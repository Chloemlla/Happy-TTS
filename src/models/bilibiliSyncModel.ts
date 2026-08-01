import { mongoose } from "../services/mongoService";

export interface BilibiliSyncSettings {
  [key: string]: unknown;
}

export interface BilibiliSearchRecord {
  id: string;
  keyword: string;
  dedupeKey: string;
  createdAt: string;
  updatedAt: string;
  isDeleted: boolean;
  deletedAt: string | null;
  serverUpdatedAt: Date;
}

export interface BilibiliSyncDoc {
  userId: string;
  bilibiliUid?: string;
  uidBoundAt: Date | null;
  settings: BilibiliSyncSettings;
  settingsVersion: number;
  settingsUpdatedAt: Date | null;
  searchRecords: BilibiliSearchRecord[];
  createdAt: Date;
  updatedAt: Date;
  credentialCiphertext?: string;
  credentialIv?: string;
  credentialTag?: string;
  credentialKeyVersion?: string;
  credentialStatus: "active" | "invalid";
  credentialValidatedAt: Date | null;
  credentialLastCheckedAt: Date | null;
}

const searchRecordSchema = new mongoose.Schema<BilibiliSearchRecord>(
  {
    id: { type: String, required: true },
    keyword: { type: String, required: true },
    dedupeKey: { type: String, required: true },
    createdAt: { type: String, required: true },
    updatedAt: { type: String, required: true },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: String, default: null },
    serverUpdatedAt: { type: Date, required: true },
  },
  { _id: false },
);

const bilibiliSyncSchema = new mongoose.Schema<BilibiliSyncDoc>(
  {
    userId: { type: String, required: true, unique: true, index: true },
    bilibiliUid: { type: String, index: true, sparse: true },
    uidBoundAt: { type: Date, default: null },
    settings: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
    settingsVersion: { type: Number, required: true, default: 0 },
    settingsUpdatedAt: { type: Date, default: null },
    searchRecords: { type: [searchRecordSchema], default: [] },
    credentialCiphertext: { type: String, select: false },
    credentialIv: { type: String, select: false },
    credentialTag: { type: String, select: false },
    credentialKeyVersion: { type: String, select: false },
    credentialStatus: { type: String, enum: ["active", "invalid"], default: "invalid" },
    credentialValidatedAt: { type: Date, default: null },
    credentialLastCheckedAt: { type: Date, default: null },
  },
  {
    collection: "bilibili_sync",
    timestamps: true,
  },
);

bilibiliSyncSchema.index({ bilibiliUid: 1 }, { unique: true, sparse: true });
bilibiliSyncSchema.index({ userId: 1, "searchRecords.serverUpdatedAt": 1 });

export const BilibiliSyncModel =
  (mongoose.models.BilibiliSync as mongoose.Model<BilibiliSyncDoc>) ||
  mongoose.model<BilibiliSyncDoc>("BilibiliSync", bilibiliSyncSchema);
