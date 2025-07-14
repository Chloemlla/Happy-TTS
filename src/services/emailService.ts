import { Resend } from 'resend';
import { logger } from './logger';

// 从环境变量获取Resend API密钥
const RESEND_API_KEY = process.env.RESEND_API_KEY || 're_xxxxxxxxx';

// 创建Resend实例
const resend = new Resend(RESEND_API_KEY);

export interface EmailData {
  from: string;
  to: string[];
  subject: string;
  html: string;
  text?: string;
  attachments?: Array<{
    filename: string;
    content: Buffer | string;
    contentType?: string;
  }>;
}

export interface EmailResponse {
  success: boolean;
  data?: any;
  error?: string;
  messageId?: string;
}

export class EmailService {
  /**
   * 发送邮件
   * @param emailData 邮件数据
   * @returns 发送结果
   */
  static async sendEmail(emailData: EmailData): Promise<EmailResponse> {
    if (!(globalThis as any).EMAIL_ENABLED) {
      return { success: false, error: '邮件服务未启用，请联系管理员配置 RESEND_API_KEY' };
    }
    try {
      // 验证发件人域名
      if (!this.isValidSenderDomain(emailData.from)) {
        const errorMessage = `发件人邮箱必须是 @hapxs.com 域名，当前域名: ${emailData.from.split('@')[1]}`;
        logger.error('邮件发送失败：发件人域名不允许', {
          from: emailData.from,
          domain: emailData.from.split('@')[1]
        });
        return {
          success: false,
          error: errorMessage
        };
      }

      logger.log('开始发送邮件', {
        from: emailData.from,
        to: emailData.to,
        subject: emailData.subject,
        hasAttachments: !!emailData.attachments?.length
      });

      const { data, error } = await resend.emails.send({
        from: emailData.from,
        to: emailData.to,
        subject: emailData.subject,
        html: emailData.html,
        text: emailData.text,
        attachments: emailData.attachments
      });

      if (error) {
        logger.error('邮件发送失败', {
          error: error.message,
          code: (error as any).statusCode,
          details: error
        });
        return {
          success: false,
          error: error.message || '邮件发送失败'
        };
      }

      logger.log('邮件发送成功', {
        messageId: data?.id,
        from: emailData.from,
        to: emailData.to,
        subject: emailData.subject
      });

      return {
        success: true,
        data,
        messageId: data?.id
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '未知错误';
      logger.error('邮件发送异常', {
        error: errorMessage,
        stack: error instanceof Error ? error.stack : undefined
      });
      return {
        success: false,
        error: errorMessage
      };
    }
  }

  /**
   * 发送简单文本邮件
   * @param to 收件人
   * @param subject 主题
   * @param content 内容
   * @param from 发件人（可选）
   * @returns 发送结果
   */
  static async sendSimpleEmail(
    to: string[],
    subject: string,
    content: string,
    from?: string
  ): Promise<EmailResponse> {
    if (!(globalThis as any).EMAIL_ENABLED) {
      return { success: false, error: '邮件服务未启用，请联系管理员配置 RESEND_API_KEY' };
    }
    const defaultFrom = process.env.DEFAULT_EMAIL_FROM || 'noreply@hapxs.com';
    
    return this.sendEmail({
      from: from || defaultFrom,
      to,
      subject,
      html: `<div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
        <p>${content.replace(/\n/g, '<br>')}</p>
      </div>`,
      text: content
    });
  }

  /**
   * 发送HTML格式邮件
   * @param to 收件人
   * @param subject 主题
   * @param htmlContent HTML内容
   * @param from 发件人（可选）
   * @returns 发送结果
   */
  static async sendHtmlEmail(
    to: string[],
    subject: string,
    htmlContent: string,
    from?: string
  ): Promise<EmailResponse> {
    if (!(globalThis as any).EMAIL_ENABLED) {
      return { success: false, error: '邮件服务未启用，请联系管理员配置 RESEND_API_KEY' };
    }
    const defaultFrom = process.env.DEFAULT_EMAIL_FROM || 'noreply@hapxs.com';
    
    return this.sendEmail({
      from: from || defaultFrom,
      to,
      subject,
      html: htmlContent
    });
  }

  /**
   * 验证邮箱格式
   * @param email 邮箱地址
   * @returns 是否有效
   */
  static isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * 验证发件人域名
   * @param email 邮箱地址
   * @returns 是否允许的域名
   */
  static isValidSenderDomain(email: string): boolean {
    const domain = email.split('@')[1];
    return domain === 'hapxs.com';
  }

  /**
   * 验证多个邮箱格式
   * @param emails 邮箱地址数组
   * @returns 验证结果
   */
  static validateEmails(emails: string[]): { valid: string[], invalid: string[] } {
    const valid: string[] = [];
    const invalid: string[] = [];

    emails.forEach(email => {
      if (this.isValidEmail(email.trim())) {
        valid.push(email.trim());
      } else {
        invalid.push(email);
      }
    });

    return { valid, invalid };
  }

  /**
   * 获取邮件发送状态
   * @returns 服务状态
   */
  static async getServiceStatus(): Promise<{ available: boolean; error?: string }> {
    try {
      // 尝试发送测试邮件到无效地址来检查API连接
      const testResult = await resend.emails.send({
        from: 'test@example.com',
        to: ['test@example.com'],
        subject: 'Test',
        html: '<p>Test</p>'
      });

      // 如果返回错误但错误不是认证相关，说明服务可用
      if (testResult.error) {
        const error = testResult.error as any;
        if (error.statusCode === 400) {
          // 400错误通常是参数问题，说明API连接正常
          return { available: true };
        } else if (error.statusCode === 401 || error.statusCode === 403) {
          return { available: false, error: 'API密钥无效' };
        }
      }

      return { available: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '未知错误';
      return { available: false, error: errorMessage };
    }
  }
} 