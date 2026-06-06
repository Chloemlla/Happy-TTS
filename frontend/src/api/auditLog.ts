import { api, getApiBaseUrl } from './api';

export interface AuditLogEntry {
  _id: string;
  requestId?: string;
  userId: string;
  username: string;
  role: string;
  action: string;
  module: string;
  targetId?: string;
  targetName?: string;
  result: 'success' | 'failure';
  errorMessage?: string;
  detail?: Record<string, unknown>;
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
  username?: string;
  role?: string;
  result?: string;
  startDate?: string;
  endDate?: string;
  keyword?: string;
  requestId?: string;
  method?: string;
  path?: string;
  ip?: string;
  targetId?: string;
  targetName?: string;
  statusCode?: string | number;
  minDurationMs?: string | number;
  maxDurationMs?: string | number;
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
  topActions: { action: string; count: number }[];
  topUsers: { username: string; userId: string; count: number }[];
  byMethod: { method: string; count: number }[];
  byStatusCode: { statusCode: number; count: number }[];
  averageDurationMs: number;
  maxDurationMs: number;
  last24h: number;
  total: number;
}

export interface AuditLogMeta {
  success: boolean;
  modules: string[];
  results: string[];
  methods: string[];
  maxPageSize: number;
  maxExportRows: number;
  retentionDays: number;
  payloadCaptureEnabled: boolean;
  successPayloadCaptureEnabled: boolean;
}

const BASE = () => `${getApiBaseUrl()}/api/admin/audit-logs`;

const buildQueryString = (params: AuditLogQuery = {}) => {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== '') {
      qs.append(key, String(value));
    }
  });
  return qs.toString();
};

const downloadBlob = (data: BlobPart, filename: string, type: string) => {
  const blob = new Blob([data], { type });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
};

export const auditLogApi = {
  query: async (params: AuditLogQuery = {}): Promise<AuditLogResponse> => {
    const qs = buildQueryString(params);
    const res = await api.get(`${BASE()}?${qs}`);
    return res.data;
  },

  getStats: async (params: AuditLogQuery = {}): Promise<AuditLogStats> => {
    const qs = buildQueryString(params);
    const res = await api.get(`${BASE()}/stats?${qs}`);
    return res.data;
  },

  getMeta: async (): Promise<AuditLogMeta> => {
    const res = await api.get(`${BASE()}/meta`);
    return res.data;
  },

  exportCsv: async (params: AuditLogQuery = {}): Promise<number | null> => {
    const qs = buildQueryString(params);
    const response = await api.get(`${BASE()}/export?${qs}`, {
      responseType: 'blob',
    });

    const contentDisposition = response.headers['content-disposition'];
    let filename = `audit-logs-${new Date().toISOString().slice(0, 10)}.csv`;
    if (contentDisposition) {
      const filenameMatch = contentDisposition.match(/filename="(.+)"/i);
      if (filenameMatch) {
        filename = filenameMatch[1];
      }
    }

    downloadBlob(response.data, filename, 'text/csv;charset=utf-8');

    const countHeader = response.headers['x-audit-log-export-count'];
    const count = Number(countHeader);
    return Number.isFinite(count) ? count : null;
  },
};
