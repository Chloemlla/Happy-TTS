import { useCallback, useEffect, useRef, useState } from 'react';
import { m, useReducedMotion } from 'framer-motion';
import { FaShieldAlt, FaSync } from 'react-icons/fa';
import { useNotification } from '../Notification';
import CollapsibleSection from './CollapsibleSection';
import { API_URL, getAuthHeaders } from './api';

const REFRESH_BUTTON_CLASS =
  'inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60';

const SECTION_KEY = 'ecoenchantsWebhook';

interface SecretField {
  key: string;
  altKeys: string[];
  label: string;
  description: string;
  placeholder: string;
}

const SECRET_FIELDS: SecretField[] = [
  {
    key: 'ECOENCHANTS_STRIPE_WEBHOOK_SECRET',
    altKeys: ['STRIPE_WEBHOOK_SECRET'],
    label: 'Stripe Webhook 校验密钥',
    description:
      '用于校验 EcoEnchants 收到的 Stripe 支付 webhook 请求签名。对应环境变量 ECOENCHANTS_STRIPE_WEBHOOK_SECRET（未配置时回退 STRIPE_WEBHOOK_SECRET）。',
    placeholder: '请输入 Stripe webhook 签名校验密钥',
  },
  {
    key: 'ECOENCHANTS_POLYMART_WEBHOOK_SECRET',
    altKeys: ['POLYMART_WEBHOOK_SECRET'],
    label: 'Polymart Webhook 校验密钥',
    description:
      '用于校验 EcoEnchants 收到的 Polymart 商店 webhook 请求签名。对应环境变量 ECOENCHANTS_POLYMART_WEBHOOK_SECRET（未配置时回退 POLYMART_WEBHOOK_SECRET）。',
    placeholder: '请输入 Polymart webhook 签名校验密钥',
  },
  {
    key: 'ECOENCHANTS_PAYPAL_WEBHOOK_SECRET',
    altKeys: ['PAYPAL_WEBHOOK_SECRET'],
    label: 'PayPal Webhook 校验密钥',
    description:
      '用于校验 EcoEnchants 收到的 PayPal 支付 webhook 请求签名。对应环境变量 ECOENCHANTS_PAYPAL_WEBHOOK_SECRET（未配置时回退 PAYPAL_WEBHOOK_SECRET）。',
    placeholder: '请输入 PayPal webhook 签名校验密钥',
  },
];

// 后端返回的 key 可能带前缀（如 `.env:KEY`、`APP:KEY`），只取最后一个冒号之后的部分进行匹配。
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

export interface EcoEnchantsWebhookSectionProps {
  isOpen: boolean;
  onToggle: (key: string) => void;
  loading: boolean;
  onRefresh: () => void;
}

export default function EcoEnchantsWebhookSection({
  isOpen,
  onToggle,
  loading,
  onRefresh,
}: EcoEnchantsWebhookSectionProps) {
  const prefersReducedMotion = useReducedMotion();
  const { setNotification } = useNotification();

  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [current, setCurrent] = useState<Record<string, string>>({});
  const [fetching, setFetching] = useState(false);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [deletingKey, setDeletingKey] = useState<string | null>(null);
  const fetchedRef = useRef(false);

  const fetchValues = useCallback(async () => {
    setFetching(true);
    try {
      const res = await fetch(API_URL, { headers: getAuthHeaders() });
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
      if (savingKey) return;
      const value = (inputs[key] || '').trim();
      if (!value) {
        setNotification({ message: '请填写密钥值后再保存', type: 'error' });
        return;
      }
      setSavingKey(key);
      try {
        const res = await fetch(API_URL, {
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
    [inputs, savingKey, fetchValues, onRefresh, setNotification],
  );

  const handleDelete = useCallback(
    async (key: string) => {
      if (deletingKey) return;
      if (!window.confirm(`确定删除环境变量「${key}」？对应 webhook 校验能力可能立即失效。`)) return;
      setDeletingKey(key);
      try {
        const res = await fetch(`${API_URL}/${encodeURIComponent(key)}`, {
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
    [deletingKey, fetchValues, onRefresh, setNotification],
  );

  const refreshing = fetching || loading;
  const busy = savingKey !== null || deletingKey !== null;

  return (
    <CollapsibleSection
      title="EcoEnchants Webhook 校验密钥"
      description="配置 EcoEnchants 支付 / 商店 webhook 的签名校验密钥（Stripe、Polymart、PayPal）。保存后写入运行时配置（环境变量）并立即生效。"
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
      <div className="rounded-xl border border-indigo-100 bg-indigo-50/70 px-4 py-3 text-xs leading-5 text-indigo-900">
        <div className="flex items-start gap-2">
          <FaShieldAlt className="mt-0.5 shrink-0 text-indigo-700" />
          <div>
            <p>
              以下密钥由 EcoEnchants 服务用于校验支付 / 商店 webhook 请求的来源签名，防止伪造回调。保存的密钥会覆盖进程环境 /{' '}
              <code className="rounded bg-white/80 px-1">.env</code> 中的同名启动默认值并立即生效。
            </p>
            <p className="mt-1">
              支持回退变量：
              <code className="rounded bg-white/80 px-1">ECOENCHANTS_STRIPE_WEBHOOK_SECRET</code> 回退{' '}
              <code className="rounded bg-white/80 px-1">STRIPE_WEBHOOK_SECRET</code>；
              <code className="rounded bg-white/80 px-1">ECOENCHANTS_POLYMART_WEBHOOK_SECRET</code> 回退{' '}
              <code className="rounded bg-white/80 px-1">POLYMART_WEBHOOK_SECRET</code>；
              <code className="rounded bg-white/80 px-1">ECOENCHANTS_PAYPAL_WEBHOOK_SECRET</code> 回退{' '}
              <code className="rounded bg-white/80 px-1">PAYPAL_WEBHOOK_SECRET</code>。
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        {SECRET_FIELDS.map((field) => (
          <div key={field.key} className="rounded-xl border border-slate-200 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-sm font-semibold text-gray-700">{field.label}</h4>
              <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-600">
                {field.key}
              </code>
            </div>
            <p className="mt-1 text-xs text-gray-500">{field.description}</p>

            <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="md:col-span-2">
                <label className="mb-1 block text-sm font-medium text-gray-700">新值</label>
                <input
                  type="password"
                  value={inputs[field.key] || ''}
                  onChange={(event) =>
                    setInputs((prev) => ({ ...prev, [field.key]: event.target.value }))
                  }
                  placeholder={field.placeholder}
                  autoComplete="off"
                  spellCheck={false}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-400 sm:text-base"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">当前配置（脱敏）</label>
                <div className="flex min-h-[40px] items-center rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 font-mono text-sm text-gray-700">
                  {fetching ? '加载中...' : maskSecret(current[field.key] || '')}
                </div>
              </div>
            </div>

            <div className="mt-3 flex items-center justify-end gap-3">
              <m.button
                type="button"
                onClick={() => handleDelete(field.key)}
                disabled={busy}
                className="rounded-lg bg-red-500 px-3 py-2 text-sm font-medium text-white transition hover:bg-red-600 disabled:opacity-50 sm:px-4"
                whileTap={{ scale: 0.96 }}
              >
                {deletingKey === field.key ? '删除中...' : '删除'}
              </m.button>
              <m.button
                type="button"
                onClick={() => handleSave(field.key)}
                disabled={busy}
                className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:opacity-50 sm:px-4"
                whileTap={{ scale: 0.96 }}
              >
                {savingKey === field.key ? '保存中...' : '保存/更新'}
              </m.button>
            </div>
          </div>
        ))}
      </div>
    </CollapsibleSection>
  );
}
