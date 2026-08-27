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
  total: number;
  limit: number;
  offset: number;
}

export type CrashGroupSort = 'lastSeenAt' | 'count' | 'affectedUsers' | 'versionCode' | 'risk';

export interface ListGroupsParams {
  limit?: number;
  offset?: number;
  source?: 'sdk' | 'app';
  risk?: 'high' | 'medium' | 'low';
  versionCode?: number;
  search?: string;
  device?: string;
  sort?: CrashGroupSort;
  order?: 'asc' | 'desc';
}

export interface GroupReportsParams {
  limit?: number;
  offset?: number;
  device?: string;
}

const BASE = () => `${getApiBaseUrl()}/api/admin/crash-reports`;

const toQuery = (params: Record<string, string | number | undefined>): string => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === '') continue;
    search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `?${query}` : '';
};

export const crashReportsApi = {
  listGroups: async (params: ListGroupsParams = {}): Promise<ListGroupsResponse> => {
    const res = await api.get(`${BASE()}${toQuery({ ...params })}`);
    return res.data;
  },

  getGroupReports: async (
    groupKey: string,
    params: GroupReportsParams = {},
  ): Promise<GroupReportsResponse> => {
    const res = await api.get(`${BASE()}/${encodeURIComponent(groupKey)}${toQuery({ ...params })}`);
    return res.data;
  },
};