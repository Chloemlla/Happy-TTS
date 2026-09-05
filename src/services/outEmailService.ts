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
// 每日一个计数文档，唯一索引避免并发 create 产生同 date 多文档导致计数分裂。
OutEmailQuotaSchema.index({ date: 1 }, { unique: true });
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

// ---- G6-07 出站邮件净化辅助 ----
// 对外邮件是带本域 DKIM/SPF 的发送通道，禁止把调用方提交的任意 HTML/富文本
// 直接转发，也禁止未校验收件人/未净化 display-name 的地址列表注入。

const BASIC_EMAIL_RE = /^[^\s@<>()]+@[^\s@<>()]+\.[^\s@<>()]+$/;

function stripControlChars(value: unknown): string {
  return String(value ?? "")
    .replace(/[\x00-\x1f\x7f]/g, "")
    .trim();
}

function sanitizeRecipient(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 320 || !BASIC_EMAIL_RE.test(trimmed)) return null;
  return trimmed;
}

function sanitizeDisplayName(name: string): string {
  // RFC 5322 display-name 里不允许的字符直接剔除，防止回信落到攻击者邮箱。
  return String(name || "")
    .replace(/[<>",;:()@[\]\\]/g, "")
    .trim();
}

// HTML→纯文本 / 实体净化：单遍线性扫描，不用正则剥离标签或实体。
// 遇到 <script>/<style> 连内容整体丢弃；注释/doctype 跳过；普通标签按语义决定换行；
// 实体只解码一次；仅当输出 HTML 分支时在最后做一次反向转义，避免二次解码/转义。
const HTML_BLOCK_CLOSE_TAGS = new Set(["p", "div", "tr", "li", "h1", "h2", "h3", "h4", "h5", "h6"]);

function startsWithCI(raw: string, pos: number, needle: string): boolean {
  if (pos + needle.length > raw.length) return false;
  for (let k = 0; k < needle.length; k++) {
    let a = raw.charCodeAt(pos + k);
    let b = needle.charCodeAt(k);
    if (a >= 65 && a <= 90) a += 32;
    if (b >= 65 && b <= 90) b += 32;
    if (a !== b) return false;
  }
  return true;
}

function indexOfCI(raw: string, from: number, needle: string): number {
  for (let p = from; p + needle.length <= raw.length; p++) {
    if (startsWithCI(raw, p, needle)) return p;
  }
  return -1;
}

function decodeEntityAt(raw: string, i: number): { value: string; length: number } | null {
  const n = raw.length;
  if (raw.charCodeAt(i + 1) === 35 /* # */) {
    let j = i + 2;
    let value = 0;
    let digits = 0;
    while (j < n && digits < 7) {
      const c = raw.charCodeAt(j);
      if (c >= 48 && c <= 57) {
        value = value * 10 + (c - 48);
        digits++;
        j++;
      } else {
        break;
      }
    }
    if (digits > 0 && j < n && raw[j] === ";") {
      if (value > 0 && value <= 0x10ffff && !(value >= 0xd800 && value <= 0xdfff)) {
        return { value: String.fromCodePoint(value), length: j - i + 1 };
      }
    }
    return null;
  }
  // 命名实体：只在固定小窗口内找 ';'，避免长距离回溯。
  let j = i + 1;
  const maxEnd = Math.min(n, i + 9);
  while (j < maxEnd && raw.charCodeAt(j) !== 59 /* ; */) j++;
  if (j >= maxEnd || raw.charCodeAt(j) !== 59) return null;
  switch (raw.slice(i + 1, j).toLowerCase()) {
    case "amp":
      return { value: "&", length: j - i + 1 };
    case "lt":
      return { value: "<", length: j - i + 1 };
    case "gt":
      return { value: ">", length: j - i + 1 };
    case "quot":
      return { value: '"', length: j - i + 1 };
    case "nbsp":
      return { value: " ", length: j - i + 1 };
    default:
      return null;
  }
}

// 把 raw[from..] 按“字面文本 + 固定实体解码”追加（用于剩余串已无任何 '>'、不可能再构成标签的情况）。
function appendLiteralText(pieces: string[], raw: string, from: number): void {
  const n = raw.length;
  let p = from;
  while (p < n) {
    if (raw.charCodeAt(p) === 38 /* & */) {
      const entity = decodeEntityAt(raw, p);
      if (entity) {
        pieces.push(entity.value);
        p += entity.length;
      } else {
        pieces.push("&");
        p += 1;
      }
    } else {
      const nextAmp = raw.indexOf("&", p);
      if (nextAmp === -1) {
        pieces.push(raw.slice(p));
        return;
      }
      pieces.push(raw.slice(p, nextAmp));
      p = nextAmp;
    }
  }
}

function escapeHtmlOnce(value: string): string {
  let out = "";
  for (const ch of value) {
    switch (ch) {
      case "&":
        out += "&amp;";
        break;
      case "<":
        out += "&lt;";
        break;
      case ">":
        out += "&gt;";
        break;
      case '"':
        out += "&quot;";
        break;
      case "'":
        out += "&#39;";
        break;
      case "\n":
        out += "<br>";
        break;
      default:
        out += ch;
    }
  }
  return out;
}

function plainTextifyHtmlContent(content: unknown): { text: string; html: string } {
  const raw = String(content ?? "");
  const pieces: string[] = [];
  const n = raw.length;
  let i = 0;

  while (i < n) {
    const code = raw.charCodeAt(i);

    // 实体：只解码一次，解码后从 ';' 之后继续，绝不对已输出内容二次解码。
    if (code === 38 /* & */) {
      const entity = decodeEntityAt(raw, i);
      if (entity) {
        pieces.push(entity.value);
        i += entity.length;
      } else {
        pieces.push("&");
        i += 1;
      }
      continue;
    }

    // 普通文本：直接快进到下一个可能特殊字符。
    if (code !== 60 /* < */) {
      const nextLt = raw.indexOf("<", i);
      const nextAmp = raw.indexOf("&", i);
      let stop = n;
      if (nextLt !== -1 && nextLt < stop) stop = nextLt;
      if (nextAmp !== -1 && nextAmp < stop) stop = nextAmp;
      pieces.push(raw.slice(i, stop));
      i = stop;
      continue;
    }

    // code === 60：'<'
    const nc = i + 1 < n ? raw.charCodeAt(i + 1) : -1;

    if (nc === -1) {
      pieces.push("<");
      i = n;
      continue;
    }

    if (nc === 33 /* ! */) {
      // HTML 注释整体跳到 -->；doctype/CDATA 或未闭合注释跳到下一个 '>'。
      if (startsWithCI(raw, i, "<!--")) {
        const close = raw.indexOf("-->", i + 4);
        if (close !== -1) {
          i = close + 3;
          continue;
        }
      }
      const gt = raw.indexOf(">", i + 1);
      if (gt === -1) {
        appendLiteralText(pieces, raw, i);
        i = n;
      } else {
        i = gt + 1;
      }
      continue;
    }

    if (nc === 47 /* / */) {
      // 闭合标签。
      const first = i + 2 < n ? raw.charCodeAt(i + 2) : -1;
      const isNameStart = (first >= 65 && first <= 90) || (first >= 97 && first <= 122);
      if (!isNameStart) {
        pieces.push("<");
        i += 1;
        continue;
      }
      let j = i + 2;
      while (j < n) {
        const c = raw.charCodeAt(j);
        const isLetter = (c >= 65 && c <= 90) || (c >= 97 && c <= 122);
        const isDigit = c >= 48 && c <= 57;
        if (isLetter || isDigit) j++;
        else break;
      }
      const name = raw.slice(i + 2, j).toLowerCase();
      const gt = raw.indexOf(">", j);
      if (gt === -1) {
        // 剩余串已无 '>'，不可能再有完整标签：按字面文本保留（含实体解码）。
        appendLiteralText(pieces, raw, i);
        i = n;
        continue;
      }
      // 复刻原行为：仅精确的 "</块级>" 输出换行。
      if (HTML_BLOCK_CLOSE_TAGS.has(name) && raw[j] === ">") {
        pieces.push("\n");
      }
      i = gt + 1;
      continue;
    }

    const isLetter = (nc >= 65 && nc <= 90) || (nc >= 97 && nc <= 122);
    if (!isLetter) {
      // '<' 后不是标签起始（空格/数字/符号等），按字面输出。
      pieces.push("<");
      i += 1;
      continue;
    }

    // 开标签 / 普通标签：先读标签名。
    let j = i + 1;
    while (j < n) {
      const c = raw.charCodeAt(j);
      const isLetter = (c >= 65 && c <= 90) || (c >= 97 && c <= 122);
      const isDigit = c >= 48 && c <= 57;
      if (isLetter || isDigit) j++;
      else break;
    }
    const name = raw.slice(i + 1, j).toLowerCase();

    // <script>/<style>：连同原始内容整体丢弃，不输出其中任何字符（未闭合则丢弃到结尾）。
    if (name === "script" || name === "style") {
      const closeIdx = indexOfCI(raw, j, `</${name}`);
      if (closeIdx === -1) {
        i = n;
      } else {
        const gt = raw.indexOf(">", closeIdx + name.length + 2);
        i = gt === -1 ? n : gt + 1;
      }
      continue;
    }

    const gt = raw.indexOf(">", j);
    if (gt === -1) {
      // 剩余串已无 '>'：不存在完整标签，按字面文本保留（含实体解码）。
      appendLiteralText(pieces, raw, i);
      i = n;
      continue;
    }

    if (name === "br") {
      pieces.push("\n");
    }
    // 其余标签（含属性）整体跳过，不输出任何尖括号内容。
    i = gt + 1;
  }

  const text = pieces
    .join("")
    .replace(/[^\S\n]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  const html = escapeHtmlOnce(text);
  return { text, html };
}

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
  const outemailQuotaTotal = getOutEmailQuotaTotal();

  // 幂等确保当日文档存在（$setOnInsert 并发安全，不会互相覆盖）。
  await OutEmailQuota.findOneAndUpdate(
    { date },
    { $setOnInsert: { date, minute, countDay: 0, countMinute: 0 } },
    { upsert: true },
  ).exec();

  // 同一分钟：单条原子条件自增，天然避免 findOne+save 读改写丢更新。
  const sameMinute = await OutEmailQuota.findOneAndUpdate(
    {
      date,
      minute,
      countMinute: { $lte: 20 - count },
      countDay: { $lte: outemailQuotaTotal - count },
    },
    { $inc: { countMinute: count, countDay: count } },
    { returnDocument: "after" },
  ).exec();

  if (sameMinute) {
    return { success: true as const };
  }

  // 跨分钟切换窗口：同样原子。
  const crossMinute = await OutEmailQuota.findOneAndUpdate(
    { date, minute: { $ne: minute }, countDay: { $lte: outemailQuotaTotal - count } },
    { $set: { minute, countMinute: count }, $inc: { countDay: count } },
    { returnDocument: "after" },
  ).exec();

  if (crossMinute) {
    return { success: true as const };
  }

  // 两条原子路径都未命中 => 触发分钟或日额度上限，读取当前值生成提示信息。
  const current = await OutEmailQuota.findOne({ date }).exec();
  const currentMinuteCount = current && current.minute === minute ? current.countMinute : 0;
  if (currentMinuteCount + count > 20) {
    return {
      success: false as const,
      error: `当前一分钟可发送剩余额度不足（剩余 ${Math.max(0, 20 - currentMinuteCount)} 封）`,
    };
  }
  return {
    success: false as const,
    error: `今日可发送剩余额度不足（剩余 ${Math.max(0, outemailQuotaTotal - (current?.countDay || 0))} 封）`,
  };
}

function buildPublicSender(fromUser: string | undefined, displayName: string | undefined, domain: string) {
  // display-name 必须按 RFC 5322 净化后再进 replyTo / X-From-Name，防止地址列表注入。
  const safeName = sanitizeDisplayName(String(displayName || ""));
  return EmailService.buildSenderAddress(fromUser || "noreply", domain, safeName || undefined);
}

export async function getOutEmailQuota(): Promise<OutEmailQuotaInfo> {
  const now = dayjs();
  const date = now.format("YYYY-MM-DD");
  const quota = await OutEmailQuota.findOneAndUpdate(
    { date },
    { $setOnInsert: { date, minute: now.format("YYYY-MM-DD-HH-mm"), countDay: 0, countMinute: 0 } },
    { upsert: true, returnDocument: "after" },
  ).exec();
  const resetAt = now.add(1, "day").startOf("day").toISOString();
  return { used: quota?.countDay || 0, total: getOutEmailQuotaTotal(), resetAt };
}

export async function getOutEmailRecords(params: {
  page?: number;
  pageSize?: number;
  to?: string;
  subject?: string;
  startDate?: string;
  endDate?: string;
}): Promise<{
  records: Array<{ _id: string; to: string; subject: string; content: string; sentAt: Date; ip: string }>;
  total: number;
  page: number;
  pageSize: number;
}> {
  const page = Math.max(1, params.page || 1);
  const pageSize = Math.min(100, Math.max(1, params.pageSize || 20));
  const filter: Record<string, any> = {};

  if (params.to) {
    filter.to = { $regex: params.to, $options: "i" };
  }
  if (params.subject) {
    filter.subject = { $regex: params.subject, $options: "i" };
  }
  if (params.startDate || params.endDate) {
    filter.sentAt = {};
    if (params.startDate) filter.sentAt.$gte = new Date(params.startDate);
    if (params.endDate) filter.sentAt.$lte = new Date(params.endDate);
  }

  try {
    const [records, total] = await Promise.all([
      OutEmailRecord.find(filter)
        .sort({ sentAt: -1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .lean()
        .exec(),
      OutEmailRecord.countDocuments(filter),
    ]);
    return {
      records: records.map((r: any) => ({
        _id: String(r._id),
        to: r.to || "",
        subject: r.subject || "",
        content: (r.content || "").substring(0, 200),
        sentAt: r.sentAt || new Date(),
        ip: r.ip || "",
      })),
      total,
      page,
      pageSize,
    };
  } catch (error) {
    logger.error("查询对外邮件记录失败", { error: (error as any)?.message });
    return { records: [], total: 0, page, pageSize };
  }
}

export async function getOutEmailRecordById(id: string): Promise<{
  _id: string;
  to: string;
  subject: string;
  content: string;
  sentAt: Date;
  ip: string;
} | null> {
  try {
    const doc = await OutEmailRecord.findById(id).lean().exec();
    if (!doc) return null;
    const r = doc as any;
    return {
      _id: String(r._id),
      to: r.to || "",
      subject: r.subject || "",
      content: r.content || "",
      sentAt: r.sentAt || new Date(),
      ip: r.ip || "",
    };
  } catch (error) {
    logger.error("查询对外邮件详情失败", { error: (error as any)?.message, id });
    return null;
  }
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

  // 逐封净化收件人 / 主题 / 内容；任一收件人无效即整体拒绝。
  const sanitizedMessages: Array<{ to: string[]; subject: string; text: string; html: string }> = [];
  for (const message of messages) {
    const recipients = (Array.isArray(message.to) ? message.to : [message.to])
      .map(sanitizeRecipient)
      .filter((item): item is string => item !== null);
    if (recipients.length === 0) {
      return { success: false, error: "消息包含无效的收件人邮箱地址" };
    }
    const { text, html } = plainTextifyHtmlContent(message.content);
    sanitizedMessages.push({
      to: recipients,
      subject: stripControlChars(message.subject) || "(无主题)",
      text,
      html,
    });
  }

  const quotaResult = await reserveQuota(messages.length);
  if (!quotaResult.success) return quotaResult;

  try {
    const sender = buildPublicSender(fromUser, displayName, outemailDomain);
    const batch = sanitizedMessages.map((message) => ({
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
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

  const recipient = sanitizeRecipient(to);
  if (!recipient) {
    return { success: false, error: "收件人邮箱地址格式无效" };
  }

  const authResult = await ensureOutEmailAuth({ code, apiKey, domain: outemailDomain, ip });
  if (!authResult.success) return authResult;

  const quotaResult = await reserveQuota(1);
  if (!quotaResult.success) return quotaResult;

  try {
    const sender = buildPublicSender(fromUser, displayName, outemailDomain);
    // 自定义发件前缀/display-name 会让本域 DKIM/SPF 签名名义上指向该地址，
    // 存在仿冒（品牌/安全团队）风险，记录审计日志便于追溯。
    if (fromUser && fromUser !== "noreply") {
      logger.warn("[OutEmail] 使用自定义发件人发送对外邮件", {
        fromUser,
        displayName,
        domain: outemailDomain,
        ip,
      });
    }
    const { text, html } = plainTextifyHtmlContent(content);
    const result = await EmailService.sendEmail({
      from: sender.email,
      to: [recipient],
      subject: stripControlChars(subject) || "(无主题)",
      text,
      html,
      attachments: EmailService.normalizeAttachments(attachments),
      ...(sender.name && sender.name !== (fromUser || "")
        ? { replyTo: `${sender.name} <${sender.email}>`, headers: { "X-From-Name": sender.name } }
        : {}),
    });

    if (!result.success) {
      logger.error("对外邮件发送失败", { error: result.error });
      return { success: false, error: result.error || "发送失败" };
    }

    await OutEmailRecord.create({ to: recipient, subject, content, ip });
    return { success: true, messageId: result.messageId };
  } catch (error: any) {
    logger.error("对外邮件发送异常", { error, stack: error?.stack });
    return { success: false, error: error?.message || error?.toString() };
  }
}
