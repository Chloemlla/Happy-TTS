import { mongoose } from "../services/mongoService";

export interface IpqsQuotaDoc {
  monthKey: string;
  apiKeySlot: number;
  apiKeyHash: string;
  usageCount: number;
  exhaustedAt?: Date;
  lastUsedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const IpqsQuotaSchema = new mongoose.Schema<IpqsQuotaDoc>(
  {
    monthKey: { type: String, required: true, index: true },
    apiKeySlot: { type: Number, required: true, index: true },
    apiKeyHash: { type: String, required: true },
    usageCount: { type: Number, required: true, default: 0 },
    exhaustedAt: { type: Date, default: undefined },
    lastUsedAt: { type: Date, default: undefined },
  },
  {
    collection: "ipqs_monthly_quotas",
    timestamps: true,
  },
);

IpqsQuotaSchema.index({ monthKey: 1, apiKeySlot: 1 }, { unique: true });

export const IpqsQuotaModel =
  (mongoose.models.IpqsQuota as mongoose.Model<IpqsQuotaDoc>) ||
  mongoose.model<IpqsQuotaDoc>("IpqsQuota", IpqsQuotaSchema);
