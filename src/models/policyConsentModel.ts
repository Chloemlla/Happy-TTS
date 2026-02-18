import { type Document, type Model, model, Schema } from "mongoose";

// 隐私政策同意记录接口
export interface IPolicyConsent extends Document {
  id: string;
  timestamp: number;
  version: string;
  fingerprint: string;
  checksum: string;
  userAgent?: string;
  ipAddress?: string;
  recordedAt: Date;
  isValid: boolean;
  expiresAt: Date;

  // 实例方法
  isExpired(): boolean;
}

// 静态方法接口
export interface IPolicyConsentModel extends Model<IPolicyConsent> {
  findValidConsent(fingerprint: string, version: string): Promise<IPolicyConsent | null>;
  cleanExpiredConsents(): Promise<{ deletedCount?: number }>;
  getStats(startDate?: Date, endDate?: Date): Promise<any[]>;
}

// 隐私政策同意记录Schema
const policyConsentSchema = new Schema<IPolicyConsent>(
  {
    id: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    timestamp: {
      type: Number,
      required: true,
    },
    version: {
      type: String,
      required: true,
      index: true,
    },
    fingerprint: {
      type: String,
      required: true,
      index: true,
    },
    checksum: {
      type: String,
      required: true,
    },
    userAgent: {
      type: String,
      maxlength: 500,
    },
    ipAddress: {
      type: String,
      index: true,
    },
    recordedAt: {
      type: Date,
      default: Date.now,
      // 索引在复合索引中定义
    },
    isValid: {
      type: Boolean,
      default: true,
      index: true,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
  },
  {
    timestamps: true,
    collection: "policy_consents",
  },
);

// 创建索引
// timestamp 字段不需要单独索引，复合索引和字段级索引已足够
policyConsentSchema.index({ fingerprint: 1, version: 1 });
policyConsentSchema.index({ ipAddress: 1, recordedAt: -1 });
policyConsentSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // TTL索引

// 实例方法：检查是否过期
policyConsentSchema.methods.isExpired = function (): boolean {
  return new Date() > this.expiresAt;
};

// 静态方法：查找有效的同意记录
policyConsentSchema.statics.findValidConsent = function (fingerprint: string, version: string) {
  return this.findOne({
    fingerprint,
    version,
    isValid: true,
    expiresAt: { $gt: new Date() },
  });
};

// 静态方法：清理过期记录
policyConsentSchema.statics.cleanExpiredConsents = function () {
  return this.deleteMany({
    $or: [{ expiresAt: { $lt: new Date() } }, { isValid: false }],
  });
};

// 静态方法：获取统计信息
policyConsentSchema.statics.getStats = function (startDate?: Date, endDate?: Date) {
  const match: any = {};

  if (startDate || endDate) {
    match.recordedAt = {};
    if (startDate) match.recordedAt.$gte = startDate;
    if (endDate) match.recordedAt.$lte = endDate;
  }

  return this.aggregate([
    { $match: match },
    {
      $group: {
        _id: {
          version: "$version",
          date: {
            $dateToString: {
              format: "%Y-%m-%d",
              date: "$recordedAt",
            },
          },
        },
        count: { $sum: 1 },
        uniqueFingerprints: { $addToSet: "$fingerprint" },
        uniqueIPs: { $addToSet: "$ipAddress" },
      },
    },
    {
      $project: {
        _id: 1,
        count: 1,
        uniqueFingerprints: { $size: "$uniqueFingerprints" },
        uniqueIPs: { $size: "$uniqueIPs" },
      },
    },
    { $sort: { "_id.date": -1, "_id.version": 1 } },
  ]);
};

export const PolicyConsent = model<IPolicyConsent, IPolicyConsentModel>("PolicyConsent", policyConsentSchema);
