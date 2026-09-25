import { mongoose } from "../services/mongoService";

export interface ProxycheckLookupLogDoc {
  ip: string;
  apiKeySlot: number;
  apiKeyHash: string;
  status: string;
  ok: boolean;
  risk: number | null;
  deduped: boolean;
  durationMs: number;
  error: string;
  createdAt: Date;
}

const ProxycheckLookupLogSchema = new mongoose.Schema<ProxycheckLookupLogDoc>(
  {
    ip: { type: String, required: true },
    apiKeySlot: { type: Number, required: true },
    apiKeyHash: { type: String, required: true },
    status: { type: String, required: true },
    ok: { type: Boolean, required: true, default: false },
    risk: { type: Number, default: null },
    deduped: { type: Boolean, required: true, default: false },
    durationMs: { type: Number, required: true, default: 0 },
    error: { type: String, required: true, default: "" },
    createdAt: { type: Date, default: Date.now },
  },
  {
    collection: "proxycheck_lookup_logs",
    timestamps: false,
  },
);

// This collection is write-only (dedup/audit trail; no find/aggregate consumer in the repo),
// so every index on it is pure write amplification — keep it index-free. A retention TTL is
// deferred until the owner decides the retention period.

export const ProxycheckLookupLogModel =
  (mongoose.models.ProxycheckLookupLog as mongoose.Model<ProxycheckLookupLogDoc>) ||
  mongoose.model<ProxycheckLookupLogDoc>("ProxycheckLookupLog", ProxycheckLookupLogSchema);
