import { getApiBaseUrl } from './api';
import { getAuthToken } from '../utils/authSession';


// IP 封禁相关接口
export interface IPBanStats {
  totalBanned: number;
  activeBans: number;
  expiredBans: number;
  recentBans: number;
}

export interface IPBan {
  ipAddress: string;
  reason: string;
  violationCount: number;
  bannedAt: string;
  expiresAt: string;
  fingerprint?: string;
  userAgent?: string;
}

export interface IPBanListResponse {
  bans: IPBan[];
  total: number;
  page: number;
  pageSize: number;
}

// 指纹统计接口
export interface FingerprintStats {
  total: number;
  verified: number;
  unverified: number;
  expired: number;
}

export interface SystemCapability {
  key: string;
  label: string;
  description: string;
  scope: string;
  enabled: boolean;
  requiresAdmin: boolean;
  rateLimited: boolean;
  audited: boolean;
  destructive: boolean;
  intervalMs?: number;
}

export interface CleanupDetails {
  fingerprintCount: number;
  accessTokenCount: number;
  ipBanCount: number;
  ipDataCount: number;
  totalCount: number;
}

export interface SyncDirectionResult {
  synced: number;
  merged?: number;
  updated?: number;
  skipped: number;
  errors: number;
}

export interface SyncDetails {
  mongoToRedis: SyncDirectionResult;
  redisToMongo: SyncDirectionResult;
}

export interface IpBanSyncRuntimeStatus {
  isRunning: boolean;
  isSyncing: boolean;
  syncInterval: number;
  redisAvailable: boolean;
}

// 调度器状态接口
export interface SchedulerStatus {
  isRunning: boolean;
  isSyncEnabled: boolean;
  startedAt?: string | null;
  stoppedAt?: string | null;
  lastCleanup?: string | null;
  nextCleanup?: string | null;
  cleanupIntervalMs: number;
  totalCleanups: number;
  totalCleanupErrors: number;
  errors: number;
  lastCleanupResult?: CleanupDetails;
  lastCleanupError?: string;
  lastCleanupDurationMs?: number;
  lastSync?: string | null;
  nextSync?: string | null;
  syncIntervalMs: number;
  totalSyncs: number;
  totalSyncErrors: number;
  lastSyncResult?: SyncDetails;
  lastSyncError?: string;
  lastSyncDurationMs?: number;
  ipBanSyncStatus?: IpBanSyncRuntimeStatus;
  capabilities: SystemCapability[];
}

// 同步状态接口
export interface SyncStatus {
  lastSync?: string | null;
  nextSync?: string | null;
  mongoToRedisCount: number;
  redisToMongoCount: number;
  errors: string[];
  isRunning: boolean;
  isSyncEnabled: boolean;
  isSyncing: boolean;
  redisAvailable: boolean;
  syncIntervalMs: number;
  totalSyncs: number;
  totalErrors: number;
  lastSyncResult?: SyncDetails;
  lastSyncError?: string;
  lastSyncDurationMs?: number;
  capabilities: SystemCapability[];
}

// IP封禁列表响应接口
export interface IPBanListResponse {
  bans: IPBan[];
  total: number;
  page: number;
  pageSize: number;
}

const toFiniteNumber = (value: unknown, fallback = 0): number => {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
};

const toOptionalFiniteNumber = (value: unknown): number | undefined => {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
};

const asDateString = (value: unknown): string | null => {
  return typeof value === 'string' && value.length > 0 ? value : null;
};

const asCapabilities = (value: unknown): SystemCapability[] => {
  return Array.isArray(value) ? value as SystemCapability[] : [];
};

const normalizeSchedulerStatus = (status: any): SchedulerStatus => {
  return {
    isRunning: Boolean(status?.isRunning),
    isSyncEnabled: Boolean(status?.isSyncEnabled),
    startedAt: asDateString(status?.startedAt),
    stoppedAt: asDateString(status?.stoppedAt),
    lastCleanup: asDateString(status?.lastCleanup),
    nextCleanup: asDateString(status?.nextCleanup),
    cleanupIntervalMs: toFiniteNumber(status?.cleanupIntervalMs),
    totalCleanups: toFiniteNumber(status?.totalCleanups),
    totalCleanupErrors: toFiniteNumber(status?.totalCleanupErrors ?? status?.errors),
    errors: toFiniteNumber(status?.errors ?? status?.totalCleanupErrors),
    lastCleanupResult: status?.lastCleanupResult,
    lastCleanupError: status?.lastCleanupError,
    lastCleanupDurationMs: toOptionalFiniteNumber(status?.lastCleanupDurationMs),
    lastSync: asDateString(status?.lastSync),
    nextSync: asDateString(status?.nextSync),
    syncIntervalMs: toFiniteNumber(status?.syncIntervalMs),
    totalSyncs: toFiniteNumber(status?.totalSyncs),
    totalSyncErrors: toFiniteNumber(status?.totalSyncErrors),
    lastSyncResult: status?.lastSyncResult,
    lastSyncError: status?.lastSyncError,
    lastSyncDurationMs: toOptionalFiniteNumber(status?.lastSyncDurationMs),
    ipBanSyncStatus: status?.ipBanSyncStatus,
    capabilities: asCapabilities(status?.capabilities)
  };
};

const countMongoToRedis = (value: unknown): number => {
  if (typeof value === 'number') return value;
  const result = value as Partial<SyncDirectionResult> | undefined;
  return toFiniteNumber(result?.synced) + toFiniteNumber(result?.merged);
};

const countRedisToMongo = (value: unknown): number => {
  if (typeof value === 'number') return value;
  const result = value as Partial<SyncDirectionResult> | undefined;
  return toFiniteNumber(result?.synced) + toFiniteNumber(result?.updated);
};

const normalizeSyncStatus = (status: any): SyncStatus => {
  return {
    lastSync: asDateString(status?.lastSync),
    nextSync: asDateString(status?.nextSync),
    mongoToRedisCount: toFiniteNumber(status?.mongoToRedisCount),
    redisToMongoCount: toFiniteNumber(status?.redisToMongoCount),
    errors: Array.isArray(status?.errors) ? status.errors : [],
    isRunning: Boolean(status?.isRunning),
    isSyncEnabled: Boolean(status?.isSyncEnabled),
    isSyncing: Boolean(status?.isSyncing),
    redisAvailable: Boolean(status?.redisAvailable),
    syncIntervalMs: toFiniteNumber(status?.syncIntervalMs),
    totalSyncs: toFiniteNumber(status?.totalSyncs),
    totalErrors: toFiniteNumber(status?.totalErrors),
    lastSyncResult: status?.lastSyncResult,
    lastSyncError: status?.lastSyncError,
    lastSyncDurationMs: toOptionalFiniteNumber(status?.lastSyncDurationMs),
    capabilities: asCapabilities(status?.capabilities)
  };
};

const readJsonResponse = async <T>(response: Response, fallbackMessage: string): Promise<T> => {
  let result: any = null;
  try {
    result = await response.json();
  } catch (_error) {
    result = null;
  }

  if (!response.ok) {
    throw new Error(result?.error || result?.message || fallbackMessage);
  }

  return result as T;
};

// API 客户端
class TurnstileAPI {
  private getAuthHeaders() {
    const token = getAuthToken();
    return {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    };
  }

  // IP 封禁管理
  async getIPBanStats(): Promise<IPBanStats> {
    const response = await fetch(`${getApiBaseUrl()}/api/turnstile/ip-ban-stats`, {
      headers: this.getAuthHeaders()
    });
    if (!response.ok) throw new Error('获取IP封禁统计失败');
    const result = await response.json();
    return result.stats; // Extract stats from wrapper object
  }

  async banIP(ipAddress: string, reason: string, durationMinutes?: number): Promise<{ success: boolean; message: string }> {
    const response = await fetch(`${getApiBaseUrl()}/api/turnstile/ban-ip`, {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: JSON.stringify({ ipAddress, reason, durationMinutes })
    });
    if (!response.ok) throw new Error('封禁IP失败');
    return response.json();
  }

  async unbanIP(ipAddress: string): Promise<{ success: boolean; message: string }> {
    const response = await fetch(`${getApiBaseUrl()}/api/turnstile/unban-ip`, {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: JSON.stringify({ ipAddress })
    });
    if (!response.ok) throw new Error('解封IP失败');
    return response.json();
  }

  async banIPs(ipAddresses: string[], reason: string, durationMinutes?: number): Promise<{ success: boolean; message: string; bannedCount: number }> {
    const response = await fetch(`${getApiBaseUrl()}/api/turnstile/ban-ips`, {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: JSON.stringify({ ipAddresses, reason, durationMinutes })
    });
    if (!response.ok) throw new Error('批量封禁IP失败');
    return response.json();
  }

  async unbanIPs(ipAddresses: string[]): Promise<{ success: boolean; message: string; unbannedCount: number }> {
    const response = await fetch(`${getApiBaseUrl()}/api/turnstile/unban-ips`, {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: JSON.stringify({ ipAddresses })
    });
    if (!response.ok) throw new Error('批量解封IP失败');
    return response.json();
  }

  async getIPBanList(page: number = 1, pageSize: number = 20): Promise<IPBanListResponse> {
    const response = await fetch(`${getApiBaseUrl()}/api/turnstile/ip-ban-list?page=${page}&pageSize=${pageSize}`, {
      headers: this.getAuthHeaders()
    });
    if (!response.ok) throw new Error('获取IP封禁列表失败');
    const result = await response.json();
    return result.data || { bans: [], total: 0, page, pageSize }; // Handle backend response structure
  }

  // 指纹管理
  async getFingerprintStats(): Promise<FingerprintStats> {
    const response = await fetch(`${getApiBaseUrl()}/api/turnstile/fingerprint-stats`, {
      headers: this.getAuthHeaders()
    });
    if (!response.ok) throw new Error('获取指纹统计失败');
    const result = await response.json();
    return result.stats; // Extract stats from wrapper object
  }

  async cleanupExpiredFingerprints(): Promise<{ success: boolean; message: string; cleanedCount: number }> {
    const response = await fetch(`${getApiBaseUrl()}/api/turnstile/cleanup-expired-fingerprints`, {
      method: 'POST',
      headers: this.getAuthHeaders()
    });
    if (!response.ok) throw new Error('清理过期指纹失败');
    return response.json();
  }

  // 调度器管理
  async getSchedulerStatus(): Promise<SchedulerStatus> {
    const response = await fetch(`${getApiBaseUrl()}/api/turnstile/scheduler-status`, {
      headers: this.getAuthHeaders()
    });
    const result = await readJsonResponse<{ status?: SchedulerStatus; data?: SchedulerStatus }>(
      response,
      '获取调度器状态失败'
    );
    return normalizeSchedulerStatus(result.status || result.data || result as SchedulerStatus);
  }

  async startScheduler(): Promise<{ success: boolean; message: string }> {
    const response = await fetch(`${getApiBaseUrl()}/api/turnstile/scheduler/start`, {
      method: 'POST',
      headers: this.getAuthHeaders()
    });
    return readJsonResponse<{ success: boolean; message: string }>(response, '启动调度器失败');
  }

  async stopScheduler(): Promise<{ success: boolean; message: string }> {
    const response = await fetch(`${getApiBaseUrl()}/api/turnstile/scheduler/stop`, {
      method: 'POST',
      headers: this.getAuthHeaders()
    });
    return readJsonResponse<{ success: boolean; message: string }>(response, '停止调度器失败');
  }

  async manualCleanup(): Promise<{ success: boolean; message: string; cleanedCount: number; details?: CleanupDetails }> {
    const response = await fetch(`${getApiBaseUrl()}/api/turnstile/manual-cleanup`, {
      method: 'POST',
      headers: this.getAuthHeaders()
    });
    const result = await readJsonResponse<{
      success: boolean;
      message: string;
      cleanedCount?: number;
      deletedCount?: number;
      details?: CleanupDetails;
    }>(response, '手动清理失败');
    return {
      success: result.success,
      message: result.message,
      cleanedCount: toFiniteNumber(result.cleanedCount ?? result.deletedCount),
      details: result.details
    };
  }

  // 同步管理
  async syncIPBans(): Promise<{
    success: boolean;
    message: string;
    mongoToRedis: number;
    redisToMongo: number;
    data?: { mongoToRedis?: SyncDirectionResult; redisToMongo?: SyncDirectionResult };
  }> {
    const response = await fetch(`${getApiBaseUrl()}/api/turnstile/sync-ipbans`, {
      method: 'POST',
      headers: this.getAuthHeaders()
    });
    const result = await readJsonResponse<any>(response, '同步IP封禁失败');
    return {
      success: Boolean(result.success),
      message: result.message || 'IP 封禁同步完成',
      mongoToRedis: toFiniteNumber(result.mongoToRedis ?? result.data?.mongoToRedisCount, countMongoToRedis(result.data?.mongoToRedis)),
      redisToMongo: toFiniteNumber(result.redisToMongo ?? result.data?.redisToMongoCount, countRedisToMongo(result.data?.redisToMongo)),
      data: result.data
    };
  }

  async getSyncStatus(): Promise<SyncStatus> {
    const response = await fetch(`${getApiBaseUrl()}/api/turnstile/sync-status`, {
      headers: this.getAuthHeaders()
    });
    const result = await readJsonResponse<{ data?: SyncStatus; status?: SyncStatus }>(
      response,
      '获取同步状态失败'
    );
    return normalizeSyncStatus(result.data || result.status || result as SyncStatus);
  }
}

export const turnstileApi = new TurnstileAPI();
