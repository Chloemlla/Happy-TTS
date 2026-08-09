import { useCallback, useEffect, useRef, useState } from 'react';
import { m, useReducedMotion } from 'framer-motion';
import { FaKey, FaSync } from 'react-icons/fa';
import { useNotification } from '../Notification';
import { useAuth } from '../../hooks/useAuth';
import { isSuperAdmin } from '../../utils/rbac';
import CollapsibleSection from './CollapsibleSection';
import { API_URL, getAuthHeaders, authFetch } from './api';
import ConfigFieldRow from './ConfigFieldRow';
import InfoBox from './InfoBox';

const REFRESH_BUTTON_CLASS =
  'inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400';

const SECTION_KEY = 'ecoenchants';

interface SecretField {
  key: string;
  altKeys: string[];
  label: string;
  description: string;
  placeholder: string;
}

const SECRET_FIELDS: SecretField[] = [
  {
    key: 'ECOENCHANTS_LICENSE_PEPPER',
    altKeys: ['LICENSE_KEY_PEPPER'],
    label: '授权密钥加盐（License Pepper）',
    description:
      '用于生成 EcoEnchants 授权码哈希的全局加盐值。对应环境变量 ECOENCHANTS_LICENSE_PEPPER（未配置时回退 LICENSE_KEY_PEPPER）。',
    placeholder: '请输入至少 32 位的随机字符串',
  },
  {
    key: 'ECOENCHANTS_ACTIVATION_TOKEN_SECRET',
    altKeys: ['ECOENCHANTS_RUNTIME_TOKEN_SECRET'],
    label: '激活令牌签名密钥',
    description:
      '用于签名授权激活令牌。对应环境变量 ECOENCHANTS_ACTIVATION_TOKEN_SECRET（未配置时回退 ECOENCHANTS_RUNTIME_TOKEN_SECRET）。',
    placeholder: '请输入用于签名激活令牌的密钥',
  },
  {
    key: 'ECOENCHANTS_OPS_TOKEN_SECRET',
    altKeys: [],
    label: 'Ops 令牌签名密钥',
    description:
      '用于签名 EcoEnchants 运维会话令牌（注册 / RPC）。对应环境变量 ECOENCHANTS_OPS_TOKEN_SECRET。',
    placeholder: '请输入用于签名 Ops 令牌的密钥',
  },
  {
    key: 'ECOENCHANTS_DOWNLOAD_TOKEN_SECRET',
    altKeys: [],
    label: '下载令牌签名密钥',
    description: '用于签名版本下载令牌。对应环境变量 ECOENCHANTS_DOWNLOAD_TOKEN_SECRET。',
    placeholder: '请输入用于签名下载令牌的密钥',
  },
  {
    key: 'ECOENCHANTS_DOWNLOAD_URL_SIGNING_SECRET',
    altKeys: [],
    label: '下载 URL 签名密钥',
    description: '用于对短期下载 URL 签名。对应环境变量 ECOENCHANTS_DOWNLOAD_URL_SIGNING_SECRET。',
    placeholder: '请输入用于签名下载 URL 的密钥',
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

function extractErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export interface EcoEnchantsTokenSectionProps {
  isOpen: boolean;
  onToggle: (key: string) => void;
  loading: boolean;
  onRefresh: () => void;
  disabled?: boolean;
}

export default function EcoEnchantsTokenSection({
  isOpen,
  onToggle,
  loading,
  onRefresh,
  disabled = false,
}: EcoEnchantsTokenSectionProps) {
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
      if (!window.confirm(`确定删除环境变量「${key}」？对应授权/令牌能力可能立即失效。`)) return;
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
          message: `删除 ${key} 失败：${extractErrorMessage(error, '未知错误')}`,
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
      title="EcoEnchants 令牌与授权密钥"
      description="配置 EcoEnchants 授权服务的令牌签名密钥与授权码加盐。保存后写入运行时配置（环境变量）并立即生效。"
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
      <InfoBox icon={<FaKey />}>
        <p>
          以下密钥由 EcoEnchants 授权服务读取。保存的密钥会覆盖进程环境 /{' '}
          <code className="rounded bg-white/80 px-1">.env</code> 中的同名启动默认值并立即生效。
        </p>
        <p className="mt-1">
          支持回退变量：
          <code className="rounded bg-white/80 px-1">ECOENCHANTS_LICENSE_PEPPER</code> 回退{' '}
          <code className="rounded bg-white/80 px-1">LICENSE_KEY_PEPPER</code>；
          <code className="rounded bg-white/80 px-1">ECOENCHANTS_ACTIVATION_TOKEN_SECRET</code> 回退{' '}
          <code className="rounded bg-white/80 px-1">ECOENCHANTS_RUNTIME_TOKEN_SECRET</code>。
        </p>
      </InfoBox>

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
              isPassword
              readOnly={disabled}
            />
          </div>
        ))}
      </div>
    </CollapsibleSection>
  );
}