import { useCallback, useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { useNotification } from '../Notification';
import { useAuth } from '../../hooks/useAuth';
import { isSuperAdmin } from '../../utils/rbac';
import GoogleClientIdsSection from './GoogleClientIdsSection';
import { GOOGLE_AUTH_API, NEXAI_SETTING_API, GOOGLE_WEB_CLIENT_ID_PATTERN, getAuthHeaders, authFetch } from './api';

interface SelfContainedGoogleClientIdsSectionProps {
  prefersReducedMotion?: boolean | null;
}

export default function SelfContainedGoogleClientIdsSection({ prefersReducedMotion: reducedMotionProp }: SelfContainedGoogleClientIdsSectionProps) {
  const prefersReducedMotion = useReducedMotion() ?? reducedMotionProp;
  const { user } = useAuth();
  const canWrite = isSuperAdmin(user?.role);
  const { setNotification } = useNotification();
  const [isOpen, setIsOpen] = useState(false);
  const fetchedRef = useRef(false);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [googleClientIdInput, setGoogleClientIdInput] = useState('');
  const [nexaiGoogleClientIdInput, setNexaiGoogleClientIdInput] = useState('');
  const [googleClientIdCurrent, setGoogleClientIdCurrent] = useState('');
  const [nexaiGoogleClientIdCurrent, setNexaiGoogleClientIdCurrent] = useState('');
  const [updatedAt, setUpdatedAt] = useState<string | undefined>();

  const fetchConfig = useCallback(async () => {
    setLoading(true);
    try {
      const [googleRes, nexaiRes] = await Promise.all([
        authFetch(GOOGLE_AUTH_API, { headers: { ...getAuthHeaders() } }),
        authFetch(NEXAI_SETTING_API, { headers: { ...getAuthHeaders() } }),
      ]);
      let gId = '', nId = '', ua: string | undefined;
      if (googleRes.ok) { const d = await googleRes.json(); gId = String(d?.setting?.config?.clientId || '').trim(); ua = d?.setting?.updatedAt || ua; }
      else { const d = await googleRes.json().catch(() => ({})); setNotification({ message: d.error || '获取 GOOGLE_CLIENT_ID 失败', type: 'error' }); }
      if (nexaiRes.ok) { const d = await nexaiRes.json(); nId = String(d?.setting?.config?.google?.clientId || '').trim(); ua = d?.setting?.updatedAt || ua; }
      else { const d = await nexaiRes.json().catch(() => ({})); setNotification({ message: d.error || '获取 NEXAI_GOOGLE_CLIENT_ID 失败', type: 'error' }); }
      setGoogleClientIdCurrent(gId); setNexaiGoogleClientIdCurrent(nId);
      setGoogleClientIdInput(gId); setNexaiGoogleClientIdInput(nId);
      setUpdatedAt(ua);
    } catch (e) {
      setNotification({ message: '获取 Google Client ID 失败：' + (e instanceof Error ? e.message : '未知错误'), type: 'error' });
    } finally { setLoading(false); }
  }, [setNotification]);

  useEffect(() => {
    if (isOpen && !fetchedRef.current) { fetchedRef.current = true; fetchConfig(); }
  }, [isOpen, fetchConfig]);

  const handleSave = useCallback(async () => {
    if (!canWrite) return;
    if (saving) return;
    const gId = googleClientIdInput.trim(), nId = nexaiGoogleClientIdInput.trim();
    if (gId && !GOOGLE_WEB_CLIENT_ID_PATTERN.test(gId)) { setNotification({ message: 'GOOGLE_CLIENT_ID 格式无效', type: 'error' }); return; }
    if (nId && !GOOGLE_WEB_CLIENT_ID_PATTERN.test(nId)) { setNotification({ message: 'NEXAI_GOOGLE_CLIENT_ID 格式无效', type: 'error' }); return; }
    setSaving(true);
    try {
      const googleTask = gId ? authFetch(GOOGLE_AUTH_API, { method: 'POST', headers: { 'Content-Type': 'application/json', ...getAuthHeaders() }, body: JSON.stringify({ clientId: gId }) }) : authFetch(GOOGLE_AUTH_API, { method: 'DELETE', headers: { ...getAuthHeaders() } });
      const nexaiGetRes = await authFetch(NEXAI_SETTING_API, { headers: { ...getAuthHeaders() } });
      let nexaiPayload: Record<string, unknown> = { google: { clientId: nId } };
      if (nexaiGetRes.ok) { const nd = await nexaiGetRes.json(); const cfg = nd?.setting?.config || {}; nexaiPayload = { jwtExpiresIn: cfg.jwtExpiresIn, refreshExpiresIn: cfg.refreshExpiresIn, frontendUrl: cfg.frontendUrl, google: { clientId: nId }, github: { clientId: cfg.github?.clientId || '' } }; }
      const nexaiTask = authFetch(NEXAI_SETTING_API, { method: 'POST', headers: { 'Content-Type': 'application/json', ...getAuthHeaders() }, body: JSON.stringify(nexaiPayload) });
      const results = await Promise.all([googleTask, nexaiTask]);
      for (const res of results) { if (!res.ok) { const d = await res.json().catch(() => ({})); setNotification({ message: d.error || '保存失败', type: 'error' }); return; } }
      setNotification({ message: 'Google Client ID 已保存并立即生效', type: 'success' });
      await fetchConfig();
    } catch (e) { setNotification({ message: '保存失败：' + (e instanceof Error ? e.message : '未知错误'), type: 'error' }); }
    finally { setSaving(false); }
  }, [canWrite, saving, googleClientIdInput, nexaiGoogleClientIdInput, fetchConfig, setNotification]);

  const handleReset = useCallback(async () => {
    if (!canWrite) return;
    if (deleting) return;
    if (!window.confirm('确定重置 Google Client ID 配置？')) return;
    setDeleting(true);
    try {
      const nexaiRes = await authFetch(NEXAI_SETTING_API, { headers: { ...getAuthHeaders() } });
      let nexaiPayload: Record<string, unknown> = { google: { clientId: '' } };
      if (nexaiRes.ok) { const nd = await nexaiRes.json(); const cfg = nd?.setting?.config || {}; nexaiPayload = { jwtExpiresIn: cfg.jwtExpiresIn, refreshExpiresIn: cfg.refreshExpiresIn, frontendUrl: cfg.frontendUrl, google: { clientId: '' }, github: { clientId: cfg.github?.clientId || '' } }; }
      const [gDelRes, nSaveRes] = await Promise.all([
        authFetch(GOOGLE_AUTH_API, { method: 'DELETE', headers: { ...getAuthHeaders() } }),
        authFetch(NEXAI_SETTING_API, { method: 'POST', headers: { 'Content-Type': 'application/json', ...getAuthHeaders() }, body: JSON.stringify(nexaiPayload) }),
      ]);
      if (!gDelRes.ok) { const d = await gDelRes.json().catch(() => ({})); setNotification({ message: d.error || '重置失败', type: 'error' }); return; }
      if (!nSaveRes.ok) { const d = await nSaveRes.json().catch(() => ({})); setNotification({ message: d.error || '重置 NEXAI_GOOGLE_CLIENT_ID 失败', type: 'error' }); return; }
      setNotification({ message: 'Google Client ID 已重置', type: 'success' });
      setGoogleClientIdInput(''); setNexaiGoogleClientIdInput('');
      await fetchConfig();
    } catch (e) { setNotification({ message: '重置失败：' + (e instanceof Error ? e.message : '未知错误'), type: 'error' }); }
    finally { setDeleting(false); }
  }, [canWrite, deleting, fetchConfig, setNotification]);

  return (
    <GoogleClientIdsSection
      isOpen={isOpen} onToggle={() => setIsOpen((v) => !v)} prefersReducedMotion={prefersReducedMotion}
      disabled={!canWrite}
      loading={loading} saving={saving} deleting={deleting}
      googleClientIdInput={googleClientIdInput} nexaiGoogleClientIdInput={nexaiGoogleClientIdInput}
      googleClientIdCurrent={googleClientIdCurrent} nexaiGoogleClientIdCurrent={nexaiGoogleClientIdCurrent}
      updatedAt={updatedAt}
      onGoogleClientIdInputChange={setGoogleClientIdInput} onNexaiGoogleClientIdInputChange={setNexaiGoogleClientIdInput}
      onRefresh={fetchConfig} onSave={handleSave} onReset={handleReset}
    />
  );
}