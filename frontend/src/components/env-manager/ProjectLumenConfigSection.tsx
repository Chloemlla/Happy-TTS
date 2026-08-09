import { useCallback, useEffect, useRef, useState } from 'react';
import { m, useReducedMotion } from 'framer-motion';
import { FaLock, FaSync, FaInfoCircle, FaCheck, FaTimes } from 'react-icons/fa';
import { useAuth } from '../../hooks/useAuth';
import { isSuperAdmin } from '../../utils/rbac';
import { useNotification } from '../Notification';
import CollapsibleSection from './CollapsibleSection';
import { LUMEN_CONFIG_API, LUMEN_CONFIG_SYNC_API, getAuthHeaders, authFetch } from './api';
import ConfigFieldRow from './ConfigFieldRow';
import InfoBox from './InfoBox';

const REFRESH_BUTTON_CLASS =
  'inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400';

const SECTION_KEY = 'projectLumen';

interface LumenSecretField {
  key: string;
  label: string;
  description: string;
  placeholder: string;
}

const SECRET_FIELDS: LumenSecretField[] = [
  {
    key: 'PROJECT_LUMEN_API_BASE_URL',
    label: '客户端 API 地址',
    description: 'Project-Lumen Android 客户端连接的 API 基础地址。对应 GitHub Actions Secret PROJECT_LUMEN_API_BASE_URL。',
    placeholder: '例如 https://tts.chloemlla.com/api/lumen',
  },
  {
    key: 'PROJECT_LUMEN_API_CERTIFICATE_PINNING_ENABLED',
    label: 'API 证书固定开关',
    description: '是否启用 API 证书固定（Certificate Pinning）。对应 GitHub Actions Secret PROJECT_LUMEN_API_CERTIFICATE_PINNING_ENABLED。',
    placeholder: '填 true 或 false',
  },
  {
    key: 'PROJECT_LUMEN_API_CERTIFICATE_PINS',
    label: 'API 证书固定 PIN 列表',
    description: 'API 证书固定所需的 Base64 SHA-256 指纹列表。对应 GitHub Actions Secret PROJECT_LUMEN_API_CERTIFICATE_PINS。',
    placeholder: '多个 base64 SHA-256 pin，用分号或逗号分隔',
  },
  {
    key: 'PROJECT_LUMEN_TRANSLATION_API_BASE_URL',
    label: '翻译服务 API 地址',
    description: 'Project-Lumen 翻译服务（TTS 主机）的 API 基础地址。对应 GitHub Actions Secret PROJECT_LUMEN_TRANSLATION_API_BASE_URL。',
    placeholder: '例如 https://tts.chloemlla.com',
  },
  {
    key: 'PROJECT_LUMEN_TRANSLATION_CERTIFICATE_PINNING_ENABLED',
    label: '翻译服务证书固定开关',
    description: '是否启用翻译服务证书固定。对应 GitHub Actions Secret PROJECT_LUMEN_TRANSLATION_CERTIFICATE_PINNING_ENABLED。',
    placeholder: '填 true 或 false',
  },
  {
    key: 'PROJECT_LUMEN_TRANSLATION_CERTIFICATE_PINS',
    label: '翻译服务证书固定 PIN 列表',
    description: '翻译服务证书固定所需的 Base64 SHA-256 指纹列表。对应 GitHub Actions Secret PROJECT_LUMEN_TRANSLATION_CERTIFICATE_PINS。',
    placeholder: '多个 base64 SHA-256 pin',
  },
  {
    key: 'PROJECT_LUMEN_TELEMETRY_ACCESS_TOKEN',
    label: '遥测上报 Token',
    description: '用于向遥测服务上报数据的访问令牌。对应 GitHub Actions Secret PROJECT_LUMEN_TELEMETRY_ACCESS_TOKEN。',
    placeholder: '输入遥测访问令牌',
  },
  {
    key: 'PROJECT_LUMEN_REQUEST_SIGNING_SECRET',
    label: '请求签名密钥（客户端）',
    description: '用于客户端请求 HMAC 签名的密钥，确保请求完整性。对应 GitHub Actions Secret PROJECT_LUMEN_REQUEST_SIGNING_SECRET。',
    placeholder: '输入 HMAC 请求签名密钥',
  },
  {
    key: 'PROJECT_LUMEN_RELEASE_CERT_SHA256',
    label: '发布证书 SHA-256 指纹',
    description: 'Android 发布证书的 SHA-256 摘要，用于运行时完整性校验。对应 GitHub Actions Secret PROJECT_LUMEN_RELEASE_CERT_SHA256。',
    placeholder: '输入发布证书的 SHA-256 摘要',
  },
  {
    key: 'PROJECT_LUMEN_OPEN_API_TRUSTED_SIGNATURE_SHA256',
    label: 'OpenAPI 信任签名摘要',
    description: '受信任第三方应用签名的 SHA-256 摘要，用于 OpenAPI 接口授权。对应 GitHub Actions Secret PROJECT_LUMEN_OPEN_API_TRUSTED_SIGNATURE_SHA256。',
    placeholder: '输入受信任第三方签名 SHA-256',
  },
  {
    key: 'PROJECT_LUMEN_ADMIN_ACTIONS_URL',
    label: '发布清单同步地址',
    description: '用于触发发布清单同步的 Admin Actions URL。对应 GitHub Actions Secret PROJECT_LUMEN_ADMIN_ACTIONS_URL。',
    placeholder: '输入 admin actions URL',
  },
  {
    key: 'PROJECT_LUMEN_ADMIN_TOKEN',
    label: '发布清单同步 Token',
    description: '调用 Admin Actions 时使用的 Bearer Token。对应 GitHub Actions Secret PROJECT_LUMEN_ADMIN_TOKEN。',
    placeholder: '输入 admin bearer token',
  },
  {
    key: 'USER_PAT',
    label: 'GitHub 个人访问令牌（工作流）',
    description: '具有仓库写权限的 GitHub Personal Access Token，用于工作流操作。对应 GitHub Actions Secret USER_PAT。',
    placeholder: '输入具有仓库写权限的 PAT',
  },
];

function maskSecret(value: string): string {
  if (!value) return '未设置';
  if (value.length <= 8) return '已设置';
  return `${value.slice(0, 2)}***${value.slice(-4)}`;
}

function extractErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

interface GitHubInfo {
  owner: string;
  repo: string;
  tokenConfigured: boolean;
}

interface SyncResultItem {
  key: string;
  ok: boolean;
  status?: string;
  error?: string;
}

export interface ProjectLumenConfigSectionProps {
  isOpen: boolean;
  onToggle: (key: string) => void;
  loading: boolean;
  onRefresh: () => void;
  disabled?: boolean;
}

export default function ProjectLumenConfigSection({
  isOpen,
  onToggle,
  loading,
  onRefresh,
  disabled = false,
}: ProjectLumenConfigSectionProps) {
  const prefersReducedMotion = useReducedMotion();
  const { setNotification } = useNotification();
  const { user } = useAuth();
  const canWrite = isSuperAdmin(user?.role);

  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [current, setCurrent] = useState<Record<string, string>>({});
  const [github, setGitHub] = useState<GitHubInfo | null>(null);
  const [fetching, setFetching] = useState(false);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [deletingKey, setDeletingKey] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncResults, setSyncResults] = useState<SyncResultItem[] | null>(null);
  const fetchedRef = useRef(false);
  const syncingRef = useRef(false);

  const fetchValues = useCallback(async () => {
    setFetching(true);
    try {
      const res = await authFetch(LUMEN_CONFIG_API, { headers: getAuthHeaders() });
      const data = await res.json().catch(() => ({}));
      const next: Record<string, string> = {};
      if (res.ok && data) {
        const items = Array.isArray(data.items) ? data.items : [];
        for (const field of SECRET_FIELDS) {
          const item = items.find((entry: { key: string }) => entry.key === field.key);
          const raw = item?.value;
          if (typeof raw === 'string' && raw.trim()) {
            next[field.key] = raw;
          }
        }
        if (data.github && typeof data.github === 'object') {
          setGitHub(data.github as GitHubInfo);
        }
      }
      setCurrent(next);
    } catch {
      // 读取失败时保留现有展示，不阻塞保存/删除操作。
    } finally {
      setFetching(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen && !fetchedRef.current) {
      fetchedRef.current = true;
      void fetchValues();
    }
  }, [isOpen, fetchValues]);

  const handleRefresh = useCallback(() => {
    fetchedRef.current = true;
    void fetchValues();
    onRefresh();
  }, [fetchValues, onRefresh]);

  const handleSave = useCallback(
    async (key: string) => {
      if (!canWrite) return;
      if (savingKey) return;
      const value = (inputs[key] || '').trim();
      if (!value) {
        setNotification({ message: '请填写密钥值后再保存', type: 'error' });
        return;
      }
      setSavingKey(key);
      try {
        const res = await authFetch(LUMEN_CONFIG_API, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          body: JSON.stringify({ key, value }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setNotification({ message: data?.error || `保存 ${key} 失败`, type: 'error' });
          return;
        }
        setNotification({ message: `${key} 已保存`, type: 'success' });
        setInputs((prev) => ({ ...prev, [key]: '' }));
        await fetchValues();
        onRefresh();
      } catch (error) {
        setNotification({
          message: `保存 ${key} 失败：${extractErrorMessage(error, '未知错误')}`,
          type: 'error',
        });
      } finally {
        setSavingKey(null);
      }
    },
    [canWrite, inputs, savingKey, fetchValues, onRefresh, setNotification],
  );

  const handleDelete = useCallback(
    async (key: string) => {
      if (!canWrite) return;
      if (deletingKey) return;
      if (!window.confirm(`确定删除 Project-Lumen 配置「${key}」？`)) return;
      setDeletingKey(key);
      try {
        const res = await authFetch(`${LUMEN_CONFIG_API}/${encodeURIComponent(key)}`, {
          method: 'DELETE',
          headers: { ...getAuthHeaders() },
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setNotification({ message: data?.error || `删除 ${key} 失败`, type: 'error' });
          return;
        }
        setNotification({ message: `${key} 已删除`, type: 'success' });
        setInputs((prev) => ({ ...prev, [key]: '' }));
        await fetchValues();
        onRefresh();
      } catch (error) {
        setNotification({
          message: `删除 ${key} 失败：${extractErrorMessage(error, '未知错误')}`,
          type: 'error',
        });
      } finally {
        setDeletingKey(null);
      }
    },
    [canWrite, deletingKey, fetchValues, onRefresh, setNotification],
  );

  const handleSync = useCallback(async () => {
    if (!canWrite) return;
    if (syncingRef.current) return;
    syncingRef.current = true;
    setSyncing(true);
    setSyncResults(null);
    try {
      const res = await authFetch(LUMEN_CONFIG_SYNC_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setNotification({ message: data?.error || '同步到 GitHub 失败', type: 'error' });
        return;
      }
      if (data.success) {
        setSyncResults(data.results || []);
        setNotification({
          message: `同步到 GitHub 完成：${data.okCount}/${data.total}`,
          type: 'success',
        });
      }
    } catch (error) {
      setNotification({
        message: `同步到 GitHub 失败：${extractErrorMessage(error, '未知错误')}`,
        type: 'error',
      });
    } finally {
      syncingRef.current = false;
      setSyncing(false);
    }
  }, [canWrite, setNotification]);

  const refreshing = fetching || loading;
  const busy = savingKey !== null || deletingKey !== null;
  const isDisabled = busy || disabled;

  return (
    <CollapsibleSection
      title="Project Lumen 配置"
      description="管理 Project-Lumen Android 客户端构建与 CI 所需的 13 个密钥/配置项，支持保存到本服务保管库并同步到 GitHub Actions Secrets。"
      sectionKey={SECTION_KEY}
      isOpen={isOpen}
      onToggle={onToggle}
      prefersReducedMotion={prefersReducedMotion}
      headerRight={
        <m.button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            handleRefresh();
          }}
          disabled={refreshing}
          className={REFRESH_BUTTON_CLASS}
          whileTap={{ scale: 0.95 }}
        >
          <FaSync className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} /> 刷新
        </m.button>
      }
    >
      <InfoBox icon={<FaLock />}>
        <p>
          以下 13 个配置项是 Project-Lumen 的 Android 客户端构建与 CI 密钥。保存后存放在本服务（env-manager 保管库），
          可通过「同步到 GitHub」写入 Project-Lumen 仓库的 GitHub Actions Secrets，CI 即可读取。
        </p>
        <p className="mt-1">
          值不会写入本服务进程环境变量，不参与本服务运行。
        </p>
      </InfoBox>

      <InfoBox icon={<FaInfoCircle />}>
        <p>
          以下为只读键，由 CI 自动生成，无需手动配置。GitHub 会自动提供{' '}
          <code className="rounded bg-white/80 px-1">GITHUB_TOKEN</code>：
        </p>
        <p className="mt-1 font-mono text-xs">
          <code className="rounded bg-white/80 px-1">PROJECT_LUMEN_VERSION_NAME</code>
          、<code className="rounded bg-white/80 px-1">PROJECT_LUMEN_VERSION_CODE</code>
          、<code className="rounded bg-white/80 px-1">PROJECT_LUMEN_BUILD_TIME_UTC_MILLIS</code>
          、<code className="rounded bg-white/80 px-1">PROJECT_LUMEN_COMMIT_HASH</code>
          、<code className="rounded bg-white/80 px-1">PROJECT_LUMEN_SHORT_HASH</code>
        </p>
      </InfoBox>

      {github && (
        <InfoBox icon={<FaInfoCircle />}>
          <p>
            GitHub 目标仓库：<code className="rounded bg-white/80 px-1">{github.owner}/{github.repo}</code>
          </p>
          <p className="mt-1">
            Token 配置状态：
            {github.tokenConfigured ? (
              <span className="text-emerald-700 font-semibold">已配置</span>
            ) : (
              <span className="text-rose-600 font-semibold">未配置</span>
            )}
          </p>
          {!github.tokenConfigured && (
            <p className="mt-1">
              请在服务端 <code className="rounded bg-white/80 px-1">.env</code> 或上方环境变量表中配置{' '}
              <code className="rounded bg-white/80 px-1">PROJECT_LUMEN_GITHUB_OWNER</code> /{' '}
              <code className="rounded bg-white/80 px-1">PROJECT_LUMEN_GITHUB_REPO</code> /{' '}
              <code className="rounded bg-white/80 px-1">PROJECT_LUMEN_GITHUB_TOKEN</code>。
            </p>
          )}
        </InfoBox>
      )}

      <div className="flex items-center justify-end gap-3">
        <m.button
          type="button"
          onClick={handleSync}
          disabled={isDisabled || syncing}
          className={`${REFRESH_BUTTON_CLASS} disabled:opacity-40`}
          whileTap={{ scale: 0.95 }}
        >
          <FaSync className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} /> 同步全部到 GitHub
        </m.button>
      </div>

      {syncResults && syncResults.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white/80 p-4 space-y-2">
          <h4 className="text-sm font-semibold text-slate-700">同步结果</h4>
          {syncResults.map((r) => (
            <div key={r.key} className="flex items-center gap-2 text-sm">
              <span className={r.ok ? 'text-emerald-600' : 'text-rose-600'}>
                {r.ok ? <FaCheck /> : <FaTimes />}
              </span>
              <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-600">
                {r.key}
              </code>
              <span className="text-slate-500">
                {r.ok ? (r.status || 'OK') : (r.error || 'FAIL')}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-4">
        {SECRET_FIELDS.map((field) => (
          <div key={field.key} className="rounded-2xl border border-slate-200 bg-white/80 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-sm font-semibold text-slate-700">{field.label}</h4>
              <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-600">
                {field.key}
              </code>
            </div>
            <p className="mt-1 mb-3 text-xs text-slate-500">{field.description}</p>

            <ConfigFieldRow
              inputLabel="新值"
              value={inputs[field.key] || ''}
              onChange={(v) => setInputs((prev) => ({ ...prev, [field.key]: v }))}
              placeholder={field.placeholder}
              currentLabel="当前配置（脱敏）"
              currentValue={maskSecret(current[field.key] || '')}
              loading={fetching}
              isSaving={savingKey === field.key}
              isDeleting={deletingKey === field.key}
              busy={busy}
              onSave={() => handleSave(field.key)}
              onDelete={() => handleDelete(field.key)}
              readOnly={disabled}
              isPassword
            />
          </div>
        ))}
      </div>
    </CollapsibleSection>
  );
}
