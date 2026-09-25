import { mongoose } from "../services/mongoService";

export interface ProxycheckRiskCacheDoc {
  ip: string;
  risk: number;
  anonymous: boolean;
  proxy: boolean;
  vpn: boolean;
  tor: boolean;
  hosting: boolean;
  scraper: boolean;
  compromised: boolean;
  confidence: number;
  networkType: string;
  provider: string;
  asn: string;
  range: string;
  organisation: string;
  hostname: string;
  continent: string;
  country: string;
  isocode: string;
  region: string;
  city: string;
  latitude?: number | null;
  longitude?: number | null;
  timezone: string;
  detectionsRaw?: Record<string, unknown>;
  lastUpdated?: Date | null;
  queriedAt: Date;
  expiresAt: Date;
  source: string;
}

const ProxycheckRiskCacheSchema = new mongoose.Schema<ProxycheckRiskCacheDoc>(
  {
    ip: { type: String, required: true, unique: true },
    risk: { type: Number, required: true, default: 0 },
    anonymous: { type: Boolean, required: true, default: false },
    proxy: { type: Boolean, required: true, default: false },
    vpn: { type: Boolean, required: true, default: false },
    tor: { type: Boolean, required: true, default: false },
    hosting: { type: Boolean, required: true, default: false },
    scraper: { type: Boolean, required: true, default: false },
    compromised: { type: Boolean, required: true, default: false },
    confidence: { type: Number, required: true, default: 0 },
    networkType: { type: String, required: true, default: "" },
    provider: { type: String, required: true, default: "" },
    asn: { type: String, required: true, default: "" },
    range: { type: String, required: true, default: "" },
    organisation: { type: String, required: true, default: "" },
    hostname: { type: String, required: true, default: "" },
    continent: { type: String, required: true, default: "" },
    country: { type: String, required: true, default: "" },
    isocode: { type: String, required: true, default: "" },
    region: { type: String, required: true, default: "" },
    city: { type: String, required: true, default: "" },
    latitude: { type: Number, default: null },
    longitude: { type: Number, default: null },
    timezone: { type: String, required: true, default: "" },
    detectionsRaw: { type: mongoose.Schema.Types.Mixed, default: undefined },
    lastUpdated: { type: Date, default: null },
    queriedAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
    source: { type: String, required: true, default: "proxycheck" },
  },
  {
    collection: "proxycheck_risk_cache",
    timestamps: false,
  },
);

// expiresAt 支撑「同 IP 只打一次上游」：查询窗口内直接命中本集合，过期后自动消失。
// TTL 后台线程最长有 60s 才删除过期文档，所以读取侧仍然显式带 `expiresAt > now`，
// 不能只依赖索引删除。
ProxycheckRiskCacheSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const ProxycheckRiskCacheModel =
  (mongoose.models.ProxycheckRiskCache as mongoose.Model<ProxycheckRiskCacheDoc>) ||
  mongoose.model<ProxycheckRiskCacheDoc>("ProxycheckRiskCache", ProxycheckRiskCacheSchema);
