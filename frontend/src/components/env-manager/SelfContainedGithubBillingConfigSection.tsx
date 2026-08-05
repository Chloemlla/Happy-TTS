import { useCallback, useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { useNotification } from '../Notification';
import GithubBillingConfigSection from './GithubBillingConfigSection';
import { GITHUB_BILLING_MULTI_CONFIG_API, getAuthHeaders, authFetch } from './api';
import type { MultiGitHubBillingConfig } from './types';

interface SelfContainedGithubBillingConfigSectionProps {
  prefersReducedMotion?: boolean | null;
}

export default function SelfContainedGithubBillingConfigSection({ prefersReducedMotion: reducedMotionProp }: SelfContainedGithubBillingConfigSectionProps) {
  const prefersReducedMotion = useReducedMotion() ?? reducedMotionProp;
  const { setNotification } = useNotification();
  const [isOpen, setIsOpen] = useState(false);
  const fetchedRef = useRef(false);

  const [multiConfig, setMultiConfig] = useState<MultiGitHubBillingConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [curlInput, setCurlInput] = useState('');
  const [selectedConfigKey, setSelectedConfigKey] = useState<'config1' | 'config2' | 'config3'>('config1');

  const fetchConfig = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authFetch(GITHUB_BILLING_MULTI_CONFIG_API, { headers: { ...getAuthHeaders() } });
      const data = await res.json();
      if (!res.ok) {
        if (res.status !== 404) setNotification({ message: data.error || '获取 GitHub Billing 配置失败', type: 'error' });
        return;
      }
      setMultiConfig(data?.success ? (data.data || null) : null);
    } catch (e) {
      setNotification({ message: '获取 GitHub Billing 配置失败：' + (e instanceof Error ? e.message : '未知错误'), type: 'error' });
    } finally { setLoading(false); }
  }, [setNotification]);

  useEffect(() => {
    if (isOpen && !fetchedRef.current) { fetchedRef.current = true; fetchConfig(); }
  }, [isOpen, fetchConfig]);

  const handleSave = useCallback(async () => {
    if (saving) return;
    const curlCommand = curlInput.trim();
    if (!curlCommand) { setNotification({ message: '请填写 curl 命令', type: 'error' }); return; }
    try {
      const urlMatch = curlCommand.match(/(?:['"])(https?:\/\/[^\s'"]+)(?:['"])|(?:\s)(https?:\/\/[^\s'"]+)/);
      if (!urlMatch) { setNotification({ message: '无法从 curl 命令中提取有效的 URL', type: 'error' }); return; }
      const url = new URL(urlMatch[1] || urlMatch[2]);
      const hostname = url.hostname.toLowerCase();
      if ((hostname !== 'github.com' && !hostname.endsWith('.github.com')) || url.protocol !== 'https:') {
        setNotification({ message: '请提供有效的 GitHub API curl 命令（必须使用 https://github.com）', type: 'error' }); return;
      }
    } catch {
      setNotification({ message: '无效的 curl 命令格式', type: 'error' }); return;
    }
    setSaving(true);
    try {
      const res = await authFetch(`${GITHUB_BILLING_MULTI_CONFIG_API}/${selectedConfigKey}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...getAuthHeaders() }, body: JSON.stringify({ curlCommand }) });
      const data = await res.json();
      if (!res.ok || !data.success) { setNotification({ message: data.error || '保存失败', type: 'error' }); return; }
      setNotification({ message: `配置 ${selectedConfigKey} 保存成功`, type: 'success' });
      setCurlInput('');
      await fetchConfig();
    } catch (e) { setNotification({ message: '保存失败：' + (e instanceof Error ? e.message : '未知错误'), type: 'error' }); }
    finally { setSaving(false); }
  }, [saving, curlInput, selectedConfigKey, fetchConfig, setNotification]);

  const handleDelete = useCallback(async () => {
    if (saving) return;
    if (!window.confirm(`确定删除 GitHub Billing 配置「${selectedConfigKey}」？`)) return;
    setSaving(true);
    try {
      const res = await authFetch(`${GITHUB_BILLING_MULTI_CONFIG_API}/${selectedConfigKey}`, { method: 'DELETE', headers: { ...getAuthHeaders() } });
      const data = await res.json();
      if (!res.ok || !data.success) { setNotification({ message: data.error || '删除失败', type: 'error' }); return; }
      setNotification({ message: `配置 ${selectedConfigKey} 删除成功`, type: 'success' });
      await fetchConfig();
    } catch (e) { setNotification({ message: '删除失败：' + (e instanceof Error ? e.message : '未知错误'), type: 'error' }); }
    finally { setSaving(false); }
  }, [saving, selectedConfigKey, fetchConfig, setNotification]);

  return (
    <GithubBillingConfigSection
      isOpen={isOpen} onToggle={() => setIsOpen((v) => !v)} prefersReducedMotion={prefersReducedMotion}
      loading={loading} saving={saving} curlInput={curlInput}
      selectedConfigKey={selectedConfigKey} multiConfig={multiConfig}
      onCurlInputChange={setCurlInput} onSelectedConfigKeyChange={setSelectedConfigKey}
      onRefresh={fetchConfig} onSave={handleSave} onDelete={handleDelete}
    />
  );
}