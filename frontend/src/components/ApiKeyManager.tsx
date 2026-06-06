import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNotification } from './Notification';
import { getApiBaseUrl } from '../api/api';
import {
  FaBan,
  FaCheck,
  FaClock,
  FaCoins,
  FaCopy,
  FaEdit,
  FaEye,
  FaEyeSlash,
  FaKey,
  FaPlus,
  FaReceipt,
  FaSearch,
  FaShieldAlt,
  FaSyncAlt,
  FaTimes,
  FaTrash,
} from 'react-icons/fa';

type BillingMode = 'metered' | 'prepaid';
type ManagerView = 'keys' | 'billing';

interface ApiKeyManagerProps {
  initialView?: ManagerView;
}

interface ApiKeyItem {
  keyId: string;
  name: string;
  userId: string;
  permissions: string[];
  rateLimit: number;
  expiresAt: string | null;
  lastUsedAt: string | null;
  lastUsedIp: string | null;
  usageCount: number;
  enabled: boolean;
  billingEnabled?: boolean;
  billingMode?: BillingMode;
  balanceCredits?: number;
  totalChargedCredits?: number;
  totalBillableRequests?: number;
  lastBillingAt?: string | null;
  createdAt: string;
}

interface PermissionDetail {
  key: string;
  label: string;
  description: string;
  category: string;
  costCredits: number;
  endpoints: string[];
  adminOnly?: boolean;
}

interface BillingRate {
  permission: string;
  label: string;
  costCredits: number;
  description: string;
}

interface BillingEvent {
  keyId: string;
  userId: string;
  type: 'charge' | 'adjustment' | 'waived' | 'refund';
  permission: string;
  billingMode: BillingMode;
  costCredits: number;
  balanceDelta: number;
  balanceAfter: number | null;
  method: string | null;
  route: string | null;
  statusCode: number | null;
  requestId: string | null;
  reason: string | null;
  actorUserId: string | null;
  createdAt: string;
}

interface EditForm {
  name: string;
  permissions: string[];
  rateLimit: number;
  expiresInDays: number | '';
  enabled: boolean;
  billingEnabled: boolean;
  billingMode: BillingMode;
}

interface ApiResult<T> {
  success?: boolean;
  error?: string;
  message?: string;
  plainKey?: string;
  key?: ApiKeyItem;
  keys?: ApiKeyItem[];
  permissions?: string[];
  permissionDetails?: PermissionDetail[];
  rates?: BillingRate[];
  events?: BillingEvent[];
  balanceCredits?: number;
  data?: T;
}

const authHeaders = () => ({
  Authorization: `Bearer ${localStorage.getItem('token') || ''}`,
  'Content-Type': 'application/json',
});

const apiJson = async <T,>(path: string, opts?: RequestInit): Promise<ApiResult<T>> => {
  const headers = new Headers(opts?.headers);
  Object.entries(authHeaders()).forEach(([key, value]) => headers.set(key, value));
  const res = await fetch(`${getApiBaseUrl()}${path}`, { ...opts, headers });
  const data = (await res.json().catch(() => ({}))) as ApiResult<T>;
  if (!res.ok) {
    throw new Error(data.error || data.message || `请求失败 (${res.status})`);
  }
  return data;
};

const clampNumber = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const formatDate = (value?: string | null, withTime = false) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return withTime ? date.toLocaleString() : date.toLocaleDateString();
};

const formatCredits = (value?: number | null) => `${Number(value || 0).toFixed(2)} 点`;

const isExpired = (key: ApiKeyItem) => Boolean(key.expiresAt && new Date(key.expiresAt).getTime() <= Date.now());

const daysUntil = (value?: string | null): number | '' => {
  if (!value) return '';
  const diff = new Date(value).getTime() - Date.now();
  if (!Number.isFinite(diff) || diff <= 0) return 1;
  return Math.max(1, Math.ceil(diff / 86400000));
};

const normalizePermissionSelection = (current: string[], permission: string) => {
  if (permission === '*') return current.includes('*') ? ['status'] : ['*'];
  const withoutAll = current.filter((item) => item !== '*');
  return withoutAll.includes(permission)
    ? withoutAll.filter((item) => item !== permission)
    : [...withoutAll, permission];
};

const ApiKeyManager: React.FC<ApiKeyManagerProps> = ({ initialView = 'keys' }) => {
  const { setNotification } = useNotification();
  const [view, setView] = useState<ManagerView>(initialView);
  const [keys, setKeys] = useState<ApiKeyItem[]>([]);
  const [permissionDetails, setPermissionDetails] = useState<PermissionDetail[]>([]);
  const [billingRates, setBillingRates] = useState<BillingRate[]>([]);
  const [canManageAll, setCanManageAll] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'revoked' | 'expired'>('all');
  const [billingFilter, setBillingFilter] = useState<'all' | BillingMode>('all');

  const [newName, setNewName] = useState('');
  const [newPerms, setNewPerms] = useState<string[]>(['status']);
  const [newRate, setNewRate] = useState(60);
  const [newExpDays, setNewExpDays] = useState<number | ''>('');
  const [newBillingEnabled, setNewBillingEnabled] = useState(true);
  const [newBillingMode, setNewBillingMode] = useState<BillingMode>('metered');
  const [newBalanceCredits, setNewBalanceCredits] = useState<number | ''>('');
  const [creating, setCreating] = useState(false);

  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [showKey, setShowKey] = useState(false);
  const [editingKeyId, setEditingKeyId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<EditForm | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [eventsKey, setEventsKey] = useState<ApiKeyItem | null>(null);
  const [billingEvents, setBillingEvents] = useState<BillingEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [adjustCredits, setAdjustCredits] = useState<number | ''>('');
  const [adjustReason, setAdjustReason] = useState('');
  const [adjusting, setAdjusting] = useState(false);

  useEffect(() => setView(initialView), [initialView]);

  const permissionMap = useMemo(
    () => new Map(permissionDetails.map((permission) => [permission.key, permission])),
    [permissionDetails],
  );

  const allPermissions = useMemo(
    () => permissionDetails.map((permission) => permission.key),
    [permissionDetails],
  );

  const stats = useMemo(() => {
    const active = keys.filter((key) => key.enabled && !isExpired(key)).length;
    const revoked = keys.filter((key) => !key.enabled).length;
    const totalCharged = keys.reduce((sum, key) => sum + (key.totalChargedCredits || 0), 0);
    const billableRequests = keys.reduce((sum, key) => sum + (key.totalBillableRequests || 0), 0);
    const prepaidBalance = keys.reduce((sum, key) => sum + (key.billingMode === 'prepaid' ? key.balanceCredits || 0 : 0), 0);
    return { active, revoked, totalCharged, billableRequests, prepaidBalance };
  }, [keys]);

  const filteredKeys = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return keys.filter((key) => {
      if (keyword) {
        const haystack = `${key.name} ${key.keyId} ${key.userId} ${key.permissions.join(' ')}`.toLowerCase();
        if (!haystack.includes(keyword)) return false;
      }
      if (statusFilter === 'active' && (!key.enabled || isExpired(key))) return false;
      if (statusFilter === 'revoked' && key.enabled) return false;
      if (statusFilter === 'expired' && !isExpired(key)) return false;
      if (billingFilter !== 'all' && (key.billingMode || 'metered') !== billingFilter) return false;
      return true;
    });
  }, [billingFilter, keys, search, statusFilter]);

  const fetchKeys = useCallback(async () => {
    setLoading(true);
    try {
      try {
        const data = await apiJson<never>('/api/apikeys/all');
        setKeys(data.keys || []);
        setCanManageAll(true);
      } catch {
        const data = await apiJson<never>('/api/apikeys/mine');
        setKeys(data.keys || []);
        setCanManageAll(false);
      }
    } catch (err) {
      setNotification({ message: err instanceof Error ? err.message : '获取 API Key 列表失败', type: 'error' });
    } finally {
      setLoading(false);
    }
  }, [setNotification]);

  const fetchMeta = useCallback(async () => {
    try {
      const [permissionsData, ratesData] = await Promise.all([
        apiJson<never>('/api/apikeys/permissions'),
        apiJson<never>('/api/apikeys/billing/rates'),
      ]);
      const details = permissionsData.permissionDetails || (permissionsData.permissions || []).map((permission) => ({
        key: permission,
        label: permission,
        description: permission,
        category: 'utility',
        costCredits: 0,
        endpoints: [],
      }));
      setPermissionDetails(details);
      setBillingRates(ratesData.rates || details.map((permission) => ({
        permission: permission.key,
        label: permission.label,
        costCredits: permission.costCredits,
        description: permission.description,
      })));
    } catch {
      setPermissionDetails([]);
      setBillingRates([]);
    }
  }, []);

  useEffect(() => {
    fetchKeys();
    fetchMeta();
  }, [fetchKeys, fetchMeta]);

  const resetCreateForm = () => {
    setNewName('');
    setNewPerms(['status']);
    setNewRate(60);
    setNewExpDays('');
    setNewBillingEnabled(true);
    setNewBillingMode('metered');
    setNewBalanceCredits('');
  };

  const handleCreate = async () => {
    if (!newName.trim()) {
      setNotification({ message: '请输入名称', type: 'warning' });
      return;
    }
    setCreating(true);
    try {
      const data = await apiJson<never>('/api/apikeys', {
        method: 'POST',
        body: JSON.stringify({
          name: newName.trim(),
          permissions: newPerms,
          rateLimit: clampNumber(Number(newRate) || 60, 1, 1000),
          expiresInDays: newExpDays === '' ? null : newExpDays,
          billingEnabled: newBillingEnabled,
          billingMode: newBillingMode,
          balanceCredits: newBalanceCredits === '' ? 0 : newBalanceCredits,
        }),
      });
      setRevealedKey(data.plainKey || null);
      setShowKey(true);
      resetCreateForm();
      setShowCreate(false);
      fetchKeys();
      setNotification({ message: 'API Key 创建成功，请立即复制保存', type: 'success' });
    } catch (err) {
      setNotification({ message: err instanceof Error ? err.message : '创建失败', type: 'error' });
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (keyId: string) => {
    try {
      await apiJson<never>(`/api/apikeys/${keyId}/revoke`, { method: 'POST' });
      setNotification({ message: '已吊销', type: 'success' });
      fetchKeys();
    } catch (err) {
      setNotification({ message: err instanceof Error ? err.message : '操作失败', type: 'error' });
    }
  };

  const handleEnable = async (keyId: string) => {
    try {
      await apiJson<never>(`/api/apikeys/${keyId}/enable`, { method: 'POST' });
      setNotification({ message: '已启用', type: 'success' });
      fetchKeys();
    } catch (err) {
      setNotification({ message: err instanceof Error ? err.message : '操作失败', type: 'error' });
    }
  };

  const handleDelete = async (keyId: string) => {
    if (!confirm(`确定永久删除 ${keyId}？此操作不可恢复。`)) return;
    try {
      await apiJson<never>(`/api/apikeys/${keyId}`, { method: 'DELETE' });
      setNotification({ message: '已删除', type: 'success' });
      if (eventsKey?.keyId === keyId) setEventsKey(null);
      fetchKeys();
    } catch (err) {
      setNotification({ message: err instanceof Error ? err.message : '删除失败', type: 'error' });
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(
      () => setNotification({ message: '已复制到剪贴板', type: 'success' }),
      () => setNotification({ message: '复制失败', type: 'error' }),
    );
  };

  const startEdit = (key: ApiKeyItem) => {
    setEditingKeyId(key.keyId);
    setEditForm({
      name: key.name,
      permissions: key.permissions.length > 0 ? key.permissions : ['status'],
      rateLimit: key.rateLimit,
      expiresInDays: daysUntil(key.expiresAt),
      enabled: key.enabled,
      billingEnabled: key.billingEnabled !== false,
      billingMode: key.billingMode || 'metered',
    });
  };

  const cancelEdit = () => {
    setEditingKeyId(null);
    setEditForm(null);
  };

  const updateEditPermission = (permission: string) => {
    setEditForm((prev) => prev ? { ...prev, permissions: normalizePermissionSelection(prev.permissions, permission) } : prev);
  };

  const saveEdit = async (keyId: string) => {
    if (!editForm) return;
    if (!editForm.name.trim()) {
      setNotification({ message: '名称不能为空', type: 'warning' });
      return;
    }

    setSavingEdit(true);
    try {
      await apiJson<never>(`/api/apikeys/${keyId}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: editForm.name.trim(),
          permissions: editForm.permissions,
          rateLimit: clampNumber(Number(editForm.rateLimit) || 60, 1, 1000),
          enabled: editForm.enabled,
          expiresInDays: editForm.expiresInDays === '' ? null : editForm.expiresInDays,
          billingEnabled: editForm.billingEnabled,
          billingMode: editForm.billingMode,
        }),
      });
      setNotification({ message: '已更新 API Key', type: 'success' });
      cancelEdit();
      fetchKeys();
    } catch (err) {
      setNotification({ message: err instanceof Error ? err.message : '更新失败', type: 'error' });
    } finally {
      setSavingEdit(false);
    }
  };

  const fetchBillingEvents = useCallback(async (key: ApiKeyItem) => {
    setEventsKey(key);
    setEventsLoading(true);
    try {
      const data = await apiJson<never>(`/api/apikeys/${key.keyId}/billing/events?limit=50`);
      setBillingEvents(data.events || []);
    } catch (err) {
      setBillingEvents([]);
      setNotification({ message: err instanceof Error ? err.message : '获取计费流水失败', type: 'error' });
    } finally {
      setEventsLoading(false);
    }
  }, [setNotification]);

  const adjustBalance = async () => {
    if (!eventsKey || adjustCredits === '') return;
    setAdjusting(true);
    try {
      await apiJson<never>(`/api/apikeys/${eventsKey.keyId}/billing/adjust`, {
        method: 'POST',
        body: JSON.stringify({ credits: Number(adjustCredits), reason: adjustReason.trim() || undefined }),
      });
      setNotification({ message: '余额已调整', type: 'success' });
      setAdjustCredits('');
      setAdjustReason('');
      await fetchKeys();
      await fetchBillingEvents(eventsKey);
    } catch (err) {
      setNotification({ message: err instanceof Error ? err.message : '调整失败', type: 'error' });
    } finally {
      setAdjusting(false);
    }
  };

  const renderPermissionPill = (permission: string) => {
    const detail = permissionMap.get(permission);
    return (
      <span key={permission} className="px-1.5 py-0.5 bg-amber-50 text-amber-700 rounded text-xs">
        {detail?.label || permission}
      </span>
    );
  };

  const renderPermissionButtons = (selected: string[], onToggle: (permission: string) => void) => (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
      {allPermissions.map((permission) => {
        const detail = permissionMap.get(permission);
        const active = selected.includes(permission);
        return (
          <motion.button
            key={permission}
            type="button"
            onClick={() => onToggle(permission)}
            className={`min-h-[72px] rounded-lg border px-3 py-2 text-left transition ${
              active
                ? 'border-amber-300 bg-amber-50 text-amber-800'
                : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
            }`}
            whileTap={{ scale: 0.98 }}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-semibold">{detail?.label || permission}</span>
              <span className="rounded bg-white/80 px-1.5 py-0.5 text-xs">{formatCredits(detail?.costCredits)}</span>
            </div>
            <div className="mt-1 line-clamp-2 text-xs leading-5 text-gray-500">{detail?.description || permission}</div>
          </motion.button>
        );
      })}
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 sm:gap-3">
          <FaKey className="text-xl sm:text-2xl text-amber-600" />
          <div>
            <h2 className="text-lg sm:text-xl font-bold text-gray-800">API Key 管理</h2>
            <p className="mt-1 text-xs text-gray-500">使用 X-API-Key 请求头调用已接入的 API 能力。</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <motion.button
            onClick={fetchKeys}
            disabled={loading}
            className="flex items-center gap-1 px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg transition disabled:opacity-60"
            whileTap={{ scale: 0.95 }}
          >
            <FaSyncAlt className={loading ? 'animate-spin' : ''} />
            <span>刷新</span>
          </motion.button>
          <motion.button
            onClick={() => { setShowCreate(!showCreate); setRevealedKey(null); }}
            className="flex items-center gap-1 px-3 py-1.5 text-sm bg-amber-500 text-white hover:bg-amber-600 rounded-lg transition"
            whileTap={{ scale: 0.95 }}
          >
            <FaPlus />
            <span>创建</span>
          </motion.button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-gray-200">
        {[
          { key: 'keys' as ManagerView, label: '密钥' },
          { key: 'billing' as ManagerView, label: '计费' },
        ].map((item) => (
          <button
            key={item.key}
            onClick={() => setView(item.key)}
            className={`px-3 py-2 text-sm font-semibold border-b-2 transition ${
              view === item.key ? 'border-amber-500 text-amber-700' : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {[
          { label: 'Key 总数', value: keys.length },
          { label: '可用', value: stats.active },
          { label: '已吊销', value: stats.revoked },
          { label: '计费请求', value: stats.billableRequests },
          { label: '累计费用', value: formatCredits(stats.totalCharged) },
        ].map((item) => (
          <div key={item.label} className="rounded-lg border border-gray-200 bg-white p-3">
            <div className="text-xs text-gray-400">{item.label}</div>
            <div className="mt-1 text-lg font-bold text-gray-800">{item.value}</div>
          </div>
        ))}
      </div>

      <AnimatePresence>
        {revealedKey && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="p-4 bg-amber-50 border border-amber-300 rounded-lg"
          >
            <div className="flex items-center gap-2 mb-2 text-amber-800 font-medium text-sm">
              <FaShieldAlt /> 新 API Key 已创建，请立即复制，此密钥不会再次显示
            </div>
            <div className="flex items-center gap-2">
              <code className="flex-1 min-w-0 bg-white px-3 py-2 rounded border text-xs sm:text-sm font-mono break-all select-all">
                {showKey ? revealedKey : '*'.repeat(40)}
              </code>
              <motion.button onClick={() => setShowKey(!showKey)} className="p-2 text-gray-500 hover:text-gray-700" whileTap={{ scale: 0.9 }}>
                {showKey ? <FaEyeSlash /> : <FaEye />}
              </motion.button>
              <motion.button onClick={() => copyToClipboard(revealedKey)} className="p-2 text-amber-600 hover:text-amber-800" whileTap={{ scale: 0.9 }}>
                <FaCopy />
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showCreate && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="space-y-4 rounded-lg border border-gray-200 bg-gray-50 p-4"
          >
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <div className="lg:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">名称</label>
                <input
                  value={newName}
                  onChange={(event) => setNewName(event.target.value)}
                  maxLength={50}
                  placeholder="例如：CI/CD 部署密钥"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">限流（次/分钟）</label>
                <input
                  type="number"
                  value={newRate}
                  onChange={(event) => setNewRate(clampNumber(Number(event.target.value) || 60, 1, 1000))}
                  min={1}
                  max={1000}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">权限与单次成本</label>
              {renderPermissionButtons(newPerms, (permission) => setNewPerms((prev) => normalizePermissionSelection(prev, permission)))}
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">有效期（天）</label>
                <input
                  type="number"
                  value={newExpDays}
                  onChange={(event) => setNewExpDays(event.target.value === '' ? '' : clampNumber(Number(event.target.value) || 1, 1, 365))}
                  min={1}
                  max={365}
                  placeholder="永不过期"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                />
              </div>
              {canManageAll && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">计费模式</label>
                    <select
                      value={newBillingMode}
                      onChange={(event) => setNewBillingMode(event.target.value as BillingMode)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                    >
                      <option value="metered">后付计量</option>
                      <option value="prepaid">预付余额</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">初始余额（点）</label>
                    <input
                      type="number"
                      value={newBalanceCredits}
                      onChange={(event) => setNewBalanceCredits(event.target.value === '' ? '' : Math.max(Number(event.target.value) || 0, 0))}
                      min={0}
                      max={1000000}
                      disabled={newBillingMode !== 'prepaid'}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500 disabled:bg-gray-100"
                    />
                  </div>
                </>
              )}
            </div>
            {canManageAll && (
              <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={newBillingEnabled}
                  onChange={(event) => setNewBillingEnabled(event.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-amber-600 focus:ring-amber-500"
                />
                启用 API Key 计费
              </label>
            )}
            <motion.button
              onClick={handleCreate}
              disabled={creating || !newName.trim()}
              className={`flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-lg font-semibold text-white transition ${
                creating || !newName.trim() ? 'bg-gray-300 cursor-not-allowed' : 'bg-amber-500 hover:bg-amber-600 shadow'
              }`}
              whileTap={{ scale: 0.98 }}
            >
              {creating ? <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" /> : <FaPlus />}
              <span>{creating ? '创建中...' : '创建 API Key'}</span>
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>

      {view === 'billing' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
            <div className="rounded-lg border border-gray-200 bg-white p-4 lg:col-span-2">
              <div className="flex items-center gap-2 text-sm font-semibold text-gray-800">
                <FaCoins className="text-amber-600" /> API 计费价格
              </div>
              <div className="mt-3 overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="text-xs text-gray-400">
                    <tr>
                      <th className="py-2 pr-4">权限</th>
                      <th className="py-2 pr-4">单次成本</th>
                      <th className="py-2 pr-4">说明</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {billingRates.map((rate) => (
                      <tr key={rate.permission}>
                        <td className="py-2 pr-4 font-medium text-gray-800">{rate.label}</td>
                        <td className="py-2 pr-4 text-amber-700">{formatCredits(rate.costCredits)}</td>
                        <td className="py-2 pr-4 text-gray-500">{rate.description}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="rounded-lg border border-gray-200 bg-white p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-gray-800">
                <FaReceipt className="text-emerald-600" /> 计费摘要
              </div>
              <div className="mt-3 space-y-2 text-sm text-gray-600">
                <div className="flex justify-between"><span>计费状态</span><span>2xx-3xx 成功响应</span></div>
                <div className="flex justify-between"><span>预付余额合计</span><span>{formatCredits(stats.prepaidBalance)}</span></div>
                <div className="flex justify-between"><span>累计扣费</span><span>{formatCredits(stats.totalCharged)}</span></div>
              </div>
            </div>
          </div>

          {eventsKey && (
            <div className="rounded-lg border border-gray-200 bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-gray-800">{eventsKey.name} 计费流水</div>
                  <div className="mt-1 font-mono text-xs text-gray-400">{eventsKey.keyId}</div>
                </div>
                <button onClick={() => setEventsKey(null)} className="rounded p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700">
                  <FaTimes />
                </button>
              </div>
              {canManageAll && (
                <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-[160px_1fr_auto]">
                  <input
                    type="number"
                    value={adjustCredits}
                    onChange={(event) => setAdjustCredits(event.target.value === '' ? '' : Number(event.target.value))}
                    placeholder="+100 或 -10"
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                  />
                  <input
                    value={adjustReason}
                    onChange={(event) => setAdjustReason(event.target.value)}
                    placeholder="调整原因"
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                  />
                  <button
                    onClick={adjustBalance}
                    disabled={adjusting || adjustCredits === ''}
                    className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:bg-gray-300"
                  >
                    {adjusting ? '调整中...' : '调整余额'}
                  </button>
                </div>
              )}
              <div className="mt-4 overflow-x-auto">
                {eventsLoading ? (
                  <div className="py-8 text-center text-sm text-gray-400">加载计费流水...</div>
                ) : billingEvents.length === 0 ? (
                  <div className="py-8 text-center text-sm text-gray-400">暂无计费流水</div>
                ) : (
                  <table className="min-w-full text-left text-sm">
                    <thead className="text-xs text-gray-400">
                      <tr>
                        <th className="py-2 pr-4">时间</th>
                        <th className="py-2 pr-4">类型</th>
                        <th className="py-2 pr-4">权限</th>
                        <th className="py-2 pr-4">费用</th>
                        <th className="py-2 pr-4">余额变化</th>
                        <th className="py-2 pr-4">接口</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {billingEvents.map((event) => (
                        <tr key={`${event.createdAt}-${event.type}-${event.balanceDelta}`}>
                          <td className="py-2 pr-4 text-gray-500">{formatDate(event.createdAt, true)}</td>
                          <td className="py-2 pr-4 text-gray-800">{event.type}</td>
                          <td className="py-2 pr-4 text-gray-500">{permissionMap.get(event.permission)?.label || event.permission}</td>
                          <td className="py-2 pr-4 text-amber-700">{formatCredits(event.costCredits)}</td>
                          <td className="py-2 pr-4 text-gray-600">
                            {event.balanceDelta > 0 ? '+' : ''}{formatCredits(event.balanceDelta)}
                            {event.balanceAfter !== null && <span className="ml-1 text-gray-400">({formatCredits(event.balanceAfter)})</span>}
                          </td>
                          <td className="py-2 pr-4 font-mono text-xs text-gray-400">{event.method || '-'} {event.route || event.reason || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative flex-1">
          <FaSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-gray-400" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="搜索名称、Key ID、用户或权限"
            className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm focus:border-amber-500 focus:ring-2 focus:ring-amber-500"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-amber-500 focus:ring-2 focus:ring-amber-500"
          >
            <option value="all">全部状态</option>
            <option value="active">可用</option>
            <option value="revoked">已吊销</option>
            <option value="expired">已过期</option>
          </select>
          <select
            value={billingFilter}
            onChange={(event) => setBillingFilter(event.target.value as typeof billingFilter)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-amber-500 focus:ring-2 focus:ring-amber-500"
          >
            <option value="all">全部计费</option>
            <option value="metered">后付计量</option>
            <option value="prepaid">预付余额</option>
          </select>
        </div>
      </div>

      {loading && keys.length === 0 ? (
        <div className="text-center py-10 text-gray-400">加载中...</div>
      ) : filteredKeys.length === 0 ? (
        <div className="text-center py-10 text-gray-400">暂无匹配的 API Key</div>
      ) : (
        <div className="space-y-3">
          {filteredKeys.map((key) => {
            const expired = isExpired(key);
            const editing = editingKeyId === key.keyId && editForm;
            return (
              <motion.div
                key={key.keyId}
                layout
                className={`rounded-lg border p-3 transition sm:p-4 ${
                  key.enabled && !expired ? 'bg-white border-gray-200' : 'bg-gray-50 border-gray-200 opacity-75'
                }`}
              >
                {editing ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                      <input
                        value={editForm.name}
                        onChange={(event) => setEditForm({ ...editForm, name: event.target.value })}
                        className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-amber-500 focus:ring-2 focus:ring-amber-500 md:col-span-2"
                      />
                      <input
                        type="number"
                        value={editForm.rateLimit}
                        onChange={(event) => setEditForm({ ...editForm, rateLimit: clampNumber(Number(event.target.value) || 60, 1, 1000) })}
                        className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-amber-500 focus:ring-2 focus:ring-amber-500"
                      />
                    </div>
                    {renderPermissionButtons(editForm.permissions, updateEditPermission)}
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                      <input
                        type="number"
                        value={editForm.expiresInDays}
                        onChange={(event) => setEditForm({
                          ...editForm,
                          expiresInDays: event.target.value === '' ? '' : clampNumber(Number(event.target.value) || 1, 1, 365),
                        })}
                        placeholder="永不过期"
                        className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-amber-500 focus:ring-2 focus:ring-amber-500"
                      />
                      <select
                        value={editForm.enabled ? 'enabled' : 'disabled'}
                        onChange={(event) => setEditForm({ ...editForm, enabled: event.target.value === 'enabled' })}
                        className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-amber-500 focus:ring-2 focus:ring-amber-500"
                      >
                        <option value="enabled">启用</option>
                        <option value="disabled">吊销</option>
                      </select>
                      {canManageAll && (
                        <>
                          <select
                            value={editForm.billingMode}
                            onChange={(event) => setEditForm({ ...editForm, billingMode: event.target.value as BillingMode })}
                            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-amber-500 focus:ring-2 focus:ring-amber-500"
                          >
                            <option value="metered">后付计量</option>
                            <option value="prepaid">预付余额</option>
                          </select>
                          <label className="flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700">
                            <input
                              type="checkbox"
                              checked={editForm.billingEnabled}
                              onChange={(event) => setEditForm({ ...editForm, billingEnabled: event.target.checked })}
                              className="h-4 w-4 rounded border-gray-300 text-amber-600 focus:ring-amber-500"
                            />
                            计费
                          </label>
                        </>
                      )}
                    </div>
                    <div className="flex justify-end gap-2">
                      <button onClick={cancelEdit} className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50">取消</button>
                      <button
                        onClick={() => saveEdit(key.keyId)}
                        disabled={savingEdit}
                        className="rounded-lg bg-amber-600 px-3 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:bg-gray-300"
                      >
                        {savingEdit ? '保存中...' : '保存'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start justify-between gap-2 sm:gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium text-gray-800">{key.name}</span>
                        <code className="max-w-[160px] truncate rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600 sm:max-w-none">{key.keyId}</code>
                        <span className={`rounded px-1.5 py-0.5 text-xs ${key.enabled && !expired ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                          {expired ? '已过期' : key.enabled ? '启用' : '已吊销'}
                        </span>
                        <span className={`rounded px-1.5 py-0.5 text-xs ${(key.billingEnabled ?? true) ? 'bg-sky-100 text-sky-700' : 'bg-gray-100 text-gray-500'}`}>
                          {(key.billingMode || 'metered') === 'prepaid' ? '预付余额' : '后付计量'}
                        </span>
                      </div>
                      <div className="mb-2 flex flex-wrap gap-1">
                        {key.permissions.map(renderPermissionPill)}
                      </div>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-400 sm:flex sm:flex-wrap">
                        <span>限流: {key.rateLimit}/min</span>
                        <span>调用: {key.usageCount} 次</span>
                        <span>计费请求: {key.totalBillableRequests || 0}</span>
                        <span>累计费用: {formatCredits(key.totalChargedCredits)}</span>
                        {(key.billingMode || 'metered') === 'prepaid' && <span>余额: {formatCredits(key.balanceCredits)}</span>}
                        {key.expiresAt && <span className="flex items-center gap-1"><FaClock /> {formatDate(key.expiresAt)}</span>}
                        {key.lastUsedAt && <span className="col-span-2 sm:col-span-1">最后使用: {formatDate(key.lastUsedAt, true)}</span>}
                        {key.lastBillingAt && <span className="col-span-2 sm:col-span-1">最后计费: {formatDate(key.lastBillingAt, true)}</span>}
                        {key.lastUsedIp && <span>IP: {key.lastUsedIp}</span>}
                        <span>创建: {formatDate(key.createdAt)}</span>
                        <span className="truncate">用户: {key.userId}</span>
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
                      <motion.button onClick={() => startEdit(key)} title="编辑" className="rounded p-2 text-sky-600 transition hover:bg-sky-50 sm:p-1.5" whileTap={{ scale: 0.9 }}>
                        <FaEdit />
                      </motion.button>
                      <motion.button onClick={() => { setView('billing'); fetchBillingEvents(key); }} title="计费流水" className="rounded p-2 text-emerald-600 transition hover:bg-emerald-50 sm:p-1.5" whileTap={{ scale: 0.9 }}>
                        <FaReceipt />
                      </motion.button>
                      {key.enabled ? (
                        <motion.button onClick={() => handleRevoke(key.keyId)} title="吊销" className="rounded p-2 text-yellow-600 transition hover:bg-yellow-50 sm:p-1.5" whileTap={{ scale: 0.9 }}>
                          <FaBan />
                        </motion.button>
                      ) : (
                        <motion.button onClick={() => handleEnable(key.keyId)} title="启用" className="rounded p-2 text-green-600 transition hover:bg-green-50 sm:p-1.5" whileTap={{ scale: 0.9 }}>
                          <FaCheck />
                        </motion.button>
                      )}
                      <motion.button onClick={() => handleDelete(key.keyId)} title="永久删除" className="rounded p-2 text-red-500 transition hover:bg-red-50 sm:p-1.5" whileTap={{ scale: 0.9 }}>
                        <FaTrash />
                      </motion.button>
                    </div>
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ApiKeyManager;
