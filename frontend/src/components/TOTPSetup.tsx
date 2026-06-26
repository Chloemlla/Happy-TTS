import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { QRCodeSVG } from 'qrcode.react';
import { api } from '../api/api';
import { TOTPSetupData } from '../types/auth';
import { cleanTOTPToken, handleTOTPError, validateTOTPToken } from '../utils/totpUtils';
import { useNotification } from './Notification';
import {
  studioFieldClassName,
  studioGhostButtonClassName,
  studioModalCardClassName,
  studioPageFont,
  studioPrimaryButtonClassName,
} from './studioTheme';
import {
  FaBan,
  FaCheck,
  FaCopy,
  FaEye,
  FaEyeSlash,
  FaKey,
  FaQrcode,
  FaShieldAlt,
  FaTimes,
} from 'react-icons/fa';

interface TOTPSetupProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const TOTPSetup: React.FC<TOTPSetupProps> = ({ isOpen, onClose, onSuccess }) => {
  const [step, setStep] = useState<'loading' | 'setup' | 'success'>('loading');
  const [setupData, setSetupData] = useState<TOTPSetupData | null>(null);
  const [verificationCode, setVerificationCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showBackupCodes, setShowBackupCodes] = useState(false);
  const { setNotification } = useNotification();

  useEffect(() => {
    if (!isOpen) return;

    const generateSetup = async () => {
      try {
        setStep('loading');
        setError('');
        setVerificationCode('');
        setShowBackupCodes(false);

        const response = await api.post('/api/totp/generate-setup');
        setSetupData(response.data);
        setStep('setup');
      } catch (error: any) {
        console.error('TOTP setup generation failed:', error);
        setError(error.response?.data?.error || '生成 TOTP 设置失败');
        setStep('setup');
      }
    };

    void generateSetup();
  }, [isOpen]);

  const handleVerify = async () => {
    const cleanCode = cleanTOTPToken(verificationCode);

    if (!cleanCode.trim()) {
      setNotification({ message: '请输入验证码', type: 'warning' });
      return;
    }

    if (!validateTOTPToken(cleanCode)) {
      setNotification({ message: '验证码必须是 6 位数字', type: 'warning' });
      return;
    }

    try {
      setLoading(true);
      setError('');

      await api.post('/api/totp/verify-and-enable', {
        token: cleanCode,
      });

      setStep('success');
      window.setTimeout(() => {
        onSuccess();
        handleClose();
      }, 1200);
    } catch (error: any) {
      setError(handleTOTPError(error));
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setStep('loading');
    setVerificationCode('');
    setError('');
    setShowBackupCodes(false);
    setSetupData(null);
    onClose();
  };

  const copySecret = async () => {
    if (!setupData?.secret) return;
    await navigator.clipboard.writeText(setupData.secret);
    setNotification({ message: '密钥已复制到剪贴板', type: 'success' });
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/30 p-4 backdrop-blur-sm"
        onClick={handleClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 18 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 18 }}
          className={`${studioModalCardClassName} my-8 max-w-2xl`}
          style={{ fontFamily: studioPageFont }}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="max-h-[82vh] overflow-y-auto pr-1">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div className="flex min-w-0 gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-900 text-white">
                  <FaQrcode />
                </div>
                <div className="min-w-0">
                  <h2 className="text-xl font-semibold text-slate-900">启用 TOTP</h2>
                  <p className="mt-1 text-sm leading-6 text-slate-500">
                    扫描二维码后输入认证器中的 6 位验证码。
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleClose}
                className="rounded-full border border-slate-200 bg-white/80 p-2 text-slate-400 transition hover:border-slate-300 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 focus-visible:ring-offset-2"
                aria-label="关闭 TOTP 设置"
                title="关闭"
              >
                <FaTimes />
              </button>
            </div>

            {step === 'loading' ? (
              <div className="flex items-center justify-center py-12">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-slate-900" />
              </div>
            ) : step === 'success' ? (
              <div className="rounded-[24px] border border-emerald-200 bg-emerald-50 px-5 py-8 text-center text-emerald-700">
                <FaCheck className="mx-auto mb-3 h-8 w-8" />
                <div className="text-base font-semibold">TOTP 已启用</div>
              </div>
            ) : (
              <div className="space-y-4">
                {error ? (
                  <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                    {error}
                  </div>
                ) : null}

                {setupData ? (
                  <>
                    <div className="grid gap-4 md:grid-cols-[220px,minmax(0,1fr)]">
                      <div className="rounded-[24px] border border-slate-200 bg-white p-4 text-center">
                        <QRCodeSVG
                          value={setupData.otpauthUrl}
                          size={188}
                          level="M"
                          includeMargin
                          bgColor="#FFFFFF"
                          fgColor="#0f172a"
                          className="mx-auto h-auto max-w-full"
                        />
                        <div className="mt-3 text-xs leading-5 text-slate-500">
                          使用认证器应用扫描
                        </div>
                      </div>

                      <div className="space-y-3">
                        <div className="rounded-[24px] border border-slate-200 bg-slate-50/80 p-4">
                          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-900">
                            <FaKey className="text-slate-400" />
                            手动密钥
                          </div>
                          <code className="block break-all rounded-2xl border border-slate-200 bg-white px-3 py-3 font-mono text-sm text-slate-800">
                            {setupData.secret}
                          </code>
                          <button
                            type="button"
                            onClick={copySecret}
                            className={`${studioGhostButtonClassName} mt-3 w-full sm:w-auto`}
                          >
                            <FaCopy />
                            复制密钥
                          </button>
                        </div>

                        <div className="rounded-[24px] border border-amber-200 bg-amber-50 p-4">
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2 text-sm font-semibold text-amber-800">
                              <FaShieldAlt />
                              恢复码
                            </div>
                            <button
                              type="button"
                              onClick={() => setShowBackupCodes((shown) => !shown)}
                              className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700"
                            >
                              {showBackupCodes ? <FaEyeSlash /> : <FaEye />}
                              {showBackupCodes ? '隐藏' : '显示'}
                            </button>
                          </div>
                          <p className="mt-2 text-sm leading-6 text-amber-800">
                            请在启用前妥善保存。设备丢失时可用它们恢复登录。
                          </p>
                          <AnimatePresence>
                            {showBackupCodes ? (
                              <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                                className="mt-3 grid gap-2 overflow-hidden sm:grid-cols-2"
                              >
                                {setupData.backupCodes.map((code, index) => (
                                  <code
                                    key={code}
                                    className="rounded-xl border border-amber-200 bg-white px-3 py-2 text-center font-mono text-xs text-slate-800"
                                  >
                                    {index + 1}. {code}
                                  </code>
                                ))}
                              </motion.div>
                            ) : null}
                          </AnimatePresence>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-[24px] border border-slate-200 bg-white/90 p-4">
                      <label className="mb-2 block text-sm font-semibold text-slate-900">
                        验证码
                      </label>
                      <input
                        type="text"
                        value={verificationCode}
                        onChange={(event) =>
                          setVerificationCode(event.target.value.replace(/\D/g, '').slice(0, 6))
                        }
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' && !loading && verificationCode.length === 6) {
                            void handleVerify();
                          }
                        }}
                        className={`${studioFieldClassName} text-center font-mono text-lg`}
                        placeholder="000000"
                        maxLength={6}
                        autoComplete="one-time-code"
                      />
                    </div>
                  </>
                ) : null}

                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                  <button
                    type="button"
                    onClick={handleClose}
                    className={`${studioGhostButtonClassName} w-full sm:w-auto`}
                  >
                    <FaBan />
                    取消
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleVerify()}
                    disabled={loading || verificationCode.length !== 6 || !setupData}
                    className={`${studioPrimaryButtonClassName} w-full sm:w-auto`}
                  >
                    {loading ? (
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/50 border-t-white" />
                    ) : (
                      <FaCheck />
                    )}
                    验证并启用
                  </button>
                </div>
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default TOTPSetup;
