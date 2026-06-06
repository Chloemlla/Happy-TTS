import { mongoose } from "../services/mongoService";

export type AccountIdentityProvider = "google" | "linuxdo";
export type AccountIdentityStatus = "active" | "revoked";

export interface AccountIdentityDoc {
  provider: AccountIdentityProvider;
  providerUserId: string;
  userId: string;
  providerEmail: string | null;
  providerUsername: string | null;
  avatarUrl: string | null;
  linkedAt: Date;
  lastUsedAt: Date | null;
  status: AccountIdentityStatus;
  createdAt: Date;
  updatedAt: Date;
}

const AccountIdentitySchema = new mongoose.Schema<AccountIdentityDoc>(
  {
    provider: { type: String, enum: ["google", "linuxdo"], required: true, index: true },
    providerUserId: { type: String, required: true },
    userId: { type: String, required: true, index: true },
    providerEmail: { type: String, default: null },
    providerUsername: { type: String, default: null },
    avatarUrl: { type: String, default: null },
    linkedAt: { type: Date, default: Date.now },
    lastUsedAt: { type: Date, default: null },
    status: { type: String, enum: ["active", "revoked"], default: "active", index: true },
  },
  {
    collection: "account_identities",
    timestamps: true,
  },
);

AccountIdentitySchema.index({ provider: 1, providerUserId: 1 }, { unique: true });
AccountIdentitySchema.index({ userId: 1, provider: 1, status: 1 });
AccountIdentitySchema.index({ providerEmail: 1 });

export const AccountIdentityModel =
  (mongoose.models.AccountIdentity as mongoose.Model<AccountIdentityDoc>) ||
  mongoose.model<AccountIdentityDoc>("AccountIdentity", AccountIdentitySchema);
