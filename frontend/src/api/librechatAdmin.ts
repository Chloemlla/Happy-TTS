import api, { getApiBaseUrl } from './api';

export interface AdminUserSummary {
    userId: string;
    total: number;
    updatedAt?: string;
    firstTs?: string | null;
    lastTs?: string | null;
}

export interface AdminUsersResponse {
    users: AdminUserSummary[];
    total: number;
}

export interface AdminUserHistoryItem {
    id: string;
    message: string;
    role?: 'user' | 'assistant';
    timestamp: string;
}

export interface AdminUserHistoryResponse {
    messages: AdminUserHistoryItem[];
    total: number;
}

// 统一的 LibreChat 接口前缀，API base URL 只从 api.ts 读取
const BASE = `${getApiBaseUrl()}/api/librechat`;

export async function listUsers(params: { kw?: string; page?: number; limit?: number; includeDeleted?: boolean }): Promise<AdminUsersResponse> {
    const { kw = '', page = 1, limit = 20, includeDeleted = false } = params || {};
    const res = await api.get(`${BASE}/admin/users`, { params: { kw, page, limit, includeDeleted } });
    return res.data as AdminUsersResponse;
}

export async function getUserHistory(userId: string, params: { page?: number; limit?: number }): Promise<AdminUserHistoryResponse> {
    const { page = 1, limit = 20 } = params || {};
    const res = await api.get(`${BASE}/admin/users/${encodeURIComponent(userId)}/history`, { params: { page, limit } });
    return res.data as AdminUserHistoryResponse;
}

export async function deleteUser(userId: string): Promise<{ deleted: number; message: string }> {
    const res = await api.delete(`${BASE}/admin/users/${encodeURIComponent(userId)}`);
    return res.data as { deleted: number; message: string };
}

export async function batchDeleteUsers(userIds: string[]): Promise<{ deleted: number; details: { userId: string; deleted: number }[]; message: string }> {
    const res = await api.delete(`${BASE}/admin/users`, { data: { userIds } });
    return res.data as { deleted: number; details: { userId: string; deleted: number }[]; message: string };
}

export async function deleteAllUsers(): Promise<{ deleted: number; message: string }> {
    const res = await api.delete(`${BASE}/admin/users/all`, { data: { confirm: true } });
    return res.data as { deleted: number; message: string };
}
