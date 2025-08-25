import { mongoose } from '../services/mongoService';

interface AccessTokenDoc {
  token: string;
  fingerprint: string;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date; // 过期时间，用于TTL索引
}

const AccessTokenSchema = new mongoose.Schema<AccessTokenDoc>({
  token: { type: String, required: true, unique: true, index: true },
  fingerprint: { type: String, required: true, index: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, required: true, index: true },
}, { timestamps: true });

// TTL索引，5分钟后自动删除
AccessTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// 复合索引，用于快速查询
AccessTokenSchema.index({ token: 1, fingerprint: 1 });
AccessTokenSchema.index({ fingerprint: 1, expiresAt: 1 });

const AccessTokenModel = (mongoose.models.AccessToken as mongoose.Model<AccessTokenDoc>) ||
  mongoose.model<AccessTokenDoc>('AccessToken', AccessTokenSchema);

export { AccessTokenModel, AccessTokenDoc }; 