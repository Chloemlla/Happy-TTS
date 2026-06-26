import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  FaBan,
  FaCheck,
  FaCopy,
  FaEdit,
  FaHistory,
  FaKey,
  FaLayerGroup,
  FaPlus,
  FaRedo,
  FaSave,
  FaSearch,
  FaShieldAlt,
  FaSyncAlt,
  FaTimes,
  FaTrash,
} from 'react-icons/fa';
import { auditLogApi, type AuditLogEntry } from '../api/auditLog';
import { oauthApi, type OAuthClient, type OAuthGrant, type OAuthScopeDefinition } from '../api/oauth';
import { useNotification } from './Notification';

const defaultScopes = ['openid', 'profile', 'admin:identity', 'status'];

const scopeCategoryLabels: Record<string, string> = {
  identity: '身份资料',
  tts: 'TTS 能力',
  user: '用户数据',
  system: '系统能力',
  security: '安全能力',
  resource: '资源能力',
  admin: '管理能力',
  other: '其他能力',
};

const auditActionLabels: Record<string, string> = {
  'oauth.client.create': '创建客户端',
  'oauth.client.update': '更新客户端',
  'oauth.client.rotate_secret': '轮换密钥',
  'oauth.client.disable': '停用客户端',
  'oauth.grant.revoke': '撤销授权',
};

type ClientFormState = {
  name: string;
  description: string;
  homepageUrl: string;
  logoUrl: string;
  redirectUris: string;
  rateLimitPerMinute: number;
  selectedScopes: string[];
};

const createEmptyClientForm = (): ClientFormState => ({
  name: '',
  description: '',
  homepageUrl: '',
  logoUrl: '',
  redirectUris: '',
  rateLimitPerMinute: 120,
  selectedScopes: [...defaultScopes],
});

const formatDate = (value?: string | null) => {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleString('zh-CN');
};

const getGrantUserDisplay = (grant: OAuthGrant) => {
  const username = grant.user?.username?.trim() || '';
  const email = grant.user?.email?.trim() || '';
  const options = [username, email].filter(Boolean);
  const primary = options.length === 0 ? grant.userId : options.sort((left, right) => left.length - right.length)[0];
  const secondary = primary === username ? email : username;
  return {
    primary,
    secondary: secondary || grant.userId,
    title: [username, email, grant.userId].filter(Boolean).join(' / '),
  };
};

const getErrorMessage = (error: any) =>
  error?.response?.data?.error_description || error?.response?.data?.error || error?.message || '请求失败';

const OAuthClientManager: React.FC = () => {
  const { setNotification } = useNotification();
  const [clients, setClients] = useState<OAuthClient[]>([]);
  const [grants, setGrants] = useState<OAuthGrant[]>([]);
  const [scopes, setScopes] = useState<OAuthScopeDefinition[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState('');
  const [revealedSecret, setRevealedSecret] = useState<{ clientId: string; secret: string } | null>(null);
  const [editingClientId, setEditingClientId] = useState<string | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [editForm, setEditForm] = useState<ClientFormState>(createEmptyClientForm);
  const [grantSearch, setGrantSearch] = useState('');
  const [grantStatus, setGrantStatus] = useState<'all' | 'active' | 'revoked'>('all');

  const [name, setName] = useState('');
  const [type, setType] = useState<'confidential' | 'public'>('confidential');
  const [description, setDescription] = useState('');
  const [homepageUrl, setHomepageUrl] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [redirectUris, setRedirectUris] = useState('');
  const [rateLimitPerMinute, setRateLimitPerMinute] = useState(120);
  const [selectedScopes, setSelectedScopes] = useState<string[]>(defaultScopes);

  const scopeMap = useMemo(() => new Map(scopes.map((scope) => [scope.key, scope])), [scopes]);
  const groupedScopes = useMemo(() => {
    const groups = scopes.reduce<Record<string, OAuthScopeDefinition[]>>((acc, scope) => {
      const category = scope.category || 'other';
      acc[category] = [...(acc[category] || []), scope];
      return acc;
    }, {});
    return Object.entries(groups).sort(([left], [right]) => {
      if (left === 'identity') return -1;
      if (right === 'identity') return 1;
      return left.localeCompare(right);
    });
  }, [scopes]);
  const filteredClients = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return clients;
    return clients.filter((client) =>
      `${client.name} ${client.clientId} ${client.allowedScopes.join(' ')}`.toLowerCase().includes(keyword),
    );
  }, [clients, search]);
  const filteredGrants = useMemo(() => {
    const keyword = grantSearch.trim().toLowerCase();
    return grants.filter((grant) => {
      const matchesStatus =
        grantStatus === 'all' || (grantStatus === 'active' ? !grant.revokedAt : Boolean(grant.revokedAt));
      if (!matchesStatus) return false;
      if (!keyword) return true;
      return `${grant.client?.name || ''} ${grant.clientId} ${grant.userId} ${grant.user?.username || ''} ${grant.user?.email || ''} ${grant.scopes.join(' ')}`
        .toLowerCase()
        .includes(keyword);
    });
  }, [grantSearch, grantStatus, grants]);
  const activeGrantCount = useMemo(() => grants.filter((grant) => !grant.revokedAt).length, [grants]);
  const enabledClientCount = useMemo(() => clients.filter((client) => client.enabled).length, [clients]);
  const apiScopeCount = useMemo(() => scopes.filter((scope) => !scope.identityScope).length, [scopes]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [scopeData, clientData, grantData] = await Promise.all([
        oauthApi.getScopes(),
        oauthApi.listClients(),
        oauthApi.listGrants(),
      ]);
      setScopes(scopeData.scopes || []);
      setClients(clientData.clients || []);
      setGrants(grantData.grants || []);
      void auditLogApi
        .query({ module: 'oauth', page: 1, pageSize: 6 })
        .then((response) => setAuditLogs(response.logs || []))
        .catch(() => setAuditLogs([]));
    } catch (error) {
      setNotification({ message: getErrorMessage(error), type: 'error' });
    } finally {
      setLoading(false);
    }
  }, [setNotification]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const toggleScope = (scope: string) => {
    setSelectedScopes((current) =>
      current.includes(scope) ? current.filter((item) => item !== scope) : [...current, scope],
    );
  };

  const toggleEditScope = (scope: string) => {
    setEditForm((current) => ({
      ...current,
      selectedScopes: current.selectedScopes.includes(scope)
        ? current.selectedScopes.filter((item) => item !== scope)
        : [...current.selectedScopes, scope],
    }));
  };

  const updateEditForm = <K extends keyof ClientFormState>(field: K, value: ClientFormState[K]) => {
    setEditForm((current) => ({ ...current, [field]: value }));
  };

  const resetForm = () => {
    setName('');
    setType('confidential');
    setDescription('');
    setHomepageUrl('');
    setLogoUrl('');
    setRedirectUris('');
    setRateLimitPerMinute(120);
    setSelectedScopes(defaultScopes);
  };

  const beginEdit = (client: OAuthClient) => {
    setRevealedSecret(null);
    setEditingClientId(client.clientId);
    setEditForm({
      name: client.name,
      description: client.description || '',
      homepageUrl: client.homepageUrl || '',
      logoUrl: client.logoUrl || '',
      redirectUris: client.redirectUris.join('\n'),
      rateLimitPerMinute: client.rateLimitPerMinute || 120,
      selectedScopes: client.allowedScopes.length > 0 ? client.allowedScopes : defaultScopes,
    });
  };

  const cancelEdit = () => {
    setEditingClientId(null);
    setEditSaving(false);
    setEditForm(createEmptyClientForm());
  };

  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setNotification({ message: '已复制到剪贴板', type: 'success' });
    } catch {
      setNotification({ message: '复制失败', type: 'error' });
    }
  };

  const saveClient = async (client: OAuthClient) => {
    if (!editForm.name.trim()) {
      setNotification({ message: '请输入客户端名称', type: 'warning' });
      return;
    }
    if (!editForm.redirectUris.trim()) {
      setNotification({ message: '请至少配置一个回调地址', type: 'warning' });
      return;
    }
    if (editForm.selectedScopes.length === 0) {
      setNotification({ message: '请至少选择一个 scope', type: 'warning' });
      return;
    }

    setEditSaving(true);
    try {
      await oauthApi.updateClient(client.clientId, {
        name: editForm.name.trim(),
        description: editForm.description.trim() || null,
        homepageUrl: editForm.homepageUrl.trim() || null,
        logoUrl: editForm.logoUrl.trim() || null,
        redirectUris: editForm.redirectUris,
        allowedScopes: editForm.selectedScopes,
        rateLimitPerMinute: editForm.rateLimitPerMinute,
      });
      setNotification({ message: 'OAuth 客户端信息已更新', type: 'success' });
      cancelEdit();
      await loadAll();
    } catch (error) {
      setNotification({ message: getErrorMessage(error), type: 'error' });
    } finally {
      setEditSaving(false);
    }
  };

  const createClient = async () => {
    if (!name.trim()) {
      setNotification({ message: '请输入客户端名称', type: 'warning' });
      return;
    }
    if (!redirectUris.trim()) {
      setNotification({ message: '请至少配置一个回调地址', type: 'warning' });
      return;
    }

    setCreating(true);
    try {
      const result = await oauthApi.createClient({
        name: name.trim(),
        type,
        description: description.trim() || null,
        homepageUrl: homepageUrl.trim() || null,
        logoUrl: logoUrl.trim() || null,
        redirectUris,
        allowedScopes: selectedScopes,
        rateLimitPerMinute,
      });
      if (result.clientSecret) {
        setRevealedSecret({ clientId: result.client.clientId, secret: result.clientSecret });
      }
      setNotification({ message: 'OAuth 客户端已创建', type: 'success' });
      resetForm();
      await loadAll();
    } catch (error) {
      setNotification({ message: getErrorMessage(error), type: 'error' });
    } finally {
      setCreating(false);
    }
  };

  const updateEnabled = async (client: OAuthClient, enabled: boolean) => {
    try {
      await oauthApi.updateClient(client.clientId, { enabled });
      setNotification({ message: enabled ? '客户端已启用' : '客户端已停用', type: 'success' });
      await loadAll();
    } catch (error) {
      setNotification({ message: getErrorMessage(error), type: 'error' });
    }
  };

  const rotateSecret = async (client: OAuthClient) => {
    if (!window.confirm(`确定轮换 ${client.name} 的 client secret？既有 token 会被吊销。`)) return;
    try {
      const result = await oauthApi.rotateClientSecret(client.clientId);
      if (result.clientSecret) setRevealedSecret({ clientId: client.clientId, secret: result.clientSecret });
      setNotification({ message: 'client secret 已轮换', type: 'success' });
      await loadAll();
    } catch (error) {
      setNotification({ message: getErrorMessage(error), type: 'error' });
    }
  };

  const deleteClient = async (client: OAuthClient) => {
    if (!window.confirm(`确定停用 ${client.name}？相关授权和 token 会被吊销。`)) return;
    try {
      await oauthApi.deleteClient(client.clientId);
      setNotification({ message: '客户端已停用', type: 'success' });
      await loadAll();
    } catch (error) {
      setNotification({ message: getErrorMessage(error), type: 'error' });
    }
  };

  const revokeGrant = async (grant: OAuthGrant) => {
    if (!window.confirm(`确定撤销 ${grant.client?.name || grant.clientId} 的授权？`)) return;
    try {
      await oauthApi.revokeGrant(grant.grantId);
      setNotification({ message: '授权已撤销', type: 'success' });
      await loadAll();
    } catch (error) {
      setNotification({ message: getErrorMessage(error), type: 'error' });
    }
  };

  const renderScopeSelector = (
    activeScopes: string[],
    onToggle: (scope: string) => void,
    onReplace: (nextScopes: string[]) => void,
  ) => (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
        <div className="inline-flex items-center gap-2 text-sm font-semibold text-slate-800">
          <FaLayerGroup className="text-slate-500" />
          已选择 {activeScopes.length} / {scopes.length} 个 scope
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onReplace(scopes.filter((scope) => scope.identityScope).map((scope) => scope.key))}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100"
          >
            仅身份
          </button>
          <button
            type="button"
            onClick={() => onReplace(scopes.map((scope) => scope.key))}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100"
          >
            全选
          </button>
          <button
            type="button"
            onClick={() => onReplace([])}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100"
          >
            清空
          </button>
        </div>
      </div>

      {groupedScopes.map(([category, items]) => {
        const selectedInGroup = items.filter((scope) => activeScopes.includes(scope.key)).length;
        const allSelected = selectedInGroup === items.length;
        return (
          <div key={category} className="rounded-lg border border-slate-200 bg-white p-3">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-sm font-semibold text-slate-900">
                  {scopeCategoryLabels[category] || category}
                </div>
                <div className="mt-0.5 text-xs text-slate-500">
                  {selectedInGroup} / {items.length} 已启用
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  const groupKeys = new Set(items.map((scope) => scope.key));
                  const base = activeScopes.filter((scope) => !groupKeys.has(scope));
                  onReplace(allSelected ? base : [...base, ...items.map((scope) => scope.key)]);
                }}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                {allSelected ? '取消本组' : '选择本组'}
              </button>
            </div>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
              {items.map((scope) => {
                const active = activeScopes.includes(scope.key);
                return (
                  <button
                    key={scope.key}
                    type="button"
                    onClick={() => onToggle(scope.key)}
                    className={`min-h-[88px] rounded-lg border px-3 py-2 text-left transition ${
                      active
                        ? 'border-slate-900 bg-slate-900 text-white'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-sm font-semibold">{scope.label}</span>
                      <code className={`break-all rounded px-1.5 py-0.5 text-xs ${active ? 'bg-white/15 text-white' : 'bg-slate-100 text-slate-500'}`}>
                        {scope.key}
                      </code>
                    </div>
                    <p className={`mt-1 line-clamp-2 text-xs leading-5 ${active ? 'text-white/75' : 'text-slate-500'}`}>
                      {scope.description}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-900 text-white">
            <FaShieldAlt />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900">OAuth 第三方接入</h2>
            <p className="mt-1 text-xs text-slate-500">管理员授权、客户端注册、scope 与 token 生命周期管理。</p>
          </div>
        </div>
        <button
          type="button"
          onClick={loadAll}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
        >
          <FaSyncAlt className={loading ? 'animate-spin' : ''} /> 刷新
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <OAuthStatCard label="启用客户端" value={enabledClientCount} hint={`共 ${clients.length} 个`} />
        <OAuthStatCard label="有效授权" value={activeGrantCount} hint={`共 ${grants.length} 条`} />
        <OAuthStatCard label="可分配 scope" value={scopes.length} hint={`${apiScopeCount} 个 API scope`} />
        <OAuthStatCard
          label="近期记录"
          value={auditLogs.length}
          hint="OAuth 审计"
          tone={auditLogs.some((log) => log.result === 'failure') ? 'amber' : 'slate'}
        />
      </div>

      {revealedSecret && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-amber-900">client secret 仅显示一次</div>
              <code className="mt-2 block break-all rounded-lg bg-white/80 px-3 py-2 text-xs text-amber-900">
                {revealedSecret.secret}
              </code>
              <p className="mt-2 text-xs text-amber-800">客户端: {revealedSecret.clientId}</p>
            </div>
            <button
              type="button"
              onClick={() => copy(revealedSecret.secret)}
              className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-3 py-2 text-sm font-semibold text-white hover:bg-amber-700"
            >
              <FaCopy /> 复制
            </button>
          </div>
        </div>
      )}

      <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
        <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-900">
          <FaPlus /> 创建 OAuth 客户端
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="客户端名称"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-900 focus:ring-2 focus:ring-slate-900"
          />
          <select
            value={type}
            onChange={(event) => setType(event.target.value as 'confidential' | 'public')}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-900 focus:ring-2 focus:ring-slate-900"
          >
            <option value="confidential">confidential（服务端应用）</option>
            <option value="public">public（PKCE 应用）</option>
          </select>
          <input
            value={homepageUrl}
            onChange={(event) => setHomepageUrl(event.target.value)}
            placeholder="应用主页 URL（可选）"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-900 focus:ring-2 focus:ring-slate-900"
          />
          <input
            value={logoUrl}
            onChange={(event) => setLogoUrl(event.target.value)}
            placeholder="Logo URL（可选）"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-900 focus:ring-2 focus:ring-slate-900"
          />
          <input
            type="number"
            min={1}
            max={1000}
            value={rateLimitPerMinute}
            onChange={(event) => setRateLimitPerMinute(Math.min(Math.max(Number(event.target.value) || 120, 1), 1000))}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-900 focus:ring-2 focus:ring-slate-900"
          />
          <input
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="说明（可选）"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-900 focus:ring-2 focus:ring-slate-900"
          />
          <textarea
            value={redirectUris}
            onChange={(event) => setRedirectUris(event.target.value)}
            placeholder="回调地址，每行一个"
            rows={3}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-900 focus:ring-2 focus:ring-slate-900 lg:col-span-2"
          />
        </div>
        <div className="mt-4">{renderScopeSelector(selectedScopes, toggleScope, setSelectedScopes)}</div>
        <motion.button
          type="button"
          onClick={createClient}
          disabled={creating}
          className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
          whileTap={{ scale: 0.98 }}
        >
          {creating ? <FaSyncAlt className="animate-spin" /> : <FaPlus />}
          创建客户端
        </motion.button>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <FaKey /> 客户端列表
          </div>
          <div className="relative">
            <FaSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="搜索客户端"
              className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm focus:border-slate-900 focus:ring-2 focus:ring-slate-900 sm:w-72"
            />
          </div>
        </div>
        {loading && clients.length === 0 ? (
          <div className="py-8 text-center text-sm text-slate-400">加载中...</div>
        ) : filteredClients.length === 0 ? (
          <div className="py-8 text-center text-sm text-slate-400">暂无 OAuth 客户端</div>
        ) : (
          <div className="space-y-3">
            {filteredClients.map((client) => (
              <div key={client.clientId} className={`rounded-lg border p-4 ${client.enabled ? 'border-slate-200 bg-white' : 'border-slate-200 bg-slate-50 opacity-75'}`}>
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-slate-900">{client.name}</span>
                      <code className="rounded bg-slate-100 px-2 py-1 text-xs text-slate-600">{client.clientId}</code>
                      <span className={`rounded px-2 py-1 text-xs ${client.enabled ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                        {client.enabled ? '启用' : '停用'}
                      </span>
                      <span className="rounded bg-slate-100 px-2 py-1 text-xs text-slate-600">{client.type}</span>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-1">
                      {client.allowedScopes.map((scope) => (
                        <span key={scope} className="rounded bg-slate-50 px-2 py-1 text-xs text-slate-600">
                          {scopeMap.get(scope)?.label || scope}
                        </span>
                      ))}
                    </div>
                    <div className="mt-3 grid gap-1 text-xs text-slate-500 sm:grid-cols-2">
                      <span>限流: {client.rateLimitPerMinute}/min</span>
                      <span>创建: {formatDate(client.createdAt)}</span>
                      <span>最近使用: {formatDate(client.lastUsedAt)}</span>
                      <span>Secret: {client.hasClientSecret ? '已设置' : '无'}</span>
                    </div>
                    <div className="mt-3 space-y-1">
                      {client.redirectUris.map((uri) => (
                        <code key={uri} className="block break-all rounded bg-slate-50 px-2 py-1 text-xs text-slate-500">
                          {uri}
                        </code>
                      ))}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => (editingClientId === client.clientId ? cancelEdit() : beginEdit(client))}
                      className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"
                      title={editingClientId === client.clientId ? '取消编辑' : '编辑客户端信息'}
                    >
                      {editingClientId === client.clientId ? <FaTimes /> : <FaEdit />}
                    </button>
                    <button
                      type="button"
                      onClick={() => copy(client.clientId)}
                      className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"
                      title="复制 clientId"
                    >
                      <FaCopy />
                    </button>
                    {client.type === 'confidential' && (
                      <button
                        type="button"
                        onClick={() => rotateSecret(client)}
                        className="rounded-lg border border-amber-200 p-2 text-amber-700 hover:bg-amber-50"
                        title="轮换 client secret"
                      >
                        <FaRedo />
                      </button>
                    )}
                    {client.enabled ? (
                      <button
                        type="button"
                        onClick={() => updateEnabled(client, false)}
                        className="rounded-lg border border-orange-200 p-2 text-orange-700 hover:bg-orange-50"
                        title="停用"
                      >
                        <FaBan />
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => updateEnabled(client, true)}
                        className="rounded-lg border border-emerald-200 p-2 text-emerald-700 hover:bg-emerald-50"
                        title="启用"
                      >
                        <FaCheck />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => deleteClient(client)}
                      className="rounded-lg border border-rose-200 p-2 text-rose-700 hover:bg-rose-50"
                      title="停用并吊销"
                    >
                      <FaTrash />
                    </button>
                  </div>
                </div>
                {editingClientId === client.clientId && (
                  <div className="mt-4 border-t border-slate-100 pt-4">
                    <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                      <div className="text-sm font-semibold text-slate-900">编辑客户端信息</div>
                      <div className="text-xs text-slate-500">客户端类型和 secret 不在此处修改</div>
                    </div>
                    <div className="grid gap-3 lg:grid-cols-2">
                      <input
                        value={editForm.name}
                        onChange={(event) => updateEditForm('name', event.target.value)}
                        placeholder="客户端名称"
                        className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-900 focus:ring-2 focus:ring-slate-900"
                      />
                      <input
                        type="number"
                        min={1}
                        max={1000}
                        value={editForm.rateLimitPerMinute}
                        onChange={(event) => {
                          const value = Math.min(Math.max(Number(event.target.value) || 120, 1), 1000);
                          updateEditForm('rateLimitPerMinute', value);
                        }}
                        className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-900 focus:ring-2 focus:ring-slate-900"
                      />
                      <input
                        value={editForm.homepageUrl}
                        onChange={(event) => updateEditForm('homepageUrl', event.target.value)}
                        placeholder="应用主页 URL（可选）"
                        className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-900 focus:ring-2 focus:ring-slate-900"
                      />
                      <input
                        value={editForm.logoUrl}
                        onChange={(event) => updateEditForm('logoUrl', event.target.value)}
                        placeholder="Logo URL（可选）"
                        className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-900 focus:ring-2 focus:ring-slate-900"
                      />
                      <input
                        value={editForm.description}
                        onChange={(event) => updateEditForm('description', event.target.value)}
                        placeholder="说明（可选）"
                        className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-900 focus:ring-2 focus:ring-slate-900 lg:col-span-2"
                      />
                      <textarea
                        value={editForm.redirectUris}
                        onChange={(event) => updateEditForm('redirectUris', event.target.value)}
                        placeholder="回调地址，每行一个"
                        rows={3}
                        className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-900 focus:ring-2 focus:ring-slate-900 lg:col-span-2"
                      />
                    </div>
                    <div className="mt-4">
                      {renderScopeSelector(editForm.selectedScopes, toggleEditScope, (nextScopes) =>
                        updateEditForm('selectedScopes', nextScopes),
                      )}
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => saveClient(client)}
                        disabled={editSaving}
                        className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
                      >
                        {editSaving ? <FaSyncAlt className="animate-spin" /> : <FaSave />}
                        保存修改
                      </button>
                      <button
                        type="button"
                        onClick={cancelEdit}
                        disabled={editSaving}
                        className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                      >
                        <FaTimes /> 取消
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <FaShieldAlt /> 授权记录
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative">
              <FaSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400" />
              <input
                value={grantSearch}
                onChange={(event) => setGrantSearch(event.target.value)}
                placeholder="搜索授权用户、客户端或 scope"
                className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm focus:border-slate-900 focus:ring-2 focus:ring-slate-900 sm:w-72"
              />
            </div>
            <select
              value={grantStatus}
              onChange={(event) => setGrantStatus(event.target.value as 'all' | 'active' | 'revoked')}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-900 focus:ring-2 focus:ring-slate-900"
            >
              <option value="all">全部授权</option>
              <option value="active">仅有效</option>
              <option value="revoked">仅撤销</option>
            </select>
          </div>
        </div>
        {filteredGrants.length === 0 ? (
          <div className="py-8 text-center text-sm text-slate-400">暂无授权记录</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-xs text-slate-400">
                <tr>
                  <th className="py-2 pr-4">客户端</th>
                  <th className="py-2 pr-4">授权用户</th>
                  <th className="py-2 pr-4">Scope</th>
                  <th className="py-2 pr-4">状态</th>
                  <th className="py-2 pr-4">最近使用</th>
                  <th className="py-2 pr-4">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredGrants.map((grant) => {
                  const userDisplay = getGrantUserDisplay(grant);
                  return (
                  <tr key={grant.grantId}>
                    <td className="py-3 pr-4">
                      <div className="font-medium text-slate-800">{grant.client?.name || grant.clientId}</div>
                      <code className="text-xs text-slate-400">{grant.clientId}</code>
                    </td>
                    <td className="max-w-[220px] py-3 pr-4">
                      <button
                        type="button"
                        onClick={() => copy(grant.userId)}
                        className="block max-w-full rounded bg-slate-50 px-2 py-1 text-left text-xs text-slate-600 hover:bg-slate-100"
                        title={`${userDisplay.title}，点击复制用户 ID`}
                      >
                        <span className="block truncate font-semibold text-slate-700">{userDisplay.primary}</span>
                        <span className="block truncate text-[11px] text-slate-400">{userDisplay.secondary}</span>
                      </button>
                    </td>
                    <td className="py-3 pr-4">
                      <div className="flex max-w-md flex-wrap gap-1">
                        {grant.scopes.map((scope) => (
                          <span key={scope} className="rounded bg-slate-50 px-2 py-1 text-xs text-slate-500">
                            {scope}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="py-3 pr-4">
                      <span className={`rounded px-2 py-1 text-xs ${grant.revokedAt ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'}`}>
                        {grant.revokedAt ? '已撤销' : '有效'}
                      </span>
                    </td>
                    <td className="py-3 pr-4 text-slate-500">{formatDate(grant.lastUsedAt)}</td>
                    <td className="py-3 pr-4">
                      {!grant.revokedAt && (
                        <button
                          type="button"
                          onClick={() => revokeGrant(grant)}
                          className="rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50"
                        >
                          撤销
                        </button>
                      )}
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
        <div className="font-semibold text-slate-900">接入端点</div>
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          <code className="rounded bg-white px-3 py-2">GET /oauth/authorize</code>
          <code className="rounded bg-white px-3 py-2">POST /api/oauth/token</code>
          <code className="rounded bg-white px-3 py-2">GET /api/oauth/userinfo</code>
          <code className="rounded bg-white px-3 py-2">POST /api/oauth/introspect</code>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
        <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-900">
          <FaHistory /> 近期 OAuth 操作记录
        </div>
        {auditLogs.length === 0 ? (
          <div className="py-6 text-center text-sm text-slate-400">暂无 OAuth 审计记录</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {auditLogs.map((log) => (
              <div key={log._id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`h-2 w-2 rounded-full ${log.result === 'success' ? 'bg-emerald-400' : 'bg-rose-400'}`} />
                    <span className="text-sm font-semibold text-slate-800">
                      {auditActionLabels[log.action] || log.action}
                    </span>
                    {log.targetId && (
                      <code className="rounded bg-slate-50 px-2 py-1 text-xs text-slate-500">{log.targetId}</code>
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
                    <span>{log.username || 'unknown'}</span>
                    <span>{log.ip}</span>
                    {log.errorMessage && <span className="text-rose-600">{log.errorMessage}</span>}
                  </div>
                </div>
                <div className="text-xs text-slate-400">{formatDate(log.createdAt)}</div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};

const OAuthStatCard: React.FC<{
  label: string;
  value: number | string;
  hint: string;
  tone?: 'slate' | 'amber';
}> = ({ label, value, hint, tone = 'slate' }) => (
  <div className={`rounded-xl border p-4 ${tone === 'amber' ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-white'}`}>
    <div className={`text-2xl font-bold ${tone === 'amber' ? 'text-amber-700' : 'text-slate-900'}`}>
      {typeof value === 'number' ? value.toLocaleString() : value}
    </div>
    <div className="mt-1 text-sm font-semibold text-slate-700">{label}</div>
    <div className="mt-1 text-xs text-slate-500">{hint}</div>
  </div>
);

export default OAuthClientManager;
