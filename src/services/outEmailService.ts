import crypto from "node:crypto";
import dayjs from "dayjs";
import { logger } from "./logger";
import { mongoose } from "./mongoService";
import {
  EmailService,
  getOutEmailCodeFallback,
  getOutEmailQuotaTotal,
  getOutEmailServiceStatus,
  resolveOutEmailDomain,
  type EmailAttachmentInput,
} from "./emailService";

const OutEmailRecordSchema = new mongoose.Schema(
  {
    to: String,
    subject: String,
    content: String,
    sentAt: { type: Date, default: Date.now },
    ip: String,
  },
  { collection: "outemail_records" },
);
const OutEmailRecord = mongoose.models.OutEmailRecord || mongoose.model("OutEmailRecord", OutEmailRecordSchema);

const OutEmailQuotaSchema = new mongoose.Schema(
  {
    date: String,
    minute: String,
    countDay: Number,
    countMinute: Number,
  },
  { collection: "outemail_quotas" },
);
const OutEmailQuota = mongoose.models.OutEmailQuota || mongoose.model("OutEmailQuota", OutEmailQuotaSchema);

interface OutEmailSettingDoc {
  domain: string;
  code?: string;
  apiKey?: string;
  updatedAt?: Date;
}

const OutEmailSettingSchema = new mongoose.Schema<OutEmailSettingDoc>(
  {
    domain: { type: String, default: "" },
    code: { type: String, default: "" },
    apiKey: { type: String, default: "" },
    updatedAt: { type: Date, default: Date.now },
  },
  { collection: "outemail_settings" },
);

const OutEmailSetting =
  (mongoose.models.OutEmailSetting as mongoose.Model<OutEmailSettingDoc>) ||
  mongoose.model<OutEmailSettingDoc>("OutEmailSetting", OutEmailSettingSchema);

export interface OutEmailQuotaInfo {
  used: number;
  total: number;
  resetAt: string;
}

function normalizeAuthSecret(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function timingSafeSecretEqual(candidate: unknown, expected: unknown): boolean {
  const candidateSecret = normalizeAuthSecret(candidate);
  const expectedSecret = normalizeAuthSecret(expected);
  if (!candidateSecret || !expectedSecret) return false;

  const candidateHash = crypto.createHash("sha256").update(candidateSecret).digest();
  const expectedHash = crypto.createHash("sha256").update(expectedSecret).digest();
  return crypto.timingSafeEqual(candidateHash, expectedHash);
}

async function getOutEmailAuthSettingFromDb(domain?: string): Promise<OutEmailSettingDoc | null> {
  try {
    const domainKey = typeof domain === "string" ? domain.trim().toLowerCase() : "";
    let doc = (await OutEmailSetting.findOne({ domain: domainKey }).lean().exec()) as OutEmailSettingDoc | null;
    if ((!doc || (!normalizeAuthSecret(doc.code) && !normalizeAuthSecret(doc.apiKey))) && domainKey) {
      doc = (await OutEmailSetting.findOne({ domain: "" }).lean().exec()) as OutEmailSettingDoc | null;
    }
    return doc;
  } catch (error) {
    logger.error("读取对外邮件鉴权配置失败", { error: (error as any)?.message });
    return null;
  }
}

async function ensureOutEmailAuth({
  code,
  apiKey,
  domain,
}: {
  code?: string;
  apiKey?: string;
  domain: string;
}) {
  const dbSetting = await getOutEmailAuthSettingFromDb(domain);
  const dbCode = normalizeAuthSecret(dbSetting?.code);
  const dbApiKey = normalizeAuthSecret(dbSetting?.apiKey);
  const fallbackCode = getOutEmailCodeFallback();
  const expectedCode = dbCode || fallbackCode;

  if (!dbApiKey && !expectedCode) {
    return { success: false as const, error: "对外邮件鉴权未配置" };
  }

  if (!normalizeAuthSecret(apiKey) && !normalizeAuthSecret(code)) {
    return { success: false as const, error: "缺少鉴权信息" };
  }

  if (dbApiKey && timingSafeSecretEqual(apiKey, dbApiKey)) {
    return { success: true as const };
  }

  if (expectedCode && timingSafeSecretEqual(code, expectedCode)) {
    return { success: true as const };
  }

  return { success: false as const, error: "鉴权失败" };
}

async function reserveQuota(count: number) {
  const now = dayjs();
  const date = now.format("YYYY-MM-DD");
  const minute = now.format("YYYY-MM-DD-HH-mm");
  let quota = await OutEmailQuota.findOne({ date });
  if (!quota) quota = await OutEmailQuota.create({ date, minute, countDay: 0, countMinute: 0 });

  const currentMinuteCount = quota.minute === minute ? quota.countMinute : 0;
  if (currentMinuteCount + count > 20) {
    return {
      success: false as const,
      error: `当前一分钟可发送剩余额度不足（剩余 ${Math.max(0, 20 - currentMinuteCount)} 封）`,
    };
  }
  const outemailQuotaTotal = getOutEmailQuotaTotal();
  if (quota.countDay + count > outemailQuotaTotal) {
    return {
      success: false as const,
      error: `今日可发送剩余额度不足（剩余 ${Math.max(0, outemailQuotaTotal - quota.countDay)} 封）`,
    };
  }

  if (quota.minute === minute) {
    quota.countMinute += count;
  } else {
    quota.minute = minute;
    quota.countMinute = count;
  }
  quota.countDay += count;
  await quota.save();
  return { success: true as const };
}

function buildPublicSender(fromUser: string | undefined, displayName: string | undefined, domain: string) {
  return EmailService.buildSenderAddress(fromUser || "noreply", domain, displayName);
}

export async function getOutEmailQuota(): Promise<OutEmailQuotaInfo> {
  const now = dayjs();
  const date = now.format("YYYY-MM-DD");
  let quota = await OutEmailQuota.findOne({ date });
  if (!quota) {
    quota = await OutEmailQuota.create({ date, minute: now.format("YYYY-MM-DD-HH-mm"), countDay: 0, countMinute: 0 });
  }
  const resetAt = now.add(1, "day").startOf("day").toISOString();
  return { used: quota.countDay || 0, total: getOutEmailQuotaTotal(), resetAt };
}

export async function getOutEmailAuthStatus(domain?: string): Promise<{ configured: boolean; hasApiKey: boolean; hasCode: boolean }> {
  const dbSetting = await getOutEmailAuthSettingFromDb(domain);
  const hasApiKey = Boolean(normalizeAuthSecret(dbSetting?.apiKey));
  const hasCode = Boolean(normalizeAuthSecret(dbSetting?.code) || getOutEmailCodeFallback());
  return {
    configured: hasApiKey || hasCode,
    hasApiKey,
    hasCode,
  };
}

export async function sendOutEmailBatch({
  messages,
  code,
  apiKey,
  ip,
  from: fromUser,
  displayName,
  domain,
}: {
  messages: Array<{ to: string | string[]; subject: string; content: string }>;
  code?: string;
  apiKey?: string;
  ip: string;
  from?: string;
  displayName?: string;
  domain?: string;
}) {
  const outemailStatus = getOutEmailServiceStatus();
  if (!outemailStatus.available) {
    return { success: false, error: outemailStatus.error || "对外邮件服务不可用" };
  }

  if (!Array.isArray(messages) || messages.length === 0) {
    return { success: false, error: "消息列表不能为空" };
  }
  if (messages.length > 100) {
    return { success: false, error: "单次最多批量发送100封" };
  }

  const outemailDomain = resolveOutEmailDomain(domain);
  if (!outemailDomain) return { success: false, error: "域名未配置" };
  if (!EmailService.isValidSenderDomain(`noreply@${outemailDomain}`)) {
    return { success: false, error: "API密钥未配置" };
  }

  const authResult = await ensureOutEmailAuth({ code, apiKey, domain: outemailDomain });
  if (!authResult.success) return authResult;

  const quotaResult = await reserveQuota(messages.length);
  if (!quotaResult.success) return quotaResult;

  try {
    const sender = buildPublicSender(fromUser, displayName, outemailDomain);
    const batch = messages.map((message) => ({
      to: Array.isArray(message.to) ? message.to.map((item) => String(item).trim()).filter(Boolean) : [String(message.to)],
      subject: message.subject,
      html: message.content,
      ...(sender.name && sender.name !== (fromUser || "")
        ? { replyTo: `${sender.name} <${sender.email}>`, headers: { "X-From-Name": sender.name } }
        : {}),
    }));

    const result = await EmailService.sendBatchEmail({
      from: sender.email,
      messages: batch,
    });

    if (!result.success) {
      logger.error("对外批量邮件发送失败", { error: result.error });
      return { success: false, error: result.error || "批量发送失败" };
    }

    const records = messages.map((message) => ({
      to: Array.isArray(message.to) ? message.to.join(",") : message.to,
      subject: message.subject,
      content: message.content,
      ip,
    }));
    await OutEmailRecord.insertMany(records);
    return { success: true, ids: result.ids };
  } catch (error: any) {
    logger.error("对外批量邮件发送异常", { error, stack: error?.stack });
    return { success: false, error: error?.message || error?.toString() };
  }
}

export async function sendOutEmail({
  to,
  subject,
  content,
  code,
  apiKey,
  ip,
  from: fromUser,
  displayName,
  domain,
  attachments,
}: {
  to: string;
  subject: string;
  content: string;
  code?: string;
  apiKey?: string;
  ip: string;
  from?: string;
  displayName?: string;
  domain?: string;
  attachments?: EmailAttachmentInput[];
}) {
  const outemailStatus = getOutEmailServiceStatus();
  if (!outemailStatus.available) {
    return { success: false, error: outemailStatus.error || "对外邮件服务不可用" };
  }

  const outemailDomain = resolveOutEmailDomain(domain);
  if (!outemailDomain) {
    return { success: false, error: "域名未配置" };
  }
  if (!EmailService.isValidSenderDomain(`noreply@${outemailDomain}`)) {
    return { success: false, error: "API密钥未配置" };
  }

  if (typeof to !== "string") {
    throw new Error("to 必须为字符串");
  }

  const authResult = await ensureOutEmailAuth({ code, apiKey, domain: outemailDomain });
  if (!authResult.success) return authResult;

  const quotaResult = await reserveQuota(1);
  if (!quotaResult.success) return quotaResult;

  try {
    const sender = buildPublicSender(fromUser, displayName, outemailDomain);
    const result = await EmailService.sendEmail({
      from: sender.email,
      to: [to],
      subject,
      html: content,
      attachments: EmailService.normalizeAttachments(attachments),
      ...(sender.name && sender.name !== (fromUser || "")
        ? { replyTo: `${sender.name} <${sender.email}>`, headers: { "X-From-Name": sender.name } }
        : {}),
    });

    if (!result.success) {
      logger.error("对外邮件发送失败", { error: result.error });
      return { success: false, error: result.error || "发送失败" };
    }

    await OutEmailRecord.create({ to, subject, content, ip });
    return { success: true, messageId: result.messageId };
  } catch (error: any) {
    logger.error("对外邮件发送异常", { error, stack: error?.stack });
    return { success: false, error: error?.message || error?.toString() };
  }
}
