import { mongoose } from "../services/mongoService";

const encryptedPayloadSchema = new mongoose.Schema(
  {
    alg: { type: String, required: true },
    kdf: { type: String, required: true },
    keyId: { type: String, required: true },
    nonce: { type: String, required: true },
    aad: { type: String },
    ciphertext: { type: String, required: true },
  },
  { _id: false },
);

const nexaiEncryptedSyncRecordSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, index: true },
    category: { type: String, required: true },
    recordId: { type: String, required: true },
    revision: { type: Number, required: true, index: true },
    updatedAt: { type: String, required: true },
    deleted: { type: Boolean, default: false },
    crypto: { type: encryptedPayloadSchema, required: true },
    metadata: { type: mongoose.Schema.Types.Mixed },
    deviceId: { type: String },
    snapshotId: { type: String },
  },
  {
    collection: "nexai_sync_v2_records",
    timestamps: { createdAt: true, updatedAt: "updatedAtServer" },
  },
);

nexaiEncryptedSyncRecordSchema.index({ userId: 1, category: 1, recordId: 1 }, { unique: true });
nexaiEncryptedSyncRecordSchema.index({ userId: 1, revision: 1 });

const nexaiEncryptedSyncCounterSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, unique: true, index: true },
    revision: { type: Number, required: true, default: 0 },
  },
  {
    collection: "nexai_sync_v2_counters",
    timestamps: true,
  },
);

export interface INexaiEncryptedPayload {
  alg: string;
  kdf: string;
  keyId: string;
  nonce: string;
  aad?: string;
  ciphertext: string;
}

export interface INexaiEncryptedSyncRecord {
  userId: string;
  category: string;
  recordId: string;
  revision: number;
  updatedAt: string;
  deleted: boolean;
  crypto: INexaiEncryptedPayload;
  metadata?: unknown;
  deviceId?: string;
  snapshotId?: string;
  createdAt?: Date;
  updatedAtServer?: Date;
}

export interface INexaiEncryptedSyncCounter {
  userId: string;
  revision: number;
}

export const NexaiEncryptedSyncRecordModel =
  mongoose.models.NexaiEncryptedSyncRecord ||
  mongoose.model("NexaiEncryptedSyncRecord", nexaiEncryptedSyncRecordSchema);

export const NexaiEncryptedSyncCounterModel =
  mongoose.models.NexaiEncryptedSyncCounter ||
  mongoose.model("NexaiEncryptedSyncCounter", nexaiEncryptedSyncCounterSchema);
