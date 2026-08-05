import { useCallback, useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { useNotification } from '../Notification';
import CodeSettingSection from './CodeSettingSection';
import { authFetch, getAuthHeaders } from './api';

interface SelfContainedCodeSettingSectionProps {
  title: string;
  description: string;
  sectionKey: string;
  apiUrl: string;
  inputLabel: string;
  inputPlaceholder: string;
  prefersReducedMotion?: boolean | null;
}

export default function SelfContainedCodeSettingSection({
  title, description, sectionKey, apiUrl, inputLabel, inputPlaceholder, prefersReducedMotion: reducedMotionProp,
}: SelfContainedCodeSettingSectionProps) {
  const prefersReducedMotion = useReducedMotion() ?? reducedMotionProp;
  const { setNotification } = useNotification();
  const [isOpen, setIsOpen] = useState(false);
  const fetchedRef = useRef(false);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [currentValue, setCurrentValue] = useState<string | undefined>();
  const [updatedAt, setUpdatedAt] = useState<string | undefined>();

  const fetchSetting = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authFetch(apiUrl, { headers: { ...getAuthHeaders() } });
      const data = await res.json();
      if (!res.ok) { setNotification({ message: data.error || '获取设置失败', type: 'error' }); return; }
      if (data?.success) { setCurrentValue(data.setting?.code); setUpdatedAt(data.setting?.updatedAt); }
      else setCurrentValue(undefined);
    } catch (e) {
      setNotification({ message: '获取设置失败：' + (e instanceof Error ? e.message : '未知错误'), type: 'error' });
    } finally { setLoading(false); }
  }, [apiUrl, setNotification]);

  useEffect(() => {
    if (isOpen && !fetchedRef.current) { fetchedRef.current = true; fetchSetting(); }
  }, [isOpen, fetchSetting]);

  const handleSave = useCallback(async () => {
    if (saving) return;
    const code = inputValue.trim();
    if (!code) { setNotification({ message: `请填写${inputLabel}`, type: 'error' }); return; }
    setSaving(true);
    try {
      const res = await authFetch(apiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json', ...getAuthHeaders() }, body: JSON.stringify({ code }) });
      const data = await res.json();
      if (!res.ok || !data.success) { setNotification({ message: data.error || '保存失败', type: 'error' }); return; }
      setNotification({ message: '保存成功', type: 'success' });
      setInputValue(''); await fetchSetting();
    } catch (e) { setNotification({ message: '保存失败：' + (e instanceof Error ? e.message : '未知错误'), type: 'error' }); }
    finally { setSaving(false); }
  }, [saving, inputValue, apiUrl, inputLabel, fetchSetting, setNotification]);

  const handleDelete = useCallback(async () => {
    if (deleting) return;
    if (!window.confirm(`确定删除当前${inputLabel}配置？`)) return;
    setDeleting(true);
    try {
      const res = await authFetch(apiUrl, { method: 'DELETE', headers: { 'Content-Type': 'application/json', ...getAuthHeaders() } });
      const data = await res.json();
      if (!res.ok || !data.success) { setNotification({ message: data.error || '删除失败', type: 'error' }); return; }
      setNotification({ message: '删除成功', type: 'success' });
      await fetchSetting();
    } catch (e) { setNotification({ message: '删除失败：' + (e instanceof Error ? e.message : '未知错误'), type: 'error' }); }
    finally { setDeleting(false); }
  }, [deleting, apiUrl, inputLabel, fetchSetting, setNotification]);

  return (
    <CodeSettingSection
      title={title} description={description} sectionKey={sectionKey}
      isOpen={isOpen} onToggle={() => setIsOpen((v) => !v)} prefersReducedMotion={prefersReducedMotion}
      loading={loading} saving={saving} deleting={deleting}
      inputLabel={inputLabel} inputValue={inputValue} inputPlaceholder={inputPlaceholder}
      currentValue={currentValue} updatedAt={updatedAt}
      onInputChange={setInputValue} onRefresh={fetchSetting} onSave={handleSave} onDelete={handleDelete}
    />
  );
}