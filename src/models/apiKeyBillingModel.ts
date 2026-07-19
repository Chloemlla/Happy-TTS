import { mongoose } from "../services/mongoService";

export type ApiKeyBillingMode = "metered" | "prepaid";
export type ApiKeyBillingEventType = "reservation" | "charge" | "adjustment" | "waived" | "refund";
export type ApiKeyBillingEventState = "pending" | "completed";

export interface ApiKeyBillingEventDoc {
  operationId: string;
  keyId: string;
  userId: string;
  type: ApiKeyBillingEventType;
  state: ApiKeyBillingEventState;
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
  reservationExpiresAt: Date | null;
  finalizedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const ApiKeyBillingEventSchema = new mongoose.Schema<ApiKeyBillingEventDoc>(
  {
    operationId: { type: String, required: true },
    keyId: { type: String, required: true, index: true },
    userId: { type: String, required: true, index: true },
    type: {
      type: String,
      enum: ["reservation", "charge", "adjustment", "waived", "refund"],
      required: true,
      index: true,
    },
    state: {
      type: String,
      enum: ["pending", "completed"],
      required: true,
      default: "completed",
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
    reservationExpiresAt: { type: Date, default: null, index: true },
    finalizedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

ApiKeyBillingEventSchema.index(
  { operationId: 1 },
  { unique: true, partialFilterExpression: { operationId: { $type: "string" } } },
);
ApiKeyBillingEventSchema.index({ keyId: 1, createdAt: -1 });
ApiKeyBillingEventSchema.index({ userId: 1, createdAt: -1 });
ApiKeyBillingEventSchema.index({ state: 1, reservationExpiresAt: 1 });

const ApiKeyBillingEventModel =
  (mongoose.models.ApiKeyBillingEvent as mongoose.Model<ApiKeyBillingEventDoc>) ||
  mongoose.model<ApiKeyBillingEventDoc>("ApiKeyBillingEvent", ApiKeyBillingEventSchema);

export { ApiKeyBillingEventModel };
