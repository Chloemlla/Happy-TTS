import { mongoose } from "../services/mongoService";

export interface ProxycheckProbeMismatch {
  ipv4vsWs: boolean;
  ipvEvsV6: boolean;
  timezoneVsGeo: boolean;
}

/**
 * 每一轴「是否具备判定条件」。true = 两侧前提都在，mismatch 的取值才有意义；
 * false = 缺一侧或该侧不是可比对的公网出口（反代 / 容器网关内网地址就是典型），
 * 此时 mismatch 恒为 false，前端不得渲染成「一致」。
 */
export interface ProxycheckProbeComparability {
  ipv4vsWs: boolean;
  ipvEvsV6: boolean;
  timezoneVsGeo: boolean;
}

export interface ProxycheckProbeReportDoc {
  /** 服务端解析出的上报方 IP（HTTP 请求侧，可信来源），非客户端自报。 */
  ip: string;
  httpExitIp?: string;
  wsExitIp?: string;
  ipv6Exit?: string;
  webrtcLeak?: boolean;
  timezone?: string;
  timezoneOffsetMin?: number;
  languages?: string[];
  userAgent?: string;
  uaPlatform?: string;
  hardwareConcurrency?: number;
  deviceMemory?: number;
  screenRes?: string;
  webdriver?: boolean;
  collectedAt?: string;
  /** 服务端自行判定的不一致标记，不采信客户端自报。 */
  flags: string[];
  mismatch: ProxycheckProbeMismatch;
  /**
   * 各轴是否具备判定条件（见 ProxycheckProbeComparability）。
   * 这是应用写入的形状；本判定改版前写入的旧文档没有这个字段，读出为 undefined，
   * 前端类型（frontend/src/api/ipRiskLogs.ts）相应地声明为可选。
   */
  comparability: ProxycheckProbeComparability;
  createdAt: Date;
}

const ProxycheckProbeReportSchema = new mongoose.Schema<ProxycheckProbeReportDoc>(
  {
    ip: { type: String, required: true },
    httpExitIp: { type: String, default: undefined },
    wsExitIp: { type: String, default: undefined },
    ipv6Exit: { type: String, default: undefined },
    webrtcLeak: { type: Boolean, default: undefined },
    timezone: { type: String, default: undefined },
    timezoneOffsetMin: { type: Number, default: undefined },
    languages: { type: [String], default: undefined },
    userAgent: { type: String, default: undefined },
    uaPlatform: { type: String, default: undefined },
    hardwareConcurrency: { type: Number, default: undefined },
    deviceMemory: { type: Number, default: undefined },
    screenRes: { type: String, default: undefined },
    webdriver: { type: Boolean, default: undefined },
    collectedAt: { type: String, default: undefined },
    flags: { type: [String], default: [] },
    mismatch: {
      ipv4vsWs: { type: Boolean, required: true, default: false },
      ipvEvsV6: { type: Boolean, required: true, default: false },
      timezoneVsGeo: { type: Boolean, required: true, default: false },
    },
    // 与 mismatch 同形。schema 上不设 required：判定改版前写入的旧文档没有这个字段，
    // 读出时按 undefined 处理即可，不回填也不改写历史判决（应用侧总是会写入它）。
    comparability: {
      ipv4vsWs: { type: Boolean, default: false },
      ipvEvsV6: { type: Boolean, default: false },
      timezoneVsGeo: { type: Boolean, default: false },
    },
    createdAt: { type: Date, default: Date.now },
  },
  {
    collection: "proxycheck_probe_reports",
    timestamps: false,
  },
);

// 该集合不再是只写集合：新增的 admin 日志面板会按 createdAt 倒序翻页读它（探测上报页），
// 所以补一条 { createdAt: -1 } 支撑排序与分页。字段本身不动：客户端自报字段仍然只用于
// 事后分析，服务端判定（flags / mismatch / comparability）才是权威。保留期同样待 owner 决定，不加 TTL。
ProxycheckProbeReportSchema.index({ createdAt: -1 });

export const ProxycheckProbeReportModel =
  (mongoose.models.ProxycheckProbeReport as mongoose.Model<ProxycheckProbeReportDoc>) ||
  mongoose.model<ProxycheckProbeReportDoc>("ProxycheckProbeReport", ProxycheckProbeReportSchema);
