import { api } from './api';

export interface TranslationLogEntry {
  _id: string;
  userId: string;
  timestamp: string;
  input_text: string;
  output_text: string;
  ip_address: string;
  request_meta?: Record<string, unknown>;
}

export interface TranslationLogQuery {
  page?: number;
  pageSize?: number;
  userId?: string;
  keyword?: string;
  startDate?: string;
  endDate?: string;
}

export interface TranslationLogResponse {
  success: boolean;
  logs: TranslationLogEntry[];
  total: number;
  page: number;
  pageSize: number;
}

export interface TranslationLogStats {
  success: boolean;
  total: number;
  last24h: number;
  topUsers: Array<{ userId: string; count: number }>;
}

export interface TranslationTraceUser {
  id: string;
  username: string;
  email: string;
  role: string;
  createdAt: string;
  accountStatus?: 'active' | 'suspended';
  isTranslationEnabled?: boolean;
  translationAccessUntil?: string;
}

export type TranslationPenaltyAction =
  | 'LIMIT_TRANSLATION'
  | 'REVOKE_PAGE_ACCESS'
  | 'SUSPEND_ACCOUNT'
  | 'DELETE_USER'
  | 'CLEAR_TRANSLATION_RESTRICTIONS';

export const translationAuditApi = {
  query: async (params: TranslationLogQuery = {}): Promise<TranslationLogResponse> => {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== '') {
        query.append(key, String(value));
      }
    });
    const response = await api.get(`/api/admin/translation-logs?${query.toString()}`);
    return response.data;
  },

  getStats: async (): Promise<TranslationLogStats> => {
    const response = await api.get('/api/admin/translation-logs/stats');
    return response.data;
  },

  getUser: async (userId: string): Promise<TranslationTraceUser> => {
    const response = await api.get(`/api/admin/users/${userId}`);
    return response.data.user;
  },

  applyPenalty: async (userId: string, action: TranslationPenaltyAction, until?: string) => {
    const response = await api.post(`/api/admin/users/${userId}/translation-penalty`, {
      action,
      until,
    });
    return response.data as { success: boolean; message: string };
  },
};
