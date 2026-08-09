import { useCallback, useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { useNotification } from '../Notification';
import TurnstileConfigSection from './TurnstileConfigSection';
import { TURNSTILE_CONFIG_API, getAuthHeaders, authFetch } from './api';
import type { TurnstileConfigSetting } from './types';
import { useAuth } from '../../hooks/useAuth';
import { isSuperAdmin } from '../../utils/rbac';

interface SelfContainedTurnstileConfigSectionProps {
  prefersReducedMotion?: boolean | null;
}

export default function SelfContainedTurnstileConfigSection({ prefersReducedMotion: reducedMotionProp }: SelfContainedTurnstileConfigSectionProps) {
  const prefersReducedMotion = useReducedMotion() ?? reducedMotionProp;
  const { setNotification } = useNotification();
  const { user } = useAuth();
  const canWrite = isSuperAdmin(user?.role);
  const [isOpen, setIsOpen] = useState(false);
  const fetchedRef = useRef(false);

  const [config, setConfig] = useState<TurnstileConfigSetting | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [siteKeyInput, setSiteKeyInput] = useState('');
  const [secretKeyInput, setSecretKeyInput] = useState('');

  const fetchConfig = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authFetch(TURNSTILE_CONFIG_API, { headers: { ...getAuthHeaders() } });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 401) setNotification({ message: '登录状态已失效，请重新登录', type: 'error' });
        else setNotification({ message: data.error || '获取Turnstile配置失败', type: 'error' });
        return;
      }
      setConfig({ enabled: data.enabled || false, siteKey: data.siteKey || null, secretKey: data.secretKey || null, updatedAt: data.updatedAt });
    } catch (e) {
      setNotification({ message: '获取Turnstile配置失败：' + (e instanceof Error ? e.message : '未知错误'), type: 'error' });
    } finally {
      setLoading(false);
    }
  }, [setNotification]);

  useEffect(() => {
    if (isOpen && !fetchedRef.current) { fetchedRef.current = true; fetchConfig(); }
  }, [isOpen, fetchConfig]);

  const handleSave = useCallback(async (key: 'TURNSTILE_SECRET_KEY' | 'TURNSTILE_SITE_KEY') => {
    if (!canWrite) return;
    if (saving) return;
    const value = key === 'TURNSTILE_SECRET_KEY' ? secretKeyInput.trim() : siteKeyInput.trim();
    if (!value) { setNotification({ message: `请填写${key === 'TURNSTILE_SECRET_KEY' ? 'Secret Key' : 'Site Key'}`, type: 'error' }); return; }
    setSaving(true);
    try {
      const res = await authFetch(TURNSTILE_CONFIG_API, { method: 'POST', headers: { 'Content-Type': 'application/json', ...getAuthHeaders() }, body: JSON.stringify({ key, value }) });
      const data = await res.json();
      if (!res.ok || !data.success) { setNotification({ message: data.error || '保存失败', type: 'error' }); return; }
      setNotification({ message: '保存成功', type: 'success' });
      if (key === 'TURNSTILE_SECRET_KEY') setSecretKeyInput(''); else setSiteKeyInput('');
      await fetchConfig();
    } catch (e) { setNotification({ message: '保存失败：' + (e instanceof Error ? e.message : '未知错误'), type: 'error' }); }
    finally { setSaving(false); }
  }, [canWrite, saving, secretKeyInput, siteKeyInput, fetchConfig, setNotification]);

  const handleDelete = useCallback(async (key: 'TURNSTILE_SECRET_KEY' | 'TURNSTILE_SITE_KEY') => {
    if (!canWrite) return;
    if (deleting) return;
    if (!window.confirm(`确定删除 Turnstile 配置「${key}」？`)) return;
    setDeleting(true);
    try {
      const res = await authFetch(`${TURNSTILE_CONFIG_API}/${key}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json', ...getAuthHeaders() } });
      const data = await res.json();
      if (!res.ok || !data.success) { setNotification({ message: data.error || '删除失败', type: 'error' }); return; }
      setNotification({ message: '删除成功', type: 'success' });
      await fetchConfig();
    } catch (e) { setNotification({ message: '删除失败：' + (e instanceof Error ? e.message : '未知错误'), type: 'error' }); }
    finally { setDeleting(false); }
  }, [canWrite, deleting, fetchConfig, setNotification]);

  return (
    <TurnstileConfigSection
      isOpen={isOpen} onToggle={() => setIsOpen((v) => !v)} prefersReducedMotion={prefersReducedMotion}
      loading={loading} saving={saving} deleting={deleting} disabled={!canWrite} config={config}
      siteKeyInput={siteKeyInput} secretKeyInput={secretKeyInput}
      onSiteKeyChange={setSiteKeyInput} onSecretKeyChange={setSecretKeyInput}
      onRefresh={fetchConfig} onSave={handleSave} onDelete={handleDelete}
    />
  );
}