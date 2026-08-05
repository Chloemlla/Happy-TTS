import { useCallback, useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { useNotification } from '../Notification';
import LibreChatProvidersSection from './LibreChatProvidersSection';
import { LIBRECHAT_PROVIDERS_API, getAuthHeaders, authFetch } from './api';
import type { ChatProviderItem } from './types';

interface SelfContainedLibreChatProvidersSectionProps {
  prefersReducedMotion?: boolean | null;
}

export default function SelfContainedLibreChatProvidersSection({ prefersReducedMotion: reducedMotionProp }: SelfContainedLibreChatProvidersSectionProps) {
  const prefersReducedMotion = useReducedMotion() ?? reducedMotionProp;
  const { setNotification } = useNotification();
  const [isOpen, setIsOpen] = useState(false);
  const fetchedRef = useRef(false);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [providers, setProviders] = useState<ChatProviderItem[]>([]);
  const [providerFilterGroup, setProviderFilterGroup] = useState('');
  const [providerId, setProviderId] = useState<string | null>(null);
  const [providerBaseUrl, setProviderBaseUrl] = useState('');
  const [providerApiKey, setProviderApiKey] = useState('');
  const [providerModel, setProviderModel] = useState('');
  const [providerGroup, setProviderGroup] = useState('');
  const [providerEnabled, setProviderEnabled] = useState(true);
  const [providerWeight, setProviderWeight] = useState(1);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth <= 768);
    check(); let timer: ReturnType<typeof setTimeout>;
    const debounced = () => { clearTimeout(timer); timer = setTimeout(check, 150); };
    window.addEventListener('resize', debounced);
    return () => { clearTimeout(timer); window.removeEventListener('resize', debounced); };
  }, []);

  const fetchProviders = useCallback(async () => {
    setLoading(true);
    try {
      const url = providerFilterGroup ? `${LIBRECHAT_PROVIDERS_API}?group=${encodeURIComponent(providerFilterGroup)}` : LIBRECHAT_PROVIDERS_API;
      const res = await authFetch(url, { headers: { ...getAuthHeaders() } });
      const data = await res.json();
      if (!res.ok || !data.success) { setNotification({ message: data.error || '获取提供者失败', type: 'error' }); return; }
      setProviders(Array.isArray(data.providers) ? data.providers : []);
    } catch (e) {
      setNotification({ message: '获取提供者失败：' + (e instanceof Error ? e.message : '未知错误'), type: 'error' });
    } finally { setLoading(false); }
  }, [providerFilterGroup, setNotification]);

  useEffect(() => {
    if (isOpen && !fetchedRef.current) { fetchedRef.current = true; fetchProviders(); }
  }, [isOpen, fetchProviders]);

  const resetForm = useCallback(() => {
    setProviderId(null); setProviderBaseUrl(''); setProviderApiKey(''); setProviderModel('');
    setProviderGroup(''); setProviderEnabled(true); setProviderWeight(1);
  }, []);

  const handleSave = useCallback(() => {
    if (saving) return;
    const baseUrl = providerBaseUrl.trim(), apiKey = providerApiKey.trim(), model = providerModel.trim(), group = providerGroup.trim();
    const enabled = !!providerEnabled, weight = Math.max(1, Math.min(10, Number(providerWeight || 1)));
    if (!baseUrl || !apiKey || !model) { setNotification({ message: '请填写 baseUrl / apiKey / model', type: 'error' }); return; }
    setSaving(true);
    (async () => {
      try {
        const body: Record<string, unknown> = { baseUrl, apiKey, model, group, enabled, weight };
        if (providerId) body.id = providerId;
        const res = await authFetch(LIBRECHAT_PROVIDERS_API, { method: 'POST', headers: { 'Content-Type': 'application/json', ...getAuthHeaders() }, body: JSON.stringify(body) });
        const data = await res.json();
        if (!res.ok || !data.success) { setNotification({ message: data.error || '保存失败', type: 'error' }); return; }
        setNotification({ message: '保存成功', type: 'success' });
        resetForm(); await fetchProviders();
      } catch (e) { setNotification({ message: '保存失败：' + (e instanceof Error ? e.message : '未知错误'), type: 'error' }); }
      finally { setSaving(false); }
    })();
  }, [saving, providerId, providerBaseUrl, providerApiKey, providerModel, providerGroup, providerEnabled, providerWeight, fetchProviders, resetForm, setNotification]);

  const handleDelete = useCallback(async (id: string) => {
    if (deletingId) return;
    if (!window.confirm(`确定删除 LibreChat 提供商「${id}」？`)) return;
    setDeletingId(id);
    try {
      const res = await authFetch(`${LIBRECHAT_PROVIDERS_API}/${id}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json', ...getAuthHeaders() } });
      const data = await res.json();
      if (!res.ok || !data.success) { setNotification({ message: data.error || '删除失败', type: 'error' }); return; }
      setNotification({ message: '删除成功', type: 'success' });
      await fetchProviders();
    } catch (e) { setNotification({ message: '删除失败：' + (e instanceof Error ? e.message : '未知错误'), type: 'error' }); }
    finally { setDeletingId(null); }
  }, [deletingId, fetchProviders, setNotification]);

  const handleEdit = useCallback((p: ChatProviderItem) => {
    setProviderId(p.id); setProviderBaseUrl(p.baseUrl); setProviderApiKey('');
    setProviderModel(p.model); setProviderGroup(p.group || '');
    setProviderEnabled(!!p.enabled); setProviderWeight(Number(p.weight || 1));
  }, []);

  return (
    <LibreChatProvidersSection
      isOpen={isOpen} onToggle={() => setIsOpen((v) => !v)} prefersReducedMotion={prefersReducedMotion} isMobile={isMobile}
      loading={loading} saving={saving} deletingId={deletingId}
      providers={providers} providerId={providerId} providerFilterGroup={providerFilterGroup}
      providerBaseUrl={providerBaseUrl} providerApiKey={providerApiKey} providerModel={providerModel}
      providerGroup={providerGroup} providerEnabled={providerEnabled} providerWeight={providerWeight}
      onFilterGroupChange={setProviderFilterGroup} onBaseUrlChange={setProviderBaseUrl} onApiKeyChange={setProviderApiKey}
      onModelChange={setProviderModel} onGroupChange={setProviderGroup} onEnabledChange={setProviderEnabled} onWeightChange={setProviderWeight}
      onRefresh={fetchProviders} onSave={handleSave} onReset={resetForm} onEdit={handleEdit} onDelete={handleDelete}
    />
  );
}