import type { IncomingHttpHeaders } from "node:http";
import mongoose, { Schema } from "mongoose";
import { Webhook as SvixWebhook } from "svix";

// WebhookEvent document interface
interface WebhookEventDoc {
  provider?: string;
  routeKey?: string;
  eventId?: string;
  type: string;
  title?: string;
  content?: string;
  renderedContent?: string;
  created_at?: Date;
  to?: any;
  subject?: string;
  status?: string;
  data?: any;
  raw?: any;
  receivedAt: Date;
  updatedAt: Date;
}

const WebhookEventSchema = new Schema<WebhookEventDoc>(
  {
    provider: { type: String, default: "resend" },
    routeKey: { type: String },
    eventId: { type: String },
    type: { type: String, required: true },
    title: { type: String },
    content: { type: String },
    renderedContent: { type: String },
    created_at: { type: Date },
    to: { type: Schema.Types.Mixed },
    subject: { type: String },
    status: { type: String },
    data: { type: Schema.Types.Mixed },
    raw: { type: Schema.Types.Mixed },
    receivedAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  { collection: "webhook_events" },
);

WebhookEventSchema.index({ provider: 1, routeKey: 1, eventId: 1 }, { unique: false });
WebhookEventSchema.index({ routeKey: 1, receivedAt: -1 });
WebhookEventSchema.index({ type: 1, status: 1, receivedAt: -1 });
WebhookEventSchema.pre("save", function (this: WebhookEventDoc) {
  this.updatedAt = new Date();
});

export const WebhookEventModel = mongoose.models.WebhookEvent || mongoose.model("WebhookEvent", WebhookEventSchema);

const WEBHOOK_EVENT_FIELDS = new Set([
  "provider",
  "routeKey",
  "eventId",
  "type",
  "title",
  "content",
  "renderedContent",
  "created_at",
  "to",
  "subject",
  "status",
  "data",
  "raw",
  "receivedAt",
  "updatedAt",
]);

function asString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function normalizeRouteKey(value: unknown): string | undefined {
  const trimmed = asString(value);
  if (!trimmed || trimmed === "null") return undefined;
  return trimmed;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function toPlain<T = any>(doc: any): T {
  if (doc && typeof doc.toObject === "function") {
    return doc.toObject();
  }
  return doc;
}

function parseWebhookDate(value: unknown): Date | undefined {
  if (value == null || value === "") return undefined;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? undefined : value;
  if (typeof value === "number") {
    const date = new Date(value < 1e12 ? value * 1000 : value);
    return Number.isNaN(date.getTime()) ? undefined : date;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    const numeric = Number(trimmed);
    const date = Number.isFinite(numeric)
      ? new Date(numeric < 1e12 ? numeric * 1000 : numeric)
      : new Date(trimmed);
    return Number.isNaN(date.getTime()) ? undefined : date;
  }
  return undefined;
}

function sanitizeEventDocument(input: any, { partial = false }: { partial?: boolean } = {}) {
  const safe: any = {};
  if (input && typeof input === "object") {
    for (const [key, value] of Object.entries(input)) {
      if (!WEBHOOK_EVENT_FIELDS.has(key)) continue;
      if ((key === "created_at" || key === "receivedAt" || key === "updatedAt") && value) {
        const date = parseWebhookDate(value);
        if (date) safe[key] = date;
        continue;
      }
      if (key === "routeKey") {
        safe.routeKey = normalizeRouteKey(value) ?? null;
        continue;
      }
      safe[key] = value;
    }
  }

  if (!partial) {
    safe.type = asString(safe.type) || "manual";
    safe.provider = asString(safe.provider) || "manual";
    if (!safe.receivedAt) safe.receivedAt = new Date();
  }
  if (safe.type != null) safe.type = String(safe.type).trim() || (partial ? undefined : "manual");
  if (safe.provider != null) safe.provider = String(safe.provider).trim() || (partial ? undefined : "manual");
  if (safe.eventId != null) safe.eventId = String(safe.eventId).trim() || undefined;
  if (safe.status != null) safe.status = String(safe.status).trim() || undefined;
  return safe;
}

/**
 * 将 content 中的 {{value}} 占位符按顺序替换为 values 数组中的值。
 */
export function renderWebhookContent(content: string, values?: any[]): string {
  if (!content || !Array.isArray(values) || values.length === 0) return content || "";
  let index = 0;
  return content.replace(/\{\{value\}\}/g, () => {
    if (index < values.length) {
      return String(values[index++]);
    }
    return "{{value}}";
  });
}

export function normalizeGenericWebhookEvent(body: any, source?: string) {
  const payload = body && typeof body === "object" ? body : { raw: body };
  const type = asString(payload.type) || asString(payload.event) || asString(payload.action) || "generic";
  const eventId = asString(payload.id) || asString(payload.event_id) || asString(payload.eventId);
  const title = asString(payload.title);
  const content = asString(payload.content);
  const values = Array.isArray(payload.values) ? payload.values : undefined;
  const renderedContent = content ? renderWebhookContent(content, values) : undefined;
  const createdAt = parseWebhookDate(payload.created_at ?? payload.timestamp);
  const routeKey = normalizeRouteKey(source);

  return sanitizeEventDocument({
    provider: routeKey || "generic",
    routeKey,
    eventId,
    type,
    title,
    content,
    renderedContent,
    created_at: createdAt,
    to: payload.to || payload.recipient || payload.email || undefined,
    subject: title || payload.subject || payload.message || undefined,
    status: payload.status || "received",
    data: payload,
    raw: payload,
  });
}

// 存储 Resend/Webhook 密钥的集合（优先从 DB 读取，回退到环境变量）
const WebhookSecretSchema = new Schema(
  {
    provider: { type: String, default: "resend" }, // 预留多提供商
    key: { type: String, default: "DEFAULT" }, // 路由后缀（大写），默认 DEFAULT
    secret: { type: String, required: true }, // 可为 base64 或明文
    updatedAt: { type: Date, default: Date.now },
  },
  { collection: "webhook_settings" },
);
WebhookSecretSchema.index({ provider: 1, key: 1 }, { unique: true });
export const WebhookSecretModel = mongoose.models.WebhookSecret || mongoose.model("WebhookSecret", WebhookSecretSchema);

async function getResendSecretFromDb(routeKey?: string): Promise<string | null> {
  if (mongoose.connection.readyState !== 1) return null;
  const key = (routeKey ? String(routeKey).trim().toUpperCase() : "DEFAULT") || "DEFAULT";
  const candidates = key === "DEFAULT" ? ["DEFAULT"] : [key, "DEFAULT"];
  for (const k of candidates) {
    const doc = await WebhookSecretModel.findOne({ provider: "resend", key: k }).lean();
    if (doc && typeof (doc as any).secret === "string" && (doc as any).secret.trim()) {
      return (doc as any).secret.trim();
    }
  }
  return null;
}

export const WebhookEventService = {
  async create(doc: any) {
    const created = await WebhookEventModel.create(sanitizeEventDocument(doc));
    // Handle both single document and array of documents
    if (Array.isArray(created)) {
      return created.map((item) => toPlain(item));
    }
    return toPlain(created);
  },
  async createGeneric(source: string | undefined, body: any, overrides: any = {}) {
    const event = normalizeGenericWebhookEvent(body, source);
    return this.create({ ...event, ...sanitizeEventDocument(overrides, { partial: true }) });
  },
  async list({
    page = 1,
    pageSize = 20,
    routeKey,
    provider,
    eventId,
    type,
    status,
    q,
    receivedFrom,
    receivedTo,
  }: {
    page?: number;
    pageSize?: number;
    routeKey?: string | null;
    provider?: string;
    eventId?: string;
    type?: string;
    status?: string;
    q?: string;
    receivedFrom?: string;
    receivedTo?: string;
  }) {
    // Normalize and cap pagination to prevent abuse
    const p = Number.isFinite(Number(page)) ? Math.max(1, Number(page)) : 1;
    const ps = Number.isFinite(Number(pageSize)) ? Math.min(100, Math.max(1, Number(pageSize))) : 20;
    const skip = (p - 1) * ps;

    const query: any = {};
    if (typeof routeKey === "string") query.routeKey = routeKey;
    if (routeKey === null) query.routeKey = { $in: [null, undefined] };
    if (typeof provider === "string" && provider) query.provider = provider;
    if (typeof eventId === "string" && eventId) query.eventId = eventId;
    if (typeof type === "string" && type) query.type = type;
    if (typeof status === "string" && status) query.status = status;
    const receivedAt: any = {};
    const fromDate = parseWebhookDate(receivedFrom);
    const toDate = parseWebhookDate(receivedTo);
    if (fromDate) receivedAt.$gte = fromDate;
    if (toDate) receivedAt.$lte = toDate;
    if (Object.keys(receivedAt).length > 0) query.receivedAt = receivedAt;
    if (typeof q === "string" && q.trim()) {
      const regex = new RegExp(escapeRegex(q.trim()), "i");
      query.$or = [
        { provider: regex },
        { routeKey: regex },
        { eventId: regex },
        { type: regex },
        { title: regex },
        { subject: regex },
        { status: regex },
      ];
    }

    const [items, total] = await Promise.all([
      WebhookEventModel.find(query).sort({ receivedAt: -1 }).skip(skip).limit(ps).lean(),
      WebhookEventModel.countDocuments(query),
    ]);
    return { items, total, page: p, pageSize: ps };
  },
  async groups() {
    const rows = await WebhookEventModel.aggregate([
      {
        $group: {
          _id: { routeKey: "$routeKey" },
          total: { $sum: 1 },
        },
      },
      { $sort: { total: -1 } },
    ]);
    return rows.map((r: any) => ({ routeKey: r._id.routeKey ?? null, total: r.total }));
  },
  async stats() {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const failureStatuses = ["failed", "error", "bounced", "complained", "delivery_delayed"];
    const [total, last24h, failed, byStatus, byProvider, byRouteKey, byType] = await Promise.all([
      WebhookEventModel.countDocuments({}),
      WebhookEventModel.countDocuments({ receivedAt: { $gte: since } }),
      WebhookEventModel.countDocuments({ status: { $in: failureStatuses } }),
      WebhookEventModel.aggregate([
        { $group: { _id: "$status", total: { $sum: 1 } } },
        { $sort: { total: -1 } },
      ]),
      WebhookEventModel.aggregate([
        { $group: { _id: "$provider", total: { $sum: 1 } } },
        { $sort: { total: -1 } },
      ]),
      WebhookEventModel.aggregate([
        { $group: { _id: "$routeKey", total: { $sum: 1 } } },
        { $sort: { total: -1 } },
      ]),
      WebhookEventModel.aggregate([
        { $group: { _id: "$type", total: { $sum: 1 } } },
        { $sort: { total: -1 } },
        { $limit: 10 },
      ]),
    ]);

    const mapRows = (rows: any[]) => rows.map((row) => ({ key: row._id ?? null, total: row.total }));
    return {
      total,
      last24h,
      failed,
      byStatus: mapRows(byStatus),
      byProvider: mapRows(byProvider),
      byRouteKey: mapRows(byRouteKey),
      byType: mapRows(byType),
    };
  },
  async get(id: string) {
    if (!mongoose.isValidObjectId(id)) {
      throw new Error("无效的 ID");
    }
    return WebhookEventModel.findById(id).lean();
  },
  async update(id: string, patch: any) {
    if (!mongoose.isValidObjectId(id)) {
      throw new Error("无效的 ID");
    }
    // Whitelist fields to avoid arbitrary query injection
    const allowed: Record<string, boolean> = {
      provider: true,
      routeKey: true,
      eventId: true,
      type: true,
      title: true,
      content: true,
      renderedContent: true,
      created_at: true,
      to: true,
      subject: true,
      status: true,
      data: true,
      raw: true,
    };
    const safePatch: any = {};
    if (patch && typeof patch === "object") {
      for (const [k, v] of Object.entries(patch)) {
        if (allowed[k]) {
          Object.assign(safePatch, sanitizeEventDocument({ [k]: v }, { partial: true }));
        }
      }
    }
    return WebhookEventModel.findByIdAndUpdate(
      id,
      { $set: { ...safePatch, updatedAt: new Date() } },
      { returnDocument: "after" },
    ).lean();
  },
  async updateStatus(id: string, status: string) {
    const normalizedStatus = asString(status);
    if (!normalizedStatus) {
      throw new Error("状态不能为空");
    }
    return this.update(id, { status: normalizedStatus });
  },
  async bulkUpdateStatus(ids: string[], status: string) {
    const normalizedStatus = asString(status);
    if (!normalizedStatus) {
      throw new Error("状态不能为空");
    }
    const validIds = ids.filter((id) => mongoose.isValidObjectId(id));
    if (validIds.length === 0) {
      throw new Error("未提供有效的 ID");
    }
    const result: any = await WebhookEventModel.updateMany(
      { _id: { $in: validIds } },
      { $set: { status: normalizedStatus, updatedAt: new Date() } },
    );
    return {
      matchedCount: result?.matchedCount ?? result?.n ?? validIds.length,
      modifiedCount: result?.modifiedCount ?? result?.nModified ?? validIds.length,
    };
  },
  async bulkRemove(ids: string[]) {
    const validIds = ids.filter((id) => mongoose.isValidObjectId(id));
    if (validIds.length === 0) {
      throw new Error("未提供有效的 ID");
    }
    const result: any = await WebhookEventModel.deleteMany({ _id: { $in: validIds } });
    return { deletedCount: result?.deletedCount ?? 0 };
  },
  async replay(id: string, options: { status?: string; note?: string } = {}) {
    const original: any = await this.get(id);
    if (!original) return null;

    const now = new Date();
    const replayData =
      original.data && typeof original.data === "object" && !Array.isArray(original.data)
        ? { ...original.data }
        : { value: original.data };
    replayData.replay = {
      sourceEventId: id,
      replayedAt: now.toISOString(),
      note: asString(options.note),
    };

    return this.create({
      provider: original.provider || "manual",
      routeKey: original.routeKey ?? undefined,
      eventId: `${original.eventId || id}:replay:${now.getTime()}`,
      type: original.type || "manual.replay",
      title: original.title,
      content: original.content,
      renderedContent: original.renderedContent,
      created_at: original.created_at,
      to: original.to,
      subject: original.subject,
      status: asString(options.status) || "replayed",
      data: replayData,
      raw: {
        replayedFrom: id,
        replayedAt: now.toISOString(),
        original: original.raw ?? original.data ?? original,
      },
      receivedAt: now,
    });
  },
  async remove(id: string) {
    if (!mongoose.isValidObjectId(id)) {
      throw new Error("无效的 ID");
    }
    await WebhookEventModel.findByIdAndDelete(id);
    return { success: true };
  },
};

/**
 * 获取 Resend Webhook 密钥（DB 优先，ENV 回退）
 */
export async function getResendSecret(routeKey?: string): Promise<string> {
  const dbSecret = await getResendSecretFromDb(routeKey);
  if (dbSecret && typeof dbSecret === "string" && dbSecret.trim()) {
    return dbSecret.trim();
  }
  const keySuffix = routeKey ? String(routeKey).trim().toUpperCase() : "";
  const candidates = [
    keySuffix ? `RESEND_WEBHOOK_SECRET_${keySuffix}` : "",
    keySuffix ? `WEBHOOK_SECRET_${keySuffix}` : "",
    "RESEND_WEBHOOK_SECRET",
    "WEBHOOK_SECRET",
  ].filter(Boolean) as string[];
  for (const envName of candidates) {
    const v = process.env[envName];
    if (v && typeof v === "string" && v.trim()) {
      return v.trim();
    }
  }
  throw new Error(`RESEND_WEBHOOK_SECRET 未配置${keySuffix ? `（键：${keySuffix}）` : ""}`);
}

/**
 * 使用提供的密钥执行 Svix 验证
 */
export function verifyResendPayload(payload: string, headers: IncomingHttpHeaders, rawSecret: string) {
  // Resend 文档要求：先 base64 解码（若解码失败则按明文处理）
  let secret: string;
  try {
    secret = Buffer.from(rawSecret, "base64").toString("utf-8");
  } catch {
    secret = rawSecret;
  }
  const svixHeaders = {
    "svix-id": String(headers["svix-id"] || ""),
    "svix-timestamp": String(headers["svix-timestamp"] || ""),
    "svix-signature": String(headers["svix-signature"] || ""),
  };
  if (!svixHeaders["svix-id"] || !svixHeaders["svix-timestamp"] || !svixHeaders["svix-signature"]) {
    throw new Error("缺少 Svix 签名头");
  }
  const wh = new SvixWebhook(secret);
  return wh.verify(payload, svixHeaders as any);
}

/**
 * 兼容旧用法：仅从 ENV 中解析（同步），不走 DB
 */
export function verifyResendWebhook(payload: string, headers: IncomingHttpHeaders, key?: string) {
  // 支持多路由多密钥：优先使用 DB（webhook_settings），回退到 RESEND_WEBHOOK_SECRET_<KEY> / WEBHOOK_SECRET_<KEY>
  const keySuffix = key ? String(key).trim().toUpperCase() : "";
  const candidates = [
    keySuffix ? `RESEND_WEBHOOK_SECRET_${keySuffix}` : "",
    keySuffix ? `WEBHOOK_SECRET_${keySuffix}` : "",
    "RESEND_WEBHOOK_SECRET",
    "WEBHOOK_SECRET",
  ].filter(Boolean) as string[];

  let rawSecret = "";
  // 仅 ENV（同步）
  for (const envName of candidates) {
    const v = process.env[envName];
    if (v && typeof v === "string" && v.trim()) {
      rawSecret = v;
      break;
    }
  }
  if (!rawSecret) {
    throw new Error(`RESEND_WEBHOOK_SECRET 未配置${keySuffix ? `（键：${keySuffix}）` : ""}`);
  }
  return verifyResendPayload(payload, headers, rawSecret);
}
