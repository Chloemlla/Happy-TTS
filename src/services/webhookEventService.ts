import mongoose, { Schema } from 'mongoose';
import type { IncomingHttpHeaders } from 'http';
import { Webhook as SvixWebhook } from 'svix';

const WebhookEventSchema = new Schema({
  provider: { type: String, default: 'resend' },
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

WebhookEventSchema.index({ provider: 1, eventId: 1 }, { unique: false });
WebhookEventSchema.pre('save', function(next) { (this as any).updatedAt = new Date(); next(); });

export const WebhookEventModel = mongoose.models.WebhookEvent || mongoose.model('WebhookEvent', WebhookEventSchema);

export const WebhookEventService = {
  async create(doc: any) {
    const created = await WebhookEventModel.create(doc);
    return created.toObject();
  },
  async list({ page = 1, pageSize = 20 }: { page?: number; pageSize?: number }) {
    // Normalize and cap pagination to prevent abuse
    const p = Number.isFinite(Number(page)) ? Math.max(1, Number(page)) : 1;
    const ps = Number.isFinite(Number(pageSize)) ? Math.min(100, Math.max(1, Number(pageSize))) : 20;
    const skip = (p - 1) * ps;
    const [items, total] = await Promise.all([
      WebhookEventModel.find().sort({ receivedAt: -1 }).skip(skip).limit(ps).lean(),
      WebhookEventModel.countDocuments(),
    ]);
    return { items, total, page: p, pageSize: ps };
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
export function verifyResendWebhook(payload: string, headers: IncomingHttpHeaders) {
  const rawSecret = process.env.RESEND_WEBHOOK_SECRET || process.env.WEBHOOK_SECRET;
  if (!rawSecret) {
    throw new Error('RESEND_WEBHOOK_SECRET 未配置');
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
