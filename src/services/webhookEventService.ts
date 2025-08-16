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
 * 使用 Svix 验证 Resend Webhook 请求
 * 注意：Resend 的签名密钥需要 Base64 解码后再传入 Svix
 */
export function verifyResendWebhook(payload: string, headers: IncomingHttpHeaders, key?: string) {
  // 支持多路由多密钥：优先使用 RESEND_WEBHOOK_SECRET_<KEY> / WEBHOOK_SECRET_<KEY>
  const keySuffix = key ? String(key).trim().toUpperCase() : '';
  const candidates = [
    keySuffix ? `RESEND_WEBHOOK_SECRET_${keySuffix}` : '',
    keySuffix ? `WEBHOOK_SECRET_${keySuffix}` : '',
    'RESEND_WEBHOOK_SECRET',
    'WEBHOOK_SECRET',
  ].filter(Boolean) as string[];

  let rawSecret = '';
  for (const envName of candidates) {
    const v = process.env[envName];
    if (v && typeof v === 'string' && v.trim()) { rawSecret = v; break; }
  }
  if (!rawSecret) {
    throw new Error(`RESEND_WEBHOOK_SECRET 未配置${keySuffix ? `（键：${keySuffix}）` : ''}`);
  }
  // Resend 文档要求：先 base64 解码
  let secret: string;
  try {
    secret = Buffer.from(rawSecret, 'base64').toString('utf-8');
  } catch {
    // 若用户已提供明文（非base64），则直接使用
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
  // 成功时返回已验证且解析后的对象，失败将抛错
  return wh.verify(payload, svixHeaders as any);
}
