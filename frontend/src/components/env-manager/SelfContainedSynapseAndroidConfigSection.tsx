import { useCallback, useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { useAuth } from '../../hooks/useAuth';
import { isSuperAdmin } from '../../utils/rbac';
import { useNotification } from '../Notification';
import SynapseAndroidConfigSection from './SynapseAndroidConfigSection';
import { SYNAPSE_ANDROID_API, GOOGLE_WEB_CLIENT_ID_PATTERN, getAuthHeaders, authFetch } from './api';

interface SelfContainedSynapseAndroidConfigSectionProps {
  prefersReducedMotion?: boolean | null;
}

export default function SelfContainedSynapseAndroidConfigSection({ prefersReducedMotion: reducedMotionProp }: SelfContainedSynapseAndroidConfigSectionProps) {
  const prefersReducedMotion = useReducedMotion() ?? reducedMotionProp;
  const { setNotification } = useNotification();
  const { user } = useAuth();
  const canWrite = isSuperAdmin(user?.role);
  const [isOpen, setIsOpen] = useState(false);
  const fetchedRef = useRef(false);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [packageInput, setPackageInput] = useState('com.synapse.mobile');
  const [fingerprintsInput, setFingerprintsInput] = useState('');
  const [googleClientIdInput, setGoogleClientIdInput] = useState('');
  const [disabled, setDisabled] = useState(false);
  const [currentPackage, setCurrentPackage] = useState('');
  const [currentFingerprints, setCurrentFingerprints] = useState<string[]>([]);
  const [currentGoogleClientId, setCurrentGoogleClientId] = useState('');
  const [updatedAt, setUpdatedAt] = useState<string | undefined>();

  const fetchConfig = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authFetch(SYNAPSE_ANDROID_API, { headers: { ...getAuthHeaders() } });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setNotification({ message: data.error || '获取 Synapse Android 配置失败', type: 'error' }); return; }
      const cfg = data?.setting?.config || {};
      const pkg = String(cfg.packageName || 'com.synapse.mobile').trim() || 'com.synapse.mobile';
      const fps = Array.isArray(cfg.sha256CertFingerprints) ? cfg.sha256CertFingerprints.map((item: unknown) => String(item || '').trim()).filter(Boolean) : [];
      const gId = String(cfg.googleClientId || '').trim();
      setPackageInput(pkg); setFingerprintsInput(fps.join('\n')); setGoogleClientIdInput(gId);
      setDisabled(cfg.disabled === true);
      setCurrentPackage(pkg); setCurrentFingerprints(fps); setCurrentGoogleClientId(gId);
      setUpdatedAt(data?.setting?.updatedAt);
    } catch (e) {
      setNotification({ message: '获取 Synapse Android 配置失败：' + (e instanceof Error ? e.message : '未知错误'), type: 'error' });
    } finally { setLoading(false); }
  }, [setNotification]);

  useEffect(() => {
    if (isOpen && !fetchedRef.current) { fetchedRef.current = true; fetchConfig(); }
  }, [isOpen, fetchConfig]);

  const handleSave = useCallback(async () => {
    if (!canWrite) return;
    if (saving) return;
    const pkg = packageInput.trim() || 'com.synapse.mobile';
    const fps = fingerprintsInput.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean);
    const gId = googleClientIdInput.trim();
    if (!/^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)+$/.test(pkg)) { setNotification({ message: 'ANDROID_PACKAGE_NAME 格式无效', type: 'error' }); return; }
    if (fps.length === 0) { setNotification({ message: '至少填写一个 SHA-256 证书指纹', type: 'error' }); return; }
    if (gId && !GOOGLE_WEB_CLIENT_ID_PATTERN.test(gId)) { setNotification({ message: 'SYNAPSE_ANDROID_GOOGLE_CLIENT_ID 格式无效', type: 'error' }); return; }
    setSaving(true);
    try {
      const res = await authFetch(SYNAPSE_ANDROID_API, { method: 'POST', headers: { 'Content-Type': 'application/json', ...getAuthHeaders() }, body: JSON.stringify({ packageName: pkg, sha256CertFingerprints: fps, googleClientId: gId, disabled }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setNotification({ message: data.error || '保存失败', type: 'error' }); return; }
      setNotification({ message: '配置已保存', type: 'success' });
      await fetchConfig();
    } catch (e) { setNotification({ message: '保存失败：' + (e instanceof Error ? e.message : '未知错误'), type: 'error' }); }
    finally { setSaving(false); }
  }, [canWrite, saving, packageInput, fingerprintsInput, googleClientIdInput, disabled, fetchConfig, setNotification]);

  const handleReset = useCallback(async () => {
    if (!canWrite) return;
    if (deleting) return;
    if (!window.confirm('确定重置 Synapse Android 配置为默认值？')) return;
    setDeleting(true);
    try {
      const res = await authFetch(SYNAPSE_ANDROID_API, { method: 'DELETE', headers: { ...getAuthHeaders() } });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setNotification({ message: data.error || '重置失败', type: 'error' }); return; }
      setNotification({ message: '已重置为默认配置', type: 'success' });
      await fetchConfig();
    } catch (e) { setNotification({ message: '重置失败：' + (e instanceof Error ? e.message : '未知错误'), type: 'error' }); }
    finally { setDeleting(false); }
  }, [canWrite, deleting, fetchConfig, setNotification]);

  return (
    <SynapseAndroidConfigSection
      isOpen={isOpen} onToggle={() => setIsOpen((v) => !v)} prefersReducedMotion={prefersReducedMotion}
      loading={loading} saving={saving} deleting={deleting} readOnly={!canWrite}
      packageInput={packageInput} fingerprintsInput={fingerprintsInput} googleClientIdInput={googleClientIdInput} disabled={disabled}
      currentPackage={currentPackage} currentFingerprints={currentFingerprints} currentGoogleClientId={currentGoogleClientId} updatedAt={updatedAt}
      onPackageInputChange={setPackageInput} onFingerprintsInputChange={setFingerprintsInput} onGoogleClientIdInputChange={setGoogleClientIdInput} onDisabledChange={setDisabled}
      onRefresh={fetchConfig} onSave={handleSave} onReset={handleReset}
    />
  );
}