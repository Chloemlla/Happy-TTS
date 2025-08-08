import mongoose, { Schema, Document } from 'mongoose';

export interface IShortUrl extends Document {
  code: string;
  target: string;
  userId: string;
  username: string;
  createdAt: Date;
}

const ShortUrlSchema: Schema<IShortUrl> = new Schema<IShortUrl>(
  {
    code: { type: String, required: true },
    target: { type: String, required: true },
    userId: { type: String, default: 'admin' },
    username: { type: String, default: 'admin' },
    createdAt: { type: Date, default: Date.now }
  },
  { collection: 'short_urls' }
);

// 添加索引以提高查询性能
ShortUrlSchema.index({ code: 1 }, { unique: true });
ShortUrlSchema.index({ userId: 1 });
ShortUrlSchema.index({ createdAt: -1 });

export default mongoose.models.ShortUrl || mongoose.model<IShortUrl>('ShortUrl', ShortUrlSchema); 