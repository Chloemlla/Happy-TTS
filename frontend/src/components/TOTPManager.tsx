import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import axios from 'axios';
import { FaCheck, FaClock, FaEye, FaKey, FaLock } from 'react-icons/fa';
import type { TOTPStatus } from '../types/auth';
import { cleanTOTPToken, handleTOTPError, validateTOTPToken } from '../utils/totpUtils';
import BackupCodesModal from './BackupCodesModal';
import { PasskeySetup } from './PasskeySetup';
import {
  studioDarkPanelClassName,
  studioDisplayFont,
  studioFieldClassName,
  studioGhostButtonClassName,
  studioHeroCardClassName,
  studioMainSurfaceClassName,
  studioMetricToneClassName,
  studioModalCardClassName,
  studioModalOverlayClassName,
  studioPageFont,
  studioPanelClassName,
  studioPrimaryButtonClassName,
} from './studioTheme';
import TOTPSetup from './TOTPSetup';
import { useTwoFactorStatus } from '../hooks/useTwoFactorStatus';

interface TOTPManagerProps {
  onStatusChange?: (status: TOTPStatus) => void;
}

const TOTPManager: React.FC<TOTPManagerProps> = ({ onStatusChange }) => {
  const [status, setStatus] = useState<TOTPStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [showSetup, setShowSetup] = useState(false);
  const [showDisable, setShowDisable] = useState(false);
  const [showBackupCodes, setShowBackupCodes] = useState(false);
  const [showPasskeySetup, setShowPasskeySetup] = useState(false);
  const [disableCode, setDisableCode] = useState('');
  const [error, setError] = useState('');
  const twoFactor = useTwoFactorStatus();

  const getApiBaseUrl = () => {
    if (import.meta.env.DEV) return 'http://localhost:3000';
    if (import.meta.env.VITE_API_URL) return import.meta.env.VITE_API_URL;
    return 'https://api.951100.xyz';
  };

  const api = axios.create({
    baseURL: getApiBaseUrl(),
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${localStorage.getItem('token')}`,
    },
  });

  const fetchStatus = async () => {
    try {
      setLoading(true);
      const response = await api.get('/api/totp/status');
      setStatus(response.data);
      onStatusChange?.(response.data);
    } catch (err) {
      console.error('获取 TOTP 状态失败:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  const handleDisable = async () => {
    const cleanCode = cleanTOTPToken(disableCode);
    if (!cleanCode.trim()) {
      setError('请输入验证码');
      return;
    }
    if (!validateTOTPToken(cleanCode)) {
      setError('验证码必须是 6 位数字');
      return;
    }

    try {
      setError('');
      await api.post('/api/totp/disable', { token: cleanCode });
      setShowDisable(false);
      setDisableCode('');
      fetchStatus();
    } catch (err: any) {
      setError(handleTOTPError(err));
    }
  };

  const statusCards = [
    { label: 'Status', value: twoFactor.enabled ? '双因素已启用' : '尚未启用', tone: twoFactor.enabled ? 'emerald' as const : 'amber' as const },
    { label: 'Method', value: twoFactor.type?.length ? twoFactor.type.join(' + ') : '仅密码', tone: 'sky' as const },
    { label: 'Recovery', value: status?.hasBackupCodes ? '恢复码可用' : '尚未查看恢复码', tone: 'violet' as const },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10" style={{ fontFamily: studioPageFont }}>
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-[#2541b2]" />
      </div>
    );
  }

  return (
    <div className="space-y-4" style={{ fontFamily: studioPageFont }}>
      <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className={studioHeroCardClassName}>
        <div className="flex flex-col gap-4">
          <div className="inline-flex w-fit items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-sky-700">
            <FaLock />
            Account Security Studio
          </div>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 id="totp-manager-title" className="text-3xl font-semibold leading-tight text-slate-900" style={{ fontFamily: studioDisplayFont }}>
                双因素验证工作台
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-600">
                保留原有的 TOTP、恢复码和 Passkey 流程，只把界面收束成和 DeepLX 一致的卡片层级与信息密度。
              </p>
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              {statusCards.map((item) => (
                <div key={item.label} className={`${studioMetricToneClassName(item.tone)} rounded-[22px] border px-3 py-2.5 sm:rounded-2xl sm:px-4 sm:py-3`}>
                  <div className="text-[10px] uppercase tracking-[0.24em] text-slate-400">{item.label}</div>
                  <div className="mt-2 text-sm font-semibold text-slate-800">{item.value}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </motion.div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_230px]">
        <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, delay: 0.05 }} className={studioMainSurfaceClassName}>
          <div className="rounded-[24px] border border-slate-200 bg-white p-4 sm:rounded-[28px] sm:p-5">
            {status?.enabled ? (
              <div className="space-y-4">
                <div className="rounded-[22px] border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm leading-7 text-emerald-800">
                  双因素验证已开启。登录时除了密码，还会要求动态验证码，账户安全等级已经提升。
                </div>
                {status.hasBackupCodes ? (
                  <div className="rounded-[22px] border border-sky-200 bg-sky-50 px-4 py-4 text-sm leading-7 text-sky-800">
                    恢复码已经生成，可以在无法使用验证器时作为兜底方案。建议再次查看并确认已妥善保存。
                  </div>
                ) : (
                  <div className="rounded-[22px] border border-amber-200 bg-amber-50 px-4 py-4 text-sm leading-7 text-amber-800">
                    TOTP 已开启，但你还没有查看恢复码。建议至少检查一次恢复方案，避免设备丢失时无法登录。
                  </div>
                )}
                <div className="grid gap-2 sm:grid-cols-2">
                  {status.hasBackupCodes ? (
                    <button type="button" onClick={() => setShowBackupCodes(true)} className={studioGhostButtonClassName}>
                      <FaEye />
                      查看恢复码
                    </button>
                  ) : null}
                  <button type="button" onClick={() => setShowDisable(true)} className={`${studioGhostButtonClassName} border-rose-200 text-rose-600 hover:border-rose-300 hover:text-rose-700`}>
                    禁用双因素
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="rounded-[22px] border border-amber-200 bg-amber-50 px-4 py-4 text-sm leading-7 text-amber-800">
                  当前账号只使用密码登录。建议立即启用 TOTP，为登录增加第二道验证门槛。
                </div>
                <button type="button" onClick={() => setShowSetup(true)} className={studioPrimaryButtonClassName}>
                  <FaLock />
                  开始设置 TOTP
                </button>
              </div>
            )}
          </div>
        </motion.div>

        <div className="space-y-4">
          <motion.section initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, delay: 0.12 }} className={studioPanelClassName}>
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-900 text-white"><FaKey /></div>
              <div>
                <div className="text-lg font-semibold text-slate-900">安全摘要</div>
                <div className="text-sm text-slate-500">快速确认当前状态</div>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between rounded-[20px] border border-slate-100 px-3 py-3 text-sm"><span className="text-slate-500">双因素</span><span className="font-semibold text-slate-900">{twoFactor.enabled ? '已启用' : '未启用'}</span></div>
              <div className="flex items-center justify-between rounded-[20px] border border-slate-100 px-3 py-3 text-sm"><span className="text-slate-500">认证方式</span><span className="font-semibold text-slate-900">{twoFactor.type?.length ? twoFactor.type.join(' + ') : 'Password'}</span></div>
              <div className="flex items-center justify-between rounded-[20px] border border-slate-100 px-3 py-3 text-sm"><span className="text-slate-500">恢复码</span><span className="font-semibold text-slate-900">{status?.hasBackupCodes ? '已生成' : '未确认'}</span></div>
            </div>
          </motion.section>

          <motion.section initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, delay: 0.18 }} className={studioDarkPanelClassName}>
            <div className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Passkey</div>
            <div className="space-y-2 text-sm leading-7 text-slate-200">
              <p>在 TOTP 之外，你还可以配置 Passkey，把账号切到更现代的无密码认证路径。</p>
              {status?.enabled ? (
                <button type="button" onClick={() => setShowPasskeySetup(true)} className={`${studioPrimaryButtonClassName} w-full`}>
                  <FaKey />
                  管理 Passkey
                </button>
              ) : (
                <div className="rounded-[20px] border border-white/10 bg-white/5 px-4 py-3 text-slate-300">
                  先启用 TOTP，再继续配置 Passkey。
                </div>
              )}
            </div>
          </motion.section>
        </div>
      </div>

      <TOTPSetup isOpen={showSetup} onClose={() => setShowSetup(false)} onSuccess={() => fetchStatus()} />
      <BackupCodesModal isOpen={showBackupCodes} onClose={() => setShowBackupCodes(false)} />

      <AnimatePresence>
        {showDisable ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className={studioModalOverlayClassName} onClick={() => setShowDisable(false)}>
            <motion.div initial={{ opacity: 0, scale: 0.95, y: 24 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 24 }} className={`${studioModalCardClassName} max-w-md`} onClick={(event) => event.stopPropagation()}>
              <h3 className="text-2xl font-semibold text-slate-900" style={{ fontFamily: studioDisplayFont }}>禁用双因素验证</h3>
              <p className="mt-3 text-sm leading-7 text-slate-500">输入当前 6 位验证码后，系统会关闭 TOTP。这个动作会降低账号安全等级。</p>
              <div className="mt-5 space-y-3">
                <input type="text" value={disableCode} onChange={(event) => setDisableCode(event.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="000000" maxLength={6} className={`${studioFieldClassName} text-center font-mono sm:rounded-[18px]`} />
                {error ? <div className="rounded-[20px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}
                <div className="flex flex-col gap-2 sm:flex-row">
                  <button type="button" onClick={() => setShowDisable(false)} className={`${studioGhostButtonClassName} w-full sm:w-auto`}>取消</button>
                  <button type="button" onClick={handleDisable} disabled={disableCode.length !== 6} className={`${studioPrimaryButtonClassName} w-full bg-rose-600 hover:bg-rose-700 shadow-rose-600/20 sm:w-auto`}>
                    <FaClock />
                    确认禁用
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {showPasskeySetup ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className={studioModalOverlayClassName} onClick={() => setShowPasskeySetup(false)}>
            <motion.div initial={{ opacity: 0, scale: 0.96, y: 24 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96, y: 24 }} className={`${studioModalCardClassName} max-w-5xl`} onClick={(event) => event.stopPropagation()}>
              <div className="max-h-[80vh] overflow-y-auto pr-1">
                <PasskeySetup />
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
};

export default TOTPManager;
