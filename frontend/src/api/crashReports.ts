import { api, getApiBaseUrl } from './api';

export interface CrashGroup {
  groupKey: string;
  versionCode: number;
  count: number;
  affectedUsers: number;
  risk: 'high' | 'medium' | 'low';
  cleanStack: string[];
  lastSeenAt: string | null;
}

export interface ListGroupsResponse {
  success: boolean;
  groups: CrashGroup[];
  total: number;
}

export interface FullCrashReport {
  _id: string;
  userId: string;
  deviceInstallationId: string;
  reportId: string;
  packageName: string;
  versionCode: number;
  crashedAtMillis: number;
  crashedAtText: string;
  exceptionType: string;
  rootCause: string;
  threadName: string;
  processName: string;
  systemInfo: string;
  stackTrace: string;
  recentEvents: string[];
  kind: string;
  durationMillis: number;
  authorName: string;
  authorUrl: string;
  authorFingerprint: string;
  groupKey: string;
  cleanStack: string[];
  receivedAt: number;
}

export interface GroupReportsResponse {
  success: boolean;
  reports: FullCrashReport[];
}

interface ListGroupsParams {
  limit?: number;
  offset?: number;
  source?: 'sdk' | 'app';
}

const BASE = () => `${getApiBaseUrl()}/api/admin/crash-reports`;

export const crashReportsApi = {
  listGroups: async (params: ListGroupsParams = {}): Promise<ListGroupsResponse> => {
    const qs = new URLSearchParams();
    if (params.limit !== undefined) qs.set('limit', String(params.limit));
    if (params.offset !== undefined) qs.set('offset', String(params.offset));
    if (params.source) qs.set('source', params.source);
    const query = qs.toString();
    const res = await api.get(`${BASE()}${query ? `?${query}` : ''}`);
    return res.data;
  },

  getGroupReports: async (groupKey: string): Promise<GroupReportsResponse> => {
    const res = await api.get(`${BASE()}/${encodeURIComponent(groupKey)}`);
    return res.data;
  },
};