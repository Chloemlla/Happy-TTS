import { useCallback, useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { useNotification } from '../Notification';
import NexaiSigningConfigSection from './NexaiSigningConfigSection';
import { NEXAI_SIGNING_API, getAuthHeaders, authFetch } from './api';

interface SelfContainedNexaiSigningConfigSectionProps {
  prefersReducedMotion?: boolean | null;
}

export default function SelfContainedNexaiSigningConfigSection({ prefersReducedMotion: reducedMotionProp }: SelfContainedNexaiSigningConfigSectionProps) {
  const prefersReducedMotion = useReducedMotion() ?? reducedMotionProp;
  const { setNotification } = useNotification();
  const [isOpen, setIsOpen] = useState(false);
  const fetchedRef = useRef(false);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [modeInput, setModeInput] = useState<'off' | 'soft' | 'enforce'>('soft');
  const [appSignSecretInput, setAppSignSecretInput] = useState('');
  const [appSignSecretPrevInput, setAppSignSecretPrevInput] = useState('');
  const [maxDriftMsInput, setMaxDriftMsInput] = useState('300000');
  const [currentAppSignSecret, setCurrentAppSignSecret] = useState('');
  const [currentAppSignSecretPrev, setCurrentAppSignSecretPrev] = useState('');
  const [updatedAt, setUpdatedAt] = useState<string | undefined>();

  const fetchConfig = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authFetch(NEXAI_SIGNING_API, { headers: { ...getAuthHeaders() } });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setNotification({ message: data.error || '获取 NexAI 请求签名配置失败', type: 'error' }); return; }
      const cfg = data?.setting?.config || {};
      const mode = ['off', 'soft', 'enforce'].includes(cfg.mode) ? cfg.mode : 'soft';
      const maxDrift = Number(cfg.maxDriftMs);
      setModeInput(mode);
      setMaxDriftMsInput(Number.isFinite(maxDrift) ? String(maxDrift) : '300000');
      setAppSignSecretInput(''); setAppSignSecretPrevInput('');
      setCurrentAppSignSecret(cfg.hasAppSignSecret ? (cfg.appSignSecret || '已设置') : '未设置');
      setCurrentAppSignSecretPrev(cfg.hasAppSignSecretPrev ? (cfg.appSignSecretPrev || '已设置') : '未设置');
      setUpdatedAt(data?.setting?.updatedAt);
    } catch (e) {
      setNotification({ message: '获取 NexAI 请求签名配置失败：' + (e instanceof Error ? e.message : '未知错误'), type: 'error' });
    } finally { setLoading(false); }
  }, [setNotification]);

  useEffect(() => {
    if (isOpen && !fetchedRef.current) { fetchedRef.current = true; fetchConfig(); }
  }, [isOpen, fetchConfig]);

  const handleSave = useCallback(async () => {
    if (saving) return;
    const maxDriftNum = Number(maxDriftMsInput);
    if (!Number.isFinite(maxDriftNum) || maxDriftNum < 1000) { setNotification({ message: 'NEXAI_SIG_MAX_DRIFT_MS 必须是一个不小于 1000 的数字', type: 'error' }); return; }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = { mode: modeInput, maxDriftMs: maxDriftNum };
      if (appSignSecretInput.trim()) payload.appSignSecret = appSignSecretInput.trim();
      if (appSignSecretPrevInput.trim()) payload.appSignSecretPrev = appSignSecretPrevInput.trim();
      const res = await authFetch(NEXAI_SIGNING_API, { method: 'POST', headers: { 'Content-Type': 'application/json', ...getAuthHeaders() }, body: JSON.stringify(payload) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setNotification({ message: data.error || '保存失败', type: 'error' }); return; }
      setNotification({ message: 'NexAI 请求签名配置已保存', type: 'success' });
      await fetchConfig();
    } catch (e) { setNotification({ message: '保存失败：' + (e instanceof Error ? e.message : '未知错误'), type: 'error' }); }
    finally { setSaving(false); }
  }, [saving, modeInput, appSignSecretInput, appSignSecretPrevInput, maxDriftMsInput, fetchConfig, setNotification]);

  const handleReset = useCallback(async () => {
    if (deleting) return;
    if (!window.confirm('确定重置 NexAI 请求签名配置为默认值？')) return;
    setDeleting(true);
    try {
      const res = await authFetch(NEXAI_SIGNING_API, { method: 'DELETE', headers: { ...getAuthHeaders() } });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setNotification({ message: data.error || '重置失败', type: 'error' }); return; }
      setNotification({ message: '已重置为默认配置', type: 'success' });
      await fetchConfig();
    } catch (e) { setNotification({ message: '重置失败：' + (e instanceof Error ? e.message : '未知错误'), type: 'error' }); }
    finally { setDeleting(false); }
  }, [deleting, fetchConfig, setNotification]);

  return (
    <NexaiSigningConfigSection
      isOpen={isOpen} onToggle={() => setIsOpen((v) => !v)} prefersReducedMotion={prefersReducedMotion}
      loading={loading} saving={saving} deleting={deleting}
      modeInput={modeInput} appSignSecretInput={appSignSecretInput} appSignSecretPrevInput={appSignSecretPrevInput} maxDriftMsInput={maxDriftMsInput}
      currentAppSignSecret={currentAppSignSecret} currentAppSignSecretPrev={currentAppSignSecretPrev} updatedAt={updatedAt}
      onModeInputChange={setModeInput} onAppSignSecretInputChange={setAppSignSecretInput} onAppSignSecretPrevInputChange={setAppSignSecretPrevInput} onMaxDriftMsInputChange={setMaxDriftMsInput}
      onRefresh={fetchConfig} onSave={handleSave} onReset={handleReset}
    />
  );
}