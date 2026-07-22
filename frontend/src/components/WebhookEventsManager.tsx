import React, { useCallback, useEffect, useMemo, useState } from 'react';
import ReactDOM from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  CheckSquare,
  Clipboard,
  Copy,
  Download,
  Eye,
  FileJson,
  KeyRound,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Send,
  Square,
  Trash2,
  Webhook,
  X,
} from 'lucide-react';
import { getApiBaseUrl } from '../api/api';
import { useNotification } from './Notification';
import { getAuthToken } from '../utils/authSession';


interface WebhookEventItem {
  _id: string;
  provider?: string;
  routeKey?: string | null;
  eventId?: string;
  type: string;
  title?: string;
  content?: string;
  renderedContent?: string;
  created_at?: string;
  to?: unknown;
  subject?: string;
  status?: string;
  data?: unknown;
  raw?: unknown;
  receivedAt?: string;
  updatedAt?: string;
}

interface WebhookStats {
  total: number;
  last24h: number;
  failed: number;
  byStatus: CountRow[];
  byProvider: CountRow[];
  byRouteKey: CountRow[];
  byType: CountRow[];
}

interface CountRow {
  key: string | null;
  total: number;
}

interface GroupRow extends CountRow {
  routeKey?: string | null;
}

interface WebhookSecretSetting {
  key: string;
  secret: string | null;
  updatedAt: string | null;
}

type ActivePanel = 'usage' | 'test' | 'secrets';
type EditMode = 'create' | 'edit';

const STATUS_OPTIONS = [
  'received',
  'testing',
  'processed',
  'replayed',
  'ignored',
  'failed',
  'delivered',
  'bounced',
  'complained',
];

const defaultStats: WebhookStats = {
  total: 0,
  last24h: 0,
  failed: 0,
  byStatus: [],
  byProvider: [],
  byRouteKey: [],
  byType: [],
};

const samplePayload = {
  type: 'demo.notification',
  title: 'Webhook 测试',
  content: '来自 {{value}} 的事件，状态：{{value}}',
  values: ['Synapse', 'OK'],
  status: 'received',
  timestamp: Date.now(),
  data: {
    source: 'admin-console',
  },
};

function apiUrl(path = '') {
  return `${getApiBaseUrl()}/api/webhook-events${path}`;
}

function secretUrl(key?: string) {
  const params = new URLSearchParams();
  if (key) params.set('key', key);
  const query = params.toString();
  return `${getApiBaseUrl()}/api/admin/webhook/secret${query ? `?${query}` : ''}`;
}

function authHeaders(json = false): HeadersInit {
  const token = getAuthToken();
  const headers: Record<string, string> = {};
  if (json) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

async function parseApiResponse(res: Response) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.success === false) {
    throw new Error(data.error || data.message || `请求失败 (${res.status})`);
  }
  return data;
}

function safeRouteSegment(value: string) {
  return value.trim().replace(/[^a-zA-Z0-9_-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
}

function buildPublicWebhookPath(kind: 'generic' | 'resend', routeKey: string) {
  const key = safeRouteSegment(routeKey);
  if (kind === 'generic') return key ? `/api/webhooks/generic-${key}` : '/api/webhooks/generic';
  return key && key.toUpperCase() !== 'DEFAULT' ? `/api/webhooks/resend-${key}` : '/api/webhooks/resend';
}

function toAbsoluteUrl(path: string) {
  const base = getApiBaseUrl();
  return new URL(`${base}${path}`, window.location.origin).toString();
}

function formatDate(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('zh-CN');
}

function stringifyJson(value: unknown) {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  return JSON.stringify(value, null, 2);
}

function parseJsonDraft(value: string, fieldLabel: string) {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  try {
    return JSON.parse(trimmed);
  } catch {
    throw new Error(`${fieldLabel} 不是有效 JSON`);
  }
}

function csvEscape(value: unknown) {
  const text = value == null ? '' : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function statusClass(status?: string) {
  const value = status?.toLowerCase();
  if (value === 'failed' || value === 'error' || value === 'bounced' || value === 'complained') {
    return 'bg-red-50 text-red-700 border-red-200';
  }
  if (value === 'processed' || value === 'delivered') {
    return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  }
  if (value === 'testing' || value === 'replayed') {
    return 'bg-amber-50 text-amber-700 border-amber-200';
  }
  return 'bg-slate-50 text-slate-700 border-slate-200';
}

const WebhookEventsManager: React.FC = () => {
  const { setNotification } = useNotification();
  const prefersReducedMotion = useReducedMotion();
  const hoverScale = useCallback(
    (scale: number, enabled = true) => (enabled && !prefersReducedMotion ? { scale } : undefined),
    [prefersReducedMotion],
  );
  const tapScale = useCallback(
    (scale: number, enabled = true) => (enabled && !prefersReducedMotion ? { scale } : undefined),
    [prefersReducedMotion],
  );

  const [items, setItems] = useState<WebhookEventItem[]>([]);
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [stats, setStats] = useState<WebhookStats>(defaultStats);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [activePanel, setActivePanel] = useState<ActivePanel>('usage');

  const [routeKeyFilter, setRouteKeyFilter] = useState<'all' | 'null' | string>('all');
  const [providerFilter, setProviderFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [eventIdFilter, setEventIdFilter] = useState('');
  const [searchFilter, setSearchFilter] = useState('');

  const [endpointRouteKey, setEndpointRouteKey] = useState('');
  const [testSource, setTestSource] = useState('');
  const [testMode, setTestMode] = useState<'public' | 'admin'>('public');
  const [testPayload, setTestPayload] = useState(() => JSON.stringify(samplePayload, null, 2));

  const [secretKeyInput, setSecretKeyInput] = useState('DEFAULT');
  const [secretInput, setSecretInput] = useState('');
  const [secretSetting, setSecretSetting] = useState<WebhookSecretSetting | null>(null);

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const allPageSelected = items.length > 0 && items.every((item) => selectedSet.has(item._id));

  const [selected, setSelected] = useState<WebhookEventItem | null>(null);
  const [editing, setEditing] = useState<WebhookEventItem | null>(null);
  const [editMode, setEditMode] = useState<EditMode>('edit');
  const [dataDraft, setDataDraft] = useState('');
  const [rawDraft, setRawDraft] = useState('');
  const [toDraft, setToDraft] = useState('');

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / pageSize)), [pageSize, total]);
  const genericPath = buildPublicWebhookPath('generic', endpointRouteKey);
  const resendPath = buildPublicWebhookPath('resend', endpointRouteKey);
  const genericUrl = toAbsoluteUrl(genericPath);
  const resendUrl = toAbsoluteUrl(resendPath);
  const testPath = buildPublicWebhookPath('generic', testSource);

  const fetchStats = useCallback(async () => {
    const data = await parseApiResponse(await fetch(apiUrl('/stats'), { headers: authHeaders() }));
    setStats({ ...defaultStats, ...(data.stats || {}) });
  }, []);

  const fetchGroups = useCallback(async () => {
    const data = await parseApiResponse(await fetch(apiUrl('/groups'), { headers: authHeaders() }));
    setGroups(data.groups || []);
  }, []);

  const fetchList = useCallback(
    async (
      nextPage = page,
      nextPageSize = pageSize,
      filters?: {
        routeKey?: 'all' | 'null' | string;
        provider?: string;
        type?: string;
        status?: string;
        eventId?: string;
        search?: string;
      },
    ) => {
      try {
        setLoading(true);
        const routeKey = filters?.routeKey ?? routeKeyFilter;
        const provider = filters?.provider ?? providerFilter;
        const type = filters?.type ?? typeFilter;
        const status = filters?.status ?? statusFilter;
        const eventId = filters?.eventId ?? eventIdFilter;
        const search = filters?.search ?? searchFilter;
        const params = new URLSearchParams({
          page: String(nextPage),
          pageSize: String(nextPageSize),
        });
        if (routeKey !== 'all') params.set('routeKey', routeKey);
        if (provider.trim()) params.set('provider', provider.trim());
        if (type.trim()) params.set('type', type.trim());
        if (status.trim()) params.set('status', status.trim());
        if (eventId.trim()) params.set('eventId', eventId.trim());
        if (search.trim()) params.set('q', search.trim());

        const data = await parseApiResponse(await fetch(`${apiUrl()}?${params.toString()}`, { headers: authHeaders() }));
        setItems(data.items || []);
        setTotal(data.total || 0);
        setPage(data.page || nextPage);
        setPageSize(data.pageSize || nextPageSize);
      } catch (error) {
        setNotification({ type: 'error', message: error instanceof Error ? error.message : '获取列表失败' });
      } finally {
        setLoading(false);
      }
    },
    [eventIdFilter, page, pageSize, providerFilter, routeKeyFilter, searchFilter, setNotification, statusFilter, typeFilter],
  );

  const refreshAll = useCallback(
    async (nextPage = page, nextPageSize = pageSize) => {
      try {
        await Promise.all([fetchGroups(), fetchStats(), fetchList(nextPage, nextPageSize)]);
      } catch (error) {
        setNotification({ type: 'error', message: error instanceof Error ? error.message : '刷新失败' });
      }
    },
    [fetchGroups, fetchList, fetchStats, page, pageSize, setNotification],
  );

  useEffect(() => {
    refreshAll(1, pageSize);
  }, []);

  const notifySuccess = useCallback((message: string) => setNotification({ type: 'success', message }), [setNotification]);

  const copyText = useCallback(
    async (text: string, message = '已复制') => {
      try {
        await navigator.clipboard.writeText(text);
        notifySuccess(message);
      } catch {
        setNotification({ type: 'error', message: '复制失败' });
      }
    },
    [notifySuccess, setNotification],
  );

  const handleFetchSecret = useCallback(async () => {
    try {
      setActionLoading('secret-load');
      const key = secretKeyInput.trim().toUpperCase() || 'DEFAULT';
      const data = await parseApiResponse(await fetch(secretUrl(key), { headers: authHeaders() }));
      setSecretSetting({
        key: data.key || key,
        secret: data.secret ?? null,
        updatedAt: data.updatedAt ?? null,
      });
    } catch (error) {
      setNotification({ type: 'error', message: error instanceof Error ? error.message : '获取密钥失败' });
    } finally {
      setActionLoading(null);
    }
  }, [secretKeyInput, setNotification]);

  const handleSaveSecret = useCallback(async () => {
    const key = secretKeyInput.trim().toUpperCase() || 'DEFAULT';
    const secret = secretInput.trim();
    if (!secret) {
      setNotification({ type: 'error', message: '请填写 Webhook 密钥' });
      return;
    }
    try {
      setActionLoading('secret-save');
      await parseApiResponse(
        await fetch(secretUrl(), {
          method: 'POST',
          headers: authHeaders(true),
          body: JSON.stringify({ key, secret }),
        }),
      );
      setSecretInput('');
      notifySuccess('密钥已保存');
      await handleFetchSecret();
    } catch (error) {
      setNotification({ type: 'error', message: error instanceof Error ? error.message : '保存密钥失败' });
    } finally {
      setActionLoading(null);
    }
  }, [handleFetchSecret, notifySuccess, secretInput, secretKeyInput, setNotification]);

  const handleDeleteSecret = useCallback(async () => {
    if (!confirm('确认删除该 Resend Webhook 密钥？')) return;
    const key = secretKeyInput.trim().toUpperCase() || 'DEFAULT';
    try {
      setActionLoading('secret-delete');
      await parseApiResponse(
        await fetch(secretUrl(), {
          method: 'DELETE',
          headers: authHeaders(true),
          body: JSON.stringify({ key }),
        }),
      );
      setSecretSetting({ key, secret: null, updatedAt: null });
      notifySuccess('密钥已删除');
    } catch (error) {
      setNotification({ type: 'error', message: error instanceof Error ? error.message : '删除密钥失败' });
    } finally {
      setActionLoading(null);
    }
  }, [notifySuccess, secretKeyInput, setNotification]);

  const handleSendTest = useCallback(async () => {
    let payload: unknown;
    try {
      payload = JSON.parse(testPayload);
    } catch {
      setNotification({ type: 'error', message: '测试 payload 不是有效 JSON' });
      return;
    }

    try {
      setActionLoading('test-send');
      if (testMode === 'public') {
        await parseApiResponse(
          await fetch(`${getApiBaseUrl()}${testPath}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          }),
        );
      } else {
        await parseApiResponse(
          await fetch(apiUrl('/test'), {
            method: 'POST',
            headers: authHeaders(true),
            body: JSON.stringify({
              source: testSource.trim() || 'generic-test',
              payload,
              status: 'testing',
            }),
          }),
        );
      }
      notifySuccess('测试事件已写入');
      await refreshAll(1, pageSize);
    } catch (error) {
      setNotification({ type: 'error', message: error instanceof Error ? error.message : '测试发送失败' });
    } finally {
      setActionLoading(null);
    }
  }, [notifySuccess, pageSize, refreshAll, setNotification, testMode, testPath, testPayload, testSource]);

  const handleDelete = useCallback(
    async (id: string) => {
      if (!confirm('确认删除该事件记录？')) return;
      try {
        setActionLoading(`delete-${id}`);
        await parseApiResponse(
          await fetch(apiUrl(`/${id}`), {
            method: 'DELETE',
            headers: authHeaders(),
          }),
        );
        setSelectedIds((prev) => prev.filter((value) => value !== id));
        notifySuccess('删除成功');
        await refreshAll(page, pageSize);
      } catch (error) {
        setNotification({ type: 'error', message: error instanceof Error ? error.message : '删除失败' });
      } finally {
        setActionLoading(null);
      }
    },
    [notifySuccess, page, pageSize, refreshAll, setNotification],
  );

  const handleReplay = useCallback(
    async (id: string) => {
      if (!confirm('确认重放该事件？可能会触发下游业务副作用。')) return;
      try {
        setActionLoading(`replay-${id}`);
        await parseApiResponse(
          await fetch(apiUrl(`/${id}/replay`), {
            method: 'POST',
            headers: authHeaders(true),
            body: JSON.stringify({ status: 'replayed', note: 'admin replay' }),
          }),
        );
        notifySuccess('事件已重放');
        await refreshAll(1, pageSize);
      } catch (error) {
        setNotification({ type: 'error', message: error instanceof Error ? error.message : '重放失败' });
      } finally {
        setActionLoading(null);
      }
    },
    [notifySuccess, pageSize, refreshAll, setNotification],
  );

  const handleStatusChange = useCallback(
    async (id: string, status: string) => {
      try {
        setActionLoading(`status-${id}`);
        const data = await parseApiResponse(
          await fetch(apiUrl(`/${id}/status`), {
            method: 'PATCH',
            headers: authHeaders(true),
            body: JSON.stringify({ status }),
          }),
        );
        setItems((prev) => prev.map((item) => (item._id === id ? data.item : item)));
        notifySuccess('状态已更新');
        await fetchStats();
      } catch (error) {
        setNotification({ type: 'error', message: error instanceof Error ? error.message : '更新状态失败' });
      } finally {
        setActionLoading(null);
      }
    },
    [fetchStats, notifySuccess, setNotification],
  );

  const handleBulkStatus = useCallback(
    async (status: string) => {
      if (selectedIds.length === 0) {
        setNotification({ type: 'warning', message: '请选择事件' });
        return;
      }
      try {
        setActionLoading('bulk-status');
        await parseApiResponse(
          await fetch(apiUrl('/bulk-status'), {
            method: 'POST',
            headers: authHeaders(true),
            body: JSON.stringify({ ids: selectedIds, status }),
          }),
        );
        notifySuccess('批量状态已更新');
        await refreshAll(page, pageSize);
      } catch (error) {
        setNotification({ type: 'error', message: error instanceof Error ? error.message : '批量更新失败' });
      } finally {
        setActionLoading(null);
      }
    },
    [notifySuccess, page, pageSize, refreshAll, selectedIds, setNotification],
  );

  const handleBulkDelete = useCallback(async () => {
    if (selectedIds.length === 0) {
      setNotification({ type: 'warning', message: '请选择事件' });
      return;
    }
    if (!confirm(`确认删除选中的 ${selectedIds.length} 条事件？`)) return;
    try {
      setActionLoading('bulk-delete');
      await parseApiResponse(
        await fetch(apiUrl('/bulk-delete'), {
          method: 'POST',
          headers: authHeaders(true),
          body: JSON.stringify({ ids: selectedIds }),
        }),
      );
      setSelectedIds([]);
      notifySuccess('批量删除成功');
      await refreshAll(page, pageSize);
    } catch (error) {
      setNotification({ type: 'error', message: error instanceof Error ? error.message : '批量删除失败' });
    } finally {
      setActionLoading(null);
    }
  }, [notifySuccess, page, pageSize, refreshAll, selectedIds, setNotification]);

  const openCreate = useCallback(() => {
    const item: WebhookEventItem = {
      _id: '',
      provider: 'manual',
      routeKey: null,
      type: 'manual.event',
      status: 'received',
      data: {},
      raw: {},
    };
    setEditMode('create');
    setEditing(item);
    setDataDraft('{}');
    setRawDraft('{}');
    setToDraft('');
  }, []);

  const openEdit = useCallback((item: WebhookEventItem) => {
    setEditMode('edit');
    setEditing(item);
    setDataDraft(stringifyJson(item.data));
    setRawDraft(stringifyJson(item.raw));
    setToDraft(stringifyJson(item.to));
  }, []);

  const closeEdit = useCallback(() => {
    setEditing(null);
    setDataDraft('');
    setRawDraft('');
    setToDraft('');
  }, []);

  const handleSave = useCallback(async () => {
    if (!editing) return;
    try {
      const payload = {
        ...editing,
        data: parseJsonDraft(dataDraft, 'data'),
        raw: parseJsonDraft(rawDraft, 'raw'),
        to: parseJsonDraft(toDraft, 'to'),
      };
      delete (payload as { _id?: string })._id;

      setActionLoading('save-event');
      const res =
        editMode === 'create'
          ? await fetch(apiUrl(), {
              method: 'POST',
              headers: authHeaders(true),
              body: JSON.stringify(payload),
            })
          : await fetch(apiUrl(`/${editing._id}`), {
              method: 'PUT',
              headers: authHeaders(true),
              body: JSON.stringify(payload),
            });
      await parseApiResponse(res);
      notifySuccess(editMode === 'create' ? '事件已创建' : '事件已保存');
      closeEdit();
      await refreshAll(editMode === 'create' ? 1 : page, pageSize);
    } catch (error) {
      setNotification({ type: 'error', message: error instanceof Error ? error.message : '保存失败' });
    } finally {
      setActionLoading(null);
    }
  }, [closeEdit, dataDraft, editMode, editing, notifySuccess, page, pageSize, rawDraft, refreshAll, setNotification, toDraft]);

  const togglePageSelection = useCallback(() => {
    if (allPageSelected) {
      const pageIds = new Set(items.map((item) => item._id));
      setSelectedIds((prev) => prev.filter((id) => !pageIds.has(id)));
      return;
    }
    setSelectedIds((prev) => Array.from(new Set([...prev, ...items.map((item) => item._id)])));
  }, [allPageSelected, items]);

  const toggleOne = useCallback((id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id]));
  }, []);

  const exportEvents = useCallback(
    (format: 'json' | 'csv') => {
      if (items.length === 0) {
        setNotification({ type: 'warning', message: '当前列表没有可导出的事件' });
        return;
      }
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const blob =
        format === 'json'
          ? new Blob([JSON.stringify(items, null, 2)], { type: 'application/json;charset=utf-8' })
          : new Blob(
              [
                [
                  ['provider', 'routeKey', 'eventId', 'type', 'status', 'subject', 'receivedAt'],
                  ...items.map((item) => [
                    item.provider || '',
                    item.routeKey || '',
                    item.eventId || '',
                    item.type || '',
                    item.status || '',
                    item.subject || item.title || '',
                    item.receivedAt || '',
                  ]),
                ]
                  .map((row) => row.map(csvEscape).join(','))
                  .join('\n'),
              ],
              { type: 'text/csv;charset=utf-8' },
            );
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `webhook-events-${timestamp}.${format}`;
      link.click();
      URL.revokeObjectURL(url);
    },
    [items, setNotification],
  );

  const renderPanel = () => {
    if (activePanel === 'test') {
      return (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="bg-white/90 border border-[#8ECAE6]/30 rounded-xl shadow-sm p-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-[#023047]/70 mb-1">来源 routeKey</label>
              <input
                value={testSource}
                onChange={(event) => setTestSource(event.target.value)}
                placeholder="github"
                className="w-full px-3 py-2 rounded-lg border border-[#8ECAE6]/40 focus:ring-2 focus:ring-[#FFB703] text-[#023047]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#023047]/70 mb-1">写入方式</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setTestMode('public')}
                  className={`px-3 py-2 rounded-lg border text-sm ${testMode === 'public' ? 'bg-[#023047] text-white border-[#023047]' : 'bg-white text-[#023047] border-[#8ECAE6]/40'}`}
                >
                  公开端点
                </button>
                <button
                  onClick={() => setTestMode('admin')}
                  className={`px-3 py-2 rounded-lg border text-sm ${testMode === 'admin' ? 'bg-[#023047] text-white border-[#023047]' : 'bg-white text-[#023047] border-[#8ECAE6]/40'}`}
                >
                  管理接口
                </button>
              </div>
            </div>
            <div className="flex items-end">
              <motion.button
                onClick={handleSendTest}
                disabled={actionLoading === 'test-send'}
                className="w-full px-3 py-2 rounded-lg bg-[#FFB703] text-[#023047] hover:bg-[#FB8500] disabled:opacity-50 text-sm font-semibold inline-flex items-center justify-center gap-2"
                whileHover={hoverScale(1.02)}
                whileTap={tapScale(0.98)}
              >
                <Send className="w-4 h-4" /> {actionLoading === 'test-send' ? '发送中' : '发送测试'}
              </motion.button>
            </div>
          </div>
          <div className="mt-3">
            <div className="flex items-center justify-between mb-1 gap-2">
              <label className="text-xs font-medium text-[#023047]/70">Payload JSON</label>
              <button
                onClick={() => setTestPayload(JSON.stringify(samplePayload, null, 2))}
                className="px-2 py-1 rounded-md border border-[#8ECAE6]/40 text-xs text-[#023047]/70 hover:bg-[#8ECAE6]/10"
              >
                重置样例
              </button>
            </div>
            <textarea
              value={testPayload}
              onChange={(event) => setTestPayload(event.target.value)}
              spellCheck={false}
              className="w-full min-h-56 px-3 py-2 rounded-lg bg-slate-950 text-slate-100 border border-slate-800 font-mono text-xs"
            />
          </div>
          <div className="mt-3 text-xs text-[#023047]/60 break-all">POST {toAbsoluteUrl(testPath)}</div>
        </motion.div>
      );
    }

    if (activePanel === 'secrets') {
      return (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="bg-white/90 border border-[#8ECAE6]/30 rounded-xl shadow-sm p-4">
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-medium text-[#023047]/70 mb-1">Resend key</label>
              <input
                value={secretKeyInput}
                onChange={(event) => setSecretKeyInput(event.target.value.toUpperCase())}
                placeholder="DEFAULT"
                className="w-full px-3 py-2 rounded-lg border border-[#8ECAE6]/40 focus:ring-2 focus:ring-[#FFB703] text-[#023047]"
              />
            </div>
            <div className="lg:col-span-2">
              <label className="block text-xs font-medium text-[#023047]/70 mb-1">Secret</label>
              <input
                value={secretInput}
                onChange={(event) => setSecretInput(event.target.value)}
                type="password"
                placeholder="whsec_xxx 或 Base64"
                className="w-full px-3 py-2 rounded-lg border border-[#8ECAE6]/40 focus:ring-2 focus:ring-[#FFB703] text-[#023047]"
              />
            </div>
            <div className="grid grid-cols-3 gap-2 lg:flex lg:items-end">
              <button
                onClick={handleFetchSecret}
                disabled={actionLoading === 'secret-load'}
                className="px-3 py-2 rounded-lg border border-[#8ECAE6]/40 text-[#023047] hover:bg-[#8ECAE6]/10 disabled:opacity-50 text-sm inline-flex items-center justify-center gap-2"
              >
                <RefreshCw className="w-4 h-4" /> 读取
              </button>
              <button
                onClick={handleSaveSecret}
                disabled={actionLoading === 'secret-save'}
                className="px-3 py-2 rounded-lg bg-[#FFB703] text-[#023047] hover:bg-[#FB8500] disabled:opacity-50 text-sm inline-flex items-center justify-center gap-2"
              >
                <Save className="w-4 h-4" /> 保存
              </button>
              <button
                onClick={handleDeleteSecret}
                disabled={actionLoading === 'secret-delete'}
                className="px-3 py-2 rounded-lg bg-red-500 text-white hover:bg-red-600 disabled:opacity-50 text-sm inline-flex items-center justify-center gap-2"
              >
                <Trash2 className="w-4 h-4" /> 删除
              </button>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
            <div className="rounded-lg border border-[#8ECAE6]/30 bg-[#8ECAE6]/10 p-3">
              <div className="text-xs text-[#023047]/60">当前 key</div>
              <div className="font-mono text-[#023047] break-all">{secretSetting?.key || '-'}</div>
            </div>
            <div className="rounded-lg border border-[#8ECAE6]/30 bg-[#8ECAE6]/10 p-3">
              <div className="text-xs text-[#023047]/60">密钥状态</div>
              <div className="font-mono text-[#023047] break-all">{secretSetting?.secret ?? '未读取'}</div>
            </div>
            <div className="rounded-lg border border-[#8ECAE6]/30 bg-[#8ECAE6]/10 p-3">
              <div className="text-xs text-[#023047]/60">更新时间</div>
              <div className="text-[#023047]">{formatDate(secretSetting?.updatedAt)}</div>
            </div>
          </div>
        </motion.div>
      );
    }

    const curlPayload = JSON.stringify(samplePayload);
    const genericCurl = `curl -X POST "${genericUrl}" -H "Content-Type: application/json" -d '${curlPayload}'`;
    const resendCurl = `curl -X POST "${resendUrl}" -H "Content-Type: application/json" -H "svix-id: msg_xxx" -H "svix-timestamp: 1700000000" -H "svix-signature: v1,xxx" -d '{"type":"email.delivered","data":{"id":"email_xxx"}}'`;

    return (
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="bg-white/90 border border-[#8ECAE6]/30 rounded-xl shadow-sm p-4">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-medium text-[#023047]/70 mb-1">routeKey</label>
            <input
              value={endpointRouteKey}
              onChange={(event) => setEndpointRouteKey(event.target.value)}
              placeholder="留空使用默认路由"
              className="w-full px-3 py-2 rounded-lg border border-[#8ECAE6]/40 focus:ring-2 focus:ring-[#FFB703] text-[#023047]"
            />
          </div>
          <EndpointBox label="Generic" value={genericUrl} onCopy={() => copyText(genericUrl, 'Generic URL 已复制')} />
          <EndpointBox label="Resend" value={resendUrl} onCopy={() => copyText(resendUrl, 'Resend URL 已复制')} />
        </div>
        <div className="mt-3 grid grid-cols-1 lg:grid-cols-2 gap-3">
          <CodeBlock title="Generic curl" value={genericCurl} onCopy={() => copyText(genericCurl, 'Generic curl 已复制')} />
          <CodeBlock title="Resend curl" value={resendCurl} onCopy={() => copyText(resendCurl, 'Resend curl 已复制')} />
        </div>
      </motion.div>
    );
  };

  return (
    <div className="max-w-7xl mx-auto px-2 sm:px-4 space-y-5">
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-[#023047] text-white rounded-2xl shadow-xl border border-[#8ECAE6]/30 p-4 sm:p-6"
      >
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#FFB703]/20 flex items-center justify-center shadow">
              <Webhook className="w-5 h-5" />
            </div>
            <div>
              <div className="text-lg font-semibold">Webhook 事件管理</div>
              <div className="text-[#8ECAE6] text-sm">接收端点、Resend 密钥、测试投递与事件处理</div>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 sm:flex sm:flex-wrap">
            <HeaderStat label="总数" value={stats.total} />
            <HeaderStat label="24h" value={stats.last24h} />
            <HeaderStat label="异常" value={stats.failed} tone="warning" />
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 lg:grid-cols-4 gap-2">
          {(stats.byStatus.length ? stats.byStatus.slice(0, 4) : [{ key: 'received', total: 0 }]).map((row) => (
            <div key={String(row.key)} className="rounded-lg bg-white/10 border border-white/10 px-3 py-2 min-w-0">
              <div className="text-xs text-[#8ECAE6] truncate">{row.key || '未设置状态'}</div>
              <div className="text-base font-semibold">{row.total}</div>
            </div>
          ))}
        </div>
      </motion.div>

      <div className="bg-white/80 backdrop-blur-sm border border-[#8ECAE6]/30 rounded-2xl p-3 shadow-sm">
        <div className="flex flex-col xl:flex-row gap-3 xl:items-center xl:justify-between">
          <div className="grid grid-cols-3 gap-2">
            <PanelButton icon={<Clipboard className="w-4 h-4" />} active={activePanel === 'usage'} onClick={() => setActivePanel('usage')}>
              使用
            </PanelButton>
            <PanelButton icon={<Play className="w-4 h-4" />} active={activePanel === 'test'} onClick={() => setActivePanel('test')}>
              测试
            </PanelButton>
            <PanelButton icon={<KeyRound className="w-4 h-4" />} active={activePanel === 'secrets'} onClick={() => setActivePanel('secrets')}>
              密钥
            </PanelButton>
          </div>
          <div className="flex flex-wrap gap-2">
            <motion.button
              onClick={() => refreshAll(page, pageSize)}
              disabled={loading}
              className="px-3 py-2 rounded-lg border border-[#8ECAE6]/40 text-[#023047] hover:bg-[#8ECAE6]/10 disabled:opacity-50 text-sm font-medium inline-flex items-center gap-2"
              whileHover={hoverScale(1.02)}
              whileTap={tapScale(0.98)}
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> 刷新
            </motion.button>
            <motion.button
              onClick={openCreate}
              className="px-3 py-2 rounded-lg bg-[#FFB703] text-[#023047] hover:bg-[#FB8500] text-sm font-semibold inline-flex items-center gap-2"
              whileHover={hoverScale(1.02)}
              whileTap={tapScale(0.98)}
            >
              <Plus className="w-4 h-4" /> 新增
            </motion.button>
          </div>
        </div>
        <div className="mt-3">{renderPanel()}</div>
      </div>

      <div className="bg-white/80 backdrop-blur-sm border border-[#8ECAE6]/30 rounded-2xl p-3 shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-3">
          <div>
            <label className="block text-xs text-[#023047]/60 mb-1">routeKey</label>
            <select
              value={routeKeyFilter}
              onChange={(event) => setRouteKeyFilter(event.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-[#8ECAE6]/40 bg-white text-[#023047]"
            >
              <option value="all">全部</option>
              <option value="null">未分组</option>
              {groups.map((group) => (
                <option key={String(group.routeKey ?? group.key ?? 'null')} value={String(group.routeKey ?? group.key ?? 'null')}>
                  {String(group.routeKey ?? group.key ?? '未分组')} ({group.total})
                </option>
              ))}
            </select>
          </div>
          <FilterInput label="provider" value={providerFilter} onChange={setProviderFilter} placeholder="resend" />
          <FilterInput label="type" value={typeFilter} onChange={setTypeFilter} placeholder="email.delivered" />
          <FilterInput label="status" value={statusFilter} onChange={setStatusFilter} placeholder="processed" />
          <FilterInput label="eventId" value={eventIdFilter} onChange={setEventIdFilter} placeholder="evt_xxx" />
          <FilterInput label="搜索" value={searchFilter} onChange={setSearchFilter} placeholder="标题/主题" />
        </div>
        <div className="mt-3 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-2">
          <div className="flex flex-wrap gap-2">
            <motion.button
              onClick={() => fetchList(1, pageSize)}
              className="px-3 py-2 rounded-lg bg-[#023047] text-white hover:bg-[#034766] text-sm font-medium inline-flex items-center gap-2"
              whileHover={hoverScale(1.02)}
              whileTap={tapScale(0.98)}
            >
              <Search className="w-4 h-4" /> 应用筛选
            </motion.button>
            <button
              onClick={() => {
                setRouteKeyFilter('all');
                setProviderFilter('');
                setTypeFilter('');
                setStatusFilter('');
                setEventIdFilter('');
                setSearchFilter('');
                void fetchList(1, pageSize, {
                  routeKey: 'all',
                  provider: '',
                  type: '',
                  status: '',
                  eventId: '',
                  search: '',
                });
              }}
              className="px-3 py-2 rounded-lg border border-[#8ECAE6]/40 text-[#023047] hover:bg-[#8ECAE6]/10 text-sm"
            >
              清空
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => exportEvents('json')} className="px-3 py-2 rounded-lg border border-[#8ECAE6]/40 text-[#023047] hover:bg-[#8ECAE6]/10 text-sm inline-flex items-center gap-2">
              <FileJson className="w-4 h-4" /> JSON
            </button>
            <button onClick={() => exportEvents('csv')} className="px-3 py-2 rounded-lg border border-[#8ECAE6]/40 text-[#023047] hover:bg-[#8ECAE6]/10 text-sm inline-flex items-center gap-2">
              <Download className="w-4 h-4" /> CSV
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white/80 backdrop-blur-sm border border-[#8ECAE6]/30 rounded-2xl shadow-xl overflow-hidden">
        <div className="p-3 border-b border-[#8ECAE6]/20 flex flex-col xl:flex-row xl:items-center xl:justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2 text-sm text-[#023047]/70">
            <button onClick={togglePageSelection} className="px-3 py-2 rounded-lg border border-[#8ECAE6]/40 hover:bg-[#8ECAE6]/10 inline-flex items-center gap-2">
              {allPageSelected ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />} 当前页
            </button>
            <span>已选 {selectedIds.length} 条</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <select
              onChange={(event) => {
                if (event.target.value) void handleBulkStatus(event.target.value);
                event.target.value = '';
              }}
              disabled={selectedIds.length === 0 || actionLoading === 'bulk-status'}
              className="px-3 py-2 rounded-lg border border-[#8ECAE6]/40 bg-white text-[#023047] text-sm disabled:opacity-50"
              defaultValue=""
            >
              <option value="" disabled>批量状态</option>
              {STATUS_OPTIONS.map((status) => (
                <option key={status} value={status}>{status}</option>
              ))}
            </select>
            <button
              onClick={handleBulkDelete}
              disabled={selectedIds.length === 0 || actionLoading === 'bulk-delete'}
              className="px-3 py-2 rounded-lg bg-red-500 text-white hover:bg-red-600 disabled:opacity-50 text-sm inline-flex items-center gap-2"
            >
              <Trash2 className="w-4 h-4" /> 批量删除
            </button>
            <select
              value={pageSize}
              onChange={(event) => fetchList(1, Number(event.target.value))}
              className="px-3 py-2 rounded-lg border border-[#8ECAE6]/40 bg-white text-[#023047] text-sm"
            >
              {[10, 20, 50, 100].map((size) => (
                <option key={size} value={size}>{size}/页</option>
              ))}
            </select>
          </div>
        </div>

        <div className="block lg:hidden divide-y divide-[#8ECAE6]/20">
          {items.map((item) => (
            <EventCard
              key={item._id}
              item={item}
              checked={selectedSet.has(item._id)}
              onCheck={() => toggleOne(item._id)}
              onDetail={() => setSelected(item)}
              onEdit={() => openEdit(item)}
              onReplay={() => handleReplay(item._id)}
              onDelete={() => handleDelete(item._id)}
              onStatusChange={(status) => handleStatusChange(item._id, status)}
              actionLoading={actionLoading}
            />
          ))}
          {!loading && items.length === 0 && <div className="p-6 text-center text-[#023047]/40">暂无数据</div>}
        </div>

        <div className="hidden lg:block overflow-x-auto">
          <table className="min-w-full text-sm table-fixed">
            <thead className="bg-[#8ECAE6]/10">
              <tr className="text-left text-[#023047]">
                <th className="p-3 w-12"></th>
                <th className="p-3 w-32">来源</th>
                <th className="p-3 w-40">类型</th>
                <th className="p-3 w-44">事件 ID</th>
                <th className="p-3 w-64">摘要</th>
                <th className="p-3 w-40">状态</th>
                <th className="p-3 w-44">时间</th>
                <th className="p-3 w-64">操作</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item._id} className="border-t border-[#8ECAE6]/20 hover:bg-[#8ECAE6]/10">
                  <td className="p-3">
                    <button onClick={() => toggleOne(item._id)} className="text-[#023047]/70 hover:text-[#023047]" aria-label="选择事件">
                      {selectedSet.has(item._id) ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                    </button>
                  </td>
                  <td className="p-3 text-[#023047]">
                    <div className="font-medium truncate">{item.provider || '-'}</div>
                    <div className="text-xs text-[#023047]/50 truncate">{item.routeKey || '默认'}</div>
                  </td>
                  <td className="p-3 text-[#023047] truncate" title={item.type}>{item.type || '-'}</td>
                  <td className="p-3 text-[#023047]/70 font-mono truncate" title={item.eventId || ''}>{item.eventId || '-'}</td>
                  <td className="p-3 text-[#023047]">
                    <div className="truncate">{item.title || item.subject || '-'}</div>
                    <div className="text-xs text-[#023047]/50 truncate">{item.renderedContent || stringifyJson(item.to) || ''}</div>
                  </td>
                  <td className="p-3">
                    <select
                      value={item.status || ''}
                      onChange={(event) => handleStatusChange(item._id, event.target.value)}
                      className={`w-full px-2 py-1 rounded-md border text-xs ${statusClass(item.status)}`}
                    >
                      <option value="">未设置</option>
                      {STATUS_OPTIONS.map((status) => (
                        <option key={status} value={status}>{status}</option>
                      ))}
                      {item.status && !STATUS_OPTIONS.includes(item.status) && <option value={item.status}>{item.status}</option>}
                    </select>
                  </td>
                  <td className="p-3 text-[#023047]/70 whitespace-nowrap">{formatDate(item.receivedAt)}</td>
                  <td className="p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <IconButton title="详情" onClick={() => setSelected(item)}><Eye className="w-4 h-4" /></IconButton>
                      <IconButton title="编辑" onClick={() => openEdit(item)} tone="warning"><Pencil className="w-4 h-4" /></IconButton>
                      <IconButton title="重放" onClick={() => handleReplay(item._id)}><RotateCcw className="w-4 h-4" /></IconButton>
                      <IconButton title="删除" onClick={() => handleDelete(item._id)} tone="danger"><Trash2 className="w-4 h-4" /></IconButton>
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && items.length === 0 && (
                <tr>
                  <td className="p-6 text-center text-[#023047]/40" colSpan={8}>暂无数据</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {loading && <div className="p-4 text-[#023047]/50">加载中...</div>}
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 bg-white/80 backdrop-blur-sm border border-[#8ECAE6]/30 rounded-2xl">
        <div className="text-sm text-[#023047]/70">共 {total} 条，第 {page}/{totalPages} 页</div>
        <div className="flex flex-col sm:flex-row gap-2">
          <motion.button
            disabled={page <= 1}
            onClick={() => fetchList(page - 1, pageSize)}
            className="px-3 py-2 rounded-lg bg-[#8ECAE6]/10 hover:bg-[#8ECAE6]/20 text-[#023047]/70 disabled:opacity-50"
            whileHover={hoverScale(1.02, page > 1)}
            whileTap={tapScale(0.98, page > 1)}
          >
            上一页
          </motion.button>
          <motion.button
            disabled={page >= totalPages}
            onClick={() => fetchList(page + 1, pageSize)}
            className="px-3 py-2 rounded-lg bg-[#8ECAE6]/10 hover:bg-[#8ECAE6]/20 text-[#023047]/70 disabled:opacity-50"
            whileHover={hoverScale(1.02, page < totalPages)}
            whileTap={tapScale(0.98, page < totalPages)}
          >
            下一页
          </motion.button>
        </div>
      </div>

      {ReactDOM.createPortal(
        <AnimatePresence>
          {selected && (
            <Modal onClose={() => setSelected(null)} title="事件详情">
              <div className="space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                  <SummaryField label="来源" value={`${selected.provider || '-'} / ${selected.routeKey || '默认'}`} />
                  <SummaryField label="类型" value={selected.type || '-'} />
                  <SummaryField label="状态" value={selected.status || '-'} />
                </div>
                {(selected.title || selected.renderedContent) && (
                  <div className="rounded-lg border border-[#8ECAE6]/30 bg-[#8ECAE6]/10 p-3">
                    <div className="font-semibold text-[#023047]">{selected.title || selected.subject || '摘要'}</div>
                    {selected.renderedContent && <div className="mt-1 text-sm text-[#023047]/70 whitespace-pre-wrap">{selected.renderedContent}</div>}
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => copyText(JSON.stringify(selected, null, 2), '事件 JSON 已复制')} className="px-3 py-2 rounded-lg border border-[#8ECAE6]/40 text-[#023047] hover:bg-[#8ECAE6]/10 text-sm inline-flex items-center gap-2">
                    <Copy className="w-4 h-4" /> 复制 JSON
                  </button>
                  <button onClick={() => handleReplay(selected._id)} className="px-3 py-2 rounded-lg border border-[#8ECAE6]/40 text-[#023047] hover:bg-[#8ECAE6]/10 text-sm inline-flex items-center gap-2">
                    <RotateCcw className="w-4 h-4" /> 重放
                  </button>
                </div>
                <pre className="text-xs bg-slate-950 text-slate-100 p-3 rounded-lg overflow-auto max-h-[50vh]">{JSON.stringify(selected, null, 2)}</pre>
              </div>
            </Modal>
          )}
        </AnimatePresence>,
        document.body,
      )}

      {ReactDOM.createPortal(
        <AnimatePresence>
          {editing && (
            <Modal onClose={closeEdit} title={editMode === 'create' ? '新增事件' : '编辑事件'} width="max-w-3xl">
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <EditInput label="provider" value={editing.provider || ''} onChange={(value) => setEditing({ ...editing, provider: value })} />
                  <EditInput label="routeKey" value={editing.routeKey || ''} onChange={(value) => setEditing({ ...editing, routeKey: value || null })} />
                  <EditInput label="type" value={editing.type || ''} onChange={(value) => setEditing({ ...editing, type: value })} />
                  <EditInput label="eventId" value={editing.eventId || ''} onChange={(value) => setEditing({ ...editing, eventId: value })} />
                  <EditInput label="status" value={editing.status || ''} onChange={(value) => setEditing({ ...editing, status: value })} />
                  <EditInput label="subject" value={editing.subject || ''} onChange={(value) => setEditing({ ...editing, subject: value })} />
                  <div className="md:col-span-2">
                    <EditInput label="title" value={editing.title || ''} onChange={(value) => setEditing({ ...editing, title: value })} />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm text-[#023047]/70 mb-1">content</label>
                    <textarea
                      value={editing.content || ''}
                      onChange={(event) => setEditing({ ...editing, content: event.target.value })}
                      className="w-full h-20 px-3 py-2 rounded-lg border border-[#8ECAE6]/40 focus:ring-2 focus:ring-[#FFB703] text-[#023047]"
                    />
                  </div>
                  <JsonDraft label="to" value={toDraft} onChange={setToDraft} height="h-20" />
                  <JsonDraft label="data" value={dataDraft} onChange={setDataDraft} />
                  <JsonDraft label="raw" value={rawDraft} onChange={setRawDraft} />
                </div>
                <div className="flex justify-end gap-2 pt-3 border-t border-[#8ECAE6]/30">
                  <button onClick={closeEdit} className="px-3 py-2 rounded-lg border border-[#8ECAE6]/40 text-[#023047] hover:bg-[#8ECAE6]/10 text-sm">
                    取消
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={actionLoading === 'save-event'}
                    className="px-3 py-2 rounded-lg bg-[#FFB703] text-[#023047] hover:bg-[#FB8500] disabled:opacity-50 text-sm font-semibold inline-flex items-center gap-2"
                  >
                    <Save className="w-4 h-4" /> {actionLoading === 'save-event' ? '保存中' : '保存'}
                  </button>
                </div>
              </div>
            </Modal>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </div>
  );
};

function HeaderStat({ label, value, tone }: { label: string; value: number; tone?: 'warning' }) {
  return (
    <div className={`rounded-lg px-3 py-2 border ${tone === 'warning' ? 'bg-red-500/15 border-red-300/20' : 'bg-white/10 border-white/10'}`}>
      <div className="text-xs text-[#8ECAE6]">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  );
}

function PanelButton({ active, icon, children, onClick }: { active: boolean; icon: React.ReactNode; children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-2 rounded-lg border text-sm font-medium inline-flex items-center justify-center gap-2 ${active ? 'bg-[#023047] text-white border-[#023047]' : 'bg-white text-[#023047] border-[#8ECAE6]/40 hover:bg-[#8ECAE6]/10'}`}
    >
      {icon}
      {children}
    </button>
  );
}

function EndpointBox({ label, value, onCopy }: { label: string; value: string; onCopy: () => void }) {
  return (
    <div className="rounded-lg border border-[#8ECAE6]/30 bg-[#8ECAE6]/10 p-3 min-w-0">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs font-semibold text-[#023047]/70">{label}</div>
        <button onClick={onCopy} className="p-1.5 rounded-md hover:bg-white/70 text-[#023047]" title={`复制 ${label}`}>
          <Copy className="w-4 h-4" />
        </button>
      </div>
      <div className="mt-1 text-xs font-mono text-[#023047] break-all">{value}</div>
    </div>
  );
}

function CodeBlock({ title, value, onCopy }: { title: string; value: string; onCopy: () => void }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-800">
        <div className="text-xs text-slate-300">{title}</div>
        <button onClick={onCopy} className="p-1.5 rounded-md hover:bg-slate-800 text-slate-200" title="复制">
          <Copy className="w-4 h-4" />
        </button>
      </div>
      <pre className="p-3 overflow-auto text-xs text-slate-100 whitespace-pre-wrap break-all">{value}</pre>
    </div>
  );
}

function FilterInput({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder: string }) {
  return (
    <div>
      <label className="block text-xs text-[#023047]/60 mb-1">{label}</label>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2 rounded-lg border border-[#8ECAE6]/40 bg-white text-[#023047]"
      />
    </div>
  );
}

function IconButton({ children, title, onClick, tone }: { children: React.ReactNode; title: string; onClick: () => void; tone?: 'warning' | 'danger' }) {
  const toneClass =
    tone === 'danger'
      ? 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100'
      : tone === 'warning'
        ? 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'
        : 'bg-[#8ECAE6]/15 text-[#219EBC] border-[#8ECAE6]/30 hover:bg-[#8ECAE6]/25';
  return (
    <button onClick={onClick} title={title} className={`p-2 rounded-lg border ${toneClass}`}>
      {children}
    </button>
  );
}

function EventCard({
  item,
  checked,
  onCheck,
  onDetail,
  onEdit,
  onReplay,
  onDelete,
  onStatusChange,
}: {
  item: WebhookEventItem;
  checked: boolean;
  actionLoading: string | null;
  onCheck: () => void;
  onDetail: () => void;
  onEdit: () => void;
  onReplay: () => void;
  onDelete: () => void;
  onStatusChange: (status: string) => void;
}) {
  return (
    <div className="p-4">
      <div className="flex items-start gap-3">
        <button onClick={onCheck} className="mt-1 text-[#023047]/70" aria-label="选择事件">
          {checked ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-[#219EBC]/15 text-[#219EBC]">{item.type || '未分类'}</span>
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[11px] font-medium ${statusClass(item.status)}`}>{item.status || '未设置'}</span>
            {item.eventId && <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-mono bg-[#8ECAE6]/10 text-[#023047]/70 max-w-full truncate">#{item.eventId}</span>}
          </div>
          <div className="mt-1 text-xs text-[#023047]/60">
            {item.provider || '-'} / {item.routeKey || '默认'} / {formatDate(item.receivedAt)}
          </div>
          <div className="mt-2 text-sm font-medium text-[#023047] truncate">{item.title || item.subject || '-'}</div>
          {item.renderedContent && <div className="mt-1 text-xs text-[#023047]/70 line-clamp-2 whitespace-pre-wrap">{item.renderedContent}</div>}
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <select value={item.status || ''} onChange={(event) => onStatusChange(event.target.value)} className={`px-2 py-2 rounded-lg border text-xs ${statusClass(item.status)}`}>
          <option value="">未设置</option>
          {STATUS_OPTIONS.map((status) => (
            <option key={status} value={status}>{status}</option>
          ))}
          {item.status && !STATUS_OPTIONS.includes(item.status) && <option value={item.status}>{item.status}</option>}
        </select>
        <div className="grid grid-cols-4 gap-2">
          <IconButton title="详情" onClick={onDetail}><Eye className="w-4 h-4" /></IconButton>
          <IconButton title="编辑" onClick={onEdit} tone="warning"><Pencil className="w-4 h-4" /></IconButton>
          <IconButton title="重放" onClick={onReplay}><RotateCcw className="w-4 h-4" /></IconButton>
          <IconButton title="删除" onClick={onDelete} tone="danger"><Trash2 className="w-4 h-4" /></IconButton>
        </div>
      </div>
    </div>
  );
}

function Modal({ title, onClose, children, width = 'max-w-4xl' }: { title: string; onClose: () => void; children: React.ReactNode; width?: string }) {
  return (
    <motion.div className="fixed inset-0 z-[9999] bg-black/50 backdrop-blur-sm flex items-center justify-center p-3" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.div
        className={`bg-white/95 backdrop-blur rounded-2xl ${width} w-[95vw] max-h-[90vh] flex flex-col p-4 sm:p-6 border border-[#8ECAE6]/30 shadow-xl`}
        initial={{ scale: 0.96, y: 10, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.96, y: 10, opacity: 0 }}
      >
        <div className="flex items-center justify-between gap-3 mb-3 flex-shrink-0">
          <div className="font-semibold text-[#023047]">{title}</div>
          <button onClick={onClose} className="p-2 rounded-lg border border-[#8ECAE6]/40 text-[#023047] hover:bg-[#8ECAE6]/10" title="关闭">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-auto min-h-0">{children}</div>
      </motion.div>
    </motion.div>
  );
}

function SummaryField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[#8ECAE6]/30 bg-[#8ECAE6]/10 p-3">
      <div className="text-xs text-[#023047]/60">{label}</div>
      <div className="text-[#023047] break-all">{value}</div>
    </div>
  );
}

function EditInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <div>
      <label className="block text-sm text-[#023047]/70 mb-1">{label}</label>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full px-3 py-2 rounded-lg border border-[#8ECAE6]/40 focus:ring-2 focus:ring-[#FFB703] text-[#023047]"
      />
    </div>
  );
}

function JsonDraft({ label, value, onChange, height = 'h-32' }: { label: string; value: string; onChange: (value: string) => void; height?: string }) {
  return (
    <div className="md:col-span-2">
      <label className="block text-sm text-[#023047]/70 mb-1">{label}</label>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        spellCheck={false}
        className={`w-full ${height} px-3 py-2 rounded-lg border border-[#8ECAE6]/40 focus:ring-2 focus:ring-[#FFB703] text-[#023047] font-mono text-xs`}
      />
    </div>
  );
}

export default WebhookEventsManager;
