import { api, getApiBaseUrl } from './api';

export interface AuditLogEntry {
  _id: string;
  userId: string;
  username: string;
  role: string;
  action: string;
  module: string;
  targetId?: string;
  targetName?: string;
  result: 'success' | 'failure';
  errorMessage?: string;
  detail?: Record<string, any>;
  ip: string;
  userAgent?: string;
  path?: string;
  method?: string;
  createdAt: string;
}

export interface AuditLogQuery {
  page?: number;
  pageSize?: number;
  module?: string;
  action?: string;
  userId?: string;
  result?: string;
  startDate?: string;
  endDate?: string;
  keyword?: string;
}

export interface AuditLogResponse {
  success: boolean;
  logs: AuditLogEntry[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AuditLogStats {
  success: boolean;
  byModule: { module: string; count: number }[];
  byResult: { result: string; count: number }[];
  last24h: number;
  total: number;
}

const BASE = () => `${getApiBaseUrl()}/api/admin/audit-logs`;

export const auditLogApi = {
  query: async (params: AuditLogQuery = {}): Promise<AuditLogResponse> => {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== '') qs.append(k, String(v));
    });
    const res = await api.get(`${BASE()}?${qs}`);
    return res.data;
  },

  getStats: async (): Promise<AuditLogStats> => {
    const res = await api.get(`${BASE()}/stats`);
    return res.data;
  },
};
