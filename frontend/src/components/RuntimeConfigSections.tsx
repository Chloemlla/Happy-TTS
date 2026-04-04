import React, { useCallback, useEffect, useState } from 'react';
import { FaSync } from 'react-icons/fa';
import getApiBaseUrl from '../api';
import { useNotification } from './Notification';

const IPQS_API = getApiBaseUrl() + '/api/admin/ipqs/setting';
const LINUXDO_API = getApiBaseUrl() + '/api/admin/linuxdo/setting';
const NEXAI_API = getApiBaseUrl() + '/api/admin/nexai/setting';

function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

interface IpqsSettingResponse {
  config: {
    enabled: boolean;
    strictness: number;
    allowPublicAccessPoints: boolean;
    lighterPenalties: boolean;
    timeoutMs: number;
    monthlyQuotaPerKey: number;
    challengeFraudScore: number;
    tokenTtlMinutes: number;
    failOpen: boolean;
    apiKeyCount: number;
    apiKeysMasked: string[];
  };
  updatedAt?: string;
}

interface LinuxDoSettingResponse {
  config: {
    clientId: string;
    clientSecret: string;
    discoveryUrl: string;
    scopes: string;
    authorizationEndpoint: string;
    tokenEndpoint: string;
    userEndpoint: string;
    forumBaseUrl: string;
    callbackUrl: string;
    frontendCallbackUrl: string;
  };
  updatedAt?: string;
}

interface NexaiSettingResponse {
  config: {
    jwtSecret: string;
    jwtExpiresIn: string;
    refreshExpiresIn: string;
    google: {
      clientId: string;
    };
    github: {
      clientId: string;
      clientSecret: string;
    };
    frontendUrl: string;
  };
  updatedAt?: string;
}

function parseApiKeys(input: string): string[] {
  return Array.from(
    new Set(
      input
        .split(/[\r\n,]+/)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  );
}

function SectionCard(props: {
  title: string;
  description: string;
  loading: boolean;
  onRefresh: () => void;
  children: React.ReactNode;
}) {
  const { title, description, loading, onRefresh, children } = props;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-slate-800">{title}</h3>
          <p className="mt-1 text-sm text-slate-500">{description}</p>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <FaSync className={loading ? 'animate-spin' : ''} />
          刷新
        </button>
      </div>
      <div className="space-y-4 px-5 py-5">{children}</div>
    </section>
  );
}

function FieldLabel(props: { label: string; hint?: string }) {
  const { label, hint } = props;

  return (
    <div className="mb-1 flex items-center justify-between gap-3">
      <label className="text-sm font-medium text-slate-700">{label}</label>
      {hint ? <span className="text-xs text-slate-400">{hint}</span> : null}
    </div>
  );
}

function UpdatedAt(props: { value?: string }) {
  return (
    <div className="text-xs text-slate-500">
      最后更新时间：{props.value ? new Date(props.value).toLocaleString() : '-'}
    </div>
  );
}

const RuntimeConfigSections: React.FC = () => {
  const { setNotification } = useNotification();

  const [ipqsSetting, setIpqsSetting] = useState<IpqsSettingResponse | null>(null);
  const [ipqsLoading, setIpqsLoading] = useState(false);
  const [ipqsSaving, setIpqsSaving] = useState(false);
  const [ipqsDeleting, setIpqsDeleting] = useState(false);
  const [ipqsApiKeysInput, setIpqsApiKeysInput] = useState('');
  const [ipqsForm, setIpqsForm] = useState({
    enabled: false,
    strictness: 1,
    allowPublicAccessPoints: false,
    lighterPenalties: true,
    timeoutMs: 8000,
    monthlyQuotaPerKey: 5000,
    challengeFraudScore: 75,
    tokenTtlMinutes: 40,
    failOpen: true,
  });

  const [linuxdoSetting, setLinuxdoSetting] = useState<LinuxDoSettingResponse | null>(null);
  const [linuxdoLoading, setLinuxdoLoading] = useState(false);
  const [linuxdoSaving, setLinuxdoSaving] = useState(false);
  const [linuxdoDeleting, setLinuxdoDeleting] = useState(false);
  const [linuxdoSecretInput, setLinuxdoSecretInput] = useState('');
  const [linuxdoForm, setLinuxdoForm] = useState({
    clientId: '',
    discoveryUrl: '',
    scopes: '',
    authorizationEndpoint: '',
    tokenEndpoint: '',
    userEndpoint: '',
    forumBaseUrl: '',
    callbackUrl: '',
    frontendCallbackUrl: '',
  });

  const [nexaiSetting, setNexaiSetting] = useState<NexaiSettingResponse | null>(null);
  const [nexaiLoading, setNexaiLoading] = useState(false);
  const [nexaiSaving, setNexaiSaving] = useState(false);
  const [nexaiDeleting, setNexaiDeleting] = useState(false);
  const [nexaiJwtSecretInput, setNexaiJwtSecretInput] = useState('');
  const [nexaiGithubSecretInput, setNexaiGithubSecretInput] = useState('');
  const [nexaiForm, setNexaiForm] = useState({
    jwtExpiresIn: '2h',
    refreshExpiresIn: '30d',
    googleClientId: '',
    githubClientId: '',
    frontendUrl: '',
  });

  const handleRequestError = useCallback(async (res: Response, fallback: string) => {
    const data = await res.json().catch(() => null);
    throw new Error((data && data.error) || fallback);
  }, []);

  const fetchIpqsSetting = useCallback(async () => {
    setIpqsLoading(true);
    try {
      const res = await fetch(IPQS_API, { headers: getAuthHeaders() });
      if (!res.ok) {
        await handleRequestError(res, '获取 IPQS 配置失败');
        return;
      }
      const data = await res.json();
      const setting = data?.setting as IpqsSettingResponse | undefined;
      if (!setting) {
        setIpqsSetting(null);
        return;
      }
      setIpqsSetting(setting);
      setIpqsForm({
        enabled: setting.config.enabled,
        strictness: setting.config.strictness,
        allowPublicAccessPoints: setting.config.allowPublicAccessPoints,
        lighterPenalties: setting.config.lighterPenalties,
        timeoutMs: setting.config.timeoutMs,
        monthlyQuotaPerKey: setting.config.monthlyQuotaPerKey,
        challengeFraudScore: setting.config.challengeFraudScore,
        tokenTtlMinutes: setting.config.tokenTtlMinutes,
        failOpen: setting.config.failOpen,
      });
      setIpqsApiKeysInput('');
    } catch (error) {
      setNotification({
        message: error instanceof Error ? error.message : '获取 IPQS 配置失败',
        type: 'error',
      });
    } finally {
      setIpqsLoading(false);
    }
  }, [handleRequestError, setNotification]);

  const fetchLinuxDoSetting = useCallback(async () => {
    setLinuxdoLoading(true);
    try {
      const res = await fetch(LINUXDO_API, { headers: getAuthHeaders() });
      if (!res.ok) {
        await handleRequestError(res, '获取 LinuxDo 配置失败');
        return;
      }
      const data = await res.json();
      const setting = data?.setting as LinuxDoSettingResponse | undefined;
      if (!setting) {
        setLinuxdoSetting(null);
        return;
      }
      setLinuxdoSetting(setting);
      setLinuxdoForm({
        clientId: setting.config.clientId || '',
        discoveryUrl: setting.config.discoveryUrl || '',
        scopes: setting.config.scopes || '',
        authorizationEndpoint: setting.config.authorizationEndpoint || '',
        tokenEndpoint: setting.config.tokenEndpoint || '',
        userEndpoint: setting.config.userEndpoint || '',
        forumBaseUrl: setting.config.forumBaseUrl || '',
        callbackUrl: setting.config.callbackUrl || '',
        frontendCallbackUrl: setting.config.frontendCallbackUrl || '',
      });
      setLinuxdoSecretInput('');
    } catch (error) {
      setNotification({
        message: error instanceof Error ? error.message : '获取 LinuxDo 配置失败',
        type: 'error',
      });
    } finally {
      setLinuxdoLoading(false);
    }
  }, [handleRequestError, setNotification]);

  const fetchNexaiSetting = useCallback(async () => {
    setNexaiLoading(true);
    try {
      const res = await fetch(NEXAI_API, { headers: getAuthHeaders() });
      if (!res.ok) {
        await handleRequestError(res, '获取 NexAI 配置失败');
        return;
      }
      const data = await res.json();
      const setting = data?.setting as NexaiSettingResponse | undefined;
      if (!setting) {
        setNexaiSetting(null);
        return;
      }
      setNexaiSetting(setting);
      setNexaiForm({
        jwtExpiresIn: setting.config.jwtExpiresIn || '2h',
        refreshExpiresIn: setting.config.refreshExpiresIn || '30d',
        googleClientId: setting.config.google?.clientId || '',
        githubClientId: setting.config.github?.clientId || '',
        frontendUrl: setting.config.frontendUrl || '',
      });
      setNexaiJwtSecretInput('');
      setNexaiGithubSecretInput('');
    } catch (error) {
      setNotification({
        message: error instanceof Error ? error.message : '获取 NexAI 配置失败',
        type: 'error',
      });
    } finally {
      setNexaiLoading(false);
    }
  }, [handleRequestError, setNotification]);

  useEffect(() => {
    fetchIpqsSetting();
    fetchLinuxDoSetting();
    fetchNexaiSetting();
  }, [fetchIpqsSetting, fetchLinuxDoSetting, fetchNexaiSetting]);

  const saveIpqsSetting = useCallback(async () => {
    setIpqsSaving(true);
    try {
      const payload: Record<string, unknown> = { ...ipqsForm };
      if (ipqsApiKeysInput.trim()) {
        payload.apiKeys = parseApiKeys(ipqsApiKeysInput);
      }
      const res = await fetch(IPQS_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        await handleRequestError(res, '保存 IPQS 配置失败');
        return;
      }
      setNotification({ message: 'IPQS 配置已保存', type: 'success' });
      await fetchIpqsSetting();
    } catch (error) {
      setNotification({
        message: error instanceof Error ? error.message : '保存 IPQS 配置失败',
        type: 'error',
      });
    } finally {
      setIpqsSaving(false);
    }
  }, [fetchIpqsSetting, handleRequestError, ipqsApiKeysInput, ipqsForm, setNotification]);

  const deleteIpqsSetting = useCallback(async () => {
    setIpqsDeleting(true);
    try {
      const res = await fetch(IPQS_API, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      if (!res.ok) {
        await handleRequestError(res, '删除 IPQS 配置失败');
        return;
      }
      setNotification({ message: 'IPQS 配置已重置', type: 'success' });
      await fetchIpqsSetting();
    } catch (error) {
      setNotification({
        message: error instanceof Error ? error.message : '删除 IPQS 配置失败',
        type: 'error',
      });
    } finally {
      setIpqsDeleting(false);
    }
  }, [fetchIpqsSetting, handleRequestError, setNotification]);

  const saveLinuxDoSetting = useCallback(async () => {
    setLinuxdoSaving(true);
    try {
      const payload: Record<string, unknown> = { ...linuxdoForm };
      if (linuxdoSecretInput.trim()) {
        payload.clientSecret = linuxdoSecretInput.trim();
      }
      const res = await fetch(LINUXDO_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        await handleRequestError(res, '保存 LinuxDo 配置失败');
        return;
      }
      setNotification({ message: 'LinuxDo 配置已保存', type: 'success' });
      await fetchLinuxDoSetting();
    } catch (error) {
      setNotification({
        message: error instanceof Error ? error.message : '保存 LinuxDo 配置失败',
        type: 'error',
      });
    } finally {
      setLinuxdoSaving(false);
    }
  }, [fetchLinuxDoSetting, handleRequestError, linuxdoForm, linuxdoSecretInput, setNotification]);

  const deleteLinuxDoSetting = useCallback(async () => {
    setLinuxdoDeleting(true);
    try {
      const res = await fetch(LINUXDO_API, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      if (!res.ok) {
        await handleRequestError(res, '删除 LinuxDo 配置失败');
        return;
      }
      setNotification({ message: 'LinuxDo 配置已重置', type: 'success' });
      await fetchLinuxDoSetting();
    } catch (error) {
      setNotification({
        message: error instanceof Error ? error.message : '删除 LinuxDo 配置失败',
        type: 'error',
      });
    } finally {
      setLinuxdoDeleting(false);
    }
  }, [fetchLinuxDoSetting, handleRequestError, setNotification]);

  const saveNexaiSetting = useCallback(async () => {
    setNexaiSaving(true);
    try {
      const payload: Record<string, unknown> = {
        jwtExpiresIn: nexaiForm.jwtExpiresIn,
        refreshExpiresIn: nexaiForm.refreshExpiresIn,
        frontendUrl: nexaiForm.frontendUrl,
        google: {
          clientId: nexaiForm.googleClientId,
        },
        github: {
          clientId: nexaiForm.githubClientId,
        },
      };
      if (nexaiJwtSecretInput.trim()) {
        payload.jwtSecret = nexaiJwtSecretInput.trim();
      }
      if (nexaiGithubSecretInput.trim()) {
        payload.github = {
          ...(payload.github as Record<string, unknown>),
          clientSecret: nexaiGithubSecretInput.trim(),
        };
      }
      const res = await fetch(NEXAI_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        await handleRequestError(res, '保存 NexAI 配置失败');
        return;
      }
      setNotification({ message: 'NexAI 配置已保存', type: 'success' });
      await fetchNexaiSetting();
    } catch (error) {
      setNotification({
        message: error instanceof Error ? error.message : '保存 NexAI 配置失败',
        type: 'error',
      });
    } finally {
      setNexaiSaving(false);
    }
  }, [
    fetchNexaiSetting,
    handleRequestError,
    nexaiForm,
    nexaiGithubSecretInput,
    nexaiJwtSecretInput,
    setNotification,
  ]);

  const deleteNexaiSetting = useCallback(async () => {
    setNexaiDeleting(true);
    try {
      const res = await fetch(NEXAI_API, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      if (!res.ok) {
        await handleRequestError(res, '删除 NexAI 配置失败');
        return;
      }
      setNotification({ message: 'NexAI 配置已重置', type: 'success' });
      await fetchNexaiSetting();
    } catch (error) {
      setNotification({
        message: error instanceof Error ? error.message : '删除 NexAI 配置失败',
        type: 'error',
      });
    } finally {
      setNexaiDeleting(false);
    }
  }, [fetchNexaiSetting, handleRequestError, setNotification]);

  return (
    <div className="space-y-6">
      <SectionCard
        title="IPQS 运行时配置"
        description="通过 EnvManager 直接管理风控开关、配额和 API Key，不再依赖环境变量。"
        loading={ipqsLoading}
        onRefresh={fetchIpqsSetting}
      >
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <div>
            <FieldLabel label="API Keys" hint="留空表示保持现有" />
            <textarea
              value={ipqsApiKeysInput}
              onChange={(e) => setIpqsApiKeysInput(e.target.value)}
              rows={4}
              placeholder="每行一个，或用逗号分隔"
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-800 outline-none ring-0 transition focus:border-slate-500"
            />
            <div className="mt-2 text-xs text-slate-500">
              已配置 {ipqsSetting?.config.apiKeyCount || 0} 个：
              {(ipqsSetting?.config.apiKeysMasked || []).join('，') || '-'}
            </div>
          </div>
          <div>
            <FieldLabel label="Strictness" />
            <input
              type="number"
              min={0}
              max={3}
              value={ipqsForm.strictness}
              onChange={(e) => setIpqsForm((prev) => ({ ...prev, strictness: Number(e.target.value) || 0 }))}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-800"
            />
          </div>
          <div>
            <FieldLabel label="Token TTL (minutes)" />
            <input
              type="number"
              min={1}
              value={ipqsForm.tokenTtlMinutes}
              onChange={(e) => setIpqsForm((prev) => ({ ...prev, tokenTtlMinutes: Number(e.target.value) || 1 }))}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-800"
            />
          </div>
          <div>
            <FieldLabel label="Timeout (ms)" />
            <input
              type="number"
              min={1000}
              value={ipqsForm.timeoutMs}
              onChange={(e) => setIpqsForm((prev) => ({ ...prev, timeoutMs: Number(e.target.value) || 1000 }))}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-800"
            />
          </div>
          <div>
            <FieldLabel label="Monthly Quota Per Key" />
            <input
              type="number"
              min={1}
              value={ipqsForm.monthlyQuotaPerKey}
              onChange={(e) => setIpqsForm((prev) => ({ ...prev, monthlyQuotaPerKey: Number(e.target.value) || 1 }))}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-800"
            />
          </div>
          <div>
            <FieldLabel label="Challenge Fraud Score" />
            <input
              type="number"
              min={0}
              max={100}
              value={ipqsForm.challengeFraudScore}
              onChange={(e) => setIpqsForm((prev) => ({ ...prev, challengeFraudScore: Number(e.target.value) || 0 }))}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-800"
            />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {[
            ['enabled', '启用验证'],
            ['allowPublicAccessPoints', '允许公共接入点'],
            ['lighterPenalties', '使用轻处罚'],
            ['failOpen', '失败时放行'],
          ].map(([key, label]) => (
            <label key={key} className="flex items-center gap-3 rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={Boolean(ipqsForm[key as keyof typeof ipqsForm])}
                onChange={(e) => setIpqsForm((prev) => ({ ...prev, [key]: e.target.checked }))}
              />
              <span>{label}</span>
            </label>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <UpdatedAt value={ipqsSetting?.updatedAt} />
          <div className="flex gap-3">
            <button
              type="button"
              onClick={deleteIpqsSetting}
              disabled={ipqsDeleting}
              className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-rose-700 disabled:opacity-60"
            >
              {ipqsDeleting ? '重置中...' : '重置'}
            </button>
            <button
              type="button"
              onClick={saveIpqsSetting}
              disabled={ipqsSaving}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:opacity-60"
            >
              {ipqsSaving ? '保存中...' : '保存'}
            </button>
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title="LinuxDo 运行时配置"
        description="LinuxDo OAuth 配置改为直接从 MongoDB 读取，留空的密钥字段会保留当前值。"
        loading={linuxdoLoading}
        onRefresh={fetchLinuxDoSetting}
      >
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <FieldLabel label="Client ID" />
            <input
              value={linuxdoForm.clientId}
              onChange={(e) => setLinuxdoForm((prev) => ({ ...prev, clientId: e.target.value }))}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-800"
            />
          </div>
          <div>
            <FieldLabel label="Client Secret" hint={linuxdoSetting?.config.clientSecret || '未配置'} />
            <input
              value={linuxdoSecretInput}
              onChange={(e) => setLinuxdoSecretInput(e.target.value)}
              placeholder="留空表示保持现有 Client Secret"
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-800"
            />
          </div>
          <div>
            <FieldLabel label="Discovery URL" />
            <input
              value={linuxdoForm.discoveryUrl}
              onChange={(e) => setLinuxdoForm((prev) => ({ ...prev, discoveryUrl: e.target.value }))}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-800"
            />
          </div>
          <div>
            <FieldLabel label="Scopes" />
            <input
              value={linuxdoForm.scopes}
              onChange={(e) => setLinuxdoForm((prev) => ({ ...prev, scopes: e.target.value }))}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-800"
            />
          </div>
          <div>
            <FieldLabel label="Authorization Endpoint" />
            <input
              value={linuxdoForm.authorizationEndpoint}
              onChange={(e) => setLinuxdoForm((prev) => ({ ...prev, authorizationEndpoint: e.target.value }))}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-800"
            />
          </div>
          <div>
            <FieldLabel label="Token Endpoint" />
            <input
              value={linuxdoForm.tokenEndpoint}
              onChange={(e) => setLinuxdoForm((prev) => ({ ...prev, tokenEndpoint: e.target.value }))}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-800"
            />
          </div>
          <div>
            <FieldLabel label="User Endpoint" />
            <input
              value={linuxdoForm.userEndpoint}
              onChange={(e) => setLinuxdoForm((prev) => ({ ...prev, userEndpoint: e.target.value }))}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-800"
            />
          </div>
          <div>
            <FieldLabel label="Forum Base URL" />
            <input
              value={linuxdoForm.forumBaseUrl}
              onChange={(e) => setLinuxdoForm((prev) => ({ ...prev, forumBaseUrl: e.target.value }))}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-800"
            />
          </div>
          <div>
            <FieldLabel label="Callback URL" />
            <input
              value={linuxdoForm.callbackUrl}
              onChange={(e) => setLinuxdoForm((prev) => ({ ...prev, callbackUrl: e.target.value }))}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-800"
            />
          </div>
          <div>
            <FieldLabel label="Frontend Callback URL" />
            <input
              value={linuxdoForm.frontendCallbackUrl}
              onChange={(e) => setLinuxdoForm((prev) => ({ ...prev, frontendCallbackUrl: e.target.value }))}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-800"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <UpdatedAt value={linuxdoSetting?.updatedAt} />
          <div className="flex gap-3">
            <button
              type="button"
              onClick={deleteLinuxDoSetting}
              disabled={linuxdoDeleting}
              className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-rose-700 disabled:opacity-60"
            >
              {linuxdoDeleting ? '重置中...' : '重置'}
            </button>
            <button
              type="button"
              onClick={saveLinuxDoSetting}
              disabled={linuxdoSaving}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:opacity-60"
            >
              {linuxdoSaving ? '保存中...' : '保存'}
            </button>
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title="NexAI 运行时配置"
        description="NexAI JWT、OAuth 和前端回调地址改为直接由 EnvManager 管理。"
        loading={nexaiLoading}
        onRefresh={fetchNexaiSetting}
      >
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <FieldLabel label="JWT Secret" hint={nexaiSetting?.config.jwtSecret || '未配置'} />
            <input
              value={nexaiJwtSecretInput}
              onChange={(e) => setNexaiJwtSecretInput(e.target.value)}
              placeholder="留空表示保持现有 JWT Secret"
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-800"
            />
          </div>
          <div>
            <FieldLabel label="Frontend URL" />
            <input
              value={nexaiForm.frontendUrl}
              onChange={(e) => setNexaiForm((prev) => ({ ...prev, frontendUrl: e.target.value }))}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-800"
            />
          </div>
          <div>
            <FieldLabel label="JWT Expires In" />
            <input
              value={nexaiForm.jwtExpiresIn}
              onChange={(e) => setNexaiForm((prev) => ({ ...prev, jwtExpiresIn: e.target.value }))}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-800"
            />
          </div>
          <div>
            <FieldLabel label="Refresh Expires In" />
            <input
              value={nexaiForm.refreshExpiresIn}
              onChange={(e) => setNexaiForm((prev) => ({ ...prev, refreshExpiresIn: e.target.value }))}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-800"
            />
          </div>
          <div>
            <FieldLabel label="Google Client ID" />
            <input
              value={nexaiForm.googleClientId}
              onChange={(e) => setNexaiForm((prev) => ({ ...prev, googleClientId: e.target.value }))}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-800"
            />
          </div>
          <div>
            <FieldLabel label="GitHub Client ID" />
            <input
              value={nexaiForm.githubClientId}
              onChange={(e) => setNexaiForm((prev) => ({ ...prev, githubClientId: e.target.value }))}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-800"
            />
          </div>
          <div className="md:col-span-2">
            <FieldLabel label="GitHub Client Secret" hint={nexaiSetting?.config.github.clientSecret || '未配置'} />
            <input
              value={nexaiGithubSecretInput}
              onChange={(e) => setNexaiGithubSecretInput(e.target.value)}
              placeholder="留空表示保持现有 GitHub Client Secret"
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-800"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <UpdatedAt value={nexaiSetting?.updatedAt} />
          <div className="flex gap-3">
            <button
              type="button"
              onClick={deleteNexaiSetting}
              disabled={nexaiDeleting}
              className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-rose-700 disabled:opacity-60"
            >
              {nexaiDeleting ? '重置中...' : '重置'}
            </button>
            <button
              type="button"
              onClick={saveNexaiSetting}
              disabled={nexaiSaving}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:opacity-60"
            >
              {nexaiSaving ? '保存中...' : '保存'}
            </button>
          </div>
        </div>
      </SectionCard>
    </div>
  );
};

export default RuntimeConfigSections;
