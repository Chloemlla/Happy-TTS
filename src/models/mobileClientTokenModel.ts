/**
 * 扫码登录客户端长效令牌（sml_）的 Mongo 存储。
 * G2-18: 从 data/mobile_login_client_tokens.json 迁到独立集合，
 * tokenHash 唯一索引 + expiresAt TTL 索引，读写改为单文档原子操作。
 */
import { mongoose } from "../services/mongoService";

export interface MobileClientTokenDoc {
  tokenHash: string;
  userId: string;
  deviceId?: string;
  deviceName?: string;
  createdAt: number;
  expiresAt: number;
  lastUsedAt?: number;
  lastUsedIp?: string;
  revokedAt?: number;
}

const mobileClientTokenSchema = new mongoose.Schema<MobileClientTokenDoc>(
  {
    tokenHash: { type: String, required: true, unique: true },
    userId: { type: String, required: true },
    deviceId: { type: String },
    deviceName: { type: String },
    createdAt: { type: Number, required: true },
    expiresAt: { type: Number, required: true },
    lastUsedAt: { type: Number },
    lastUsedIp: { type: String },
    revokedAt: { type: Number },
  },
  { collection: "mobile_client_tokens" },
);

// TTL 索引：Mongo TTL 需要 Date 字段，这里用 ttlExpireAt 承载，由服务在写入时填充。
mobileClientTokenSchema.add({
  ttlExpireAt: { type: Date },
});
mobileClientTokenSchema.index({ ttlExpireAt: 1 }, { expireAfterSeconds: 0 });
mobileClientTokenSchema.index({ tokenHash: 1 }, { unique: true });
mobileClientTokenSchema.index({ userId: 1, revokedAt: 1 });

export const MobileClientTokenModel =
  (mongoose.models.MobileClientToken as mongoose.Model<MobileClientTokenDoc & { ttlExpireAt?: Date }>) ||
  mongoose.model<MobileClientTokenDoc & { ttlExpireAt?: Date }>("MobileClientToken", mobileClientTokenSchema);
