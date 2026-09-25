import { mongoose } from "../services/mongoService";

/**
 * 与 src/services/ipRiskService 的 IpRiskDecision 同形。这里逐字重声明而不 import 那边的类型：
 * model 依赖 service 会造出 models → services 的反向依赖。改一边必须同步改另一边。
 */
export interface ProxycheckLookupLogDecisionDoc {
  caller: "api" | "first_visit_gate" | "batch";
  action: "report" | "challenge" | "allow" | "fail_open" | "fail_closed";
  shouldChallenge: boolean;
  reason: string;
  risk: number;
  level: "low" | "medium" | "high" | "critical";
  flags: string[];
  source: "cache" | "proxycheck" | "unavailable";
  threshold: number;
  failOpen: boolean;
  closedOnFailure: boolean;
}

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
  /** 这次查询交给前端的决策快照；旧行与「合并没有产出结论」的行没有该字段。 */
  decision?: ProxycheckLookupLogDecisionDoc;
}

const ProxycheckLookupLogDecisionSchema = new mongoose.Schema<ProxycheckLookupLogDecisionDoc>(
  {
    caller: { type: String, required: true },
    action: { type: String, required: true },
    shouldChallenge: { type: Boolean, required: true, default: false },
    reason: { type: String, required: true, default: "" },
    risk: { type: Number, required: true, default: 0 },
    level: { type: String, required: true },
    flags: { type: [String], default: [] },
    source: { type: String, required: true },
    threshold: { type: Number, required: true, default: 0 },
    failOpen: { type: Boolean, required: true, default: false },
    closedOnFailure: { type: Boolean, required: true, default: false },
  },
  { _id: false },
);

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
    // 单嵌套子文档而非 Mixed：管理端面板要按字段展示 decision，类型必须显式。
    // default: undefined = 该行没有决策时字段根本不落库（旧行也不受影响）。
    decision: { type: ProxycheckLookupLogDecisionSchema, default: undefined },
  },
  {
    collection: "proxycheck_lookup_logs",
    timestamps: false,
  },
);

// 该集合不再是只写集合：新增的 admin 日志面板会按 createdAt 倒序翻页读它（「api 请求日志」页），
// 所以补一条 { createdAt: -1 } 支撑排序与分页。保留期不在这里改：TTL 仍然待 owner 定，
// 本集合刻意不加 expireAfterSeconds（写放大只多了这一个索引）。
ProxycheckLookupLogSchema.index({ createdAt: -1 });

export const ProxycheckLookupLogModel =
  (mongoose.models.ProxycheckLookupLog as mongoose.Model<ProxycheckLookupLogDoc>) ||
  mongoose.model<ProxycheckLookupLogDoc>("ProxycheckLookupLog", ProxycheckLookupLogSchema);
