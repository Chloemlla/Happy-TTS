import { mongoose } from "../services/mongoService";

export type ApiKeyBillingMode = "metered" | "prepaid";
export type ApiKeyBillingEventType = "charge" | "adjustment" | "waived" | "refund";

export interface ApiKeyBillingEventDoc {
  keyId: string;
  userId: string;
  type: ApiKeyBillingEventType;
  permission: string;
  billingMode: ApiKeyBillingMode;
  costCredits: number;
  balanceDelta: number;
  balanceAfter: number | null;
  method: string | null;
  route: string | null;
  statusCode: number | null;
  requestId: string | null;
  reason: string | null;
  actorUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const ApiKeyBillingEventSchema = new mongoose.Schema<ApiKeyBillingEventDoc>(
  {
    keyId: { type: String, required: true, index: true },
    userId: { type: String, required: true, index: true },
    type: {
      type: String,
      enum: ["charge", "adjustment", "waived", "refund"],
      required: true,
      index: true,
    },
    permission: { type: String, required: true, index: true },
    billingMode: {
      type: String,
      enum: ["metered", "prepaid"],
      required: true,
      default: "metered",
    },
    costCredits: { type: Number, required: true, min: 0, default: 0 },
    balanceDelta: { type: Number, required: true, default: 0 },
    balanceAfter: { type: Number, default: null },
    method: { type: String, default: null },
    route: { type: String, default: null },
    statusCode: { type: Number, default: null },
    requestId: { type: String, default: null },
    reason: { type: String, default: null },
    actorUserId: { type: String, default: null },
  },
  { timestamps: true },
);

ApiKeyBillingEventSchema.index({ keyId: 1, createdAt: -1 });
ApiKeyBillingEventSchema.index({ userId: 1, createdAt: -1 });

const ApiKeyBillingEventModel =
  (mongoose.models.ApiKeyBillingEvent as mongoose.Model<ApiKeyBillingEventDoc>) ||
  mongoose.model<ApiKeyBillingEventDoc>("ApiKeyBillingEvent", ApiKeyBillingEventSchema);

export { ApiKeyBillingEventModel };
