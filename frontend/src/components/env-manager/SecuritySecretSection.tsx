import { getBackendErrorMessage } from '../../utils/backendError';
import { useCallback, useEffect, useRef, useState } from 'react';
import { m, useReducedMotion } from 'framer-motion';
import { FaLock, FaSync } from 'react-icons/fa';
import { useAuth } from '../../hooks/useAuth';
import { isSuperAdmin } from '../../utils/rbac';
import { useNotification } from '../Notification';
import CollapsibleSection from './CollapsibleSection';
import { API_URL, getAuthHeaders, authFetch } from './api';
import ConfigFieldRow from './ConfigFieldRow';
import InfoBox from './InfoBox';

const REFRESH_BUTTON_CLASS =
  'inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400';

const SECTION_KEY = 'securitySecrets';

interface SecretField {
  key: string;
  altKeys: string[];
  label: string;
  description: string;
  placeholder: string;
}

const SECRET_FIELDS: SecretField[] = [
  {
    key: 'DATA_COLLECTION_RAW_SECRET',
    altKeys: [],
    label: '数据采集加密密钥',
    description:
      '用于加密数据采集环节的原始记录，确保落盘数据脱敏与传输加密。对应环境变量 DATA_COLLECTION_RAW_SECRET。',
    placeholder: '请输入至少 16 位的随机字符串',
  },
  {
    key: 'BILIBILI_COOKIE_ENCRYPTION_KEY',
    altKeys: [],
    label: 'Bilibili Cookie 加密密钥',
    description:
      '用于 AES-256-GCM 加密 Bilibili 账号 Cookie 的独立密钥，与 PASSWORD_ENCRYPTION_KEY 隔离。对应环境变量 BILIBILI_COOKIE_ENCRYPTION_KEY。',
    placeholder: '请输入至少 32 位的随机字符串',
  },
  {
    key: 'PASSWORD_ENCRYPTION_KEY',
    altKeys: [],
    label: '密码加密密钥',
    description:
      '用于对用户密码密文进行加密保护的独立密钥，与数据采集加密隔离。对应环境变量 PASSWORD_ENCRYPTION_KEY。',
    placeholder: '请输入至少 32 位的随机字符串',
  },
  {
    key: 'POLICY_SECRET_SALT',
    altKeys: [],
    label: '策略密钥盐值',
    description:
      '安全密钥隔离场景下用于派生策略级密钥的全局盐值。对应环境变量 POLICY_SECRET_SALT。',
    placeholder: '请输入随机盐值字符串',
  },
  {
    key: 'VERIFICATION_TOKEN_SECRET',
    altKeys: [],
    label: '验证令牌签名密钥',
    description:
      '用于签名/校验验证类令牌（邮件、手机号等验证流程）的独立密钥。对应环境变量 VERIFICATION_TOKEN_SECRET。',
    placeholder: '请输入用于签名验证令牌的密钥',
  },
  {
    key: 'TTS_ASSET_ACCESS_SECRET',
    altKeys: [],
    label: 'TTS 资产访问密钥',
    description:
      '用于校验对 TTS 音频资产的访问请求，防止未授权拉取。对应环境变量 TTS_ASSET_ACCESS_SECRET。',
    placeholder: '请输入 TTS 资产访问校验密钥',
  },
  {
    key: 'LEGACY_API_CHOICE_SECRET',
    altKeys: [],
    label: '旧版 API 选择密钥',
    description:
      '用于在密钥隔离机制下切换/访问旧版 API 的授权密钥。对应环境变量 LEGACY_API_CHOICE_SECRET。',
    placeholder: '请输入旧版 API 授权密钥',
  },
];

function normalizeEnvKey(rawKey: string): string {
  const parts = rawKey.split(':');
  return parts.length > 1 ? parts[parts.length - 1] : rawKey;
}

function matchesSecretField(candidateKey: string, field: SecretField): boolean {
  const normalized = normalizeEnvKey(candidateKey).toUpperCase();
  if (normalized === field.key) return true;
  return field.altKeys.some((altKey) => normalized === altKey);
}

function maskSecret(value: string): string {
  if (!value) return '未设置';
  if (value.length <= 8) return '已设置';
  return `${value.slice(0, 2)}***${value.slice(-4)}`;
}

export interface SecuritySecretSectionProps {
  isOpen: boolean;
  onToggle: (key: string) => void;
  loading: boolean;
  onRefresh: () => void;
  disabled?: boolean;
}

export default function SecuritySecretSection({
  isOpen,
  onToggle,
  loading,
  onRefresh,
  disabled = false,
}: SecuritySecretSectionProps) {
  const prefersReducedMotion = useReducedMotion();
  const { setNotification } = useNotification();
  const { user } = useAuth();
  const canWrite = isSuperAdmin(user?.role);

  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [current, setCurrent] = useState<Record<string, string>>({});
  const [fetching, setFetching] = useState(false);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [deletingKey, setDeletingKey] = useState<string | null>(null);
  const fetchedRef = useRef(false);

  const fetchValues = useCallback(async () => {
    setFetching(true);
    try {
      const res = await authFetch(API_URL, { headers: getAuthHeaders() });
      const data = await res.json().catch(() => ({}));
      const next: Record<string, string> = {};
      if (res.ok && data) {
        let envList: Array<{ key: string; value: unknown }> = [];
        if (Array.isArray(data.envs)) {
          envList = data.envs;
        } else if (data.envs && typeof data.envs === 'object') {
          envList = Object.entries(data.envs).map(([key, value]) => ({ key, value }));
        }
        for (const field of SECRET_FIELDS) {
          const item = envList.find((entry) => matchesSecretField(String(entry.key), field));
          const raw = item?.value;
          if (typeof raw === 'string' && raw.trim()) {
            next[field.key] = raw;
          }
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
        const res = await authFetch(API_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          body: JSON.stringify({ key, value }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setNotification({ message: data?.error || `保存 ${key} 失败`, type: 'error' });
          return;
        }
        setNotification({ message: `${key} 已保存并写入运行时配置`, type: 'success' });
        setInputs((prev) => ({ ...prev, [key]: '' }));
        await fetchValues();
        onRefresh();
      } catch (error) {
        setNotification({
          message: `保存 ${key} 失败：${getBackendErrorMessage(error, '未知错误')}`,
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
      if (!window.confirm(`确定删除环境变量「${key}」？对应密钥隔离/加密能力可能立即失效。`)) return;
      setDeletingKey(key);
      try {
        const res = await authFetch(`${API_URL}/${encodeURIComponent(key)}`, {
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
          message: `删除 ${key} 失败：${getBackendErrorMessage(error, '未知错误')}`,
          type: 'error',
        });
      } finally {
        setDeletingKey(null);
      }
    },
    [canWrite, deletingKey, fetchValues, onRefresh, setNotification],
  );

  const refreshing = fetching || loading;
  const busy = savingKey !== null || deletingKey !== null;

  return (
    <CollapsibleSection
      title="安全密钥隔离与数据采集加密"
      description="配置数据采集加密密钥（DATA_COLLECTION_RAW_SECRET）、Bilibili Cookie 加密密钥（BILIBILI_COOKIE_ENCRYPTION_KEY）、密码加密密钥（PASSWORD_ENCRYPTION_KEY）与安全密钥隔离（POLICY_SECRET_SALT、VERIFICATION_TOKEN_SECRET、TTS_ASSET_ACCESS_SECRET、LEGACY_API_CHOICE_SECRET）。保存后写入运行时配置（环境变量）并立即生效。"
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
          以下密钥用于数据采集加密、Bilibili 凭证加密与安全密钥隔离：{' '}
          <code className="rounded bg-white/80 px-1">DATA_COLLECTION_RAW_SECRET</code>（数据加密）、{' '}
          <code className="rounded bg-white/80 px-1">BILIBILI_COOKIE_ENCRYPTION_KEY</code>（Bilibili Cookie 加密）、{' '}
          <code className="rounded bg-white/80 px-1">PASSWORD_ENCRYPTION_KEY</code>（密码加密），以及密钥隔离所需的{' '}
          <code className="rounded bg-white/80 px-1">POLICY_SECRET_SALT</code>、
          <code className="rounded bg-white/80 px-1">VERIFICATION_TOKEN_SECRET</code>、
          <code className="rounded bg-white/80 px-1">TTS_ASSET_ACCESS_SECRET</code>、
          <code className="rounded bg-white/80 px-1">LEGACY_API_CHOICE_SECRET</code>。
        </p>
        <p className="mt-1">
          保存的密钥会覆盖进程环境 / <code className="rounded bg-white/80 px-1">.env</code> 中的同名启动默认值并立即生效。
          建议为每个用途使用独立、足够随机的密钥，避免跨模块复用。
        </p>
      </InfoBox>

      <div className="space-y-4">
        {SECRET_FIELDS.map((field) => (
          <div key={field.key} className="rounded-2xl border border-slate-200 bg-white/80 p-3 sm:p-4">
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