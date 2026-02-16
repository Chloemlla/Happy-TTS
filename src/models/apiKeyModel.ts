import { mongoose } from '../services/mongoService';

export interface ApiKeyDoc {
  keyId: string;          // 公开标识，如 ak_xxxx（前缀 + 8位随机）
  keyHash: string;        // SHA-256 哈希，存储而非明文
  name: string;           // 用户自定义名称
  userId: string;         // 所属用户 ID
  permissions: string[];  // 权限列表，如 ['tts', 'shorturl', 'status']
  rateLimit: number;      // 每分钟请求上限
  expiresAt: Date | null; // 过期时间，null 表示永不过期
  lastUsedAt: Date | null;
  lastUsedIp: string | null;
  usageCount: number;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const ApiKeySchema = new mongoose.Schema<ApiKeyDoc>({
  keyId:       { type: String, required: true, unique: true, index: true },
  keyHash:     { type: String, required: true, unique: true, index: true },
  name:        { type: String, required: true },
  userId:      { type: String, required: true, index: true },
  permissions: { type: [String], default: ['status'] },
  rateLimit:   { type: Number, default: 60 },
  expiresAt:   { type: Date, default: null },
  lastUsedAt:  { type: Date, default: null },
  lastUsedIp:  { type: String, default: null },
  usageCount:  { type: Number, default: 0 },
  enabled:     { type: Boolean, default: true },
  createdAt:   { type: Date, default: Date.now },
  updatedAt:   { type: Date, default: Date.now },
}, { timestamps: true });

// TTL 索引：过期后自动清理（可选，仅对设置了 expiresAt 的文档生效）
ApiKeySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0, partialFilterExpression: { expiresAt: { $ne: null } } });

const ApiKeyModel = (mongoose.models.ApiKey as mongoose.Model<ApiKeyDoc>) ||
  mongoose.model<ApiKeyDoc>('ApiKey', ApiKeySchema);

export { ApiKeyModel };
