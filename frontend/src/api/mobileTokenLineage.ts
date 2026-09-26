import { api, getApiBaseUrl } from './api';

/**
 * `sml_` 客户端登录令牌血缘的超管只读面板 API。
 * 契约：`docs/mobile-token-risk-control.md` §3/§5（P4 可视化）。
 * 所有端点都要求 superadmin 会话，只读；令牌明文永不出库（库里只有 SHA-256 哈希），
 * 哈希 / deviceId / IP 由服务端掩码后才下发，前端原样展示。
 */

/** 一代令牌的展示形状：掩码标识 + ISO 时间 + 属地。 */
export interface TokenGenerationRow {
  rotationIndex: number;
  tokenHash: string | null;
  lineageId: string | null;
  rotatedFrom: string | null;
  supersededTo: string | null;
  deviceId: string | null;
  deviceName: string | null;
  deviceFingerprint: string | null;
  createdAt: string | null;
  expiresAt: string | null;
  lastUsedAt: string | null;
  supersededAt: string | null;
  revokedAt: string | null;
  reusedAt: string | null;
  lastUsedIp: string | null;
  rotatedIp: string | null;
  reusedIp: string | null;
  verificationPending: boolean;
  riskSignals: string[];
  ipLocation: string | null;
  /** true = 未被顶替、未撤销、未过期，即这条链当前在用的那一张。 */
  current: boolean;
  [key: string]: unknown;
}

export interface MobileTokenOverviewCounts {
  totalTokens: number;
  activeTokens: number;
  supersededTokens: number;
  revokedTokens: number;
  lineages: number;
  reuseTotal: number;
  reuse24h: number;
}

export interface ReuseEventRow {
  userId: string;
  lineageId: string | null;
  rotationIndex: number;
  tokenHash?: string | null;
  deviceId: string | null;
  deviceName: string | null;
  deviceFingerprint?: string | null;
  supersededAt?: string | null;
  reusedAt: string | null;
  reusedIp: string | null;
  riskSignals?: string[];
  [key: string]: unknown;
}

export interface OverviewResponse {
  success: boolean;
  counts: MobileTokenOverviewCounts;
  recentReuse: ReuseEventRow[];
  /** 代次数越线的血缘（P5-②），按最高代倒序，最多 50 条。 */
  lineageAlerts: LineageAlertRow[];
  lineageAlertThreshold: number;
}

/** 一条代次数已达上限的血缘；字段与代次行同源，只是只回该链最高的一代。 */
export interface LineageAlertRow {
  userId: string;
  lineageId: string | null;
  rotationIndex: number;
  generationCount: number;
  deviceId: string | null;
  deviceName: string | null;
  createdAt: string | null;
  [key: string]: unknown;
}

export interface LineageParams {
  lineageId?: string;
  userId?: string;
}

export interface LineageResponse {
  success: boolean;
  generations: TokenGenerationRow[];
  total: number;
  truncated: boolean;
  filters: { lineageId: string | null; userId: string | null };
}

export interface ReuseParams {
  limit?: number;
  offset?: number;
  userId?: string;
}

export interface ReuseResponse {
  success: boolean;
  events: ReuseEventRow[];
  total: number;
  limit: number;
  offset: number;
  filters: { userId: string | null };
}

export interface GenerationsParams {
  userId: string;
  deviceFingerprint?: string;
  limit?: number;
  offset?: number;
}

export interface GenerationsResponse {
  success: boolean;
  generations: TokenGenerationRow[];
  total: number;
  limit: number;
  offset: number;
  summary: { lineages: number };
  filters: { userId: string; deviceFingerprint: string | null };
}

const BASE = () => `${getApiBaseUrl()}/api/admin/mobile-token`;

const toQuery = (params: Record<string, string | number | undefined>): string => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === '') continue;
    search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `?${query}` : '';
};

export const mobileTokenApi = {
  overview: async (): Promise<OverviewResponse> => {
    const res = await api.get(`${BASE()}/overview`);
    return res.data;
  },

  lineage: async (params: LineageParams = {}): Promise<LineageResponse> => {
    const res = await api.get(`${BASE()}/lineage${toQuery({ ...params })}`);
    return res.data;
  },

  reuse: async (params: ReuseParams = {}): Promise<ReuseResponse> => {
    const res = await api.get(`${BASE()}/reuse${toQuery({ ...params })}`);
    return res.data;
  },

  generations: async (params: GenerationsParams): Promise<GenerationsResponse> => {
    const res = await api.get(`${BASE()}/generations${toQuery({ ...params })}`);
    return res.data;
  },
};
