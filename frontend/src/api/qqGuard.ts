import { api, getApiBaseUrl } from './api';

export type QqGuardVerdict = 'violated' | 'clean' | 'undetermined';

export interface QqGuardAuditRow {
  _id?: string;
  traceId: string;
  event: string;
  groupId?: string;
  userId?: string;
  messageId?: string;
  content?: string;
  verdict?: QqGuardVerdict;
  reason?: string;
  httpCode?: number;
  attempt?: number;
  action?: string;
  status?: string;
  error?: string;
  meta?: Record<string, unknown>;
  createdAt: string;
}

export interface QqGuardPendingTask {
  traceId: string;
  groupId?: string;
  userId?: string;
  messageId?: string;
  content?: string;
  attempt: number;
  reason?: string;
  createdAt?: string;
}

export interface QqGuardWhitelistRow {
  _id?: string;
  userId: string;
  groupId: string;
  name?: string;
  reason?: string;
  addedBy: string;
  createdAt: string;
}

export interface QqGuardCommandRow {
  _id?: string;
  commandId: string;
  action: 'retry' | 'recall' | 'exempt';
  payload: Record<string, unknown>;
  status: 'pending' | 'done' | 'failed';
  result?: Record<string, unknown>;
  createdBy?: string;
  createdAt: string;
  ackedAt?: string;
}

export interface QqGuardAuditQuery {
  traceId?: string;
  groupId?: string;
  userId?: string;
  event?: string;
  verdict?: string;
  page?: number;
  limit?: number;
}

export interface QqGuardStats {
  byEvent: Record<string, number>;
  total: number;
}

export interface QqGuardHealth {
  online: boolean | null;
  latestEvent?: string;
  latestAt?: string;
  latestReason?: string;
  latestMeta?: Record<string, unknown>;
  recent?: Array<Record<string, unknown>>;
}

const BASE = () => `${getApiBaseUrl()}/api/admin/qq-guard`;

const toQuery = (params: Record<string, string | number | undefined>): string => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === '') continue;
    search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `?${query}` : '';
};

export const qqGuardApi = {
  stats: async (): Promise<QqGuardStats> => {
    const res = await api.get(`${BASE()}/stats`);
    return res.data;
  },

  health: async (): Promise<QqGuardHealth> => {
    const res = await api.get(`${BASE()}/health`);
    return res.data;
  },

  pending: async (limit = 50): Promise<QqGuardPendingTask[]> => {
    const res = await api.get(`${BASE()}/pending${toQuery({ limit })}`);
    return res.data.items;
  },

  audits: async (query: QqGuardAuditQuery): Promise<{ audits: QqGuardAuditRow[]; total: number }> => {
    const res = await api.get(`${BASE()}/audits${toQuery({ ...query })}`);
    return res.data;
  },

  timeline: async (traceId: string): Promise<QqGuardAuditRow[]> => {
    const res = await api.get(`${BASE()}/audits/${encodeURIComponent(traceId)}`);
    return res.data.events;
  },

  whitelist: async (): Promise<QqGuardWhitelistRow[]> => {
    const res = await api.get(`${BASE()}/whitelist`);
    return res.data.items;
  },

  addWhitelist: async (input: {
    userId: string;
    groupId?: string;
    name?: string;
    reason?: string;
  }): Promise<{ ok: boolean; existing?: boolean }> => {
    const res = await api.post(`${BASE()}/whitelist`, input);
    return res.data;
  },

  removeWhitelist: async (userId: string): Promise<void> => {
    await api.delete(`${BASE()}/whitelist/${encodeURIComponent(userId)}`);
  },

  commands: async (limit = 50): Promise<QqGuardCommandRow[]> => {
    const res = await api.get(`${BASE()}/commands${toQuery({ limit })}`);
    return res.data.commands;
  },

  createCommand: async (
    action: 'retry' | 'recall' | 'exempt',
    payload: Record<string, unknown>,
  ): Promise<{ commandId: string }> => {
    const res = await api.post(`${BASE()}/commands`, { action, payload });
    return res.data;
  },
};
