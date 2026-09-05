import { useCallback, useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { useAuth } from '../../hooks/useAuth';
import { isSuperAdmin } from '../../utils/rbac';
import { useNotification } from '../Notification';
import SecretKeySection from './SecretKeySection';
import { QQ_GUARD_SIGNING_API, getAuthHeaders, authFetch } from './api';

interface SelfContainedQqGuardSigningConfigSectionProps {
  prefersReducedMotion?: boolean | null;
}

/**
 * QQ 群纪律机器人控制通道共享密钥（QQ_GUARD_SIGNING）。
 * 保存走运行时配置（Mongo），verifyQqGuardSignature 每次请求读内存缓存，无需重启即生效。
 * 机器人侧（/opt/qq-realname-guard）必须配置同一份密钥才能通过 HMAC 验签。
 */
export default function SelfContainedQqGuardSigningConfigSection({ prefersReducedMotion: reducedMotionProp }: SelfContainedQqGuardSigningConfigSectionProps) {
  const prefersReducedMotion = useReducedMotion() ?? reducedMotionProp;
  const { setNotification } = useNotification();
  const { user } = useAuth();
  const canWrite = isSuperAdmin(user?.role);
  const [isOpen, setIsOpen] = useState(false);
  const fetchedRef = useRef(false);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [tokenInput, setTokenInput] = useState('');
  const [currentToken, setCurrentToken] = useState<string | undefined>();
  const [updatedAt, setUpdatedAt] = useState<string | undefined>();

  const fetchConfig = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authFetch(QQ_GUARD_SIGNING_API, { headers: { ...getAuthHeaders() } });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setNotification({ message: data.error || '获取 QQ 群纪律机器人签名配置失败', type: 'error' }); return; }
      const cfg = data?.setting?.config || {};
      setTokenInput('');
      // 后端仅回显脱敏 token；hasToken 表示已配置
      setCurrentToken(cfg.hasToken ? (cfg.token || '已设置') : undefined);
      setUpdatedAt(data?.setting?.updatedAt);
    } catch (e) {
      setNotification({ message: '获取 QQ 群纪律机器人签名配置失败：' + (e instanceof Error ? e.message : '未知错误'), type: 'error' });
    } finally { setLoading(false); }
  }, [setNotification]);

  useEffect(() => {
    if (isOpen && !fetchedRef.current) { fetchedRef.current = true; fetchConfig(); }
  }, [isOpen, fetchConfig]);

  const handleSave = useCallback(async () => {
    if (!canWrite) return;
    if (saving) return;
    const token = tokenInput.trim();
    if (!token) { setNotification({ message: '请填写新的共享密钥；留空表示不修改', type: 'info' }); return; }
    setSaving(true);
    try {
      const res = await authFetch(QQ_GUARD_SIGNING_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ token }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setNotification({ message: data.error || '保存失败', type: 'error' }); return; }
      setNotification({ message: 'QQ 群纪律机器人签名密钥已保存', type: 'success' });
      await fetchConfig();
    } catch (e) { setNotification({ message: '保存失败：' + (e instanceof Error ? e.message : '未知错误'), type: 'error' }); }
    finally { setSaving(false); }
  }, [canWrite, saving, tokenInput, fetchConfig, setNotification]);

  const handleReset = useCallback(async () => {
    if (!canWrite) return;
    if (deleting) return;
    if (!window.confirm('确定重置 QQ 群纪律机器人签名配置？重置后控制通道将回退到部署环境变量（若未设置则停用验签）。')) return;
    setDeleting(true);
    try {
      const res = await authFetch(QQ_GUARD_SIGNING_API, { method: 'DELETE', headers: { ...getAuthHeaders() } });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setNotification({ message: data.error || '重置失败', type: 'error' }); return; }
      setNotification({ message: '已重置 QQ 群纪律机器人签名配置', type: 'success' });
      await fetchConfig();
    } catch (e) { setNotification({ message: '重置失败：' + (e instanceof Error ? e.message : '未知错误'), type: 'error' }); }
    finally { setDeleting(false); }
  }, [canWrite, deleting, fetchConfig, setNotification]);

  return (
    <SecretKeySection
      title="QQ 群纪律机器人密钥设置"
      description="管理 QQ 群纪律机器人与后台之间的 HMAC 控制通道共享密钥（对应部署环境变量 QQ_GUARD_BOT_TOKEN / QQ_GUARD_SHARED_SECRET，运行时优先）。保存后立即生效，机器人侧需配置同一份密钥。"
      sectionKey="qqGuardSigning"
      isOpen={isOpen} onToggle={() => setIsOpen((v) => !v)} prefersReducedMotion={prefersReducedMotion}
      loading={loading} saving={saving} deleting={deleting} disabled={!canWrite}
      inputLabel="共享密钥" inputValue={tokenInput} inputPlaceholder="请输入新的共享密钥（不会回显明文）"
      currentLabel="当前密钥（脱敏）" currentValue={currentToken} updatedAt={updatedAt}
      onInputChange={setTokenInput} onRefresh={fetchConfig} onSave={handleSave} onDelete={handleReset}
    />
  );
}
