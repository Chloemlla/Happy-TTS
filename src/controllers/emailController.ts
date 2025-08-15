import { Request, Response } from 'express';
import { EmailService, EmailData, addEmailUsage, getEmailQuota, getAllSenderDomains } from '../services/emailService';
import logger from '../utils/logger';

export class EmailController {
  /**
   * 发送邮件
   * @param req.body { from: string, to: string[], subject: string, html: string, text?: string, skipWhitelist?: boolean }
   */
  public static async sendEmail(req: Request, res: Response) {
    try {
      const { from, to, subject, html, text, skipWhitelist = false } = req.body;
      const ip = req.ip || 'unknown';
      const user = (req as any).user;

      logger.info('收到邮件发送请求', {
        from,
        to,
        subject,
        ip,
        userId: user?.id,
        username: user?.username,
        skipWhitelist
      });

      // 验证必填字段
      if (!from || !to || !subject || !html) {
        logger.warn('邮件发送失败：缺少必填字段', {
          body: req.body,
          ip,
          userId: user?.id
        });
        return res.status(400).json({
          error: '缺少必填字段：from、to、subject、html'
        });
      }
 
      // 验证发件人域名
      const fromDomain = from.split('@')[1];
      if (fromDomain !== 'hapxs.com') {
        logger.warn('邮件发送失败：发件人域名不允许', {
          fromDomain,
          from,
          ip,
          userId: user?.id
        });
        return res.status(400).json({
          error: '发件人邮箱必须是 @hapxs.com 域名',
          invalidDomain: fromDomain
        });
      }

      // 验证邮箱格式（如果跳过白名单检查，则只验证发件人邮箱）
      const emailsToValidate = skipWhitelist ? [from] : [from, ...to];
      const emailValidation = EmailService.validateEmails(emailsToValidate);
      if (emailValidation.invalid.length > 0) {
        logger.warn('邮件发送失败：邮箱格式无效', {
          invalidEmails: emailValidation.invalid,
          skipWhitelist,
          ip,
          userId: user?.id
        });
        return res.status(400).json({
          error: '邮箱格式无效',
          invalidEmails: emailValidation.invalid
        });
      }

      // 限制收件人数量
      if (to.length > 10) {
        logger.warn('邮件发送失败：收件人数量过多', {
          recipientCount: to.length,
          ip,
          userId: user?.id
        });
        return res.status(400).json({
          error: '收件人数量不能超过10个'
        });
      }

      // 限制邮件内容长度
      if (html.length > 50000) {
        logger.warn('邮件发送失败：内容过长', {
          contentLength: html.length,
          ip,
          userId: user?.id
        });
        return res.status(400).json({
          error: '邮件内容不能超过50000字符'
        });
      }

      // 如果不是跳过白名单检查，则验证收件人域名
      if (!skipWhitelist) {
        // 这里可以添加收件人域名白名单检查逻辑
        // 暂时跳过，因为用户要求不检查
      }

      // 发送邮件
      const emailData: EmailData = {
        from,
        to,
        subject,
        html,
        text
      };

      const result = await EmailService.sendEmail(emailData);

      if (result.success) {
        // 邮件配额统计
        if (user?.id) await addEmailUsage(user.id, 1);
        logger.info('邮件发送成功', {
          messageId: result.messageId,
          from,
          to,
          subject,
          ip,
          userId: user?.id
        });

        res.json({
          success: true,
          message: '邮件发送成功',
          messageId: result.messageId,
          data: result.data
        });
      } else {
        logger.error('邮件发送失败', {
          error: result.error,
          from,
          to,
          subject,
          ip,
          userId: user?.id
        });

        res.status(500).json({
          success: false,
          error: result.error || '邮件发送失败'
        });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '未知错误';
      logger.error('邮件发送异常', {
        error: errorMessage,
        stack: error instanceof Error ? error.stack : undefined,
        body: req.body,
        ip: req.ip,
        userId: (req as any).user?.id
      });
      res.status(500).json({
        success: false,
        error: '邮件发送失败'
      });
    }
  }

  /**
   * 批量发送HTML格式邮件（每个收件人单独一封，不支持附件）
   * @param req.body { from: string, to: string[], subject: string, html?: string, text?: string }
   */
  public static async sendEmailBatch(req: Request, res: Response) {
    try {
      const { from, to, subject, html, text } = req.body as {
        from: string;
        to: string[];
        subject: string;
        html?: string;
        text?: string;
      };
      const ip = req.ip || 'unknown';
      const user = (req as any).user;

      logger.info('收到批量邮件发送请求', {
        from,
        toCount: Array.isArray(to) ? to.length : 0,
        subject,
        htmlLength: typeof html === 'string' ? html.length : undefined,
        textLength: typeof text === 'string' ? text.length : undefined,
        ip,
        userId: user?.id,
        username: user?.username
      });

      // 基本验证
      if (!from || !to || !subject) {
        return res.status(400).json({ error: '缺少必填字段：from、to、subject' });
      }
      if (!Array.isArray(to) || to.length === 0) {
        return res.status(400).json({ error: '收件人列表不能为空' });
      }
      if (to.length > 100) {
        return res.status(400).json({ error: '收件人数量不能超过100个' });
      }

      // 需要提供 html 或 text 之一
      if ((!html || html.trim().length === 0) && (!text || text.trim().length === 0)) {
        return res.status(400).json({ error: '请提供 html 或 text 内容' });
      }

      // 验证发件人域名
      const fromDomain = String(from).split('@')[1];
      if (fromDomain !== 'hapxs.com') {
        logger.warn('批量邮件发送失败：发件人域名不允许', { from, fromDomain, ip, userId: user?.id });
        return res.status(400).json({ error: '发件人邮箱必须是 @hapxs.com 域名', invalidDomain: fromDomain });
      }

      // 验证收件人邮箱格式
      const validation = EmailService.validateEmails(to);
      if (validation.invalid.length > 0) {
        return res.status(400).json({ error: '存在无效的收件人邮箱', invalidEmails: validation.invalid });
      }

      // 如果只提供了 text，将其转换为简单 HTML
      const htmlContent = (html && html.trim().length > 0)
        ? html
        : `<pre style="white-space:pre-wrap;word-wrap:break-word;margin:0;font-family:Consolas,Menlo,Monaco,monospace;">${
            String(text || '')
              .replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;')
          }</pre>`;

      // 发送批量邮件
      const result = await EmailService.sendBatchHtmlEmails(validation.valid, subject, htmlContent, from);

      if (result.success) {
        // 邮件配额统计（按收件人数计数）
        if (user?.id) await addEmailUsage(user.id, validation.valid.length, fromDomain);
        logger.info('批量邮件发送成功', {
          ids: result.ids,
          from,
          toCount: validation.valid.length,
          subject,
          ip,
          userId: user?.id
        });
        return res.json({ success: true, message: '批量发送成功', ids: result.ids, data: result.data });
      }

      logger.error('批量邮件发送失败', { error: result.error, from, toCount: validation.valid.length, subject, ip, userId: user?.id });
      return res.status(500).json({ success: false, error: result.error || '批量发送失败' });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '未知错误';
      logger.error('批量邮件发送异常', {
        error: errorMessage,
        stack: error instanceof Error ? error.stack : undefined,
        body: req.body,
        ip: req.ip,
        userId: (req as any).user?.id
      });
      return res.status(500).json({ success: false, error: '批量发送失败' });
    }
  }

  /**
   * 发送简单文本邮件
   * @param req.body { to: string[], subject: string, content: string, from?: string, skipWhitelist?: boolean }
   */
  public static async sendSimpleEmail(req: Request, res: Response) {
    try {
      const { to, subject, content, from, skipWhitelist = false } = req.body;
      const ip = req.ip || 'unknown';
      const user = (req as any).user;

      logger.info('收到简单邮件发送请求', {
        to,
        subject,
        contentLength: content?.length,
        skipWhitelist,
        ip,
        userId: user?.id,
        username: user?.username
      });

      // 验证必填字段
      if (!to || !subject || !content) {
        logger.warn('简单邮件发送失败：缺少必填字段', {
          body: req.body,
          ip,
          userId: user?.id
        });
        return res.status(400).json({
          error: '缺少必填字段：to、subject、content'
        });
      }

      // 验证发件人域名（如果提供了from参数）
      if (from) {
        const fromDomain = from.split('@')[1];
        if (fromDomain !== 'hapxs.com') {
          logger.warn('简单邮件发送失败：发件人域名不允许', {
            fromDomain,
            from,
            ip,
            userId: user?.id
          });
          return res.status(400).json({
            error: '发件人邮箱必须是 @hapxs.com 域名',
            invalidDomain: fromDomain
          });
        }
      }

      // 验证邮箱格式（如果跳过白名单检查，则不验证收件人邮箱）
      if (!skipWhitelist) {
        const emailValidation = EmailService.validateEmails(to);
        if (emailValidation.invalid.length > 0) {
          logger.warn('简单邮件发送失败：邮箱格式无效', {
            invalidEmails: emailValidation.invalid,
            ip,
            userId: user?.id
          });
          return res.status(400).json({
            error: '邮箱格式无效',
            invalidEmails: emailValidation.invalid
          });
        }
      }

      // 限制收件人数量
      if (to.length > 10) {
        logger.warn('简单邮件发送失败：收件人数量过多', {
          recipientCount: to.length,
          ip,
          userId: user?.id
        });
        return res.status(400).json({
          error: '收件人数量不能超过10个'
        });
      }

      // 限制内容长度
      if (content.length > 10000) {
        logger.warn('简单邮件发送失败：内容过长', {
          contentLength: content.length,
          ip,
          userId: user?.id
        });
        return res.status(400).json({
          error: '邮件内容不能超过10000字符'
        });
      }

      // 发送邮件
      const result = await EmailService.sendSimpleEmail(to, subject, content, from);

      if (result.success) {
        // 邮件配额统计
        if (user?.id) await addEmailUsage(user.id, 1);
        logger.info('简单邮件发送成功', {
          messageId: result.messageId,
          to,
          subject,
          ip,
          userId: user?.id
        });

        res.json({
          success: true,
          message: '邮件发送成功',
          messageId: result.messageId,
          data: result.data
        });
      } else {
        logger.error('简单邮件发送失败', {
          error: result.error,
          to,
          subject,
          ip,
          userId: user?.id
        });

        res.status(500).json({
          success: false,
          error: result.error || '邮件发送失败'
        });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '未知错误';
      logger.error('简单邮件发送异常', {
        error: errorMessage,
        stack: error instanceof Error ? error.stack : undefined,
        body: req.body,
        ip: req.ip,
        userId: (req as any).user?.id
      });
      res.status(500).json({
        success: false,
        error: '邮件发送失败'
      });
    }
  }

  /**
   * 发送Markdown格式邮件
   * @param req.body { from: string, to: string[], subject: string, markdown: string, skipWhitelist?: boolean }
   */
  public static async sendMarkdownEmail(req: Request, res: Response) {
    try {
      const { from, to, subject, markdown, skipWhitelist = false } = req.body;
      const ip = req.ip || 'unknown';
      const user = (req as any).user;

      logger.info('收到Markdown邮件发送请求', {
        from,
        to,
        subject,
        skipWhitelist,
        ip,
        userId: user?.id,
        username: user?.username
      });

      // 验证必填字段
      if (!from || !to || !subject || !markdown) {
        logger.warn('Markdown邮件发送失败：缺少必填字段', {
          body: req.body,
          ip,
          userId: user?.id
        });
        return res.status(400).json({
          error: '缺少必填字段：from、to、subject、markdown'
        });
      }

      // 验证发件人域名
      const fromDomain = from.split('@')[1];
      if (fromDomain !== 'hapxs.com') {
        logger.warn('Markdown邮件发送失败：发件人域名不允许', {
          fromDomain,
          from,
          ip,
          userId: user?.id
        });
        return res.status(400).json({
          error: '发件人邮箱必须是 @hapxs.com 域名',
          invalidDomain: fromDomain
        });
      }

      // 验证邮箱格式（如果跳过白名单检查，则只验证发件人邮箱）
      const emailsToValidate = skipWhitelist ? [from] : [from, ...to];
      const emailValidation = EmailService.validateEmails(emailsToValidate);
      if (emailValidation.invalid.length > 0) {
        logger.warn('Markdown邮件发送失败：邮箱格式无效', {
          invalidEmails: emailValidation.invalid,
          skipWhitelist,
          ip,
          userId: user?.id
        });
        return res.status(400).json({
          error: '邮箱格式无效',
          invalidEmails: emailValidation.invalid
        });
      }

      // 限制收件人数量
      if (to.length > 10) {
        logger.warn('Markdown邮件发送失败：收件人数量过多', {
          recipientCount: to.length,
          ip,
          userId: user?.id
        });
        return res.status(400).json({
          error: '收件人数量不能超过10个'
        });
      }

      // 限制内容长度
      if (markdown.length > 50000) {
        logger.warn('Markdown邮件发送失败：内容过长', {
          contentLength: markdown.length,
          ip,
          userId: user?.id
        });
        return res.status(400).json({
          error: '邮件内容不能超过50000字符'
        });
      }

      // 调用服务层处理markdown转html并发送
      const result = await EmailService.sendMarkdownEmail({ from, to, subject, markdown });

      if (result.success) {
        // 邮件配额统计
        if (user?.id) await addEmailUsage(user.id, 1);
        logger.info('Markdown邮件发送成功', {
          messageId: result.messageId,
          from,
          to,
          subject,
          ip,
          userId: user?.id
        });
        res.json({
          success: true,
          message: '邮件发送成功',
          messageId: result.messageId,
          data: result.data
        });
      } else {
        logger.error('Markdown邮件发送失败', {
          error: result.error,
          from,
          to,
          subject,
          ip,
          userId: user?.id
        });
        res.status(500).json({
          success: false,
          error: result.error || '邮件发送失败'
        });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '未知错误';
      logger.error('Markdown邮件发送异常', {
        error: errorMessage,
        stack: error instanceof Error ? error.stack : undefined,
        body: req.body,
        ip: req.ip,
        userId: (req as any).user?.id
      });
      res.status(500).json({
        success: false,
        error: '邮件发送失败'
      });
    }
  }

  /**
   * 需要 code 校验的邮件发送接口
   * @param req.body { from, to, subject, html, text?, code }
   */
  public static async sendEmailWithCode(req: Request, res: Response) {
    try {
      const { from, to, subject, html, text, code } = req.body;
      const ip = req.ip || 'unknown';
      // 校验 code
      const config = require('../config').default;
      if (!code || code !== config.email.code) {
        // 随机返回一段错误信息
        const errors = [
          '请求被拒绝，请联系管理员',
          '无效的请求参数',
          '操作失败，请稍后重试',
          '非法请求',
          '权限不足，无法发送邮件',
          '请求被拦截',
          '系统繁忙，请稍后再试',
          '未知错误',
        ];
        const idx = Math.floor(Math.random() * errors.length);
        return res.status(403).json({ success: false, error: errors[idx] });
      }
      // 复用 sendEmail 逻辑
      return await EmailController.sendEmail(req, res);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '未知错误';
      logger.error('带code邮件发送异常', {
        error: errorMessage,
        stack: error instanceof Error ? error.stack : undefined,
        body: req.body,
        ip: req.ip,
      });
      res.status(500).json({ success: false, error: '邮件发送失败' });
    }
  }

  /**
   * 获取邮件服务状态
   */
  public static async getServiceStatus(req: Request, res: Response) {
    try {
      const ip = req.ip || 'unknown';
      const user = (req as any).user;

      logger.info('收到邮件服务状态查询请求', {
        ip,
        userId: user?.id,
        username: user?.username
      });

      const status = await EmailService.getServiceStatus();

      logger.info('邮件服务状态查询完成', {
        available: status.available,
        error: status.error,
        ip,
        userId: user?.id
      });

      res.json({
        success: true,
        available: status.available,
        error: status.error
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '未知错误';
      logger.error('邮件服务状态查询异常', {
        error: errorMessage,
        stack: error instanceof Error ? error.stack : undefined,
        ip: req.ip,
        userId: (req as any).user?.id
      });
      res.status(500).json({
        success: false,
        error: '服务状态查询失败'
      });
    }
  }

  /**
   * 查询当前用户邮件配额
   * GET /api/email/quota
   */
  public static async getQuota(req: Request, res: Response) {
    try {
      const user = (req as any).user;
      if (!user?.id) return res.status(401).json({ error: '未登录' });
      const domain = req.query.domain as string | undefined;
      const quota = await getEmailQuota(user.id, domain);
      res.json(quota);
    } catch (error) {
      res.status(500).json({ error: '查询配额失败' });
    }
  }

  /**
   * 查询所有可用发件人域名
   * GET /api/email/domains
   */
  public static async getDomains(req: Request, res: Response) {
    try {
      const domains = getAllSenderDomains();
      res.json({ domains });
    } catch (error) {
      res.status(500).json({ error: '查询域名失败' });
    }
  }

  /**
   * 验证发件人域名
   * @param req.body { email: string }
   */
  public static async validateSenderDomain(req: Request, res: Response) {
    try {
      const { email } = req.body;
      const ip = req.ip || 'unknown';
      const user = (req as any).user;

      logger.info('收到发件人域名验证请求', {
        email,
        ip,
        userId: user?.id,
        username: user?.username
      });

      if (!email) {
        logger.warn('发件人域名验证失败：参数无效', {
          body: req.body,
          ip,
          userId: user?.id
        });
        return res.status(400).json({
          error: '请提供邮箱地址'
        });
      }

      const isValid = EmailService.isValidSenderDomain(email);

      logger.info('发件人域名验证完成', {
        email,
        isValid,
        ip,
        userId: user?.id
      });

      res.json({
        success: true,
        email,
        isValid,
        allowedDomain: 'hapxs.com'
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '未知错误';
      logger.error('发件人域名验证异常', {
        error: errorMessage,
        stack: error instanceof Error ? error.stack : undefined,
        body: req.body,
        ip: req.ip,
        userId: (req as any).user?.id
      });
      res.status(500).json({
        success: false,
        error: '域名验证失败'
      });
    }
  }

  /**
   * 验证邮箱格式
   * @param req.body { emails: string[] }
   */
  public static async validateEmails(req: Request, res: Response) {
    try {
      const { emails } = req.body;
      const ip = req.ip || 'unknown';
      const user = (req as any).user;

      logger.info('收到邮箱验证请求', {
        emailCount: emails?.length,
        ip,
        userId: user?.id,
        username: user?.username
      });

      if (!emails || !Array.isArray(emails)) {
        logger.warn('邮箱验证失败：参数无效', {
          body: req.body,
          ip,
          userId: user?.id
        });
        return res.status(400).json({
          error: '请提供邮箱地址数组'
        });
      }

      const validation = EmailService.validateEmails(emails);

      logger.info('邮箱验证完成', {
        totalCount: emails.length,
        validCount: validation.valid.length,
        invalidCount: validation.invalid.length,
        ip,
        userId: user?.id
      });

      res.json({
        success: true,
        total: emails.length,
        valid: validation.valid,
        invalid: validation.invalid
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '未知错误';
      logger.error('邮箱验证异常', {
        error: errorMessage,
        stack: error instanceof Error ? error.stack : undefined,
        body: req.body,
        ip: req.ip,
        userId: (req as any).user?.id
      });
      res.status(500).json({
        success: false,
        error: '邮箱验证失败'
      });
    }
  }
} 