import { useCallback, useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { useNotification } from '../Notification';
import OutemailSettingsSection from './OutemailSettingsSection';
import { OUTEMAIL_API, getAuthHeaders, authFetch } from './api';
import type { OutemailSettingItem } from './types';

interface SelfContainedOutemailSettingsSectionProps {
  prefersReducedMotion?: boolean | null;
}

export default function SelfContainedOutemailSettingsSection({ prefersReducedMotion: reducedMotionProp }: SelfContainedOutemailSettingsSectionProps) {
  const prefersReducedMotion = useReducedMotion() ?? reducedMotionProp;
  const { setNotification } = useNotification();
  const [isOpen, setIsOpen] = useState(false);
  const fetchedRef = useRef(false);

  const [settings, setSettings] = useState<OutemailSettingItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingDomain, setDeletingDomain] = useState<string | null>(null);
  const [domain, setDomain] = useState('');
  const [code, setCode] = useState('');
  const [apiKey, setApiKey] = useState('');

  const fetchSettings = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authFetch(OUTEMAIL_API, { headers: { ...getAuthHeaders() } });
      const data = await res.json();
      if (!res.ok) { setNotification({ message: data.error || '获取对外邮件设置失败', type: 'error' }); return; }
      setSettings(data?.success && Array.isArray(data.settings) ? data.settings : []);
    } catch (e) {
      setNotification({ message: '获取对外邮件设置失败：' + (e instanceof Error ? e.message : '未知错误'), type: 'error' });
    } finally { setLoading(false); }
  }, [setNotification]);

  useEffect(() => {
    if (isOpen && !fetchedRef.current) { fetchedRef.current = true; fetchSettings(); }
  }, [isOpen, fetchSettings]);

  const handleSave = useCallback(async () => {
    if (saving) return;
    const d = domain.trim(), c = code.trim(), ak = apiKey.trim();
    if (!c && !ak) { setNotification({ message: '请填写校验码或外部 API Key', type: 'error' }); return; }
    setSaving(true);
    try {
      const res = await authFetch(OUTEMAIL_API, { method: 'POST', headers: { 'Content-Type': 'application/json', ...getAuthHeaders() }, body: JSON.stringify({ domain: d, code: c, apiKey: ak }) });
      const data = await res.json();
      if (!res.ok || !data.success) { setNotification({ message: data.error || '保存失败', type: 'error' }); return; }
      setNotification({ message: '保存成功', type: 'success' });
      setCode(''); setApiKey('');
      await fetchSettings();
    } catch (e) { setNotification({ message: '保存失败：' + (e instanceof Error ? e.message : '未知错误'), type: 'error' }); }
    finally { setSaving(false); }
  }, [saving, domain, code, apiKey, fetchSettings, setNotification]);

  const handleDelete = useCallback(async (delDomain: string) => {
    if (deletingDomain) return;
    if (!window.confirm(`确定删除 OutEmail 域名配置「${delDomain}」？`)) return;
    setDeletingDomain(delDomain);
    try {
      const res = await authFetch(OUTEMAIL_API, { method: 'DELETE', headers: { 'Content-Type': 'application/json', ...getAuthHeaders() }, body: JSON.stringify({ domain: delDomain }) });
      const data = await res.json();
      if (!res.ok || !data.success) { setNotification({ message: data.error || '删除失败', type: 'error' }); return; }
      setNotification({ message: '删除成功', type: 'success' });
      await fetchSettings();
    } catch (e) { setNotification({ message: '删除失败：' + (e instanceof Error ? e.message : '未知错误'), type: 'error' }); }
    finally { setDeletingDomain(null); }
  }, [deletingDomain, fetchSettings, setNotification]);

  return (
    <OutemailSettingsSection
      isOpen={isOpen} onToggle={() => setIsOpen((v) => !v)} prefersReducedMotion={prefersReducedMotion}
      loading={loading} saving={saving} deletingDomain={deletingDomain}
      domain={domain} code={code} apiKey={apiKey} settings={settings}
      onDomainChange={setDomain} onCodeChange={setCode} onApiKeyChange={setApiKey}
      onRefresh={fetchSettings} onSave={handleSave} onDelete={handleDelete}
    />
  );
}