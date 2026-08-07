import { mongoose } from "../../services/mongoService.js";

export type EntitlementTier = "FREE" | "PRO" | "PLUS" | "TEAM" | "DEVELOPER";
export type EntitlementStatus = "active" | "pending" | "expired" | "revoked" | "cancelled";

export interface IEntitlement {
  _id: string;
  userId: string;
  source: string;
  productId: string;
  purchaseToken: string;
  tier: EntitlementTier;
  status: EntitlementStatus;
  purchasedAt: number;
  expiresAt: number;
  lastVerifiedAt: number;
  rawPayloadJson: string;
}

const EntitlementSchema = new mongoose.Schema<IEntitlement>(
  {
    _id: { type: String },
    userId: { type: String, required: true },
    source: { type: String },
    productId: { type: String },
    purchaseToken: { type: String },
    tier: { type: String, enum: ["FREE", "PRO", "PLUS", "TEAM", "DEVELOPER"] },
    status: { type: String, enum: ["active", "pending", "expired", "revoked", "cancelled"] },
    purchasedAt: { type: Number },
    expiresAt: { type: Number },
    lastVerifiedAt: { type: Number },
    rawPayloadJson: { type: String },
  },
  { strict: true, timestamps: false, collection: "entitlements" },
);

EntitlementSchema.index({ userId: 1 });
EntitlementSchema.index({ userId: 1, tier: 1 });
EntitlementSchema.index({ status: 1, expiresAt: 1 });

const Entitlement =
  (mongoose.models.Entitlement as mongoose.Model<IEntitlement>) ||
  mongoose.model<IEntitlement>("Entitlement", EntitlementSchema);

export { Entitlement, EntitlementSchema };