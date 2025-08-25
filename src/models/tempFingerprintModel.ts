import { mongoose } from '../services/mongoService';

// 临时指纹文档接口
interface TempFingerprintDoc {
  fingerprint: string;
  verified: boolean;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date; // 过期时间，用于TTL索引
}

// 临时指纹Schema
const TempFingerprintSchema = new mongoose.Schema<TempFingerprintDoc>({
  fingerprint: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  verified: {
    type: Boolean,
    default: false,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
  expiresAt: {
    type: Date,
    required: true,
    index: true,
  },
}, {
  timestamps: true, // 自动管理 createdAt 和 updatedAt
});

// 创建TTL索引，自动删除过期文档（5分钟后过期）
TempFingerprintSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// 创建复合索引，提高查询性能
TempFingerprintSchema.index({ fingerprint: 1, verified: 1 });

// 获取模型实例
const TempFingerprintModel = (mongoose.models.TempFingerprint as mongoose.Model<TempFingerprintDoc>) || 
  mongoose.model<TempFingerprintDoc>('TempFingerprint', TempFingerprintSchema);

export { TempFingerprintModel, TempFingerprintDoc }; 