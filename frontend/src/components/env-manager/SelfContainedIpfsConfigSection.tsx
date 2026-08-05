import { useCallback, useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { useNotification } from '../Notification';
import IpfsConfigSection from './IpfsConfigSection';
import { IPFS_CONFIG_API, getAuthHeaders, authFetch } from './api';
import type { IPFSConfigSetting } from './types';

interface SelfContainedIpfsConfigSectionProps {
  prefersReducedMotion?: boolean | null;
}

export default function SelfContainedIpfsConfigSection({ prefersReducedMotion: reducedMotionProp }: SelfContainedIpfsConfigSectionProps) {
  const prefersReducedMotion = useReducedMotion() ?? reducedMotionProp;
  const { setNotification } = useNotification();
  const [isOpen, setIsOpen] = useState(false);
  const fetchedRef = useRef(false);

  const [ipfsConfig, setIpfsConfig] = useState<IPFSConfigSetting | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [ipfsUploadUrlInput, setIpfsUploadUrlInput] = useState('');
  const [ipfsUserAgentInput, setIpfsUserAgentInput] = useState('');
  const [imageBedApiUrlInput, setImageBedApiUrlInput] = useState('');
  const [imageBedCdnDomainInput, setImageBedCdnDomainInput] = useState('');
  const [imageBedStorageDestinationInput, setImageBedStorageDestinationInput] = useState('');
  const [imageBedOutputFormatInput, setImageBedOutputFormatInput] = useState('');

  const fetchConfig = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authFetch(IPFS_CONFIG_API, { headers: { ...getAuthHeaders() } });
      const data = await res.json();
      if (!res.ok || !data.success) { setNotification({ message: data.error || '获取IPFS配置失败', type: 'error' }); return; }
      setIpfsConfig({ ipfsUploadUrl: data.data.ipfsUploadUrl, ipfsUa: data.data.ipfsUa, imageBedApiUrl: data.data.imageBedApiUrl, imageBedCdnDomain: data.data.imageBedCdnDomain, imageBedStorageDestination: data.data.imageBedStorageDestination, imageBedOutputFormat: data.data.imageBedOutputFormat, updatedAt: data.data.updatedAt });
    } catch (e) {
      setNotification({ message: '获取IPFS配置失败：' + (e instanceof Error ? e.message : '未知错误'), type: 'error' });
    } finally { setLoading(false); }
  }, [setNotification]);

  useEffect(() => {
    if (isOpen && !fetchedRef.current) { fetchedRef.current = true; fetchConfig(); }
  }, [isOpen, fetchConfig]);

  const handleSave = useCallback(async () => {
    if (saving) return;
    const url = ipfsUploadUrlInput.trim(), ua = ipfsUserAgentInput.trim(), ibApi = imageBedApiUrlInput.trim(), ibCdn = imageBedCdnDomainInput.trim(), ibStorage = imageBedStorageDestinationInput.trim(), ibFormat = imageBedOutputFormatInput.trim();
    if (!url && !ua && !ibApi && !ibCdn && !ibStorage && !ibFormat) { setNotification({ message: '请至少填写一个配置项', type: 'error' }); return; }
    setSaving(true);
    try {
      const res = await authFetch(IPFS_CONFIG_API, { method: 'POST', headers: { 'Content-Type': 'application/json', ...getAuthHeaders() }, body: JSON.stringify({ ...(url ? { ipfsUploadUrl: url } : {}), ...(ua ? { ipfsUa: ua } : {}), ...(ibApi ? { imageBedApiUrl: ibApi } : {}), ...(ibCdn ? { imageBedCdnDomain: ibCdn } : {}), ...(ibStorage ? { imageBedStorageDestination: ibStorage } : {}), ...(ibFormat ? { imageBedOutputFormat: ibFormat } : {}) }) });
      const data = await res.json();
      if (!res.ok || !data.success) { setNotification({ message: data.error || '保存失败', type: 'error' }); return; }
      setNotification({ message: '保存成功', type: 'success' });
      setIpfsUploadUrlInput(''); setIpfsUserAgentInput(''); setImageBedApiUrlInput(''); setImageBedCdnDomainInput(''); setImageBedStorageDestinationInput(''); setImageBedOutputFormatInput('');
      await fetchConfig();
    } catch (e) { setNotification({ message: '保存失败：' + (e instanceof Error ? e.message : '未知错误'), type: 'error' }); }
    finally { setSaving(false); }
  }, [saving, ipfsUploadUrlInput, ipfsUserAgentInput, imageBedApiUrlInput, imageBedCdnDomainInput, imageBedStorageDestinationInput, imageBedOutputFormatInput, fetchConfig, setNotification]);

  const handleTest = useCallback(async (target: 'imagebed' | 'ipfs') => {
    if (testing) return;
    setTesting(true);
    try {
      const res = await authFetch(`${IPFS_CONFIG_API}/test`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...getAuthHeaders() }, body: JSON.stringify({ target }) });
      const data = await res.json();
      if (!res.ok || !data.success) { setNotification({ message: data.error || '测试失败', type: 'error' }); return; }
      setNotification({ message: data.message || '测试成功', type: 'success' });
    } catch (e) { setNotification({ message: '测试失败：' + (e instanceof Error ? e.message : '未知错误'), type: 'error' }); }
    finally { setTesting(false); }
  }, [testing, setNotification]);

  return (
    <IpfsConfigSection
      isOpen={isOpen} onToggle={() => setIsOpen((v) => !v)} prefersReducedMotion={prefersReducedMotion}
      loading={loading} saving={saving} testing={testing} ipfsConfig={ipfsConfig}
      ipfsUploadUrlInput={ipfsUploadUrlInput} ipfsUserAgentInput={ipfsUserAgentInput}
      imageBedApiUrlInput={imageBedApiUrlInput} imageBedCdnDomainInput={imageBedCdnDomainInput}
      imageBedStorageDestinationInput={imageBedStorageDestinationInput} imageBedOutputFormatInput={imageBedOutputFormatInput}
      onIpfsUploadUrlChange={setIpfsUploadUrlInput} onIpfsUserAgentChange={setIpfsUserAgentInput}
      onImageBedApiUrlChange={setImageBedApiUrlInput} onImageBedCdnDomainChange={setImageBedCdnDomainInput}
      onImageBedStorageDestinationChange={setImageBedStorageDestinationInput} onImageBedOutputFormatChange={setImageBedOutputFormatInput}
      onRefresh={fetchConfig} onSave={handleSave} onTest={handleTest}
    />
  );
}