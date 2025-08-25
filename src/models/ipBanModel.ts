import { mongoose } from '../services/mongoService';

interface IpBanDoc {
  ipAddress: string;
  reason: string;
  violationCount: number; // 违规次数
  bannedAt: Date;
  expiresAt: Date; // 封禁到期时间
  fingerprint?: string; // 关联的指纹（可选）
  userAgent?: string; // 用户代理（可选）
}

const IpBanSchema = new mongoose.Schema<IpBanDoc>({
  ipAddress: { type: String, required: true, unique: true, index: true },
  reason: { type: String, required: true },
  violationCount: { type: Number, required: true, default: 1 },
  bannedAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, required: true, index: true },
  fingerprint: { type: String, index: true },
  userAgent: { type: String },
}, { timestamps: true });

// TTL索引，封禁到期后自动删除
IpBanSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// 复合索引
IpBanSchema.index({ ipAddress: 1, expiresAt: 1 });
IpBanSchema.index({ fingerprint: 1, expiresAt: 1 });

const IpBanModel = (mongoose.models.IpBan as mongoose.Model<IpBanDoc>) ||
  mongoose.model<IpBanDoc>('IpBan', IpBanSchema);

export { IpBanModel, IpBanDoc }; 