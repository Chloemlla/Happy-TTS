import express from 'express';
import { EmailController } from '../controllers/emailController';
import { authMiddleware } from '../middleware/authMiddleware';
import { createLimiter } from '../middleware/rateLimiter';
import logger from '../utils/logger';
import { sendOutEmail } from '../services/outEmailService';
import { domainExemptionService } from '../services/domainExemptionService';

const router = express.Router();

// 管理员权限检查中间件
const adminAuthMiddleware = (req: any, res: any, next: any) => {
    if (!req.user || req.user.role !== 'admin') {
        logger.warn('邮件发送权限检查失败：非管理员用户', {
            userId: req.user?.id,
            username: req.user?.username,
            role: req.user?.role,
            ip: req.ip
        });
        return res.status(403).json({ error: '需要管理员权限' });
    }
    next();
};

// 邮件发送速率限制（每管理员每分钟最多20封邮件）
const emailSendLimiter = createLimiter({
    windowMs: 60 * 1000, // 1分钟
    max: 20, // 最多20次
    message: '邮件发送过于频繁，请稍后再试',
    routeName: 'email.send'
});

// 邮箱验证速率限制（每管理员每分钟最多40次验证）
const emailValidationLimiter = createLimiter({
    windowMs: 60 * 1000, // 1分钟
    max: 40, // 最多40次
    message: '邮箱验证过于频繁，请稍后再试',
    routeName: 'email.validate'
});

// 服务状态查询速率限制（每管理员每分钟最多10次查询）
const statusQueryLimiter = createLimiter({
    windowMs: 60 * 1000, // 1分钟
    max: 40, // 最多40次
    message: '状态查询过于频繁，请稍后再试',
    routeName: 'email.status'
});

// 域名豁免检查速率限制（每管理员每分钟最多20次检查）
const domainExemptionLimiter = createLimiter({
    windowMs: 60 * 1000, // 1分钟
    max: 20, // 最多20次
    message: '域名豁免检查过于频繁，请稍后再试',
    routeName: 'email.domain-exemption'
});

// 对外邮件发送限流（每分钟20封，每天100封，独立于管理员邮件）
const outEmailLimiter = createLimiter({
    windowMs: 60 * 1000,
    max: 300,
    message: '对外邮件发送过于频繁，请稍后再试',
    routeName: 'outemail.send'
});

// 对外邮件发送接口（无需 token 验证，必须放在所有中间件之前）
const OUTEMAIL_ENABLED = process.env.OUTEMAIL_ENABLED !== 'false' && typeof process.env.OUTEMAIL_ENABLED !== 'undefined';
router.post('/outemail', outEmailLimiter, async (req, res) => {
    if (!OUTEMAIL_ENABLED) {
        return res.status(403).json({ error: '对外邮件功能未启用，请联系管理员配置 OUTEMAIL_ENABLED 环境变量' });
    }
    try {
        const { to, subject, content, code } = req.body;
        if (!to || !subject || !content || !code) {
            return res.status(400).json({ error: '缺少参数' });
        }
        if (typeof to === 'string') {
          if (!/^[\w.-]+@[\w.-]+\.[a-zA-Z]{2,}$/.test(to)) {
            return res.status(400).json({ error: '收件人邮箱格式无效' });
          }
          const ip = String(req.ip || req.headers['x-real-ip'] || '');
          const result = await sendOutEmail({ to, subject, content, code, ip });
          if (result.success) {
            res.json({ success: true, messageId: result.messageId });
          } else {
            res.status(400).json({ error: result.error });
          }
          return;
        } else if (Array.isArray(to) && typeof to[0] === 'string') {
          const first = to[0];
          if (!/^[\w.-]+@[\w.-]+\.[a-zA-Z]{2,}$/.test(first)) {
            return res.status(400).json({ error: '收件人邮箱格式无效' });
          }
          const ip = String(req.ip || req.headers['x-real-ip'] || '');
          const result = await sendOutEmail({ to: first, subject, content, code, ip });
          if (result.success) {
            res.json({ success: true, messageId: result.messageId });
          } else {
            res.status(400).json({ error: result.error });
          }
          return;
        } else {
          return res.status(400).json({ error: '收件人邮箱格式无效' });
        }
    } catch (e) {
        res.status(500).json({ error: '服务器错误' });
    }
});

// 全局邮件接口速率限制（每管理员每分钟最多5次）
router.use(emailSendLimiter);

// 新增：无需认证的 code 校验邮件发送接口
router.post('/send-with-code', EmailController.sendEmailWithCode);

// 应用认证和管理员权限中间件
router.use(authMiddleware);
router.use(adminAuthMiddleware);

/**
 * @openapi
 * /api/email/send:
 *   post:
 *     summary: 发送HTML格式邮件
 *     description: 管理员发送HTML格式邮件接口
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [from, to, subject, html]
 *             properties:
 *               from:
 *                 type: string
 *                 description: 发件人邮箱（必须是 @hapxs.com 域名）
 *                 example: "noreply@hapxs.com"
 *               to:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: 收件人邮箱列表
 *                 example: ["recipient@example.com"]
 *               subject:
 *                 type: string
 *                 description: 邮件主题
 *                 example: "HTML通知"
 *               html:
 *                 type: string
 *                 description: HTML格式的邮件内容
 *                 example: "<h1>Hello World</h1><p>这是一封测试邮件。</p>"
 *               text:
 *                 type: string
 *                 description: 纯文本格式的邮件内容（可选）
 *                 example: "Hello World\n这是一封测试邮件。"
 *               skipWhitelist:
 *                 type: boolean
 *                 description: 是否跳过收件人域名白名单检查（仅管理员可用）
 *                 example: false
 *     responses:
 *       200:
 *         description: 邮件发送成功
 *       400:
 *         description: 请求参数错误
 *       401:
 *         description: 未授权
 *       403:
 *         description: 权限不足
 *       429:
 *         description: 请求过于频繁
 *       500:
 *         description: 服务器错误
 */
router.post('/send', emailSendLimiter, authMiddleware, adminAuthMiddleware, EmailController.sendEmail);

/**
 * @openapi
 * /api/email/send-simple:
 *   post:
 *     summary: 发送简单文本邮件
 *     description: 管理员发送简单文本邮件接口
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [to, subject, content]
 *             properties:
 *               to:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: 收件人邮箱列表
 *                 example: ["recipient@example.com"]
 *               subject:
 *                 type: string
 *                 description: 邮件主题
 *                 example: "简单通知"
 *               content:
 *                 type: string
 *                 description: 邮件内容
 *                 example: "这是一封简单的通知邮件。"
 *               from:
 *                 type: string
 *                 description: 发件人邮箱（可选，必须是 @hapxs.com 域名）
 *                 example: "noreply@hapxs.com"
 *               skipWhitelist:
 *                 type: boolean
 *                 description: 是否跳过收件人域名白名单检查（仅管理员可用）
 *                 example: false
 *     responses:
 *       200:
 *         description: 邮件发送成功
 *       400:
 *         description: 请求参数错误
 *       401:
 *         description: 未授权
 *       403:
 *         description: 权限不足
 *       429:
 *         description: 请求过于频繁
 *       500:
 *         description: 服务器错误
 */
router.post('/send-simple', emailSendLimiter, authMiddleware, adminAuthMiddleware, EmailController.sendSimpleEmail);

/**
 * @openapi
 * /api/email/send-markdown:
 *   post:
 *     summary: 发送Markdown格式邮件
 *     description: 管理员发送Markdown格式邮件接口，后端自动将markdown转为HTML
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [from, to, subject, markdown]
 *             properties:
 *               from:
 *                 type: string
 *                 description: 发件人邮箱（必须是 @hapxs.com 域名）
 *                 example: "noreply@hapxs.com"
 *               to:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: 收件人邮箱列表
 *                 example: ["recipient1@example.com"]
 *               subject:
 *                 type: string
 *                 description: 邮件主题
 *                 example: "Markdown通知"
 *               markdown:
 *                 type: string
 *                 description: Markdown格式的邮件内容
 *                 example: "# Hello World\n这是一封测试邮件。"
 *               skipWhitelist:
 *                 type: boolean
 *                 description: 是否跳过收件人域名白名单检查（仅管理员可用）
 *                 example: false
 *     responses:
 *       200:
 *         description: 邮件发送成功
 *       400:
 *         description: 请求参数错误
 *       401:
 *         description: 未授权
 *       403:
 *         description: 权限不足
 *       429:
 *         description: 请求过于频繁
 *       500:
 *         description: 服务器错误
 */
router.post('/send-markdown', emailSendLimiter, authMiddleware, adminAuthMiddleware, EmailController.sendMarkdownEmail);

/**
 * @openapi
 * /api/email/status:
 *   get:
 *     summary: 获取邮件服务状态
 *     description: 管理员查询邮件服务状态接口
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 服务状态查询成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 available:
 *                   type: boolean
 *                   example: true
 *                 error:
 *                   type: string
 *                   example: null
 *       401:
 *         description: 未授权
 *       403:
 *         description: 权限不足
 *       429:
 *         description: 请求过于频繁
 *       500:
 *         description: 服务器错误
 */
router.get('/status', statusQueryLimiter, EmailController.getServiceStatus);

/**
 * @openapi
 * /api/email/outemail-status:
 *   get:
 *     summary: 获取对外邮件服务状态
 *     description: 查询对外邮件服务状态接口
 *     responses:
 *       200:
 *         description: 服务状态查询成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 available:
 *                   type: boolean
 *                   example: true
 *                 error:
 *                   type: string
 *                   example: null
 *       429:
 *         description: 请求过于频繁
 *       500:
 *         description: 服务器错误
 */
router.get('/outemail-status', statusQueryLimiter, (req, res) => {
  try {
    const outemailStatus = (globalThis as any).OUTEMAIL_SERVICE_STATUS;
    if (outemailStatus && typeof outemailStatus.available === 'boolean') {
      res.json({
        success: true,
        available: outemailStatus.available,
        error: outemailStatus.error || ''
      });
    } else {
      res.json({
        success: true,
        available: false,
        error: '对外邮件服务状态未初始化'
      });
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '未知错误';
    logger.error('对外邮件服务状态查询异常', {
      error: errorMessage,
      stack: error instanceof Error ? error.stack : undefined,
      ip: req.ip
    });
    res.status(500).json({ 
      success: false,
      available: false,
      error: '服务状态查询失败' 
    });
  }
});

/**
 * @openapi
 * /api/email/validate-sender-domain:
 *   post:
 *     summary: 验证发件人域名
 *     description: 管理员验证发件人域名接口
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email:
 *                 type: string
 *                 description: 要验证的发件人邮箱地址
 *                 example: "noreply@hapxs.com"
 *     responses:
 *       200:
 *         description: 域名验证成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 email:
 *                   type: string
 *                   example: "noreply@hapxs.com"
 *                 isValid:
 *                   type: boolean
 *                   example: true
 *                 allowedDomain:
 *                   type: string
 *                   example: "hapxs.com"
 *       400:
 *         description: 请求参数错误
 *       401:
 *         description: 未授权
 *       403:
 *         description: 权限不足
 *       429:
 *         description: 请求过于频繁
 *       500:
 *         description: 服务器错误
 */
router.post('/validate-sender-domain', emailValidationLimiter, EmailController.validateSenderDomain);

/**
 * @openapi
 * /api/email/validate:
 *   post:
 *     summary: 验证邮箱格式
 *     description: 管理员验证邮箱格式接口
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [emails]
 *             properties:
 *               emails:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: 要验证的邮箱地址列表
 *                 example: ["test@example.com", "invalid-email", "another@test.com"]
 *     responses:
 *       200:
 *         description: 邮箱验证成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 total:
 *                   type: number
 *                   example: 3
 *                 valid:
 *                   type: array
 *                   items:
 *                     type: string
 *                   example: ["test@example.com", "another@test.com"]
 *                 invalid:
 *                   type: array
 *                   items:
 *                     type: string
 *                   example: ["invalid-email"]
 *       400:
 *         description: 请求参数错误
 *       401:
 *         description: 未授权
 *       403:
 *         description: 权限不足
 *       429:
 *         description: 请求过于频繁
 *       500:
 *         description: 服务器错误
 */
router.post('/validate', emailValidationLimiter, EmailController.validateEmails);

/**
 * @openapi
 * /api/email/quota:
 *   get:
 *     summary: 获取邮件配额
 *     description: 管理员获取邮件配额接口
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 配额获取成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 quota:
 *                   type: object
 *                   properties:
 *                     daily:
 *                       type: number
 *                       example: 1000
 *                     monthly:
 *                       type: number
 *                       example: 50000
 *                 error:
 *                   type: string
 *                   example: null
 *       401:
 *         description: 未授权
 *       403:
 *         description: 权限不足
 *       429:
 *         description: 请求过于频繁
 *       500:
 *         description: 服务器错误
 */
router.get('/quota', authMiddleware, adminAuthMiddleware, EmailController.getQuota);

/**
 * @openapi
 * /api/email/domains:
 *   get:
 *     summary: 获取所有可用发件人域名
 *     description: 获取所有可用发件人域名接口
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 域名获取成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 domains:
 *                   type: array
 *                   items:
 *                     type: string
 *                   example: ["hapxs.com", "example.com"]
 *                 error:
 *                   type: string
 *                   example: null
 *       401:
 *         description: 未授权
 *       403:
 *         description: 权限不足
 *       429:
 *         description: 请求过于频繁
 *       500:
 *         description: 服务器错误
 */
router.get('/domains', authMiddleware, EmailController.getDomains);

/**
 * @openapi
 * /api/email/check-domain-exemption:
 *   post:
 *     summary: 检查域名豁免状态
 *     description: 检查指定域名是否在豁免列表中
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - domain
 *             properties:
 *               domain:
 *                 type: string
 *                 description: 要检查的域名
 *                 example: "hapxs.com"
 *     responses:
 *       200:
 *         description: 检查成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 exempted:
 *                   type: boolean
 *                   description: 是否豁免
 *                   example: true
 *                 message:
 *                   type: string
 *                   description: 检查结果消息
 *                   example: "域名在豁免列表中，无需额外检查"
 *                 domain:
 *                   type: string
 *                   description: 检查的域名
 *                   example: "hapxs.com"
 *                 isInternal:
 *                   type: boolean
 *                   description: 是否为内部域名
 *                   example: false
 *                 isExempted:
 *                   type: boolean
 *                   description: 是否为豁免域名
 *                   example: true
 *       400:
 *         description: 请求参数错误
 *       401:
 *         description: 未授权
 *       403:
 *         description: 权限不足
 *       429:
 *         description: 请求过于频繁
 *       500:
 *         description: 服务器错误
 */
// 检查域名豁免状态
router.post('/check-domain-exemption', domainExemptionLimiter, authMiddleware, adminAuthMiddleware, async (req, res) => {
  try {
    const { domain } = req.body;
    
    if (!domain) {
      return res.status(400).json({
        success: false,
        error: '域名参数不能为空'
      });
    }

    const result = domainExemptionService.checkDomainExemption(domain);

    res.json({
      success: true,
      exempted: result.exempted,
      message: result.message,
      domain: result.domain,
      isInternal: result.isInternal,
      isExempted: result.isExempted
    });

  } catch (error) {
    console.error('[EmailRoutes] 检查域名豁免状态失败:', error);
    res.status(500).json({
      success: false,
      error: '服务器内部错误'
    });
  }
});

/**
 * @openapi
 * /api/email/check-recipient-whitelist:
 *   post:
 *     summary: 检查收件人域名白名单状态
 *     description: 检查指定域名是否在收件人白名单中
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - domain
 *             properties:
 *               domain:
 *                 type: string
 *                 description: 要检查的收件人域名
 *                 example: "gmail.com"
 *     responses:
 *       200:
 *         description: 检查成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 whitelisted:
 *                   type: boolean
 *                   description: 是否在白名单中
 *                   example: true
 *                 message:
 *                   type: string
 *                   description: 检查结果消息
 *                   example: "域名在白名单中，无需额外检查"
 *                 domain:
 *                   type: string
 *                   description: 检查的域名
 *                   example: "gmail.com"
 *                 isWhitelisted:
 *                   type: boolean
 *                   description: 是否为白名单域名
 *                   example: true
 *       400:
 *         description: 请求参数错误
 *       401:
 *         description: 未授权
 *       403:
 *         description: 权限不足
 *       429:
 *         description: 请求过于频繁
 *       500:
 *         description: 服务器错误
 */
// 检查收件人域名白名单状态
router.post('/check-recipient-whitelist', domainExemptionLimiter, authMiddleware, adminAuthMiddleware, async (req, res) => {
  try {
    const { domain } = req.body;
    
    if (!domain) {
      return res.status(400).json({
        success: false,
        error: '域名参数不能为空'
      });
    }

    const result = domainExemptionService.checkRecipientWhitelist(domain);

    res.json({
      success: true,
      whitelisted: result.whitelisted,
      message: result.message,
      domain: result.domain,
      isWhitelisted: result.isWhitelisted
    });

  } catch (error) {
    console.error('[EmailRoutes] 检查收件人域名白名单状态失败:', error);
    res.status(500).json({
      success: false,
      error: '服务器内部错误'
    });
  }
});

export default router; 