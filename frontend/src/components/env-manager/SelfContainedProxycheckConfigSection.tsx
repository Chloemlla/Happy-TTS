import { useCallback, useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { useAuth } from '../../hooks/useAuth';
import { isSuperAdmin } from '../../utils/rbac';
import { getBackendErrorMessage } from '../../utils/backendError';
import { useNotification } from '../Notification';
import ProxycheckConfigSection, {
  DEFAULT_PROXYCHECK_INPUTS,
  PROXYCHECK_NUMERIC_FIELDS,
  clampProxycheckNumber,
  type ProxycheckInputs,
  type ProxycheckNumericKey,
  type ProxycheckSecretKey,
  type ProxycheckSectionState,
} from './ProxycheckConfigSection';
import { PROXYCHECK_API, getAuthHeaders, authFetch } from './api';

interface SelfContainedProxycheckConfigSectionProps {
  prefersReducedMotion?: boolean | null;
}

const SECRET_KEYS: ProxycheckSecretKey[] = ['apiKey', 'publicApiKey', 'hmacSecret'];

function pickNumericInput(cfg: Record<string, unknown>, key: ProxycheckNumericKey): string {
  const field = PROXYCHECK_NUMERIC_FIELDS.find((item) => item.key === key);
  if (!field) return DEFAULT_PROXYCHECK_INPUTS[key];
  const parsed = Number(cfg[key]);
  if (!Number.isFinite(parsed)) return String(field.fallback);
  return String(Math.min(field.max, Math.max(field.min, Math.round(parsed))));
}

function pickBoolean(cfg: Record<string, unknown>, key: 'enabled' | 'failOpen' | 'usePublicKeyForClient'): boolean {
  return typeof cfg[key] === 'boolean' ? (cfg[key] as boolean) : DEFAULT_PROXYCHECK_INPUTS[key];
}

function pickString(cfg: Record<string, unknown>, key: string): string {
  return typeof cfg[key] === 'string' ? (cfg[key] as string) : '';
}

/**
 * proxycheck.io IP 风险检测（PROXYCHECK）。三把密钥均为「留空 = 保留原值」，
 * 后端只回掩码 + hasXxx 布尔，明文永不回显。
 */
export default function SelfContainedProxycheckConfigSection({
  prefersReducedMotion: reducedMotionProp,
}: SelfContainedProxycheckConfigSectionProps) {
  const prefersReducedMotion = useReducedMotion() ?? reducedMotionProp;
  const { setNotification } = useNotification();
  const { user } = useAuth();
  const canWrite = isSuperAdmin(user?.role);
  const [isOpen, setIsOpen] = useState(false);
  const fetchedRef = useRef(false);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [inputs, setInputs] = useState<ProxycheckInputs>(DEFAULT_PROXYCHECK_INPUTS);
  const [current, setCurrent] = useState<ProxycheckSectionState | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | undefined>();

  const handleInputChange = useCallback(
    <K extends keyof ProxycheckInputs>(key: K, value: ProxycheckInputs[K]) => {
      setInputs((prev) => {
        const next: ProxycheckInputs = { ...prev };
        next[key] = value;
        return next;
      });
    },
    [],
  );

  const fetchConfig = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authFetch(PROXYCHECK_API, { headers: { ...getAuthHeaders() } });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setNotification({ message: data.error || '获取 proxycheck.io 配置失败', type: 'error' });
        return;
      }
      const cfg: Record<string, unknown> = data?.setting?.config || {};
      setInputs({
        enabled: pickBoolean(cfg, 'enabled'),
        // 密钥输入框始终清空：留空保存即保留原值。
        apiKey: '',
        publicApiKey: '',
        hmacSecret: '',
        cacheTtlHours: pickNumericInput(cfg, 'cacheTtlHours'),
        timeoutMs: pickNumericInput(cfg, 'timeoutMs'),
        dailyQuotaPerKey: pickNumericInput(cfg, 'dailyQuotaPerKey'),
        challengeRiskScore: pickNumericInput(cfg, 'challengeRiskScore'),
        failOpen: pickBoolean(cfg, 'failOpen'),
        usePublicKeyForClient: pickBoolean(cfg, 'usePublicKeyForClient'),
      });
      setCurrent({
        enabled: pickBoolean(cfg, 'enabled'),
        apiKey: pickString(cfg, 'apiKey'),
        publicApiKey: pickString(cfg, 'publicApiKey'),
        hmacSecret: pickString(cfg, 'hmacSecret'),
        hasApiKey: !!cfg.hasApiKey,
        hasPublicApiKey: !!cfg.hasPublicApiKey,
        hasHmacSecret: !!cfg.hasHmacSecret,
      });
      setUpdatedAt(data?.setting?.updatedAt);
    } catch (error) {
      setNotification({
        message: `获取 proxycheck.io 配置失败：${getBackendErrorMessage(error, '未知错误')}`,
        type: 'error',
      });
    } finally {
      setLoading(false);
    }
  }, [setNotification]);

  useEffect(() => {
    if (isOpen && !fetchedRef.current) {
      fetchedRef.current = true;
      fetchConfig();
    }
  }, [isOpen, fetchConfig]);

  const handleSave = useCallback(async () => {
    if (!canWrite) return;
    if (saving) return;
    // 前端先按合法区间钳制，避免后端 400；空值/非法值回落该字段默认值。
    const numbers: Record<ProxycheckNumericKey, number> = {
      cacheTtlHours: 0,
      timeoutMs: 0,
      dailyQuotaPerKey: 0,
      challengeRiskScore: 0,
    };
    let clamped = false;
    for (const field of PROXYCHECK_NUMERIC_FIELDS) {
      const value = clampProxycheckNumber(field, inputs[field.key]);
      const parsed = Number(inputs[field.key]);
      if (!Number.isFinite(parsed) || parsed !== value) clamped = true;
      numbers[field.key] = value;
    }

    const payload: Record<string, unknown> = {
      enabled: inputs.enabled,
      failOpen: inputs.failOpen,
      usePublicKeyForClient: inputs.usePublicKeyForClient,
      ...numbers,
    };
    for (const key of SECRET_KEYS) {
      const value = inputs[key].trim();
      if (value) payload[key] = value;
    }

    setSaving(true);
    try {
      const res = await authFetch(PROXYCHECK_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setNotification({ message: data.error || '保存失败', type: 'error' });
        return;
      }
      setNotification({
        message: clamped ? 'proxycheck.io 配置已保存（超区间的数值已按合法区间钳制）' : 'proxycheck.io 配置已保存',
        type: 'success',
      });
      await fetchConfig();
    } catch (error) {
      setNotification({ message: `保存失败：${getBackendErrorMessage(error, '未知错误')}`, type: 'error' });
    } finally {
      setSaving(false);
    }
  }, [canWrite, saving, inputs, fetchConfig, setNotification]);

  const handleReset = useCallback(async () => {
    if (!canWrite) return;
    if (deleting) return;
    if (
      !window.confirm(
        '确定重置 proxycheck.io IP 风险检测配置？重置后会回退到部署环境变量（PROXYCHECK_API_KEY / PROXYCHECK_PUBLIC_API_KEY / PROXYCHECK_HMAC_SECRET），未设置则回到默认值（未启用）。',
      )
    ) {
      return;
    }
    setDeleting(true);
    try {
      const res = await authFetch(PROXYCHECK_API, { method: 'DELETE', headers: { ...getAuthHeaders() } });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setNotification({ message: data.error || '重置失败', type: 'error' });
        return;
      }
      setNotification({ message: '已重置 proxycheck.io IP 风险检测配置', type: 'success' });
      await fetchConfig();
    } catch (error) {
      setNotification({ message: `重置失败：${getBackendErrorMessage(error, '未知错误')}`, type: 'error' });
    } finally {
      setDeleting(false);
    }
  }, [canWrite, deleting, fetchConfig, setNotification]);

  return (
    <ProxycheckConfigSection
      isOpen={isOpen}
      onToggle={() => setIsOpen((v) => !v)}
      prefersReducedMotion={prefersReducedMotion}
      loading={loading}
      saving={saving}
      deleting={deleting}
      disabled={!canWrite}
      inputs={inputs}
      current={current}
      updatedAt={updatedAt}
      onInputChange={handleInputChange}
      onRefresh={fetchConfig}
      onSave={handleSave}
      onReset={handleReset}
    />
  );
}
