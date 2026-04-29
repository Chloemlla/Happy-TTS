import fs from "node:fs";
import path from "node:path";
import dayjs from "dayjs";
import { marked } from "marked";
import { Resend } from "resend";
import { logger } from "./logger";
import { mongoose } from "./mongoService";

// MongoDB 邮件配额 Schema
const EmailQuotaSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true },
    domain: { type: String, required: true },
    used: { type: Number, default: 0 },
    resetAt: { type: String, required: true },
  },
  { collection: "email_quotas" },
);
const EmailQuotaModel = mongoose.models.EmailQuota || mongoose.model("EmailQuota", EmailQuotaSchema);

const DEFAULT_RESEND_DOMAIN = process.env.RESEND_DOMAIN || "chloemlla.com";
const EMAIL_QUOTA_FILE = path.join(__dirname, "../../data/email_quota.json");

export const DEFAULT_EMAIL_FROM = `noreply@${DEFAULT_RESEND_DOMAIN}`;

const _EMAIL_QUOTA_TOTAL = Number(process.env.RESEND_QUOTA_TOTAL) || 100;

export interface EmailQuotaInfo {
  used: number;
  total: number;
  resetAt: string;
}

export interface EmailAttachmentInput {
  filename: string;
  path?: string;
  content?: Buffer | string;
  contentType?: string;
  content_id?: string;
}

export interface NormalizedEmailAttachment {
  filename: string;
  path?: string;
  content?: Buffer | string;
  contentType?: string;
  content_id?: string;
}

export interface EmailData {
  from: string;
  to: string[];
  subject: string;
  html: string;
  text?: string;
  attachments?: NormalizedEmailAttachment[];
  replyTo?: string;
  headers?: Record<string, string>;
}

export interface BatchEmailData {
  from: string;
  messages: Array<{
    to: string[];
    subject: string;
    html: string;
    text?: string;
    attachments?: NormalizedEmailAttachment[];
    replyTo?: string;
    headers?: Record<string, string>;
  }>;
}

export interface EmailResponse {
  success: boolean;
  data?: any;
  error?: string;
  messageId?: string;
}

function isDangerousKey(key: string): boolean {
  return key === "__proto__" || key === "prototype" || key === "constructor";
}

function createSafeMap<T>(): Record<string, T> {
  return Object.create(null) as Record<string, T>;
}

function readQuotaFile(): Record<string, { used: number; resetAt: string }> {
  if (!fs.existsSync(EMAIL_QUOTA_FILE)) return createSafeMap();
  try {
    const parsed = JSON.parse(fs.readFileSync(EMAIL_QUOTA_FILE, "utf-8")) as Record<
      string,
      { used: number; resetAt: string }
    >;
    const safe = createSafeMap<{ used: number; resetAt: string }>();
    for (const [k, v] of Object.entries(parsed || {})) {
      if (
        typeof k === "string" &&
        !isDangerousKey(k) &&
        v &&
        typeof v.used === "number" &&
        typeof v.resetAt === "string"
      ) {
        safe[k] = { used: v.used, resetAt: v.resetAt };
      }
    }
    return safe;
  } catch {
    return createSafeMap();
  }
}

function writeQuotaFile(data: Record<string, { used: number; resetAt: string }>) {
  const obj: Record<string, { used: number; resetAt: string }> = {};
  for (const [k, v] of Object.entries(data || {})) {
    if (!isDangerousKey(k)) obj[k] = v;
  }
  fs.writeFileSync(EMAIL_QUOTA_FILE, JSON.stringify(obj, null, 2));
}

function safeGet<T extends { used: number; resetAt: string }>(map: Record<string, T>, key: string): T | undefined {
  if (typeof key !== "string" || isDangerousKey(key)) return undefined;
  return map[key];
}

function safeSet<T extends { used: number; resetAt: string }>(map: Record<string, T>, key: string, value: T): void {
  if (typeof key !== "string" || isDangerousKey(key)) return;
  map[key] = value;
}

const domainQuotaMap: Record<string, number> = {};
(function loadDomainQuotas() {
  let idx = 0;
  while (true) {
    const domain =
      process.env[`RESEND_DOMAIN${idx ? `_${idx}` : ""}`] || (idx === 0 ? process.env.RESEND_DOMAIN : undefined);
    const quota = process.env[`RESEND_QUOTA_TOTAL${idx ? `_${idx}` : ""}`];
    if (!domain) break;
    domainQuotaMap[domain] = quota ? Number(quota) : _EMAIL_QUOTA_TOTAL;
    idx++;
  }
})();

function escapeRegExp(str: string) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function pushDomainConfig(map: Record<string, string>, domain?: string, key?: string) {
  if (!domain || !key) return;
  if (/^re_\w{8,}/.test(key)) {
    map[domain] = key;
  }
}

const domainApiKeyMap: Record<string, string> = {};
(function loadDomainApiKeys() {
  let resendIdx = 0;
  while (true) {
    const domain =
      process.env[`RESEND_DOMAIN${resendIdx ? `_${resendIdx}` : ""}`] ||
      (resendIdx === 0 ? process.env.RESEND_DOMAIN : undefined);
    const key =
      process.env[`RESEND_API_KEY${resendIdx ? `_${resendIdx}` : ""}`] ||
      (resendIdx === 0 ? process.env.RESEND_API_KEY : undefined);
    if (!domain || !key) break;
    pushDomainConfig(domainApiKeyMap, domain, key);
    resendIdx++;
  }

  let outemailIdx = 0;
  while (true) {
    const domain =
      process.env[`OUTEMAIL_DOMAIN${outemailIdx ? `_${outemailIdx}` : ""}`] ||
      process.env[`RESEND_DOMAIN_OUT${outemailIdx ? `_${outemailIdx}` : ""}`] ||
      (outemailIdx === 0 ? process.env.OUTEMAIL_DOMAIN || process.env.RESEND_DOMAIN_OUT : undefined);
    const key =
      process.env[`OUTEMAIL_API_KEY${outemailIdx ? `_${outemailIdx}` : ""}`] ||
      process.env[`RESEND_API_OUT${outemailIdx ? `_${outemailIdx}` : ""}`] ||
      (outemailIdx === 0 ? process.env.OUTEMAIL_API_KEY || process.env.RESEND_API_OUT : undefined);
    if (!domain || !key) break;
    pushDomainConfig(domainApiKeyMap, domain, key);
    outemailIdx++;
  }

  if (Object.keys(domainApiKeyMap).length === 0) {
    pushDomainConfig(domainApiKeyMap, process.env.RESEND_DOMAIN, process.env.RESEND_API_KEY);
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

function getServiceAvailabilityError(): string | undefined {
  if (!(globalThis as any).EMAIL_ENABLED) {
    return "邮件服务未启用，请联系管理员配置 RESEND_API_KEY";
  }
  const serviceStatus = (globalThis as any).EMAIL_SERVICE_STATUS;
  if (serviceStatus && !serviceStatus.available) {
    return serviceStatus.error || "邮件服务不可用";
  }
  return undefined;
}

export async function getEmailQuota(userId: string, domain?: string): Promise<EmailQuotaInfo & { quotaTotal: number }> {
  try {
    if (mongoose.connection.readyState === 1) {
      const safeUserId = typeof userId === "string" ? userId : "";
      const safeDomain = typeof domain === "string" ? domain : "default";
      const quotaTotal = safeDomain && domainQuotaMap[safeDomain] ? domainQuotaMap[safeDomain] : _EMAIL_QUOTA_TOTAL;
      let quota = await EmailQuotaModel.findOne({ userId: safeUserId, domain: safeDomain });
      const now = dayjs();
      if (!quota?.resetAt || dayjs(quota.resetAt).isBefore(now)) {
        const resetAt = now.add(1, "day").startOf("day").toISOString();
        quota = await EmailQuotaModel.findOneAndUpdate(
          { userId: safeUserId, domain: safeDomain },
          { used: 0, resetAt },
          { upsert: true, new: true },
        );
      }
      return { used: quota.used, total: quotaTotal, resetAt: quota.resetAt, quotaTotal };
    }
  } catch {
    // Mongo 异常降级为文件
  }

  const all = readQuotaFile();
  const safeUserId = typeof userId === "string" ? userId : "";
  let info = safeGet(all, safeUserId);
  const now = dayjs();
  if (!info?.resetAt || dayjs(info.resetAt).isBefore(now)) {
    info = { used: 0, resetAt: now.add(1, "day").startOf("day").toISOString() };
    safeSet(all, safeUserId, info);
    writeQuotaFile(all);
  }
  const quotaTotal = domain && domainQuotaMap[domain] ? domainQuotaMap[domain] : _EMAIL_QUOTA_TOTAL;
  return { used: info.used, total: quotaTotal, resetAt: info.resetAt, quotaTotal };
}

export async function addEmailUsage(userId: string, count = 1, domain?: string) {
  try {
    if (mongoose.connection.readyState === 1) {
      const safeUserId = typeof userId === "string" ? userId : "";
      const safeDomain = typeof domain === "string" ? domain : "default";
      let quota = await EmailQuotaModel.findOne({ userId: safeUserId, domain: safeDomain });
      const now = dayjs();
      if (!quota?.resetAt || dayjs(quota.resetAt).isBefore(now)) {
        const resetAt = now.add(1, "day").startOf("day").toISOString();
        quota = await EmailQuotaModel.findOneAndUpdate(
          { userId: safeUserId, domain: safeDomain },
          { used: count, resetAt },
          { upsert: true, new: true },
        );
      } else {
        quota.used = (quota.used || 0) + count;
        await quota.save();
      }
      return;
    }
  } catch {
    // Mongo 异常降级为文件
  }

  const all = readQuotaFile();
  const safeUserId = typeof userId === "string" ? userId : "";
  let info = safeGet(all, safeUserId);
  const now = dayjs();
  if (!info?.resetAt || dayjs(info.resetAt).isBefore(now)) {
    info = { used: 0, resetAt: now.add(1, "day").startOf("day").toISOString() };
  }
  info.used = (info.used || 0) + count;
  safeSet(all, safeUserId, info);
  writeQuotaFile(all);
}

export async function resetEmailQuota(userId: string, domain?: string) {
  try {
    if (mongoose.connection.readyState === 1) {
      const safeUserId = typeof userId === "string" ? userId : "";
      const safeDomain = typeof domain === "string" ? domain : "default";
      const resetAt = dayjs().add(1, "day").startOf("day").toISOString();
      await EmailQuotaModel.findOneAndUpdate(
        { userId: safeUserId, domain: safeDomain },
        { used: 0, resetAt },
        { upsert: true },
      );
      return;
    }
  } catch {
    // Mongo 异常降级为文件
  }

  const all = readQuotaFile();
  const safeUserId = typeof userId === "string" ? userId : "";
  safeSet(all, safeUserId, { used: 0, resetAt: dayjs().add(1, "day").startOf("day").toISOString() });
  writeQuotaFile(all);
}

export class EmailService {
  static buildSenderAddress(fromPrefix?: string, domain?: string, displayName?: string) {
    const availableDomains = getAllSenderDomains();
    const senderDomain = domain || availableDomains[0] || DEFAULT_RESEND_DOMAIN;
    const prefix = String(fromPrefix || "noreply")
      .trim()
      .replace(/[^a-zA-Z0-9._-]/g, "") || "noreply";
    const name = typeof displayName === "string" && displayName.trim().length > 0 ? displayName.trim() : prefix;
    return {
      email: `${prefix}@${senderDomain}`,
      name,
      domain: senderDomain,
    };
  }

  static normalizeAttachments(
    attachments?: EmailAttachmentInput[],
    maxItems = 10,
  ): NormalizedEmailAttachment[] | undefined {
    if (!Array.isArray(attachments) || attachments.length === 0) return undefined;
    const normalized = attachments
      .filter(
        (attachment) =>
          attachment &&
          typeof attachment.filename === "string" &&
          attachment.filename.trim().length > 0 &&
          (typeof attachment.path === "string" ||
            typeof attachment.content === "string" ||
            attachment.content instanceof Buffer),
      )
      .slice(0, maxItems)
      .map((attachment) => ({
        filename: attachment.filename,
        ...(attachment.path ? { path: attachment.path } : {}),
        ...(attachment.content !== undefined ? { content: attachment.content } : {}),
        ...(attachment.contentType ? { contentType: attachment.contentType } : {}),
        ...(attachment.content_id ? { content_id: attachment.content_id } : {}),
      }));

    return normalized.length > 0 ? normalized : undefined;
  }

  static async sendEmail(emailData: EmailData): Promise<EmailResponse> {
    const availabilityError = getServiceAvailabilityError();
    if (availabilityError) {
      return { success: false, error: availabilityError };
    }

    try {
      const domain = emailData.from.split("@")[1];
      if (!domainApiKeyMap[domain]) {
        return {
          success: false,
          error: `发件人邮箱必须是已配置域名之一，当前域名: ${domain}`,
        };
      }

      const resend = getResendInstanceByDomain(domain);
      const normalizedAttachments = EmailService.normalizeAttachments(emailData.attachments);

      logger.log("开始发送邮件", {
        from: emailData.from,
        to: emailData.to,
        subject: emailData.subject,
        hasAttachments: !!normalizedAttachments?.length,
      });

      const { data, error } = await resend.emails.send({
        from: emailData.from,
        to: emailData.to,
        subject: emailData.subject,
        html: emailData.html,
        text: emailData.text,
        attachments: normalizedAttachments,
        replyTo: emailData.replyTo,
        headers: emailData.headers,
      });

      if (error) {
        logger.error("邮件发送失败", {
          error: error.message,
          code: (error as any).statusCode,
          details: error,
        });
        return {
          success: false,
          error: error.message || "邮件发送失败",
        };
      }

      logger.log("邮件发送成功", {
        messageId: data?.id,
        from: emailData.from,
        to: emailData.to,
        subject: emailData.subject,
      });

      return {
        success: true,
        data,
        messageId: data?.id,
      };
    } catch (error: any) {
      const errorMessage = error instanceof Error ? error.message : "未知错误";
      logger.error("邮件发送异常", {
        error: errorMessage,
        stack: error instanceof Error ? error.stack : undefined,
      });
      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  static async sendBatchEmail(batchEmailData: BatchEmailData): Promise<EmailResponse & { ids?: string[] }> {
    const availabilityError = getServiceAvailabilityError();
    if (availabilityError) {
      return { success: false, error: availabilityError };
    }

    const safeMessages = (batchEmailData.messages || []).filter((message) => Array.isArray(message.to) && message.to.length > 0);
    if (safeMessages.length === 0) return { success: false, error: "消息列表不能为空" };
    if (safeMessages.length > 100) return { success: false, error: "单次最多批量发送100封" };

    const domain = batchEmailData.from.split("@")[1];
    if (!domainApiKeyMap[domain]) {
      return {
        success: false,
        error: `发件人邮箱必须是已配置域名之一，当前域名: ${domain}`,
      };
    }

    try {
      const resend = getResendInstanceByDomain(domain);
      const hasAttachments = safeMessages.some((message) => (message.attachments || []).length > 0);
      if (hasAttachments) {
        return { success: false, error: "批量发送暂不支持附件" };
      }

      const batch = safeMessages.map((message) => ({
        from: batchEmailData.from,
        to: message.to,
        subject: message.subject,
        html: message.html,
        text: message.text,
        replyTo: message.replyTo,
        headers: message.headers,
      }));

      const { data, error } = await (resend as any).batch.send(batch);
      if (error) {
        logger.error("批量邮件发送失败", { error });
        return { success: false, error: error.message || String(error) };
      }

      const ids = Array.isArray(data) ? data.map((item: any) => item?.id).filter(Boolean) : undefined;
      logger.log("批量邮件发送成功", {
        from: batchEmailData.from,
        count: safeMessages.length,
        ids,
      });
      return { success: true, data, ids };
    } catch (error: any) {
      logger.error("批量邮件发送异常", {
        error: error?.message || "未知错误",
        stack: error?.stack,
      });
      return { success: false, error: error?.message || "批量发送失败" };
    }
  }

  static async sendSimpleEmail(to: string[], subject: string, content: string, from?: string): Promise<EmailResponse> {
    return EmailService.sendEmail({
      from: from || DEFAULT_EMAIL_FROM,
      to,
      subject,
      html: `<div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;"><p>${content.replace(/\n/g, "<br>")}</p></div>`,
      text: content,
    });
  }

  static async sendHtmlEmail(to: string[], subject: string, htmlContent: string, from?: string): Promise<EmailResponse> {
    return EmailService.sendEmail({
      from: from || DEFAULT_EMAIL_FROM,
      to,
      subject,
      html: htmlContent,
    });
  }

  static async sendBatchHtmlEmails(
    to: string[],
    subject: string,
    htmlContent: string,
    from?: string,
  ): Promise<EmailResponse & { ids?: string[] }> {
    const safeTo = (to || []).map((item) => String(item).trim()).filter(Boolean);
    return EmailService.sendBatchEmail({
      from: from || DEFAULT_EMAIL_FROM,
      messages: safeTo.map((recipient) => ({
        to: [recipient],
        subject,
        html: htmlContent,
      })),
    });
  }

  static async sendMarkdownEmail({
    from,
    to,
    subject,
    markdown,
  }: {
    from: string;
    to: string[];
    subject: string;
    markdown: string;
  }): Promise<EmailResponse> {
    let html: string;
    const parsed = typeof marked.parse === "function" ? marked.parse(markdown || "") : marked(markdown || "");
    if (parsed instanceof Promise) {
      html = await parsed;
    } else {
      html = parsed as string;
    }
    return EmailService.sendEmail({ from, to, subject, html, text: markdown });
  }

  static isValidEmail(email: string): boolean {
    const allowedDomains = [
      "gmail.com",
      "outlook.com",
      "qq.com",
      "163.com",
      "126.com",
      "hotmail.com",
      "yahoo.com",
      "icloud.com",
      "foxmail.com",
      "protonmail.com",
      "sina.com",
      "sohu.com",
      "yeah.net",
      "vip.qq.com",
      "aliyun.com",
      "139.com",
      "189.cn",
      "21cn.com",
      "tom.com",
      "263.net",
      "me.com",
      "live.com",
      "msn.com",
      "hotmail.com",
      "ymail.com",
      "aol.com",
      "chloemlla.com",
    ];
    const emailRegex = new RegExp(`^[\\w.-]+@(${allowedDomains.map(escapeRegExp).join("|")})$`);
    if (!emailRegex.test(email)) return false;
    const domain = email.split("@")[1].toLowerCase();
    return allowedDomains.some((allowedDomain) => domain === allowedDomain);
  }

  static isValidSenderDomain(email: string): boolean {
    const domain = email.split("@")[1];
    return Boolean(domain && domainApiKeyMap[domain]);
  }

  static validateEmails(emails: string[]): { valid: string[]; invalid: string[] } {
    const valid: string[] = [];
    const invalid: string[] = [];

    emails.forEach((email) => {
      if (EmailService.isValidEmail(email.trim())) {
        valid.push(email.trim());
      } else {
        invalid.push(email);
      }
    });

    return { valid, invalid };
  }

  static async getServiceStatus(): Promise<{ available: boolean; error?: string }> {
    if ((globalThis as any).EMAIL_SERVICE_STATUS) {
      return (globalThis as any).EMAIL_SERVICE_STATUS;
    }
    const keys = Object.values(domainApiKeyMap);
    const key = keys.find((value) => /^re_\w{8,}/.test(value));
    if (!key) {
      return { available: false, error: "未配置有效的邮件API密钥（re_ 开头）" };
    }
    return { available: true };
  }
}
