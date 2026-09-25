import { api, getApiBaseUrl } from './api';

/**
 * proxycheck.io IP 风险检测管理端只读日志 API。
 * 契约：`.audit-reports/synapse-proxycheck-log-panel-2026-09-25.md` §2。
 * 所有端点都要求 superadmin 会话，只读，密钥一律由服务端 mask 后才下发。
 */

export type IpRiskCaller = 'api' | 'first_visit_gate' | 'batch';

export type IpRiskDecisionAction = 'report' | 'challenge' | 'allow' | 'fail_open' | 'fail_closed';

export type IpRiskLevel = 'low' | 'medium' | 'high' | 'critical';

export type IpRiskDecisionSource = 'cache' | 'proxycheck' | 'unavailable';

/** 一次「给前端的决策」的完整快照。落库在 lookup log 上；风险缓存页是按当前配置重算的。 */
export interface IpRiskDecision {
  caller: IpRiskCaller;
  action: IpRiskDecisionAction;
  shouldChallenge: boolean;
  reason: string;
  risk: number;
  level: IpRiskLevel;
  flags: string[];
  source: IpRiskDecisionSource;
  threshold: number;
  failOpen: boolean;
  closedOnFailure: boolean;
}

export interface ProxycheckSettingConfig {
  enabled: boolean;
  apiKey: string;
  hasApiKey: boolean;
  publicApiKey: string;
  hasPublicApiKey: boolean;
  payloadVerificationKey: string;
  hasPayloadVerificationKey: boolean;
  hmacSecret: string;
  hasHmacSecret: boolean;
  cacheTtlHours: number;
  timeoutMs: number;
  dailyQuotaPerKey: number;
  challengeRiskScore: number;
  failOpen: boolean;
  usePublicKeyForClient: boolean;
}

export interface ProxycheckOverviewCounts {
  lookupLogs: number;
  lookupLogs24h: number;
  /** 真的打到上游的行数（排除 status=cache）：与配额、外呼失败对应。 */
  upstreamCalls: number;
  upstreamCalls24h: number;
  riskCache: number;
  riskCacheActive: number;
  probeReports: number;
  probeReports24h: number;
}

export interface ProxycheckQuotaSummary {
  dayKey: string;
  apiKeySlot: number;
  count: number;
  limit: number;
  exhausted: boolean;
  exhaustedAt: string | null;
  lastUsedAt: string | null;
}

export interface ProxycheckQuotaHistoryRow {
  dayKey: string;
  apiKeySlot?: number;
  count: number;
  exhausted: boolean;
  apiKeyHash: string;
  exhaustedAt: string | null;
  lastUsedAt: string | null;
}

export interface ProxycheckCollectionInfo {
  name: string;
  indexes: string[];
  exists: boolean;
}

export interface ProxycheckOverviewResponse {
  success: boolean;
  setting: { config: ProxycheckSettingConfig; updatedAt: string | null };
  counts: ProxycheckOverviewCounts;
  quota: ProxycheckQuotaSummary;
  quotaHistory: ProxycheckQuotaHistoryRow[];
  collections: ProxycheckCollectionInfo[];
}

export interface ProxycheckLookupLogRow {
  _id: string;
  ip: string;
  apiKeySlot: number;
  apiKeyHash: string;
  status: string;
  ok: boolean;
  risk: number | null;
  deduped: boolean;
  durationMs: number;
  error: string;
  createdAt: string;
  /** 旧行（本次改造之前写入的）没有这个字段。 */
  decision?: IpRiskDecision | null;
  [key: string]: unknown;
}

// 'cache' = 命中 proxycheck_risk_cache 的决策行：零外呼、零配额，但当时确实交出了一个结论。
export type LookupStatusFilter =
  | ''
  | 'ok'
  | 'failed'
  | 'deduped'
  | 'quota_exhausted'
  | 'not_configured'
  | 'cache';

export type TriStateFilter = '' | 'true' | 'false';

export interface LookupsParams {
  limit?: number;
  offset?: number;
  ip?: string;
  status?: LookupStatusFilter;
  ok?: TriStateFilter;
  deduped?: TriStateFilter;
}

export interface LookupsFilters {
  ip: string | null;
  status: string | null;
  ok: boolean | null;
  deduped: boolean | null;
}

export interface LookupsResponse {
  success: boolean;
  logs: ProxycheckLookupLogRow[];
  total: number;
  limit: number;
  offset: number;
  filters: LookupsFilters;
}

/** `proxycheck_risk_cache` 文档原样字段（见 `src/models/proxycheckRiskCacheModel.ts`）。 */
export interface RiskCacheEntry {
  _id?: string;
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
  detectionsRaw?: Record<string, unknown> | null;
  lastUpdated?: string | null;
  queriedAt: string;
  expiresAt: string;
  source: string;
  expired: boolean;
  /** 按「当前」challengeRiskScore / failOpen 重算，不是历史记录。 */
  derivedDecision: IpRiskDecision | null;
  [key: string]: unknown;
}

export type RiskCacheState = 'active' | 'expired' | 'all';

export interface RiskCacheParams {
  limit?: number;
  offset?: number;
  ip?: string;
  state?: RiskCacheState;
}

export interface RiskCacheResponse {
  success: boolean;
  entries: RiskCacheEntry[];
  total: number;
  limit: number;
  offset: number;
  state: string;
}

/** `proxycheck_probe_reports` 文档原样字段（见 `src/models/proxycheckProbeReportModel.ts`）。 */
export interface ProbeReportRow {
  _id?: string;
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
  flags: string[];
  mismatch: {
    ipv4vsWs: boolean;
    ipvEvsV6: boolean;
    timezoneVsGeo: boolean;
  };
  /** 各轴是否具备判定条件；老文档（本判定改版前写入）没有这个字段，读出为 undefined。 */
  comparability?: {
    ipv4vsWs: boolean;
    ipvEvsV6: boolean;
    timezoneVsGeo: boolean;
  };
  createdAt: string;
  [key: string]: unknown;
}

export interface ProbeReportsParams {
  limit?: number;
  offset?: number;
  ip?: string;
}

export interface ProbeReportsResponse {
  success: boolean;
  reports: ProbeReportRow[];
  total: number;
  limit: number;
  offset: number;
}

export interface ProxycheckQuotaRow {
  dayKey: string;
  apiKeySlot: number;
  apiKeyHash: string;
  count: number;
  exhausted: boolean;
  exhaustedAt: string | null;
  lastUsedAt: string | null;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: unknown;
}

export interface QuotasResponse {
  success: boolean;
  quotas: ProxycheckQuotaRow[];
  limit: number;
}

const BASE = () => `${getApiBaseUrl()}/api/admin/proxycheck`;

const toQuery = (params: Record<string, string | number | undefined>): string => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === '') continue;
    search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `?${query}` : '';
};

export const ipRiskLogsApi = {
  overview: async (): Promise<ProxycheckOverviewResponse> => {
    const res = await api.get(`${BASE()}/overview`);
    return res.data;
  },

  lookups: async (params: LookupsParams = {}): Promise<LookupsResponse> => {
    const res = await api.get(`${BASE()}/lookups${toQuery({ ...params })}`);
    return res.data;
  },

  riskCache: async (params: RiskCacheParams = {}): Promise<RiskCacheResponse> => {
    const res = await api.get(`${BASE()}/risk-cache${toQuery({ ...params })}`);
    return res.data;
  },

  quotas: async (days = 30): Promise<QuotasResponse> => {
    const res = await api.get(`${BASE()}/quotas${toQuery({ days })}`);
    return res.data;
  },

  probeReports: async (params: ProbeReportsParams = {}): Promise<ProbeReportsResponse> => {
    const res = await api.get(`${BASE()}/probe-reports${toQuery({ ...params })}`);
    return res.data;
  },
};
