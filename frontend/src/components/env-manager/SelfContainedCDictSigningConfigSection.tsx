import { useCallback, useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { useAuth } from '../../hooks/useAuth';
import { isSuperAdmin } from '../../utils/rbac';
import { useNotification } from '../Notification';
import CDictSigningConfigSection from './CDictSigningConfigSection';
import { CDICT_SIGNING_API, authFetch, getAuthHeaders } from './api';
import type { CDictSigningConfigSetting } from './types';

interface SelfContainedCDictSigningConfigSectionProps {
  prefersReducedMotion?: boolean | null;
}

type SigningMode = CDictSigningConfigSetting['mode'];

export default function SelfContainedCDictSigningConfigSection({
  prefersReducedMotion: reducedMotionProp,
}: SelfContainedCDictSigningConfigSectionProps) {
  const prefersReducedMotion = useReducedMotion() ?? reducedMotionProp;
  const { setNotification } = useNotification();
  const { user } = useAuth();
  const canWrite = isSuperAdmin(user?.role);
  const [isOpen, setIsOpen] = useState(false);
  const fetchedRef = useRef(false);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [modeInput, setModeInput] = useState<SigningMode>('soft');
  const [appSignSecretInput, setAppSignSecretInput] = useState('');
  const [appSignSecretPrevInput, setAppSignSecretPrevInput] = useState('');
  const [maxDriftMsInput, setMaxDriftMsInput] = useState('300000');
  const [clearPreviousSecret, setClearPreviousSecret] = useState(false);
  const [currentAppSignSecret, setCurrentAppSignSecret] = useState('');
  const [currentAppSignSecretPrev, setCurrentAppSignSecretPrev] = useState('');
  const [updatedAt, setUpdatedAt] = useState<string | undefined>();

  const fetchConfig = useCallback(async () => {
    setLoading(true);
    try {
      const response = await authFetch(CDICT_SIGNING_API, { headers: { ...getAuthHeaders() } });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setNotification({ message: data.error || '获取 CDict 请求配置失败', type: 'error' });
        return;
      }

      const config = (data?.setting?.config || {}) as Partial<CDictSigningConfigSetting>;
      const mode = config.mode && ['off', 'soft', 'enforce'].includes(config.mode) ? config.mode : 'soft';
      const maxDriftMs = Number(config.maxDriftMs);
      setModeInput(mode);
      setMaxDriftMsInput(Number.isFinite(maxDriftMs) ? String(maxDriftMs) : '300000');
      setAppSignSecretInput('');
      setAppSignSecretPrevInput('');
      setClearPreviousSecret(false);
      setCurrentAppSignSecret(config.hasAppSignSecret ? (config.appSignSecret || '已设置') : '未设置');
      setCurrentAppSignSecretPrev(config.hasAppSignSecretPrev ? (config.appSignSecretPrev || '已设置') : '未设置');
      setUpdatedAt(data?.setting?.updatedAt);
    } catch (error) {
      setNotification({
        message: '获取 CDict 请求配置失败：' + (error instanceof Error ? error.message : '未知错误'),
        type: 'error',
      });
    } finally {
      setLoading(false);
    }
  }, [setNotification]);

  useEffect(() => {
    if (isOpen && !fetchedRef.current) {
      fetchedRef.current = true;
      void fetchConfig();
    }
  }, [isOpen, fetchConfig]);

  const handleSave = useCallback(async () => {
    if (!canWrite || saving) return;

    const maxDriftMs = Number(maxDriftMsInput);
    if (!Number.isInteger(maxDriftMs) || maxDriftMs < 1000 || maxDriftMs > 86400000) {
      setNotification({ message: 'CDICT_SIG_MAX_DRIFT_MS 必须是 1000 到 86400000 之间的整数', type: 'error' });
      return;
    }
    if (appSignSecretInput.trim() && appSignSecretInput.trim().length < 32) {
      setNotification({ message: 'CDICT_APP_SIGN_SECRET 至少需要 32 个字符', type: 'error' });
      return;
    }
    if (!clearPreviousSecret && appSignSecretPrevInput.trim() && appSignSecretPrevInput.trim().length < 32) {
      setNotification({ message: 'CDICT_APP_SIGN_SECRET_PREV 至少需要 32 个字符', type: 'error' });
      return;
    }

    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        mode: modeInput,
        maxDriftMs,
        clearAppSignSecretPrev: clearPreviousSecret,
      };
      if (appSignSecretInput.trim()) payload.appSignSecret = appSignSecretInput.trim();
      if (!clearPreviousSecret && appSignSecretPrevInput.trim()) {
        payload.appSignSecretPrev = appSignSecretPrevInput.trim();
      }

      const response = await authFetch(CDICT_SIGNING_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setNotification({ message: data.error || '保存失败', type: 'error' });
        return;
      }

      setNotification({ message: 'CDict 请求配置已保存', type: 'success' });
      await fetchConfig();
    } catch (error) {
      setNotification({ message: '保存失败：' + (error instanceof Error ? error.message : '未知错误'), type: 'error' });
    } finally {
      setSaving(false);
    }
  }, [
    appSignSecretInput,
    appSignSecretPrevInput,
    canWrite,
    clearPreviousSecret,
    fetchConfig,
    maxDriftMsInput,
    modeInput,
    saving,
    setNotification,
  ]);

  const handleReset = useCallback(async () => {
    if (!canWrite || deleting) return;
    if (!window.confirm('确定删除后台覆盖并恢复 CDict 请求配置的部署环境默认值？')) return;

    setDeleting(true);
    try {
      const response = await authFetch(CDICT_SIGNING_API, {
        method: 'DELETE',
        headers: { ...getAuthHeaders() },
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setNotification({ message: data.error || '重置失败', type: 'error' });
        return;
      }

      setNotification({ message: '已恢复部署环境默认值', type: 'success' });
      await fetchConfig();
    } catch (error) {
      setNotification({ message: '重置失败：' + (error instanceof Error ? error.message : '未知错误'), type: 'error' });
    } finally {
      setDeleting(false);
    }
  }, [canWrite, deleting, fetchConfig, setNotification]);

  return (
    <CDictSigningConfigSection
      isOpen={isOpen}
      onToggle={() => setIsOpen((value) => !value)}
      prefersReducedMotion={prefersReducedMotion}
      loading={loading}
      saving={saving}
      deleting={deleting}
      disabled={!canWrite}
      modeInput={modeInput}
      appSignSecretInput={appSignSecretInput}
      appSignSecretPrevInput={appSignSecretPrevInput}
      maxDriftMsInput={maxDriftMsInput}
      clearPreviousSecret={clearPreviousSecret}
      currentAppSignSecret={currentAppSignSecret}
      currentAppSignSecretPrev={currentAppSignSecretPrev}
      updatedAt={updatedAt}
      onModeInputChange={setModeInput}
      onAppSignSecretInputChange={setAppSignSecretInput}
      onAppSignSecretPrevInputChange={setAppSignSecretPrevInput}
      onMaxDriftMsInputChange={setMaxDriftMsInput}
      onClearPreviousSecretChange={setClearPreviousSecret}
      onRefresh={() => void fetchConfig()}
      onSave={() => void handleSave()}
      onReset={() => void handleReset()}
    />
  );
}
