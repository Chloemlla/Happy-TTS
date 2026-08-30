import mongoose, { type Document, Schema } from "mongoose";

export interface ICoinFlip extends Document {
  resultId: string;
  result: "heads" | "tails";
  userId?: string;
  username?: string;
  createdAt: Date;
}

const CoinFlipSchema: Schema<ICoinFlip> = new Schema<ICoinFlip>(
  {
    resultId: { type: String, required: true },
    result: { type: String, required: true, enum: ["heads", "tails"] },
    userId: { type: String, default: undefined },
    username: { type: String, default: undefined },
    createdAt: { type: Date, default: Date.now },
  },
  { collection: "coin_flips" },
);

// 结果 ID 全局唯一，供用户按 ID 校验结果、管理员检索
CoinFlipSchema.index({ resultId: 1 }, { unique: true });
// 管理列表按时间倒序分页
CoinFlipSchema.index({ createdAt: -1 });

export default mongoose.models.CoinFlip || mongoose.model<ICoinFlip>("CoinFlip", CoinFlipSchema);
