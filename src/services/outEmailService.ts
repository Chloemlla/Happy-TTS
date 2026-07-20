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
import { recordUsage, validateApiKey } from "./apiKeyService";
import { UserStorage } from "../utils/userStorage";

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
  const left = normalizeAuthSecret(candidate);
  const right = normalizeAuthSecret(expected);
  if (!left || !right) return false;

  // Shared API secrets are compared directly in constant time. These are not password hashes.
  const leftBytes = Buffer.from(left, "utf8");
  const rightBytes = Buffer.from(right, "utf8");
  if (leftBytes.length !== rightBytes.length) {
    crypto.timingSafeEqual(leftBytes, leftBytes);
    return false;
  }
  return crypto.timingSafeEqual(leftBytes, rightBytes);
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

export type OutEmailAuthSuccess = {
  success: true;
  authKind: "outemail-setting" | "outemail-code" | "platform-api-key";
  keyId?: string;
  userId?: string;
};

export type OutEmailAuthFailure = {
  success: false;
  error: string;
};

export type OutEmailAuthResult = OutEmailAuthSuccess | OutEmailAuthFailure;

/**
 * 校验对外邮件鉴权，顺序：
 * 1. EnvManager / outemail_settings 外部 API Key
 * 2. 兼容校验码 code（DB 或 OUTEMAIL_CODE 回退）
 * 3. 平台 API Key（admin?tab=apikeys 创建，需 outemail 或 * 权限）
 */
async function tryValidatePlatformOutemailApiKey(
  plainKey: string,
  ip?: string,
): Promise<OutEmailAuthResult> {
  try {
    const doc = await validateApiKey(plainKey);
    if (!doc) {
      return { success: false, error: "鉴权失败" };
    }

    if (!doc.permissions.includes("outemail") && !doc.permissions.includes("*")) {
      return { success: false, error: '此 API Key 无 "outemail" 权限' };
    }

    const owner = await UserStorage.getUserById(doc.userId);
    if (!owner) {
      return { success: false, error: "API Key 所属用户不存在" };
    }
    if ((owner as any).disabled || (owner as any).accountStatus === "suspended") {
      return { success: false, error: "API Key 所属账户不可用" };
    }

    if (ip) {
      recordUsage(doc.keyId, ip).catch(() => {});
    }

    return {
      success: true,
      authKind: "platform-api-key",
      keyId: doc.keyId,
      userId: doc.userId,
    };
  } catch (error) {
    logger.error("验证平台 API Key（outemail）失败", {
      error: error instanceof Error ? error.message : String(error),
    });
    return { success: false, error: "鉴权失败" };
  }
}

export async function ensureOutEmailAuth({
  code,
  apiKey,
  domain,
  ip,
}: {
  code?: string;
  apiKey?: string;
  domain: string;
  ip?: string;
}): Promise<OutEmailAuthResult> {
  const presentedApiKey = normalizeAuthSecret(apiKey);
  const presentedCode = normalizeAuthSecret(code);

  if (!presentedApiKey && !presentedCode) {
    return { success: false, error: "缺少鉴权信息" };
  }

  const dbSetting = await getOutEmailAuthSettingFromDb(domain);
  const dbCode = normalizeAuthSecret(dbSetting?.code);
  const dbApiKey = normalizeAuthSecret(dbSetting?.apiKey);
  const fallbackCode = getOutEmailCodeFallback();
  const expectedCode = dbCode || fallbackCode;

  // 1) EnvManager / Mongo outemail_settings 外部 Key（明文比对，保持原行为）
  if (dbApiKey && presentedApiKey && timingSafeSecretEqual(presentedApiKey, dbApiKey)) {
    return { success: true, authKind: "outemail-setting" };
  }

  // 2) 兼容校验码（body.code）
  if (expectedCode && presentedCode && timingSafeSecretEqual(presentedCode, expectedCode)) {
    return { success: true, authKind: "outemail-code" };
  }

  // 3) 平台 API Key（admin apikeys 创建，带 outemail/* 权限）
  if (presentedApiKey) {
    return tryValidatePlatformOutemailApiKey(presentedApiKey, ip);
  }

  // 仅传了 code 且未匹配
  if (!dbApiKey && !expectedCode) {
    // code 字段不接受平台 API Key；若外部鉴权也未配置则提示未配置
    return { success: false, error: "对外邮件鉴权未配置" };
  }

  return { success: false, error: "鉴权失败" };
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

export async function getOutEmailAuthStatus(domain?: string): Promise<{
  configured: boolean;
  hasApiKey: boolean;
  hasCode: boolean;
  platformApiKeySupported: boolean;
}> {
  const dbSetting = await getOutEmailAuthSettingFromDb(domain);
  const hasApiKey = Boolean(normalizeAuthSecret(dbSetting?.apiKey));
  const hasCode = Boolean(normalizeAuthSecret(dbSetting?.code) || getOutEmailCodeFallback());
  // 平台 API Key（admin apikeys + outemail 权限）始终可作为鉴权方式
  const platformApiKeySupported = true;
  return {
    configured: hasApiKey || hasCode || platformApiKeySupported,
    hasApiKey,
    hasCode,
    platformApiKeySupported,
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

  const authResult = await ensureOutEmailAuth({ code, apiKey, domain: outemailDomain, ip });
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

  const authResult = await ensureOutEmailAuth({ code, apiKey, domain: outemailDomain, ip });
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
