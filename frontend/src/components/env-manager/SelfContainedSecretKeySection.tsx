import { useCallback, useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { useNotification } from '../Notification';
import SecretKeySection from './SecretKeySection';
import { authFetch, getAuthHeaders } from './api';
import { signedFetch } from '../../utils/requestSigner';

interface SelfContainedSecretKeySectionProps {
  title: string;
  description: string;
  sectionKey: string;
  inputLabel: string;
  inputPlaceholder: string;
  currentLabel?: string;
  apiUrl: string;
  useSignedRequest?: boolean;
  prefersReducedMotion?: boolean | null;
  extraField?: {
    label: string;
    placeholder: string;
  };
}

export default function SelfContainedSecretKeySection({
  title, description, sectionKey, inputLabel, inputPlaceholder, currentLabel, apiUrl, useSignedRequest, prefersReducedMotion: reducedMotionProp, extraField,
}: SelfContainedSecretKeySectionProps) {
  const prefersReducedMotion = useReducedMotion() ?? reducedMotionProp;
  const { setNotification } = useNotification();
  const [isOpen, setIsOpen] = useState(false);
  const fetchedRef = useRef(false);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [extraFieldValue, setExtraFieldValue] = useState('');
  const [currentValue, setCurrentValue] = useState<string | undefined>();
  const [updatedAt, setUpdatedAt] = useState<string | undefined>();

  const doFetch = useCallback(async () => {
    setLoading(true);
    try {
      const key = extraField ? (extraFieldValue.trim().toUpperCase() || 'DEFAULT') : undefined;
      const url = key ? `${apiUrl}?key=${encodeURIComponent(key)}` : apiUrl;
      const res = await authFetch(url, { headers: { ...getAuthHeaders() } });
      const data = await res.json();
      if (!res.ok || !data.success) { setNotification({ message: data.error || '获取失败', type: 'error' }); return; }
      if (extraField) {
        setCurrentValue(`${data.key || 'DEFAULT'} / ${data.secret || '未设置'}`);
      } else {
        setCurrentValue(data.aesKey ?? undefined);
      }
      setUpdatedAt(data.updatedAt);
    } catch (e) {
      setNotification({ message: '获取失败：' + (e instanceof Error ? e.message : '未知错误'), type: 'error' });
    } finally { setLoading(false); }
  }, [apiUrl, extraField, extraFieldValue, setNotification]);

  useEffect(() => {
    if (isOpen && !fetchedRef.current) { fetchedRef.current = true; doFetch(); }
  }, [isOpen, doFetch]);

  const handleSave = useCallback(async () => {
    if (saving) return;
    const value = inputValue.trim();
    if (!value) { setNotification({ message: `请填写${inputLabel}`, type: 'error' }); return; }
    setSaving(true);
    try {
      const body = extraField
        ? { key: extraFieldValue.trim().toUpperCase() || 'DEFAULT', secret: value }
        : { value };
      const fetchFn = useSignedRequest ? signedFetch : authFetch;
      const res = await fetchFn(apiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json', ...getAuthHeaders() }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok || !data.success) { setNotification({ message: data.error || '保存失败', type: 'error' }); return; }
      setNotification({ message: '保存成功', type: 'success' });
      setInputValue(''); await doFetch();
    } catch (e) { setNotification({ message: '保存失败：' + (e instanceof Error ? e.message : '未知错误'), type: 'error' }); }
    finally { setSaving(false); }
  }, [saving, inputValue, inputLabel, apiUrl, useSignedRequest, extraField, extraFieldValue, doFetch, setNotification]);

  const handleDelete = useCallback(async () => {
    if (deleting) return;
    if (!window.confirm('确定删除此配置？')) return;
    setDeleting(true);
    try {
      const fetchFn = useSignedRequest ? signedFetch : authFetch;
      const body = extraField ? { key: extraFieldValue.trim().toUpperCase() || 'DEFAULT' } : undefined;
      const res = await fetchFn(apiUrl, { method: 'DELETE', headers: { 'Content-Type': 'application/json', ...getAuthHeaders() }, ...(body ? { body: JSON.stringify(body) } : {}) });
      const data = await res.json();
      if (!res.ok || !data.success) { setNotification({ message: data.error || '删除失败', type: 'error' }); return; }
      setNotification({ message: '删除成功', type: 'success' });
      await doFetch();
    } catch (e) { setNotification({ message: '删除失败：' + (e instanceof Error ? e.message : '未知错误'), type: 'error' }); }
    finally { setDeleting(false); }
  }, [deleting, apiUrl, useSignedRequest, extraField, extraFieldValue, doFetch, setNotification]);

  return (
    <SecretKeySection
      title={title} description={description} sectionKey={sectionKey}
      isOpen={isOpen} onToggle={() => setIsOpen((v) => !v)} prefersReducedMotion={prefersReducedMotion}
      loading={loading} saving={saving} deleting={deleting}
      inputLabel={inputLabel} inputValue={inputValue} inputPlaceholder={inputPlaceholder}
      currentLabel={currentLabel} currentValue={currentValue} updatedAt={updatedAt}
      onInputChange={setInputValue} onRefresh={doFetch} onSave={handleSave} onDelete={handleDelete}
      {...(extraField ? { extraField: { label: extraField.label, value: extraFieldValue, placeholder: extraField.placeholder, onChange: (v: string) => setExtraFieldValue(v) } } : {})}
    />
  );
}