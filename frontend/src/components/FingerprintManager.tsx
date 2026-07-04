import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FaChartBar,
  FaCheckCircle,
  FaClipboard,
  FaClock,
  FaEye,
  FaFingerprint,
  FaInfoCircle,
  FaNetworkWired,
  FaSearch,
  FaShieldAlt,
  FaSync,
  FaTimesCircle,
  FaTrash,
  FaUserShield,
  FaUsers,
} from 'react-icons/fa';
import { Link } from 'react-router-dom';
import { api } from '../api/api';
import { turnstileApi, type FingerprintStats } from '../api/turnstile';
import { useNotification } from './Notification';
import {
  InfoBadge,
  InfoMetricCard,
  InfoPanel,
  InfoPrimaryButton,
  InfoSectionTitle,
  logShareDangerButtonClass,
  logShareInputClass,
  logShareSecondaryButtonClass,
} from './LogShareStyleScaffold';

interface FingerprintRecord {
  id: string;
  ts: number;
  ua?: string;
  ip?: string;
  deviceInfo?: unknown;
}

interface FingerprintUser {
  id: string;
  username: string;
  email?: string;
  role?: string;
  requireFingerprint?: boolean;
  requireFingerprintAt?: number;
  fingerprintRequestDismissedOnce?: boolean;
  fingerprintRequestDismissedAt?: number;
  fingerprints?: FingerprintRecord[];
  fingerprintCount?: number;
  latestFingerprint?: FingerprintRecord | null;
  lastLoginIp?: string;
  lastLoginAt?: string;
  accountStatus?: 'active' | 'suspended';
  totpEnabled?: boolean;
  passkeyEnabled?: boolean;
}

interface UserListPagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

interface UserListStats {
  total: number;
  fingerprintRequired: number;
  withFingerprints: number;
  active: number;
  suspended: number;
}

interface UserListEnvelope {
  users: FingerprintUser[];
  pagination: UserListPagination;
  stats?: Partial<UserListStats>;
  filteredStats?: Partial<UserListStats>;
}

interface FingerprintRequirementResponse {
  success: boolean;
  requireFingerprint: boolean;
  requireFingerprintAt: number;
}

interface FingerprintListResponse {
  success: boolean;
  fingerprints: FingerprintRecord[];
}

const DEFAULT_PAGINATION: UserListPagination = {
  page: 1,
  pageSize: 20,
  total: 0,
  totalPages: 1,
};

const DEFAULT_USER_STATS: UserListStats = {
  total: 0,
  fingerprintRequired: 0,
  withFingerprints: 0,
  active: 0,
  suspended: 0,
};

type SecurityFilter = 'all' | 'fingerprintRequired';

export default function FingerprintManager() {
  const [tempStats, setTempStats] = useState<FingerprintStats | null>(null);
  const [users, setUsers] = useState<FingerprintUser[]>([]);
  const [userStats, setUserStats] = useState<UserListStats>(DEFAULT_USER_STATS);
  const [filteredUserStats, setFilteredUserStats] = useState<UserListStats>(DEFAULT_USER_STATS);
  const [pagination, setPagination] = useState<UserListPagination>(DEFAULT_PAGINATION);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [keyword, setKeyword] = useState('');
  const [appliedKeyword, setAppliedKeyword] = useState('');
  const [securityFilter, setSecurityFilter] = useState<SecurityFilter>('all');
  const [selectedUser, setSelectedUser] = useState<FingerprintUser | null>(null);
  const [selectedLoading, setSelectedLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [actionUserId, setActionUserId] = useState<string | null>(null);
  const [deletingFingerprintKey, setDeletingFingerprintKey] = useState<string | null>(null);
  const { setNotification } = useNotification();

  const applyUserPayload = useCallback((payload: UserListEnvelope | FingerprintUser[]) => {
    const envelope = Array.isArray(payload) ? null : payload;
    const nextUsers = Array.isArray(payload) ? payload : payload.users || [];
    setUsers(nextUsers);
    setPagination(envelope?.pagination || {
      page,
      pageSize,
      total: nextUsers.length,
      totalPages: Math.max(1, Math.ceil(nextUsers.length / pageSize)),
    });
    setUserStats({ ...DEFAULT_USER_STATS, ...(envelope?.stats || {}) });
    setFilteredUserStats({ ...DEFAULT_USER_STATS, ...(envelope?.filteredStats || envelope?.stats || {}) });
    setSelectedUser((current) => {
      if (!current) return null;
      const updated = nextUsers.find((user) => user.id === current.id);
      return updated ? { ...current, ...updated } : current;
    });
  }, [page, pageSize]);

  const fetchDashboard = useCallback(async (showTip = false) => {
    setLoading(true);
    try {
      const [statsResponse, usersResponse] = await Promise.all([
        turnstileApi.getFingerprintStats(),
        api.get<UserListEnvelope | FingerprintUser[]>('/api/admin/users', {
          params: {
            envelope: 1,
            includeFingerprints: 1,
            page,
            pageSize,
            keyword: appliedKeyword || undefined,
            security: securityFilter,
            sortBy: 'lastLoginAt',
            sortOrder: 'desc',
          },
        }),
      ]);

      setTempStats(statsResponse);
      applyUserPayload(usersResponse.data);
      if (showTip) {
        setNotification({ type: 'success', message: '指纹管理数据已刷新' });
      }
    } catch (error) {
      setNotification({ type: 'error', message: getErrorMessage(error, '获取指纹管理数据失败') });
    } finally {
      setLoading(false);
    }
  }, [appliedKeyword, applyUserPayload, page, pageSize, securityFilter, setNotification]);

  useEffect(() => {
    void fetchDashboard();
  }, [fetchDashboard]);

  const visibleFingerprintCount = useMemo(
    () => users.reduce((total, user) => total + getUserFingerprintCount(user), 0),
    [users],
  );

  const selectedFingerprints = useMemo(() => {
    const records = selectedUser?.fingerprints || [];
    return [...records].sort((left, right) => Number(right.ts || 0) - Number(left.ts || 0));
  }, [selectedUser]);

  const openUserDetail = useCallback(async (user: FingerprintUser) => {
    setSelectedUser(user);
    setSelectedLoading(true);
    try {
      const response = await api.get<{ success: boolean; user?: FingerprintUser }>(`/api/admin/users/${user.id}`);
      if (response.data?.user?.id) {
        setSelectedUser(response.data.user);
      }
    } catch (error) {
      setNotification({ type: 'error', message: getErrorMessage(error, '获取用户指纹详情失败') });
    } finally {
      setSelectedLoading(false);
    }
  }, [setNotification]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchDashboard(true);
    setRefreshing(false);
  }, [fetchDashboard]);

  const handleSearch = useCallback(() => {
    setAppliedKeyword(keyword.trim());
    setPage(1);
  }, [keyword]);

  const handleCleanup = useCallback(async () => {
    if (!window.confirm('确定要清理所有过期的临时指纹数据吗？此操作不可撤销。')) return;
    setCleaning(true);
    try {
      const result = await turnstileApi.cleanupExpiredFingerprints();
      setNotification({
        type: 'success',
        message: `清理完成，删除了 ${result.cleanedCount} 个过期临时指纹`,
      });
      await fetchDashboard();
    } catch (error) {
      setNotification({ type: 'error', message: getErrorMessage(error, '清理过期指纹失败') });
    } finally {
      setCleaning(false);
    }
  }, [fetchDashboard, setNotification]);

  const updateUserRequirement = useCallback((userId: string, requireFingerprint: boolean, requireFingerprintAt: number) => {
    const patchUser = (user: FingerprintUser): FingerprintUser => user.id === userId
      ? { ...user, requireFingerprint, requireFingerprintAt }
      : user;
    setUsers((current) => current.map(patchUser));
    setSelectedUser((current) => current ? patchUser(current) : current);
  }, []);

  const updateUserFingerprints = useCallback((userId: string, fingerprints: FingerprintRecord[]) => {
    const latestFingerprint = getLatestFingerprint(fingerprints);
    const patchUser = (user: FingerprintUser): FingerprintUser => user.id === userId
      ? {
        ...user,
        fingerprints,
        fingerprintCount: fingerprints.length,
        latestFingerprint,
      }
      : user;
    setUsers((current) => current.map(patchUser));
    setSelectedUser((current) => current ? patchUser(current) : current);
  }, []);

  const requestUserFingerprint = useCallback(async (userId: string) => {
    setActionUserId(userId);
    try {
      const response = await api.post<FingerprintRequirementResponse>(`/api/admin/users/${userId}/fingerprint/require`, {
        require: true,
      });
      const requireFingerprintAt = Number(response.data?.requireFingerprintAt || Date.now());
      updateUserRequirement(userId, true, requireFingerprintAt);
      setNotification({ type: 'success', message: '已请求该用户下次上报指纹' });
    } catch (error) {
      setNotification({ type: 'error', message: getErrorMessage(error, '请求上报失败') });
    } finally {
      setActionUserId(null);
    }
  }, [setNotification, updateUserRequirement]);

  const clearUserFingerprints = useCallback(async (userId: string) => {
    if (!window.confirm('确定要清空该用户的全部指纹记录吗？此操作不可撤销。')) return;
    setActionUserId(userId);
    try {
      const response = await api.delete<FingerprintListResponse>(`/api/admin/users/${userId}/fingerprints`);
      updateUserFingerprints(userId, response.data?.fingerprints || []);
      setNotification({ type: 'success', message: '已清空该用户的全部指纹记录' });
    } catch (error) {
      setNotification({ type: 'error', message: getErrorMessage(error, '清空指纹失败') });
    } finally {
      setActionUserId(null);
    }
  }, [setNotification, updateUserFingerprints]);

  const deleteUserFingerprint = useCallback(async (userId: string, record: FingerprintRecord, key: string) => {
    if (!window.confirm('确定要删除该指纹记录吗？')) return;
    setDeletingFingerprintKey(key);
    try {
      const response = await api.delete<FingerprintListResponse>(
        `/api/admin/users/${userId}/fingerprints/${encodeURIComponent(record.id)}`,
        { params: { ts: record.ts } },
      );
      updateUserFingerprints(userId, response.data?.fingerprints || []);
      setNotification({ type: 'success', message: '已删除指纹记录' });
    } catch (error) {
      setNotification({ type: 'error', message: getErrorMessage(error, '删除指纹失败') });
    } finally {
      setDeletingFingerprintKey(null);
    }
  }, [setNotification, updateUserFingerprints]);

  const copyText = useCallback(async (value: string, successMessage: string) => {
    try {
      await navigator.clipboard?.writeText(value);
      setNotification({ type: 'success', message: successMessage });
    } catch {
      setNotification({ type: 'error', message: '复制失败，请手动复制' });
    }
  }, [setNotification]);

  if (loading && !tempStats && users.length === 0) {
    return (
      <InfoPanel>
        <div className="flex min-h-[320px] items-center justify-center text-sm text-slate-500">
          正在加载指纹管理...
        </div>
      </InfoPanel>
    );
  }

  return (
    <div className="space-y-6">
      <InfoPanel>
        <InfoSectionTitle
          eyebrow="Fingerprint Security"
          title="指纹管理"
          description="统一查看临时验证指纹与用户账号指纹，用户级数据与用户管理页面使用同一套管理端接口。"
          icon={FaFingerprint}
          action={
            <Link to="/admin" className={logShareSecondaryButtonClass}>
              <FaInfoCircle className="text-xs" />
              返回仪表板
            </Link>
          }
        />

        <div className="grid gap-3 lg:grid-cols-[1fr_180px_160px_auto]">
          <label className="space-y-2 text-sm font-semibold text-slate-700">
            <span>用户搜索</span>
            <input
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') handleSearch();
              }}
              placeholder="用户名、邮箱、用户ID、登录IP"
              className={logShareInputClass}
            />
          </label>
          <label className="space-y-2 text-sm font-semibold text-slate-700">
            <span>安全状态</span>
            <select
              value={securityFilter}
              onChange={(event) => {
                setSecurityFilter(event.target.value as SecurityFilter);
                setPage(1);
              }}
              className={logShareInputClass}
            >
              <option value="all">全部用户</option>
              <option value="fingerprintRequired">需上报指纹</option>
            </select>
          </label>
          <label className="space-y-2 text-sm font-semibold text-slate-700">
            <span>每页</span>
            <select
              value={pageSize}
              onChange={(event) => {
                setPageSize(Number(event.target.value));
                setPage(1);
              }}
              className={logShareInputClass}
            >
              {[10, 20, 50, 100].map((value) => (
                <option key={value} value={value}>{value} 条</option>
              ))}
            </select>
          </label>
          <div className="flex items-end gap-2">
            <InfoPrimaryButton type="button" onClick={handleSearch}>
              <FaSearch className="text-xs" />
              查询
            </InfoPrimaryButton>
            <button type="button" onClick={handleRefresh} disabled={refreshing} className={logShareSecondaryButtonClass}>
              <FaSync className={`text-xs ${refreshing ? 'animate-spin' : ''}`} />
              刷新
            </button>
          </div>
        </div>
      </InfoPanel>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <InfoMetricCard label="临时指纹" value={tempStats?.total ?? 0} detail={`已验证 ${tempStats?.verified ?? 0}`} icon={FaFingerprint} />
        <InfoMetricCard label="过期临时指纹" value={tempStats?.expired ?? 0} detail={`未验证 ${tempStats?.unverified ?? 0}`} icon={FaTimesCircle} />
        <InfoMetricCard label="有账号指纹用户" value={userStats.withFingerprints} detail={`筛选后 ${filteredUserStats.withFingerprints}`} icon={FaUsers} />
        <InfoMetricCard label="当前页指纹记录" value={visibleFingerprintCount} detail={`需上报 ${filteredUserStats.fingerprintRequired}`} icon={FaChartBar} />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <InfoPanel className="xl:col-span-2">
          <InfoSectionTitle
            eyebrow="User Fingerprints"
            title="用户指纹总览"
            icon={FaUsers}
            action={
              <button
                type="button"
                onClick={handleCleanup}
                disabled={cleaning || (tempStats?.expired || 0) <= 0}
                className={logShareDangerButtonClass}
              >
                <FaTrash className={`text-xs ${cleaning ? 'animate-spin' : ''}`} />
                清理过期临时指纹
              </button>
            }
          />

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead>
                <tr className="text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                  <th className="px-3 py-2">用户</th>
                  <th className="px-3 py-2">指纹</th>
                  <th className="px-3 py-2">最新记录</th>
                  <th className="px-3 py-2">登录</th>
                  <th className="px-3 py-2">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.map((user) => {
                  const count = getUserFingerprintCount(user);
                  const latest = getLatestFingerprint(user.fingerprints) || user.latestFingerprint || null;
                  const requirementAt = Number(user.requireFingerprintAt || 0);
                  return (
                    <tr key={user.id} className="text-slate-600 transition-colors duration-150 hover:bg-slate-50/70">
                      <td className="px-3 py-3 align-top">
                        <div className="font-semibold text-slate-900">{user.username}</div>
                        <div className="mt-1 text-xs text-slate-500">{user.email || user.id}</div>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          <InfoBadge>{user.role || 'user'}</InfoBadge>
                          {user.accountStatus === 'suspended' && <InfoBadge tone="rose">封停</InfoBadge>}
                          {user.totpEnabled && <InfoBadge tone="emerald">TOTP</InfoBadge>}
                          {user.passkeyEnabled && <InfoBadge tone="emerald">Passkey</InfoBadge>}
                        </div>
                      </td>
                      <td className="px-3 py-3 align-top">
                        <div className="text-lg font-semibold text-slate-900">{count}</div>
                        <div className="mt-1 text-xs text-slate-500">账号指纹记录</div>
                        {user.requireFingerprint ? (
                          <div className="mt-2 text-xs text-slate-500">
                            已预约 {requirementAt ? formatDateTime(requirementAt) : ''}
                          </div>
                        ) : null}
                      </td>
                      <td className="max-w-[320px] px-3 py-3 align-top">
                        {latest ? (
                          <div className="space-y-1">
                            <div className="truncate font-mono text-xs text-slate-900" title={latest.id}>{latest.id}</div>
                            <div className="text-xs text-slate-500">{formatDateTime(latest.ts)}</div>
                            <div className="truncate text-xs text-slate-500" title={latest.ua || ''}>
                              IP {latest.ip || '-'} · {latest.ua || '-'}
                            </div>
                          </div>
                        ) : (
                          <span className="text-slate-400">暂无</span>
                        )}
                      </td>
                      <td className="px-3 py-3 align-top text-xs text-slate-500">
                        <div>{user.lastLoginIp || '-'}</div>
                        <div className="mt-1">{formatDateTime(user.lastLoginAt)}</div>
                      </td>
                      <td className="px-3 py-3 align-top">
                        <div className="flex flex-wrap gap-2">
                          <button type="button" onClick={() => void openUserDetail(user)} className={logShareSecondaryButtonClass}>
                            <FaEye className="text-xs" />
                            查看
                          </button>
                          <button
                            type="button"
                            onClick={() => void requestUserFingerprint(user.id)}
                            disabled={actionUserId === user.id}
                            className={logShareSecondaryButtonClass}
                          >
                            <FaUserShield className="text-xs" />
                            上报
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {users.length === 0 && (
                  <tr>
                    <td className="px-3 py-10 text-center text-slate-400" colSpan={5}>
                      暂无用户指纹数据
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex flex-col gap-3 border-t border-slate-100 pt-4 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between">
            <div>
              共 {pagination.total} 个用户 · 第 {pagination.page}/{pagination.totalPages} 页
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                className={logShareSecondaryButtonClass}
              >
                上一页
              </button>
              <button
                type="button"
                disabled={page >= pagination.totalPages}
                onClick={() => setPage((current) => Math.min(pagination.totalPages, current + 1))}
                className={logShareSecondaryButtonClass}
              >
                下一页
              </button>
            </div>
          </div>
        </InfoPanel>

        <InfoPanel>
          <InfoSectionTitle eyebrow="User Detail" title="指纹详情" icon={FaFingerprint} />
          {!selectedUser ? (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-500">
              从左侧选择用户查看完整指纹记录。
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-2xl border border-slate-200 bg-white/80 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-lg font-semibold text-slate-900">{selectedUser.username}</div>
                    <div className="mt-1 truncate text-sm text-slate-500">{selectedUser.email || selectedUser.id}</div>
                  </div>
                  <InfoBadge tone={selectedUser.requireFingerprint ? 'emerald' : 'slate'}>
                    {selectedUser.requireFingerprint ? '待上报' : '正常'}
                  </InfoBadge>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <KeyValue label="指纹数" value={String(getUserFingerprintCount(selectedUser))} />
                  <KeyValue label="上次登录" value={formatDateTime(selectedUser.lastLoginAt)} />
                  <KeyValue label="登录 IP" value={selectedUser.lastLoginIp || '-'} />
                  <KeyValue label="关闭提示" value={selectedUser.fingerprintRequestDismissedOnce ? formatDateTime(selectedUser.fingerprintRequestDismissedAt) : '否'} />
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void requestUserFingerprint(selectedUser.id)}
                    disabled={actionUserId === selectedUser.id}
                    className={logShareSecondaryButtonClass}
                  >
                    <FaUserShield className="text-xs" />
                    请求下次上报
                  </button>
                  <button
                    type="button"
                    onClick={() => void clearUserFingerprints(selectedUser.id)}
                    disabled={actionUserId === selectedUser.id || selectedFingerprints.length === 0}
                    className={logShareDangerButtonClass}
                  >
                    <FaTrash className="text-xs" />
                    清空全部
                  </button>
                </div>
              </div>

              {selectedLoading ? (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-500">
                  正在加载指纹详情...
                </div>
              ) : selectedFingerprints.length > 0 ? (
                <div className="max-h-[620px] space-y-3 overflow-auto pr-1">
                  {selectedFingerprints.map((record, index) => {
                    const recordKey = `${record.id}-${record.ts}-${index}`;
                    const deviceSummary = getDeviceSummary(record.deviceInfo);
                    return (
                      <div key={recordKey} className="rounded-2xl border border-slate-200 bg-white/80 p-4 text-sm">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="break-all font-mono text-xs font-semibold text-slate-900">{record.id}</div>
                            <div className="mt-2 text-xs text-slate-500">
                              {formatDateTime(record.ts)} · IP {record.ip || '-'}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => void copyText(record.id, '指纹 ID 已复制')}
                            className={logShareSecondaryButtonClass}
                          >
                            <FaClipboard className="text-xs" />
                            复制
                          </button>
                        </div>
                        {record.ua && (
                          <div className="mt-3 break-all rounded-2xl bg-slate-50 px-3 py-2 text-xs text-slate-500">
                            {record.ua}
                          </div>
                        )}
                        {deviceSummary.length > 0 && (
                          <div className="mt-3 grid gap-2 sm:grid-cols-2">
                            {deviceSummary.map((item) => (
                              <KeyValue key={item.label} label={item.label} value={item.value} />
                            ))}
                          </div>
                        )}
                        {record.deviceInfo !== undefined && (
                          <details className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                            <summary className="cursor-pointer text-xs font-semibold text-slate-600">设备特征 JSON</summary>
                            <pre className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap text-xs text-slate-700">
                              {formatJson(record.deviceInfo)}
                            </pre>
                          </details>
                        )}
                        <div className="mt-3 flex justify-end">
                          <button
                            type="button"
                            onClick={() => void deleteUserFingerprint(selectedUser.id, record, recordKey)}
                            disabled={deletingFingerprintKey === recordKey}
                            className={logShareDangerButtonClass}
                          >
                            <FaTrash className="text-xs" />
                            删除
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-500">
                  该用户暂无指纹记录。
                </div>
              )}
            </div>
          )}
        </InfoPanel>
      </div>

      <InfoPanel>
        <InfoSectionTitle
          eyebrow="Temporary Fingerprints"
          title="临时验证指纹状态"
          icon={FaShieldAlt}
          action={(tempStats?.expired || 0) > 0 ? <InfoBadge tone="rose">建议清理</InfoBadge> : <InfoBadge tone="emerald">无需清理</InfoBadge>}
        />
        <div className="grid gap-3 md:grid-cols-4">
          <KeyMetric icon={FaCheckCircle} label="已验证" value={tempStats?.verified ?? 0} />
          <KeyMetric icon={FaTimesCircle} label="未验证" value={tempStats?.unverified ?? 0} />
          <KeyMetric icon={FaClock} label="过期" value={tempStats?.expired ?? 0} />
          <KeyMetric icon={FaNetworkWired} label="筛选用户" value={filteredUserStats.total} />
        </div>
      </InfoPanel>
    </div>
  );
}

const KeyMetric: React.FC<{
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: React.ReactNode;
}> = ({ icon: Icon, label, value }) => (
  <div className="rounded-2xl border border-slate-200 bg-white/80 p-4">
    <div className="flex items-start justify-between gap-3">
      <div>
        <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">{label}</div>
        <div className="mt-2 text-2xl font-semibold text-slate-900">{value}</div>
      </div>
      <div className="flex h-9 w-9 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-slate-500">
        <Icon className="h-4 w-4" />
      </div>
    </div>
  </div>
);

const KeyValue: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="min-w-0 rounded-2xl border border-slate-100 bg-slate-50 px-3 py-2">
    <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">{label}</div>
    <div className="mt-1 break-all text-sm font-medium text-slate-700">{value}</div>
  </div>
);

function getUserFingerprintCount(user: FingerprintUser): number {
  if (typeof user.fingerprintCount === 'number') return user.fingerprintCount;
  return Array.isArray(user.fingerprints) ? user.fingerprints.length : 0;
}

function getLatestFingerprint(fingerprints?: FingerprintRecord[] | null): FingerprintRecord | null {
  if (!Array.isArray(fingerprints) || fingerprints.length === 0) return null;
  const [first, ...rest] = fingerprints;
  if (!first) return null;
  return rest.reduce((latest, current) => (
    Number(current.ts || 0) > Number(latest.ts || 0) ? current : latest
  ), first);
}

function formatDateTime(value?: string | number | null): string {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleString('zh-CN');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readRecord(value: unknown, key: string): Record<string, unknown> | null {
  if (!isRecord(value)) return null;
  const next = value[key];
  return isRecord(next) ? next : null;
}

function readString(value: unknown, key: string): string | null {
  if (!isRecord(value)) return null;
  const next = value[key];
  return typeof next === 'string' && next.trim() ? next : null;
}

function readNumber(value: unknown, key: string): number | null {
  if (!isRecord(value)) return null;
  const next = value[key];
  return typeof next === 'number' && Number.isFinite(next) ? next : null;
}

function getDeviceSummary(deviceInfo: unknown): Array<{ label: string; value: string }> {
  const summary: Array<{ label: string; value: string }> = [];
  const screen = readRecord(deviceInfo, 'screen');
  const screenWidth = readNumber(screen, 'w') ?? readNumber(screen, 'width');
  const screenHeight = readNumber(screen, 'h') ?? readNumber(screen, 'height');
  if (screenWidth !== null && screenHeight !== null) {
    summary.push({ label: '屏幕', value: `${screenWidth} x ${screenHeight}` });
  }

  const timezone = readRecord(deviceInfo, 'timezone');
  const timezoneValue = readString(timezone, 'tz') || readString(timezone, 'timeZone');
  if (timezoneValue) {
    summary.push({ label: '时区', value: timezoneValue });
  }

  const navigatorInfo = readRecord(deviceInfo, 'navigator');
  const language = readString(navigatorInfo, 'language');
  if (language) {
    summary.push({ label: '语言', value: language });
  }

  const platform = readString(navigatorInfo, 'platform');
  if (platform) {
    summary.push({ label: '平台', value: platform });
  }

  const concurrency = readNumber(navigatorInfo, 'hardwareConcurrency');
  if (concurrency !== null) {
    summary.push({ label: 'CPU 线程', value: String(concurrency) });
  }

  const userAgent = readString(navigatorInfo, 'userAgent');
  if (userAgent) {
    summary.push({ label: '浏览器', value: userAgent.split(' ').slice(-3).join(' ') });
  }

  return summary;
}

function formatJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (isRecord(error)) {
    const response = error.response;
    if (isRecord(response)) {
      const data = response.data;
      if (isRecord(data) && typeof data.error === 'string') return data.error;
      if (isRecord(data) && typeof data.message === 'string') return data.message;
    }
    if (typeof error.message === 'string') return error.message;
  }
  return fallback;
}
