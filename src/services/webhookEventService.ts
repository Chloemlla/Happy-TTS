import mongoose, { Schema } from 'mongoose';

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
    const skip = (page - 1) * pageSize;
    const [items, total] = await Promise.all([
      WebhookEventModel.find().sort({ receivedAt: -1 }).skip(skip).limit(pageSize).lean(),
      WebhookEventModel.countDocuments(),
    ]);
    return { items, total, page, pageSize };
  },
  async get(id: string) {
    return WebhookEventModel.findById(id).lean();
  },
  async update(id: string, patch: any) {
    return WebhookEventModel.findByIdAndUpdate(id, { $set: patch, updatedAt: new Date() }, { new: true }).lean();
  },
  async remove(id: string) {
    await WebhookEventModel.findByIdAndDelete(id);
    return { success: true };
  },
};
