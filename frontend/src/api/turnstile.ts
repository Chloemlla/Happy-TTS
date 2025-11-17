import { getApiBaseUrl } from './api';

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

// 调度器状态接口
export interface SchedulerStatus {
  isRunning: boolean;
  lastCleanup: string;
  nextCleanup: string;
  totalCleanups: number;
  errors: number;
}

// 同步状态接口
export interface SyncStatus {
  lastSync: string;
  nextSync: string;
  mongoToRedisCount: number;
  redisToMongoCount: number;
  errors: string[];
  isRunning: boolean;
}

// IP封禁列表响应接口
export interface IPBanListResponse {
  bans: IPBan[];
  total: number;
  page: number;
  pageSize: number;
}

// API 客户端
class TurnstileAPI {
  private getAuthHeaders() {
    const token = localStorage.getItem('token');
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
    if (!response.ok) throw new Error('获取调度器状态失败');
    const result = await response.json();
    return result.status; // Extract status from wrapper object
  }

  async startScheduler(): Promise<{ success: boolean; message: string }> {
    const response = await fetch(`${getApiBaseUrl()}/api/turnstile/scheduler/start`, {
      method: 'POST',
      headers: this.getAuthHeaders()
    });
    if (!response.ok) throw new Error('启动调度器失败');
    return response.json();
  }

  async stopScheduler(): Promise<{ success: boolean; message: string }> {
    const response = await fetch(`${getApiBaseUrl()}/api/turnstile/scheduler/stop`, {
      method: 'POST',
      headers: this.getAuthHeaders()
    });
    if (!response.ok) throw new Error('停止调度器失败');
    return response.json();
  }

  async manualCleanup(): Promise<{ success: boolean; message: string; cleanedCount: number }> {
    const response = await fetch(`${getApiBaseUrl()}/api/turnstile/manual-cleanup`, {
      method: 'POST',
      headers: this.getAuthHeaders()
    });
    if (!response.ok) throw new Error('手动清理失败');
    return response.json();
  }

  // 同步管理
  async syncIPBans(): Promise<{ success: boolean; message: string; mongoToRedis: number; redisToMongo: number }> {
    const response = await fetch(`${getApiBaseUrl()}/api/turnstile/sync-ipbans`, {
      method: 'POST',
      headers: this.getAuthHeaders()
    });
    if (!response.ok) throw new Error('同步IP封禁失败');
    return response.json();
  }

  async getSyncStatus(): Promise<SyncStatus> {
    const response = await fetch(`${getApiBaseUrl()}/api/turnstile/sync-status`, {
      headers: this.getAuthHeaders()
    });
    if (!response.ok) throw new Error('获取同步状态失败');
    const result = await response.json();
    return result.data; // Extract data from wrapper object (backend returns 'data' not 'status')
  }
}

export const turnstileApi = new TurnstileAPI();
