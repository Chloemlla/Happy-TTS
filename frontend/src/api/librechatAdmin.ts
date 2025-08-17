import { api } from './api';

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

export async function listUsers(params: { kw?: string; page?: number; limit?: number }): Promise<AdminUsersResponse> {
    const { kw = '', page = 1, limit = 20 } = params || {};
    const res = await api.get('/librechat/admin/users', { params: { kw, page, limit } });
    return res.data as AdminUsersResponse;
}

export async function getUserHistory(userId: string, params: { page?: number; limit?: number }): Promise<AdminUserHistoryResponse> {
    const { page = 1, limit = 20 } = params || {};
    const res = await api.get(`/librechat/admin/users/${encodeURIComponent(userId)}/history`, { params: { page, limit } });
    return res.data as AdminUserHistoryResponse;
}

export async function deleteUser(userId: string): Promise<{ deleted: number; message: string }> {
    const res = await api.delete(`/librechat/admin/users/${encodeURIComponent(userId)}`);
    return res.data as { deleted: number; message: string };
}
