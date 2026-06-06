import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  FaBan,
  FaCheck,
  FaCopy,
  FaKey,
  FaPlus,
  FaRedo,
  FaSearch,
  FaShieldAlt,
  FaSyncAlt,
  FaTrash,
} from 'react-icons/fa';
import { oauthApi, type OAuthClient, type OAuthGrant, type OAuthScopeDefinition } from '../api/oauth';
import { useNotification } from './Notification';

const defaultScopes = ['openid', 'profile', 'admin:identity', 'status'];

const formatDate = (value?: string | null) => {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleString('zh-CN');
};

const getErrorMessage = (error: any) =>
  error?.response?.data?.error_description || error?.response?.data?.error || error?.message || '请求失败';

const OAuthClientManager: React.FC = () => {
  const { setNotification } = useNotification();
  const [clients, setClients] = useState<OAuthClient[]>([]);
  const [grants, setGrants] = useState<OAuthGrant[]>([]);
  const [scopes, setScopes] = useState<OAuthScopeDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState('');
  const [revealedSecret, setRevealedSecret] = useState<{ clientId: string; secret: string } | null>(null);

  const [name, setName] = useState('');
  const [type, setType] = useState<'confidential' | 'public'>('confidential');
  const [description, setDescription] = useState('');
  const [homepageUrl, setHomepageUrl] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [redirectUris, setRedirectUris] = useState('');
  const [rateLimitPerMinute, setRateLimitPerMinute] = useState(120);
  const [selectedScopes, setSelectedScopes] = useState<string[]>(defaultScopes);

  const scopeMap = useMemo(() => new Map(scopes.map((scope) => [scope.key, scope])), [scopes]);
  const filteredClients = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return clients;
    return clients.filter((client) =>
      `${client.name} ${client.clientId} ${client.allowedScopes.join(' ')}`.toLowerCase().includes(keyword),
    );
  }, [clients, search]);

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

  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setNotification({ message: '已复制到剪贴板', type: 'success' });
    } catch {
      setNotification({ message: '复制失败', type: 'error' });
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

  const renderScopeSelector = () => (
    <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
      {scopes.map((scope) => {
        const active = selectedScopes.includes(scope.key);
        return (
          <button
            key={scope.key}
            type="button"
            onClick={() => toggleScope(scope.key)}
            className={`min-h-[82px] rounded-lg border px-3 py-2 text-left transition ${
              active
                ? 'border-slate-900 bg-slate-900 text-white'
                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-semibold">{scope.label}</span>
              <code className={`rounded px-1.5 py-0.5 text-xs ${active ? 'bg-white/15 text-white' : 'bg-slate-100 text-slate-500'}`}>
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
        <div className="mt-4">{renderScopeSelector()}</div>
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
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
        <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-900">
          <FaShieldAlt /> 授权记录
        </div>
        {grants.length === 0 ? (
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
                {grants.map((grant) => (
                  <tr key={grant.grantId}>
                    <td className="py-3 pr-4">
                      <div className="font-medium text-slate-800">{grant.client?.name || grant.clientId}</div>
                      <code className="text-xs text-slate-400">{grant.clientId}</code>
                    </td>
                    <td className="py-3 pr-4 text-slate-600">{grant.userId}</td>
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
                ))}
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
    </div>
  );
};

export default OAuthClientManager;
