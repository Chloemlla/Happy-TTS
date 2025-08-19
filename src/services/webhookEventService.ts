import mongoose, { Schema } from 'mongoose';
import type { IncomingHttpHeaders } from 'http';
import { Webhook as SvixWebhook } from 'svix';

const WebhookEventSchema = new Schema({
  provider: { type: String, default: 'resend' },
  routeKey: { type: String },
  eventId: { type: String },
  type: { type: String, required: true },
  created_at: { type: Date },
  to: { type: Schema.Types.Mixed },
  subject: { type: String },
  status: { type: String },
  data: { type: Schema.Types.Mixed },
  raw: { type: Schema.Types.Mixed },
  receivedAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
}, { collection: 'webhook_events' });

WebhookEventSchema.index({ provider: 1, routeKey: 1, eventId: 1 }, { unique: false });
WebhookEventSchema.index({ routeKey: 1, receivedAt: -1 });
WebhookEventSchema.index({ type: 1, status: 1, receivedAt: -1 });
WebhookEventSchema.pre('save', function(next) { (this as any).updatedAt = new Date(); next(); });

export const WebhookEventModel = mongoose.models.WebhookEvent || mongoose.model('WebhookEvent', WebhookEventSchema);
// 存储 Resend/Webhook 密钥的集合（优先从 DB 读取，回退到环境变量）
const WebhookSecretSchema = new Schema({
  provider: { type: String, default: 'resend' }, // 预留多提供商
  key: { type: String, default: 'DEFAULT' },     // 路由后缀（大写），默认 DEFAULT
  secret: { type: String, required: true },      // 可为 base64 或明文
  updatedAt: { type: Date, default: Date.now },
}, { collection: 'webhook_settings' });
WebhookSecretSchema.index({ provider: 1, key: 1 }, { unique: true });
export const WebhookSecretModel = mongoose.models.WebhookSecret || mongoose.model('WebhookSecret', WebhookSecretSchema);

async function getResendSecretFromDb(routeKey?: string): Promise<string | null> {
  if (mongoose.connection.readyState !== 1) return null;
  const key = (routeKey ? String(routeKey).trim().toUpperCase() : 'DEFAULT') || 'DEFAULT';
  const candidates = key === 'DEFAULT' ? ['DEFAULT'] : [key, 'DEFAULT'];
  for (const k of candidates) {
    const doc = await WebhookSecretModel.findOne({ provider: 'resend', key: k }).lean();
    if (doc && typeof (doc as any).secret === 'string' && (doc as any).secret.trim()) {
      return (doc as any).secret.trim();
    }
  }
  return null;
}

export const WebhookEventService = {
  async create(doc: any) {
    const created = await WebhookEventModel.create(doc);
    return created.toObject();
  },
  async list({ page = 1, pageSize = 20, routeKey, type, status }: { page?: number; pageSize?: number; routeKey?: string | null; type?: string; status?: string }) {
    // Normalize and cap pagination to prevent abuse
    const p = Number.isFinite(Number(page)) ? Math.max(1, Number(page)) : 1;
    const ps = Number.isFinite(Number(pageSize)) ? Math.min(100, Math.max(1, Number(pageSize))) : 20;
    const skip = (p - 1) * ps;

    const query: any = {};
    if (typeof routeKey === 'string') query.routeKey = routeKey;
    if (routeKey === null) query.routeKey = { $in: [null, undefined] };
    if (typeof type === 'string' && type) query.type = type;
    if (typeof status === 'string' && status) query.status = status;

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
          _id: { routeKey: '$routeKey' },
          total: { $sum: 1 },
        },
      },
      { $sort: { total: -1 } },
    ]);
    return rows.map((r: any) => ({ routeKey: r._id.routeKey ?? null, total: r.total }));
  },
  async get(id: string) {
    if (!mongoose.isValidObjectId(id)) {
      throw new Error('Invalid id');
    }
    return WebhookEventModel.findById(id).lean();
  },
  async update(id: string, patch: any) {
    if (!mongoose.isValidObjectId(id)) {
      throw new Error('Invalid id');
    }
    // Whitelist fields to avoid arbitrary query injection
    const allowed: Record<string, boolean> = {
      provider: true,
      eventId: true,
      type: true,
      created_at: true,
      to: true,
      subject: true,
      status: true,
      data: true,
      raw: true,
    };
    const safePatch: any = {};
    if (patch && typeof patch === 'object') {
      for (const [k, v] of Object.entries(patch)) {
        if (allowed[k]) safePatch[k] = v;
      }
    }
    return WebhookEventModel.findByIdAndUpdate(
      id,
      { $set: { ...safePatch, updatedAt: new Date() } },
      { new: true }
    ).lean();
  },
  async remove(id: string) {
    if (!mongoose.isValidObjectId(id)) {
      throw new Error('Invalid id');
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
  if (dbSecret && typeof dbSecret === 'string' && dbSecret.trim()) {
    return dbSecret.trim();
  }
  const keySuffix = routeKey ? String(routeKey).trim().toUpperCase() : '';
  const candidates = [
    keySuffix ? `RESEND_WEBHOOK_SECRET_${keySuffix}` : '',
    keySuffix ? `WEBHOOK_SECRET_${keySuffix}` : '',
    'RESEND_WEBHOOK_SECRET',
    'WEBHOOK_SECRET',
  ].filter(Boolean) as string[];
  for (const envName of candidates) {
    const v = process.env[envName];
    if (v && typeof v === 'string' && v.trim()) {
      return v.trim();
    }
  }
  throw new Error(`RESEND_WEBHOOK_SECRET 未配置${keySuffix ? `（键：${keySuffix}）` : ''}`);
}

/**
 * 使用提供的密钥执行 Svix 验证
 */
export function verifyResendPayload(payload: string, headers: IncomingHttpHeaders, rawSecret: string) {
  // Resend 文档要求：先 base64 解码（若解码失败则按明文处理）
  let secret: string;
  try {
    secret = Buffer.from(rawSecret, 'base64').toString('utf-8');
  } catch {
    secret = rawSecret;
  }
  const svixHeaders = {
    'svix-id': String(headers['svix-id'] || ''),
    'svix-timestamp': String(headers['svix-timestamp'] || ''),
    'svix-signature': String(headers['svix-signature'] || ''),
  };
  if (!svixHeaders['svix-id'] || !svixHeaders['svix-timestamp'] || !svixHeaders['svix-signature']) {
    throw new Error('缺少 Svix 签名头');
  }
  const wh = new SvixWebhook(secret);
  return wh.verify(payload, svixHeaders as any);
}

/**
 * 兼容旧用法：仅从 ENV 中解析（同步），不走 DB
 */
export function verifyResendWebhook(payload: string, headers: IncomingHttpHeaders, key?: string) {
  // 支持多路由多密钥：优先使用 DB（webhook_settings），回退到 RESEND_WEBHOOK_SECRET_<KEY> / WEBHOOK_SECRET_<KEY>
  const keySuffix = key ? String(key).trim().toUpperCase() : '';
  const candidates = [
    keySuffix ? `RESEND_WEBHOOK_SECRET_${keySuffix}` : '',
    keySuffix ? `WEBHOOK_SECRET_${keySuffix}` : '',
    'RESEND_WEBHOOK_SECRET',
    'WEBHOOK_SECRET',
  ].filter(Boolean) as string[];

  let rawSecret = '';
  // 仅 ENV（同步）
  for (const envName of candidates) {
    const v = process.env[envName];
    if (v && typeof v === 'string' && v.trim()) { rawSecret = v; break; }
  }
  if (!rawSecret) {
    throw new Error(`RESEND_WEBHOOK_SECRET 未配置${keySuffix ? `（键：${keySuffix}）` : ''}`);
  }
  return verifyResendPayload(payload, headers, rawSecret);
}
