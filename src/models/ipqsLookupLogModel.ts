import { mongoose } from "../services/mongoService";

export interface IpqsLookupLogDoc {
  monthKey: string;
  apiKeySlot: number;
  apiKeyHash: string;
  ipAddress: string;
  fingerprint?: string;
  userAgent?: string;
  userLanguage?: string;
  requestId?: string;
  success: boolean;
  decision: "allow" | "challenge" | "skip" | "error";
  reason: string;
  fraudScore?: number;
  proxy?: boolean;
  vpn?: boolean;
  tor?: boolean;
  activeVpn?: boolean;
  activeTor?: boolean;
  recentAbuse?: boolean;
  botStatus?: boolean;
  strictness?: number;
  rawResponse?: Record<string, unknown>;
  errorMessage?: string;
  createdAt: Date;
}

const IpqsLookupLogSchema = new mongoose.Schema<IpqsLookupLogDoc>(
  {
    monthKey: { type: String, required: true, index: true },
    apiKeySlot: { type: Number, required: true, index: true },
    apiKeyHash: { type: String, required: true },
    ipAddress: { type: String, required: true, index: true },
    fingerprint: { type: String, default: undefined, index: true },
    userAgent: { type: String, default: undefined },
    userLanguage: { type: String, default: undefined },
    requestId: { type: String, default: undefined, index: true },
    success: { type: Boolean, required: true, default: false },
    decision: {
      type: String,
      enum: ["allow", "challenge", "skip", "error"],
      required: true,
    },
    reason: { type: String, required: true },
    fraudScore: { type: Number, default: undefined },
    proxy: { type: Boolean, default: undefined },
    vpn: { type: Boolean, default: undefined },
    tor: { type: Boolean, default: undefined },
    activeVpn: { type: Boolean, default: undefined },
    activeTor: { type: Boolean, default: undefined },
    recentAbuse: { type: Boolean, default: undefined },
    botStatus: { type: Boolean, default: undefined },
    strictness: { type: Number, default: undefined },
    rawResponse: { type: mongoose.Schema.Types.Mixed, default: undefined },
    errorMessage: { type: String, default: undefined },
    createdAt: { type: Date, default: Date.now, index: true },
  },
  {
    collection: "ipqs_lookup_logs",
    timestamps: false,
  },
);

IpqsLookupLogSchema.index({ monthKey: 1, apiKeySlot: 1, createdAt: -1 });

export const IpqsLookupLogModel =
  (mongoose.models.IpqsLookupLog as mongoose.Model<IpqsLookupLogDoc>) ||
  mongoose.model<IpqsLookupLogDoc>("IpqsLookupLog", IpqsLookupLogSchema);
