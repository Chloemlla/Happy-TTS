import mongoose, { type Document, Schema } from "mongoose";

export interface ICDK extends Document {
  code: string;
  resourceId: string;
  isUsed: boolean;
  usedAt?: Date;
  usedIp?: string;
  usedBy?: {
    userId: string;
    username: string;
  };
  expiresAt?: Date;
  createdAt: Date;
}

const CDKSchema: Schema<ICDK> = new Schema<ICDK>(
  {
    code: { type: String, required: true },
    resourceId: { type: String, required: true },
    isUsed: { type: Boolean, default: false },
    usedAt: Date,
    usedIp: String,
    usedBy: {
      userId: { type: String },
      username: { type: String },
    },
    expiresAt: Date,
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

// 添加索引以提高查询性能
CDKSchema.index({ code: 1 }, { unique: true });
CDKSchema.index({ resourceId: 1 });
CDKSchema.index({ isUsed: 1 });
CDKSchema.index({ expiresAt: 1 });
CDKSchema.index({ createdAt: -1 });

// 复合索引优化常用查询
CDKSchema.index({ resourceId: 1, isUsed: 1 }); // 按资源和使用状态查询
CDKSchema.index({ resourceId: 1, createdAt: -1 }); // 按资源和时间查询
CDKSchema.index({ isUsed: 1, createdAt: -1 }); // 按使用状态和时间查询
CDKSchema.index({ "usedBy.userId": 1, isUsed: 1 }); // 查询用户已兑换的CDK
CDKSchema.index({ expiresAt: 1, isUsed: 1 }); // 查询过期和未使用的CDK

export default mongoose.models.CDK || mongoose.model<ICDK>("CDK", CDKSchema);
