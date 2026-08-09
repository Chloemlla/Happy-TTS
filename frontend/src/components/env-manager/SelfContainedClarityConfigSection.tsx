import { useCallback, useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { useNotification } from '../Notification';
import { useAuth } from '../../hooks/useAuth';
import { isSuperAdmin } from '../../utils/rbac';
import ClarityConfigSection from './ClarityConfigSection';
import { CLARITY_CONFIG_API, getAuthHeaders, authFetch } from './api';
import type { ClarityConfigSetting } from './types';

interface SelfContainedClarityConfigSectionProps {
  prefersReducedMotion?: boolean | null;
}

export default function SelfContainedClarityConfigSection({ prefersReducedMotion: reducedMotionProp }: SelfContainedClarityConfigSectionProps) {
  const prefersReducedMotion = useReducedMotion() ?? reducedMotionProp;
  const { setNotification } = useNotification();
  const { user } = useAuth();
  const canWrite = isSuperAdmin(user?.role);
  const [isOpen, setIsOpen] = useState(false);
  const fetchedRef = useRef(false);

  const [config, setConfig] = useState<ClarityConfigSetting | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [projectIdInput, setProjectIdInput] = useState('');

  const fetchConfig = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authFetch(CLARITY_CONFIG_API, { headers: { ...getAuthHeaders() } });
      const data = await res.json();
      if (!res.ok) {
        if (res.status !== 404) setNotification({ message: data.error || '获取Clarity配置失败', type: 'error' });
        return;
      }
      setConfig({ enabled: data.enabled || false, projectId: data.projectId || null, updatedAt: data.updatedAt });
    } catch (e) {
      setNotification({ message: '获取Clarity配置失败：' + (e instanceof Error ? e.message : '未知错误'), type: 'error' });
    } finally { setLoading(false); }
  }, [setNotification]);

  useEffect(() => {
    if (isOpen && !fetchedRef.current) { fetchedRef.current = true; fetchConfig(); }
  }, [isOpen, fetchConfig]);

  const handleSave = useCallback(async () => {
    if (!canWrite) return;
    if (saving) return;
    const value = projectIdInput.trim().toLowerCase();
    if (!value) { setNotification({ message: '请填写 Clarity Project ID', type: 'error' }); return; }
    const clarityIdPattern = /^[a-z0-9]{10}$/;
    if (!clarityIdPattern.test(value)) { setNotification({ message: 'Project ID 格式无效，应为10位小写字母数字组合', type: 'error' }); return; }
    setSaving(true);
    try {
      const res = await authFetch(CLARITY_CONFIG_API, { method: 'POST', headers: { 'Content-Type': 'application/json', ...getAuthHeaders() }, body: JSON.stringify({ projectId: value }) });
      const data = await res.json();
      if (!res.ok || !data.success) { setNotification({ message: (data.error || data.message || '保存失败') + (data.code ? ` (${data.code})` : ''), type: 'error' }); return; }
      setNotification({ message: '保存成功', type: 'success' });
      setProjectIdInput('');
      await fetchConfig();
    } catch (e) { setNotification({ message: '保存失败：' + (e instanceof Error ? e.message : '未知错误'), type: 'error' }); }
    finally { setSaving(false); }
  }, [canWrite, saving, projectIdInput, fetchConfig, setNotification]);

  const handleDelete = useCallback(async () => {
    if (!canWrite) return;
    if (deleting) return;
    if (!window.confirm('确定删除 Microsoft Clarity 配置？')) return;
    setDeleting(true);
    try {
      const res = await authFetch(CLARITY_CONFIG_API, { method: 'DELETE', headers: { 'Content-Type': 'application/json', ...getAuthHeaders() } });
      const data = await res.json();
      if (!res.ok || !data.success) { setNotification({ message: (data.error || data.message || '删除失败') + (data.code ? ` (${data.code})` : ''), type: 'error' }); return; }
      setNotification({ message: '删除成功', type: 'success' });
      await fetchConfig();
    } catch (e) { setNotification({ message: '删除失败：' + (e instanceof Error ? e.message : '未知错误'), type: 'error' }); }
    finally { setDeleting(false); }
  }, [canWrite, deleting, fetchConfig, setNotification]);

  return (
    <ClarityConfigSection
      isOpen={isOpen} onToggle={() => setIsOpen((v) => !v)} prefersReducedMotion={prefersReducedMotion}
      loading={loading} saving={saving} deleting={deleting} config={config} disabled={!canWrite}
      projectIdInput={projectIdInput} onProjectIdChange={setProjectIdInput}
      onRefresh={fetchConfig} onSave={handleSave} onDelete={handleDelete}
    />
  );
}