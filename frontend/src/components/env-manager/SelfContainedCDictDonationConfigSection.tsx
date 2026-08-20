import { useCallback, useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { useAuth } from '../../hooks/useAuth';
import { isSuperAdmin } from '../../utils/rbac';
import { useNotification } from '../Notification';
import CDictDonationConfigSection, { type CDictDonationChannelDraft } from './CDictDonationConfigSection';
import { CDICT_DONATION_API, CDICT_DONATE_PUBLIC_API, getAuthHeaders, authFetch } from './api';

interface SelfContainedCDictDonationConfigSectionProps {
  prefersReducedMotion?: boolean | null;
}

const CHANNEL_ID_PATTERN = /^[a-z0-9-]{1,32}$/;
const MAX_CHANNELS = 8;

const EMPTY_CHANNEL: CDictDonationChannelDraft = { id: '', name: '', hint: '', enabled: true, imageUrl: '' };

function toDraft(raw: unknown): CDictDonationChannelDraft {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    id: String(obj.id || ''),
    name: String(obj.name || ''),
    hint: String(obj.hint || ''),
    enabled: obj.enabled !== false,
    imageUrl: String(obj.imageUrl || ''),
  };
}

export default function SelfContainedCDictDonationConfigSection({ prefersReducedMotion: reducedMotionProp }: SelfContainedCDictDonationConfigSectionProps) {
  const prefersReducedMotion = useReducedMotion() ?? reducedMotionProp;
  const { setNotification } = useNotification();
  const { user } = useAuth();
  const canWrite = isSuperAdmin(user?.role);
  const [isOpen, setIsOpen] = useState(false);
  const fetchedRef = useRef(false);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [notice, setNotice] = useState('');
  const [channels, setChannels] = useState<CDictDonationChannelDraft[]>([{ ...EMPTY_CHANNEL }]);
  const [updatedAt, setUpdatedAt] = useState<string | undefined>();

  const fetchConfig = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authFetch(CDICT_DONATION_API, { headers: { ...getAuthHeaders() } });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setNotification({ message: data.error || '获取 CDict 赞赏配置失败', type: 'error' }); return; }
      const cfg = data?.setting?.config || {};
      const list = Array.isArray(cfg.channels) ? cfg.channels.map(toDraft) : [];
      setEnabled(cfg.enabled !== false);
      setNotice(String(cfg.notice || ''));
      setChannels(list.length > 0 ? list : [{ ...EMPTY_CHANNEL }]);
      setUpdatedAt(data?.setting?.updatedAt);
    } catch (e) {
      setNotification({ message: '获取 CDict 赞赏配置失败：' + (e instanceof Error ? e.message : '未知错误'), type: 'error' });
    } finally { setLoading(false); }
  }, [setNotification]);

  useEffect(() => {
    if (isOpen && !fetchedRef.current) { fetchedRef.current = true; fetchConfig(); }
  }, [isOpen, fetchConfig]);

  const handleChannelChange = useCallback((index: number, patch: Partial<CDictDonationChannelDraft>) => {
    setChannels((prev) => prev.map((channel, i) => (i === index ? { ...channel, ...patch } : channel)));
  }, []);

  const handleChannelRemove = useCallback((index: number) => {
    setChannels((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)));
  }, []);

  const handleChannelAdd = useCallback(() => {
    setChannels((prev) => (prev.length >= MAX_CHANNELS ? prev : [...prev, { ...EMPTY_CHANNEL }]));
  }, []);

  const handleSave = useCallback(async () => {
    if (!canWrite || saving) return;
    const payloadChannels = channels.map((channel) => ({
      id: channel.id.trim().toLowerCase(),
      name: channel.name.trim(),
      hint: channel.hint.trim(),
      enabled: channel.enabled,
      imageUrl: channel.imageUrl.trim(),
    }));
    for (const channel of payloadChannels) {
      if (!CHANNEL_ID_PATTERN.test(channel.id)) { setNotification({ message: `渠道 id "${channel.id || '空'}" 不合法，只允许小写字母、数字和连字符`, type: 'error' }); return; }
      if (!channel.name) { setNotification({ message: `渠道 ${channel.id} 缺少显示名称`, type: 'error' }); return; }
      if (channel.imageUrl && !/^https:\/\//i.test(channel.imageUrl)) { setNotification({ message: `渠道 ${channel.id} 的图片地址必须是 https 直链`, type: 'error' }); return; }
      if (channel.imageUrl && /\/api\/cdict\/donate(\/|$)/i.test(channel.imageUrl)) { setNotification({ message: `渠道 ${channel.id} 的图片地址不能填赞赏码接口自身，否则服务端会自己代理自己；留空即用内置图片`, type: 'error' }); return; }
    }
    const ids = new Set(payloadChannels.map((channel) => channel.id));
    if (ids.size !== payloadChannels.length) { setNotification({ message: '渠道 id 不能重复', type: 'error' }); return; }
    setSaving(true);
    try {
      const res = await authFetch(CDICT_DONATION_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ enabled, notice: notice.trim(), channels: payloadChannels }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setNotification({ message: data.error || '保存失败', type: 'error' }); return; }
      setNotification({ message: '配置已保存，客户端下次打开赞赏页即生效', type: 'success' });
      await fetchConfig();
    } catch (e) { setNotification({ message: '保存失败：' + (e instanceof Error ? e.message : '未知错误'), type: 'error' }); }
    finally { setSaving(false); }
  }, [canWrite, saving, channels, enabled, notice, fetchConfig, setNotification]);

  const handleReset = useCallback(async () => {
    if (!canWrite || deleting) return;
    if (!window.confirm('确定重置 CDict 赞赏配置为默认值（内置支付宝 / 微信渠道与内置图片）？')) return;
    setDeleting(true);
    try {
      const res = await authFetch(CDICT_DONATION_API, { method: 'DELETE', headers: { ...getAuthHeaders() } });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setNotification({ message: data.error || '重置失败', type: 'error' }); return; }
      setNotification({ message: '已重置为默认配置', type: 'success' });
      await fetchConfig();
    } catch (e) { setNotification({ message: '重置失败：' + (e instanceof Error ? e.message : '未知错误'), type: 'error' }); }
    finally { setDeleting(false); }
  }, [canWrite, deleting, fetchConfig, setNotification]);

  return (
    <CDictDonationConfigSection
      isOpen={isOpen} onToggle={() => setIsOpen((v) => !v)} prefersReducedMotion={prefersReducedMotion}
      loading={loading} saving={saving} deleting={deleting} readOnly={!canWrite}
      enabled={enabled} notice={notice} channels={channels}
      previewBaseUrl={CDICT_DONATE_PUBLIC_API} updatedAt={updatedAt}
      onEnabledChange={setEnabled} onNoticeChange={setNotice}
      onChannelChange={handleChannelChange} onChannelRemove={handleChannelRemove} onChannelAdd={handleChannelAdd}
      onRefresh={fetchConfig} onSave={handleSave} onReset={handleReset}
    />
  );
}
