import { mongoose } from "../services/mongoService";

export interface BilibiliAccountClientIdentity {
  clientId?: string;
  clientName?: string;
  clientVersion?: string;
  clientBuild?: string;
  deviceId?: string;
  deviceName?: string;
  platform?: string;
}

export interface BilibiliAccountBindingDoc {
  userId: string;
  bilibiliUid: string;
  isPrimary: boolean;
  uidBoundAt: Date;
  credentialCiphertext: string;
  credentialIv: string;
  credentialTag: string;
  credentialKeyVersion: string;
  credentialStatus: "active" | "invalid";
  credentialValidatedAt: Date | null;
  credentialLastCheckedAt: Date | null;
  device: Record<string, unknown>;
  permissions: Record<string, string>;
  client: BilibiliAccountClientIdentity;
  lastSyncedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const clientIdentitySchema = new mongoose.Schema<BilibiliAccountClientIdentity>(
  {
    clientId: { type: String, default: undefined },
    clientName: { type: String, default: undefined },
    clientVersion: { type: String, default: undefined },
    clientBuild: { type: String, default: undefined },
    deviceId: { type: String, default: undefined },
    deviceName: { type: String, default: undefined },
    platform: { type: String, default: undefined },
  },
  { _id: false },
);

const bilibiliAccountBindingSchema = new mongoose.Schema<BilibiliAccountBindingDoc>(
  {
    userId: { type: String, required: true, index: true },
    bilibiliUid: { type: String, required: true },
    isPrimary: { type: Boolean, default: false },
    uidBoundAt: { type: Date, required: true },
    credentialCiphertext: { type: String, required: true, select: false },
    credentialIv: { type: String, required: true, select: false },
    credentialTag: { type: String, required: true, select: false },
    credentialKeyVersion: { type: String, required: true, select: false },
    credentialStatus: { type: String, enum: ["active", "invalid"], default: "active" },
    credentialValidatedAt: { type: Date, default: null },
    credentialLastCheckedAt: { type: Date, default: null },
    device: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
    permissions: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
    client: { type: clientIdentitySchema, default: () => ({}) },
    lastSyncedAt: { type: Date, required: true },
  },
  {
    collection: "bilibili_account_bindings",
    timestamps: true,
  },
);

bilibiliAccountBindingSchema.index({ userId: 1, bilibiliUid: 1 }, { unique: true });

export const BilibiliAccountBindingModel =
  (mongoose.models.BilibiliAccountBinding as mongoose.Model<BilibiliAccountBindingDoc>) ||
  mongoose.model<BilibiliAccountBindingDoc>("BilibiliAccountBinding", bilibiliAccountBindingSchema);
