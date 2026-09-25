import { useCallback, useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { useAuth } from '../../hooks/useAuth';
import { isSuperAdmin } from '../../utils/rbac';
import { getBackendErrorMessage } from '../../utils/backendError';
import { useNotification } from '../Notification';
import RegistrationInviteConfigSection from './RegistrationInviteConfigSection';
import { REGISTRATION_INVITE_API, getAuthHeaders, authFetch } from './api';
import type { RegistrationInviteConfigSetting } from './types';

interface SelfContainedRegistrationInviteConfigSectionProps {
  prefersReducedMotion?: boolean | null;
}

/**
 * 注册邀请码闸门（REGISTRATION_INVITE）。这是该开关唯一的配置入口：
 * 保存写运行时配置（REGISTRATION_INVITE_REQUIRED 环境变量只作启动默认值），
 * isRegistrationInviteRequired() 读内存缓存，保存后注册接口立即按新值判定。
 */
export default function SelfContainedRegistrationInviteConfigSection({
  prefersReducedMotion: reducedMotionProp,
}: SelfContainedRegistrationInviteConfigSectionProps) {
  const prefersReducedMotion = useReducedMotion() ?? reducedMotionProp;
  const { setNotification } = useNotification();
  const { user } = useAuth();
  const canWrite = isSuperAdmin(user?.role);
  const [isOpen, setIsOpen] = useState(false);
  const fetchedRef = useRef(false);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [required, setRequired] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<string | undefined>();

  const fetchConfig = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authFetch(REGISTRATION_INVITE_API, { headers: { ...getAuthHeaders() } });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setNotification({ message: data.error || '获取注册邀请码配置失败', type: 'error' });
        return;
      }
      const cfg = (data?.setting?.config || {}) as Partial<RegistrationInviteConfigSetting>;
      setRequired(cfg.required === true);
      setUpdatedAt(data?.setting?.updatedAt);
    } catch (error) {
      setNotification({
        message: `获取注册邀请码配置失败：${getBackendErrorMessage(error, '未知错误')}`,
        type: 'error',
      });
    } finally {
      setLoading(false);
    }
  }, [setNotification]);

  useEffect(() => {
    if (isOpen && !fetchedRef.current) {
      fetchedRef.current = true;
      fetchConfig();
    }
  }, [isOpen, fetchConfig]);

  const handleSave = useCallback(async () => {
    if (!canWrite) return;
    if (saving) return;
    setSaving(true);
    try {
      const res = await authFetch(REGISTRATION_INVITE_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ required }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setNotification({ message: data.error || '保存失败', type: 'error' });
        return;
      }
      setNotification({
        message: required ? '注册邀请码已开启：注册必须提供有效邀请码' : '注册邀请码已关闭：邀请码可选',
        type: 'success',
      });
      await fetchConfig();
    } catch (error) {
      setNotification({ message: `保存失败：${getBackendErrorMessage(error, '未知错误')}`, type: 'error' });
    } finally {
      setSaving(false);
    }
  }, [canWrite, saving, required, fetchConfig, setNotification]);

  const handleReset = useCallback(async () => {
    if (!canWrite) return;
    if (deleting) return;
    if (
      !window.confirm(
        '确定重置注册邀请码设置？重置后会回退到部署环境变量 REGISTRATION_INVITE_REQUIRED（未设置则为关闭，邀请码可选）。',
      )
    ) {
      return;
    }
    setDeleting(true);
    try {
      const res = await authFetch(REGISTRATION_INVITE_API, { method: 'DELETE', headers: { ...getAuthHeaders() } });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setNotification({ message: data.error || '重置失败', type: 'error' });
        return;
      }
      setNotification({ message: '已重置注册邀请码设置', type: 'success' });
      await fetchConfig();
    } catch (error) {
      setNotification({ message: `重置失败：${getBackendErrorMessage(error, '未知错误')}`, type: 'error' });
    } finally {
      setDeleting(false);
    }
  }, [canWrite, deleting, fetchConfig, setNotification]);

  return (
    <RegistrationInviteConfigSection
      isOpen={isOpen}
      onToggle={() => setIsOpen((v) => !v)}
      prefersReducedMotion={prefersReducedMotion}
      loading={loading}
      saving={saving}
      deleting={deleting}
      disabled={!canWrite}
      required={required}
      updatedAt={updatedAt}
      onRequiredChange={setRequired}
      onRefresh={fetchConfig}
      onSave={handleSave}
      onReset={handleReset}
    />
  );
}
