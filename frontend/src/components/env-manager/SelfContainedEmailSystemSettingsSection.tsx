import { useCallback, useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { useNotification } from '../Notification';
import { useAuth } from '../../hooks/useAuth';
import { isSuperAdmin } from '../../utils/rbac';
import EmailSystemSettingsSection from './EmailSystemSettingsSection';
import { EMAIL_SYSTEM_API, getAuthHeaders, authFetch } from './api';
import type { EmailSystemConfigItem } from './types';

interface SelfContainedEmailSystemSettingsSectionProps {
  prefersReducedMotion?: boolean | null;
}

export default function SelfContainedEmailSystemSettingsSection({ prefersReducedMotion: reducedMotionProp }: SelfContainedEmailSystemSettingsSectionProps) {
  const prefersReducedMotion = useReducedMotion() ?? reducedMotionProp;
  const { setNotification } = useNotification();
  const { user } = useAuth();
  const canWrite = isSuperAdmin(user?.role);
  const [isOpen, setIsOpen] = useState(false);
  const fetchedRef = useRef(false);

  const [config, setConfig] = useState<EmailSystemConfigItem | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const fetchConfig = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authFetch(EMAIL_SYSTEM_API, { headers: { ...getAuthHeaders() } });
      const data = await res.json();
      if (!res.ok) { setNotification({ message: data.error || '获取邮件系统配置失败', type: 'error' }); return; }
      if (data?.success && data?.setting?.config) setConfig({ ...data.setting.config, updatedAt: data.setting.updatedAt });
      else setConfig(null);
    } catch (e) {
      setNotification({ message: '获取邮件系统配置失败：' + (e instanceof Error ? e.message : '未知错误'), type: 'error' });
    } finally { setLoading(false); }
  }, [setNotification]);

  useEffect(() => {
    if (isOpen && !fetchedRef.current) { fetchedRef.current = true; fetchConfig(); }
  }, [isOpen, fetchConfig]);

  const handleSave = useCallback(async (cfg: Partial<EmailSystemConfigItem>) => {
    if (!canWrite) return;
    if (saving) return;
    setSaving(true);
    try {
      const res = await authFetch(EMAIL_SYSTEM_API, { method: 'POST', headers: { 'Content-Type': 'application/json', ...getAuthHeaders() }, body: JSON.stringify(cfg) });
      const data = await res.json();
      if (!res.ok || !data.success) { setNotification({ message: data.error || '保存邮件系统配置失败', type: 'error' }); return; }
      setNotification({ message: '保存成功', type: 'success' });
      await fetchConfig();
    } catch (e) { setNotification({ message: '保存失败：' + (e instanceof Error ? e.message : '未知错误'), type: 'error' }); }
    finally { setSaving(false); }
  }, [canWrite, saving, fetchConfig, setNotification]);

  const handleDelete = useCallback(async () => {
    if (!canWrite) return;
    if (deleting) return;
    if (!window.confirm('确定重置邮件系统配置为默认值？')) return;
    setDeleting(true);
    try {
      const res = await authFetch(EMAIL_SYSTEM_API, { method: 'DELETE', headers: { ...getAuthHeaders() } });
      const data = await res.json();
      if (!res.ok || !data.success) { setNotification({ message: data.error || '重置失败', type: 'error' }); return; }
      setNotification({ message: '重置成功', type: 'success' });
      await fetchConfig();
    } catch (e) { setNotification({ message: '重置失败：' + (e instanceof Error ? e.message : '未知错误'), type: 'error' }); }
    finally { setDeleting(false); }
  }, [canWrite, deleting, fetchConfig, setNotification]);

  return (
    <EmailSystemSettingsSection
      isOpen={isOpen} onToggle={() => setIsOpen((v) => !v)} prefersReducedMotion={prefersReducedMotion}
      loading={loading} saving={saving} deleting={deleting} config={config} disabled={!canWrite}
      onRefresh={fetchConfig} onSave={handleSave} onDelete={handleDelete}
    />
  );
}