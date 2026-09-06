import { useCallback, useEffect, useRef, useState } from 'react';
import { m, useReducedMotion } from 'framer-motion';
import { useAuth } from '../../hooks/useAuth';
import { isSuperAdmin } from '../../utils/rbac';
import { useNotification } from '../Notification';
import { logShareInputClass, logSharePrimaryButtonClass } from '../LogShareStyleScaffold';
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
  const [alertEmailsInput, setAlertEmailsInput] = useState('');
  const [currentAlertEmails, setCurrentAlertEmails] = useState('');
  const [savingAlert, setSavingAlert] = useState(false);

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
      setAlertEmailsInput('');
      setCurrentAlertEmails(typeof cfg.alertEmails === 'string' ? cfg.alertEmails : '');
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

  const handleSaveAlertEmails = useCallback(async () => {
    if (!canWrite) return;
    if (savingAlert) return;
    setSavingAlert(true);
    try {
      const res = await authFetch(QQ_GUARD_SIGNING_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ alertEmails: alertEmailsInput.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setNotification({ message: data.error || '保存告警邮箱失败', type: 'error' }); return; }
      setNotification({ message: '离线/恢复告警邮箱已保存', type: 'success' });
      await fetchConfig();
    } catch (e) { setNotification({ message: '保存失败：' + (e instanceof Error ? e.message : '未知错误'), type: 'error' }); }
    finally { setSavingAlert(false); }
  }, [canWrite, savingAlert, alertEmailsInput, fetchConfig, setNotification]);

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
    <>
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
      <div className="rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-[0_18px_60px_rgba(15,23,42,0.06)] backdrop-blur-xl sm:p-5">
        <div className="space-y-3">
          <div>
            <h4 className="text-base font-semibold text-slate-800">离线/恢复告警邮箱</h4>
            <p className="mt-1 text-sm text-slate-500">机器人离线（bot_offline）或恢复（bot_recovered）时向收件人发送邮件；多个邮箱用英文逗号分隔，需为受支持邮箱域名；留空并保存即关闭邮件告警。</p>
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-slate-700" htmlFor="qq-guard-alert-emails">告警收件邮箱</label>
            <input
              id="qq-guard-alert-emails"
              type="text"
              value={alertEmailsInput}
              onChange={(event) => setAlertEmailsInput(event.target.value)}
              placeholder="例 ops@qq.com, admin@gmail.com（多个邮箱用英文逗号分隔）"
              className={logShareInputClass}
              autoComplete="off"
              spellCheck={false}
              disabled={savingAlert || !canWrite}
            />
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50/80 px-3 py-2 text-xs text-slate-600 sm:px-4 sm:py-3">
            {currentAlertEmails ? `当前收件人：${currentAlertEmails}` : '当前未配置收件人，不会发送邮件告警'}
          </div>
          <div className="flex items-center justify-end gap-3">
            <m.button
              type="button"
              onClick={handleSaveAlertEmails}
              disabled={savingAlert || !canWrite}
              className={logSharePrimaryButtonClass}
              whileTap={{ scale: 0.97 }}
            >
              {savingAlert ? '保存中...' : '保存邮箱'}
            </m.button>
          </div>
        </div>
      </div>
    </>
  );
}
