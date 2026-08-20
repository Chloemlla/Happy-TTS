import { mongoose } from "../services/mongoService";

/**
 * CDict 赞赏署名申请。
 *
 * 赞赏者在客户端填交易号与想展示的称呼，开发者在后台核对交易号后把称呼加入鸣谢名单。
 * 这里只存交易号与称呼两项——都是提交者自己填的，不记 IP、不记设备信息。
 */
export interface CDictDonationClaimDoc {
  transactionId: string;
  displayName: string;
  createdAt?: Date;
}

const CDictDonationClaimSchema = new mongoose.Schema<CDictDonationClaimDoc>(
  {
    transactionId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      maxlength: 64,
    },
    displayName: {
      type: String,
      required: true,
      maxlength: 32,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { collection: "cdict_donation_claims" },
);

export const CDictDonationClaimModel =
  (mongoose.models.CDictDonationClaim as mongoose.Model<CDictDonationClaimDoc>) ||
  mongoose.model<CDictDonationClaimDoc>("CDictDonationClaim", CDictDonationClaimSchema);
