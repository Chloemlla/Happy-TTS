import { useCallback, useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { useAuth } from '../../hooks/useAuth';
import { isSuperAdmin } from '../../utils/rbac';
import { useNotification } from '../Notification';
import LumenServerConfigSection from './LumenServerConfigSection';
import { LUMEN_SERVER_API, getAuthHeaders, authFetch } from './api';

interface SelfContainedLumenServerConfigSectionProps {
  prefersReducedMotion?: boolean | null;
}

const TEXT_FIELDS = [
  'adminUsername',
  'outemailApiUrl',
  'appVersion',
  'outemailFrom',
  'outemailDisplayName',
  'outemailDomain',
  'outemailBaseUrl',
] as const;

const NUM_FIELDS = [
  'sessionTtlDays',
  'loginCodeTtlSeconds',
  'adminSessionTtlSeconds',
  'adminRefreshTtlSeconds',
  'accessTokenTtlSeconds',
  'refreshTokenTtlSeconds',
  'requestTimestampSkewSeconds',
  'outemailTimeoutSeconds',
] as const;

const SECRET_FIELDS = ['adminPassword', 'adminAutomationToken', 'requestSigningSecret', 'outemailApiKey'] as const;

const BOOL_FIELDS = ['enabled', 'requireRequestSigning', 'acceptUnverifiedPurchases', 'allowPublicReleaseCheck'] as const;

export default function SelfContainedLumenServerConfigSection({
  prefersReducedMotion: reducedMotionProp,
}: SelfContainedLumenServerConfigSectionProps) {
  const prefersReducedMotion = useReducedMotion() ?? reducedMotionProp;
  const { setNotification } = useNotification();
  const { user } = useAuth();
  const canWrite = isSuperAdmin(user?.role);
  const [isOpen, setIsOpen] = useState(false);
  const fetchedRef = useRef(false);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [bools, setBools] = useState<Record<string, boolean>>({});
  const [hasSecrets, setHasSecrets] = useState<Record<string, boolean>>({});
  const [devLoginCodeConfigured, setDevLoginCodeConfigured] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<string | undefined>();

  const fetchConfig = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authFetch(LUMEN_SERVER_API, { headers: { ...getAuthHeaders() } });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setNotification({ message: data?.error || '获取 Lumen 服务端配置失败', type: 'error' });
        return;
      }
      const cfg = (data?.setting?.config || {}) as Record<string, unknown>;
      const nextValues: Record<string, string> = {};
      for (const key of TEXT_FIELDS) nextValues[key] = typeof cfg[key] === 'string' ? (cfg[key] as string) : '';
      for (const key of NUM_FIELDS) {
        const raw = cfg[key];
        nextValues[key] = raw === undefined || raw === null || raw === '' ? '' : String(raw);
      }
      for (const key of SECRET_FIELDS) nextValues[key] = '';
      nextValues.devLoginCode = '';
      setValues(nextValues);

      const nextBools: Record<string, boolean> = {};
      for (const key of BOOL_FIELDS) nextBools[key] = Boolean(cfg[key]);
      setBools(nextBools);

      setHasSecrets({
        adminPassword: Boolean(cfg.hasAdminPassword),
        adminAutomationToken: Boolean(cfg.hasAdminAutomationToken),
        requestSigningSecret: Boolean(cfg.hasRequestSigningSecret),
        outemailApiKey: Boolean(cfg.hasOutemailApiKey),
      });
      setDevLoginCodeConfigured(Boolean(cfg.devLoginCodeConfigured));
      setUpdatedAt(data?.setting?.updatedAt);
    } catch (e) {
      setNotification({
        message: '获取 Lumen 服务端配置失败：' + (e instanceof Error ? e.message : '未知错误'),
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
    const payload: Record<string, unknown> = {};
    for (const key of BOOL_FIELDS) payload[key] = bools[key];
    for (const key of TEXT_FIELDS) {
      const value = (values[key] || '').trim();
      if (value !== '') payload[key] = value;
    }
    for (const key of NUM_FIELDS) {
      const raw = (values[key] || '').trim();
      if (raw === '') continue;
      const num = Number(raw);
      if (!Number.isFinite(num)) {
        setNotification({ message: `${key} 必须是一个数字`, type: 'error' });
        return;
      }
      payload[key] = num;
    }
    for (const key of SECRET_FIELDS) {
      const value = (values[key] || '').trim();
      if (value !== '') payload[key] = value;
    }
    const devLoginCode = (values.devLoginCode || '').trim();
    if (devLoginCode !== '') payload.devLoginCode = devLoginCode;

    setSaving(true);
    try {
      const res = await authFetch(LUMEN_SERVER_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setNotification({ message: data?.error || '保存失败', type: 'error' });
        return;
      }
      setNotification({ message: 'Lumen 服务端配置已保存', type: 'success' });
      await fetchConfig();
    } catch (e) {
      setNotification({ message: '保存失败：' + (e instanceof Error ? e.message : '未知错误'), type: 'error' });
    } finally {
      setSaving(false);
    }
  }, [canWrite, saving, bools, values, fetchConfig, setNotification]);

  const handleReset = useCallback(async () => {
    if (!canWrite) return;
    if (deleting) return;
    if (!window.confirm('确定重置 Lumen 服务端配置为默认值？')) return;
    setDeleting(true);
    try {
      const res = await authFetch(LUMEN_SERVER_API, { method: 'DELETE', headers: { ...getAuthHeaders() } });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setNotification({ message: data?.error || '重置失败', type: 'error' });
        return;
      }
      setNotification({ message: '已重置为默认配置', type: 'success' });
      await fetchConfig();
    } catch (e) {
      setNotification({ message: '重置失败：' + (e instanceof Error ? e.message : '未知错误'), type: 'error' });
    } finally {
      setDeleting(false);
    }
  }, [canWrite, deleting, fetchConfig, setNotification]);

  return (
    <LumenServerConfigSection
      isOpen={isOpen}
      onToggle={() => setIsOpen((v) => !v)}
      prefersReducedMotion={prefersReducedMotion}
      loading={loading}
      saving={saving}
      deleting={deleting}
      disabled={!canWrite}
      values={values}
      bools={bools}
      hasSecrets={hasSecrets}
      devLoginCodeConfigured={devLoginCodeConfigured}
      updatedAt={updatedAt}
      onValueChange={(field, value) => setValues((prev) => ({ ...prev, [field]: value }))}
      onBoolChange={(field, value) => setBools((prev) => ({ ...prev, [field]: value }))}
      onRefresh={fetchConfig}
      onSave={handleSave}
      onReset={handleReset}
    />
  );
}
