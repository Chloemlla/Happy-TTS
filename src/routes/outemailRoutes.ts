import express from 'express';
import { createLimiter } from '../middleware/rateLimiter';
import logger from '../utils/logger';
import { sendOutEmail, sendOutEmailBatch, getOutEmailQuota } from '../services/outEmailService';

const router = express.Router();

// 对外邮件发送限流（与内部邮件独立）
const outEmailLimiter = createLimiter({
  windowMs: 60 * 1000,
  max: 300,
  message: '对外邮件发送过于频繁，请稍后再试',
  routeName: 'outemail.send'
});

// 对外邮件服务状态查询限流
const statusQueryLimiter = createLimiter({
  windowMs: 60 * 1000,
  max: 60,
  message: '状态查询过于频繁，请稍后再试',
  routeName: 'outemail.status'
});

/**
 * GET /api/outemail/quota
 * 公共：查询对外邮件每日配额
 */
router.get('/quota', statusQueryLimiter, async (req, res) => {
  try {
    const info = await getOutEmailQuota();
    res.json({ success: true, used: info.used, total: info.total, resetAt: info.resetAt });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e?.message || '无法获取配额信息' });
  }
});

/**
 * GET /api/outemail/status
 * 公共：查询对外邮件服务状态
 */
router.get('/status', statusQueryLimiter, (req, res) => {
  try {
    const outemailStatus = (globalThis as any).OUTEMAIL_SERVICE_STATUS;
    const OUTEMAIL_DOMAIN = process.env.OUTEMAIL_DOMAIN || process.env.RESEND_DOMAIN || '';
    if (outemailStatus && typeof outemailStatus.available === 'boolean') {
      res.json({
        success: true,
        available: outemailStatus.available,
        error: outemailStatus.error || '',
        domain: OUTEMAIL_DOMAIN
      });
    } else {
      res.json({ success: true, available: false, error: '对外邮件服务状态未初始化', domain: OUTEMAIL_DOMAIN });
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '未知错误';
    logger.error('[OutEmail] 服务状态查询异常', {
      error: errorMessage,
      stack: error instanceof Error ? error.stack : undefined,
      ip: req.ip
    });
    res.status(500).json({ success: false, available: false, error: '服务状态查询失败' });
  }
});

/**
 * GET /api/outemail/domain
 * 公共：获取对外发信所使用的域名
 */
router.get('/domain', (req, res) => {
  const OUTEMAIL_DOMAIN = process.env.OUTEMAIL_DOMAIN || process.env.RESEND_DOMAIN || '';
  res.json({ success: true, domain: OUTEMAIL_DOMAIN });
});

/**
 * POST /api/outemail/send
 * 公共：发送对外邮件（带验证码防滥用）
 */
router.post('/send', outEmailLimiter, async (req, res) => {
  try {
    const { to, subject, content, code, attachments, from, displayName, domain } = req.body || {};
    if (!to || !subject || !content || !code) {
      return res.status(400).json({ error: '缺少参数' });
    }

    const isValidEmail = (email: string) => /^[\w.-]+@[\w.-]+\.[a-zA-Z]{2,}$/.test(email);

    if (typeof to === 'string') {
      if (!isValidEmail(to)) return res.status(400).json({ error: '收件人邮箱格式无效' });
      const ip = String(req.ip || req.headers['x-real-ip'] || '');
      // 附件校验（可选）
      let safeAttachments: any[] | undefined;
      if (attachments && Array.isArray(attachments)) {
        safeAttachments = attachments
          .filter((a: any) => a && typeof a.filename === 'string' && (typeof a.path === 'string' || typeof a.content === 'string'))
          .slice(0, 10)
          .map((a: any) => ({
            filename: a.filename,
            ...(a.path ? { path: a.path } : {}),
            ...(a.content ? { content: a.content } : {}),
            ...(a.content_id ? { content_id: a.content_id } : {}),
          }));
      }
      const result = await sendOutEmail({ to, subject, content, code, ip, attachments: safeAttachments, from, displayName, domain });
      if (result.success) return res.json({ success: true, messageId: result.messageId });
      return res.status(400).json({ error: result.error });
    }

    if (Array.isArray(to) && typeof to[0] === 'string') {
      const first = to[0];
      if (!isValidEmail(first)) return res.status(400).json({ error: '收件人邮箱格式无效' });
      const ip = String(req.ip || req.headers['x-real-ip'] || '');
      let safeAttachments: any[] | undefined;
      if (attachments && Array.isArray(attachments)) {
        safeAttachments = attachments
          .filter((a: any) => a && typeof a.filename === 'string' && (typeof a.path === 'string' || typeof a.content === 'string'))
          .slice(0, 10)
          .map((a: any) => ({
            filename: a.filename,
            ...(a.path ? { path: a.path } : {}),
            ...(a.content ? { content: a.content } : {}),
            ...(a.content_id ? { content_id: a.content_id } : {}),
          }));
      }
      const result = await sendOutEmail({ to: first, subject, content, code, ip, attachments: safeAttachments, from, displayName, domain });
      if (result.success) return res.json({ success: true, messageId: result.messageId });
      return res.status(400).json({ error: result.error });
    }

    return res.status(400).json({ error: '收件人邮箱格式无效' });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || '服务器错误' });
  }
});

// 批量发送（不支持附件）
router.post('/batch-send', outEmailLimiter, async (req, res) => {
  try {
    const { messages, code, from, displayName, domain } = req.body || {};
    if (!Array.isArray(messages) || !messages.length || !code) {
      return res.status(400).json({ error: '缺少参数' });
    }
    // 规范化与基本校验
    const normalized = messages
      .filter((m: any) => m && m.to && m.subject && m.content)
      .slice(0, 100)
      .map((m: any) => ({
        to: Array.isArray(m.to) ? m.to : String(m.to),
        subject: String(m.subject),
        content: String(m.content),
      }));
    if (!normalized.length) return res.status(400).json({ error: '消息列表无有效项' });

    const ip = String(req.ip || req.headers['x-real-ip'] || '');
    const result = await sendOutEmailBatch({ messages: normalized, code, ip, from, displayName, domain });
    if (result.success) return res.json({ success: true, ids: result.ids });
    return res.status(400).json({ error: result.error });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || '服务器错误' });
  }
});

export default router;
