import { Resend } from 'resend';
import { logger } from './logger';
import { marked } from 'marked';
import dayjs from 'dayjs';
import { mongoose } from './mongoService';

// MongoDB 邮件配额 Schema
const EmailQuotaSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  domain: { type: String, required: true },
  used: { type: Number, default: 0 },
  resetAt: { type: String, required: true },
}, { collection: 'email_quotas' });
const EmailQuotaModel = mongoose.models.EmailQuota || mongoose.model('EmailQuota', EmailQuotaSchema);

// 从环境变量获取Resend API密钥
const RESEND_API_KEY = process.env.RESEND_API_KEY || 're_xxxxxxxxx';

// 统一Resend发件人域名
const RESEND_DOMAIN = process.env.RESEND_DOMAIN || 'hapxs.com';
const DEFAULT_EMAIL_FROM = `noreply@${RESEND_DOMAIN}`;

// 创建Resend实例
const resend = new Resend(RESEND_API_KEY);

// 邮件配额存储实现（多后端支持）
import fs from 'fs';
import path from 'path';
import { getUserById } from './userService';

const EMAIL_QUOTA_TOTAL = Number(process.env.RESEND_QUOTA_TOTAL) || 100;
const EMAIL_QUOTA_FILE = path.join(__dirname, '../../data/email_quota.json');

export interface EmailQuotaInfo {
  used: number;
  total: number;
  resetAt: string; // ISO
}

function isDangerousKey(key: string): boolean {
  return key === '__proto__' || key === 'prototype' || key === 'constructor';
}

// 使用 null 原型对象避免原型链污染
function createSafeMap<T>(): Record<string, T> {
  return Object.create(null) as Record<string, T>;
}

function readQuotaFile(): Record<string, { used: number; resetAt: string }> {
  if (!fs.existsSync(EMAIL_QUOTA_FILE)) return createSafeMap();
  try {
    const parsed = JSON.parse(fs.readFileSync(EMAIL_QUOTA_FILE, 'utf-8')) as Record<string, { used: number; resetAt: string }>;
    const safe = createSafeMap<{ used: number; resetAt: string }>();
    for (const [k, v] of Object.entries(parsed || {})) {
      if (typeof k === 'string' && !isDangerousKey(k) && v && typeof v.used === 'number' && typeof v.resetAt === 'string') {
        safe[k] = { used: v.used, resetAt: v.resetAt };
      }
    }
    return safe;
  } catch {
    return createSafeMap();
  }
}
function writeQuotaFile(data: Record<string, { used: number; resetAt: string }>) {
  // 将可能的 null 原型对象安全序列化
  const obj: Record<string, { used: number; resetAt: string }> = {};
  for (const [k, v] of Object.entries(data || {})) {
    if (!isDangerousKey(k)) obj[k] = v;
  }
  fs.writeFileSync(EMAIL_QUOTA_FILE, JSON.stringify(obj, null, 2));
}

function safeGet<T extends { used: number; resetAt: string }>(map: Record<string, T>, key: string): T | undefined {
  if (typeof key !== 'string' || isDangerousKey(key)) return undefined;
  return map[key];
}

function safeSet<T extends { used: number; resetAt: string }>(map: Record<string, T>, key: string, value: T): void {
  if (typeof key !== 'string' || isDangerousKey(key)) return;
  map[key] = value;
}

// 多域名配额支持
const domainQuotaMap: Record<string, number> = {};
(function loadDomainQuotas() {
  let idx = 0;
  while (true) {
    const domain = process.env[`RESEND_DOMAIN${idx ? '_' + idx : ''}`] || (idx === 0 ? process.env.RESEND_DOMAIN : undefined);
    const quota = process.env[`RESEND_QUOTA_TOTAL${idx ? '_' + idx : ''}`];
    if (!domain) break;
    domainQuotaMap[domain] = quota ? Number(quota) : 100;
    idx++;
  }
})();

// 安全正则转义
function escapeRegExp(str: string) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export async function getEmailQuota(userId: string, domain?: string): Promise<EmailQuotaInfo & { quotaTotal: number }> {
  try {
    if (mongoose.connection.readyState === 1) {
      // 类型校验，防止NoSQL注入
      const safeUserId = typeof userId === 'string' ? userId : '';
      const safeDomain = typeof domain === 'string' ? domain : 'default';
      const quotaTotal = safeDomain && domainQuotaMap[safeDomain] ? domainQuotaMap[safeDomain] : 100;
      let quota = await EmailQuotaModel.findOne({ userId: safeUserId, domain: safeDomain });
      const now = dayjs();
      if (!quota || !quota.resetAt || dayjs(quota.resetAt).isBefore(now)) {
        // 首次/已过期，重置
        const resetAt = now.add(1, 'day').startOf('day').toISOString();
        quota = await EmailQuotaModel.findOneAndUpdate(
          { userId: safeUserId, domain: safeDomain },
          { used: 0, resetAt },
          { upsert: true, new: true }
        );
      }
      return { used: quota.used, total: quotaTotal, resetAt: quota.resetAt, quotaTotal };
    }
  } catch (e) {
    // Mongo 异常降级为文件
  }
  // 文件存储兜底
  const all = readQuotaFile();
  const safeUserId = typeof userId === 'string' ? userId : '';
  let info = safeGet(all, safeUserId);
  const now = dayjs();
  if (!info || !info.resetAt || dayjs(info.resetAt).isBefore(now)) {
    info = { used: 0, resetAt: now.add(1, 'day').startOf('day').toISOString() };
    safeSet(all, safeUserId, info);
    writeQuotaFile(all);
  }
  const quotaTotal = domain && domainQuotaMap[domain] ? domainQuotaMap[domain] : 100;
  return { used: info.used, total: quotaTotal, resetAt: info.resetAt, quotaTotal };
}

export async function addEmailUsage(userId: string, count = 1, domain?: string) {
  try {
    if (mongoose.connection.readyState === 1) {
      const safeUserId = typeof userId === 'string' ? userId : '';
      const safeDomain = typeof domain === 'string' ? domain : 'default';
      const quotaTotal = safeDomain && domainQuotaMap[safeDomain] ? domainQuotaMap[safeDomain] : 100;
      let quota = await EmailQuotaModel.findOne({ userId: safeUserId, domain: safeDomain });
      const now = dayjs();
      if (!quota || !quota.resetAt || dayjs(quota.resetAt).isBefore(now)) {
        // 首次/已过期，重置
        const resetAt = now.add(1, 'day').startOf('day').toISOString();
        quota = await EmailQuotaModel.findOneAndUpdate(
          { userId: safeUserId, domain: safeDomain },
          { used: count, resetAt },
          { upsert: true, new: true }
        );
      } else {
        quota.used = (quota.used || 0) + count;
        await quota.save();
      }
      return;
    }
  } catch (e) {
    // Mongo 异常降级为文件
  }
  // 文件存储兜底
  const all = readQuotaFile();
  const safeUserId = typeof userId === 'string' ? userId : '';
  let info = safeGet(all, safeUserId);
  const now = dayjs();
  if (!info || !info.resetAt || dayjs(info.resetAt).isBefore(now)) {
    info = { used: 0, resetAt: now.add(1, 'day').startOf('day').toISOString() };
  }
  info.used = (info.used || 0) + count;
  safeSet(all, safeUserId, info);
  writeQuotaFile(all);
}

export async function resetEmailQuota(userId: string, domain?: string) {
  try {
    if (mongoose.connection.readyState === 1) {
      const safeUserId = typeof userId === 'string' ? userId : '';
      const safeDomain = typeof domain === 'string' ? domain : 'default';
      const resetAt = dayjs().add(1, 'day').startOf('day').toISOString();
      await EmailQuotaModel.findOneAndUpdate(
        { userId: safeUserId, domain: safeDomain },
        { used: 0, resetAt },
        { upsert: true }
      );
      return;
    }
  } catch (e) {
    // Mongo 异常降级为文件
  }
  // 文件存储兜底
  const all = readQuotaFile();
  const safeUserId = typeof userId === 'string' ? userId : '';
  safeSet(all, safeUserId, { used: 0, resetAt: dayjs().add(1, 'day').startOf('day').toISOString() });
  writeQuotaFile(all);
}

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

// 多域名多API key支持
const domainApiKeyMap: Record<string, string> = {};
(function loadDomainApiKeys() {
  let idx = 0;
  while (true) {
    const domain = process.env[`RESEND_DOMAIN${idx ? '_' + idx : ''}`] || (idx === 0 ? process.env.RESEND_DOMAIN : undefined);
    const key = process.env[`RESEND_API_KEY${idx ? '_' + idx : ''}`] || (idx === 0 ? process.env.RESEND_API_KEY : undefined);
    if (!domain || !key) break;
    // 只接受 re_ 开头的 key
    if (/^re_\w{8,}/.test(key)) {
      domainApiKeyMap[domain] = key;
    }
    idx++;
  }
})();

export function getAllSenderDomains(): string[] {
  return Object.keys(domainApiKeyMap);
}

function getResendInstanceByDomain(domain: string) {
  const key = domainApiKeyMap[domain];
  if (!key) throw new Error(`未配置该域名(${domain})的API key`);
  return new Resend(key);
}

export class EmailService {
  /**
   * 发送邮件
   * @param emailData 邮件数据
   * @returns 发送结果
   */
  static async sendEmail(emailData: EmailData): Promise<EmailResponse> {
    // 检查邮件服务是否启用
    if (!(globalThis as any).EMAIL_ENABLED) {
      return { success: false, error: '邮件服务未启用，请联系管理员配置 RESEND_API_KEY' };
    }
    
    // 检查邮件服务状态
    const serviceStatus = (globalThis as any).EMAIL_SERVICE_STATUS;
    if (serviceStatus && !serviceStatus.available) {
      return { success: false, error: serviceStatus.error || '邮件服务不可用' };
    }
    
    try {
      // 验证发件人域名
      const domain = emailData.from.split('@')[1];
      if (!domainApiKeyMap[domain]) {
        return {
          success: false,
          error: `发件人邮箱必须是已配置域名之一，当前域名: ${domain}`
        };
      }
      const resend = getResendInstanceByDomain(domain);
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
    } catch (error: any) {
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
    
    // 检查邮件服务状态
    const serviceStatus = (globalThis as any).EMAIL_SERVICE_STATUS;
    if (serviceStatus && !serviceStatus.available) {
      return { success: false, error: serviceStatus.error || '邮件服务不可用' };
    }
    
    return this.sendEmail({
      from: from || DEFAULT_EMAIL_FROM,
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
    
    // 检查邮件服务状态
    const serviceStatus = (globalThis as any).EMAIL_SERVICE_STATUS;
    if (serviceStatus && !serviceStatus.available) {
      return { success: false, error: serviceStatus.error || '邮件服务不可用' };
    }
    
    return this.sendEmail({
      from: from || DEFAULT_EMAIL_FROM,
      to,
      subject,
      html: htmlContent
    });
  }

  /**
   * 发送Markdown格式邮件
   * @param param0 { from, to, subject, markdown }
   * @returns 发送结果
   */
  static async sendMarkdownEmail({ from, to, subject, markdown }: { from: string, to: string[], subject: string, markdown: string }): Promise<EmailResponse> {
    // markdown转html
    let html: string;
    const parsed = typeof marked.parse === 'function' ? marked.parse(markdown || '') : marked(markdown || '');
    if (parsed instanceof Promise) {
      html = await parsed;
    } else {
      html = parsed as string;
    }
    return this.sendEmail({ from, to, subject, html, text: markdown });
  }

  /**
   * 验证邮箱格式
   * @param email 邮箱地址
   * @returns 是否有效
   */
  static isValidEmail(email: string): boolean {
    // 允许主流邮箱域名
    const allowedDomains = [
      'gmail.com', 'outlook.com', 'qq.com', '163.com', '126.com',
      'hotmail.com', 'yahoo.com', 'icloud.com', 'foxmail.com',
      'protonmail.com', 'sina.com', 'sohu.com', 'yeah.net', 'vip.qq.com',
      'aliyun.com', '139.com', '189.cn', '21cn.com', 'tom.com', '263.net',
      'me.com', 'live.com', 'msn.com', 'hotmail.com', 'ymail.com', 'aol.com', 'hapxs.com'
    ];
    const emailRegex = new RegExp(`^[\\w.-]+@(${allowedDomains.map(escapeRegExp).join('|')})$`);
    if (!emailRegex.test(email)) return false;
    const domain = email.split('@')[1].toLowerCase();
    return allowedDomains.some(d => domain === d);
  }

  /**
   * 验证发件人域名
   * @param email 邮箱地址
   * @returns 是否允许的域名
   */
  static isValidSenderDomain(email: string): boolean {
    const domain = email.split('@')[1];
    return domain === RESEND_DOMAIN;
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
    // 优先使用启动时固定的状态
    if ((globalThis as any).EMAIL_SERVICE_STATUS) {
      return (globalThis as any).EMAIL_SERVICE_STATUS;
    }
    // 只做配置检查，不发送测试邮件
    const keys = Object.values(domainApiKeyMap);
    const key = keys.find(k => /^re_\w{8,}/.test(k));
    if (!key) {
      return { available: false, error: '未配置有效的邮件API密钥（re_ 开头）' };
    }
    return { available: true };
  }
} 