import { mongoose } from "../services/mongoService";

export interface ProxycheckQuotaDoc {
  dayKey: string;
  apiKeySlot: number;
  apiKeyHash: string;
  count: number;
  exhaustedAt?: Date;
  lastUsedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const ProxycheckQuotaSchema = new mongoose.Schema<ProxycheckQuotaDoc>(
  {
    dayKey: { type: String, required: true },
    apiKeySlot: { type: Number, required: true },
    apiKeyHash: { type: String, required: true },
    count: { type: Number, required: true, default: 0 },
    exhaustedAt: { type: Date, default: undefined },
    lastUsedAt: { type: Date, default: undefined },
  },
  {
    collection: "proxycheck_daily_quotas",
    timestamps: true,
  },
);

// 复合唯一索引同时充当 dayKey 前缀索引，因此不再单独给 dayKey / apiKeySlot 建索引。
ProxycheckQuotaSchema.index({ dayKey: 1, apiKeySlot: 1 }, { unique: true });

export const ProxycheckQuotaModel =
  (mongoose.models.ProxycheckQuota as mongoose.Model<ProxycheckQuotaDoc>) ||
  mongoose.model<ProxycheckQuotaDoc>("ProxycheckQuota", ProxycheckQuotaSchema);
