import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import axios from 'axios';
import {
  FaDownload,
  FaExclamationTriangle,
  FaEye,
  FaEyeSlash,
  FaPrint,
  FaRedo,
  FaShieldAlt,
  FaTimes,
} from 'react-icons/fa';
import { useNotification } from './Notification';
import { getApiBaseUrl } from '../api/api';
import {
  studioGhostButtonClassName,
  studioModalCardClassName,
  studioModalOverlayClassName,
  studioPageFont,
  studioPrimaryButtonClassName,
} from './studioTheme';

interface BackupCodesModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface BackupCodesResponse {
  backupCodes: string[];
  remainingCount: number;
  message: string;
}

const BackupCodesModal: React.FC<BackupCodesModalProps> = ({ isOpen, onClose }) => {
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showCodes, setShowCodes] = useState(false);
  const [showRegenerateConfirm, setShowRegenerateConfirm] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const { setNotification } = useNotification();

  const api = useMemo(
    () =>
      axios.create({
        baseURL: getApiBaseUrl(),
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
      }),
    [],
  );

  useEffect(() => {
    if (!isOpen) return;

    const fetchBackupCodes = async () => {
      try {
        setLoading(true);
        setError('');
        setShowCodes(false);
        const response = await api.get<BackupCodesResponse>('/api/totp/backup-codes');
        setBackupCodes(response.data.backupCodes);
      } catch (error: any) {
        const message = error.response?.data?.error || '获取备用恢复码失败';
        console.error('获取备用恢复码失败:', error);
        setError(message);
        setNotification({ message, type: 'error' });
      } finally {
        setLoading(false);
      }
    };

    void fetchBackupCodes();
  }, [api, isOpen, setNotification]);

  const regenerateBackupCodes = async () => {
    try {
      setRegenerating(true);
      setError('');
      const response = await api.post<BackupCodesResponse>('/api/totp/regenerate-backup-codes');
      setBackupCodes(response.data.backupCodes);
      setShowRegenerateConfirm(false);
      setShowCodes(true);
      setNotification({ message: '恢复码已重新生成', type: 'success' });
    } catch (error: any) {
      const message = error.response?.data?.error || '重新生成备用恢复码失败';
      console.error('重新生成备用恢复码失败:', error);
      setError(message);
      setNotification({ message, type: 'error' });
    } finally {
      setRegenerating(false);
    }
  };

  const downloadBackupCodes = () => {
    const content = `Synapse 备用恢复码

重要提示：
- 请妥善保管这些恢复码，它们可以用于在无法使用认证器时登录您的账户
- 每个恢复码只能使用一次
- 如果所有恢复码都用完，您需要重新生成

您的备用恢复码：
${backupCodes.map((code, index) => `${index + 1}. ${code}`).join('\n')}

生成时间：${new Date().toLocaleString('zh-CN')}
剩余数量：${backupCodes.length} 个`;

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `backup-codes-${new Date().toISOString().split('T')[0]}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const printBackupCodes = () => {
    const printContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>备用恢复码</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 24px; color: #0f172a; }
          .header { margin-bottom: 24px; }
          .warning { background: #fffbeb; border: 1px solid #fde68a; padding: 16px; margin: 16px 0; border-radius: 12px; }
          .codes { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; margin: 20px 0; }
          .code { background: #f8fafc; padding: 10px; border: 1px solid #e2e8f0; border-radius: 10px; font-family: monospace; font-size: 16px; text-align: center; }
          .footer { margin-top: 24px; font-size: 12px; color: #64748b; }
          @media print { body { margin: 0; } }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>Synapse 备用恢复码</h1>
        </div>
        <div class="warning">
          请妥善保管这些恢复码。每个恢复码只能使用一次。
        </div>
        <div class="codes">
          ${backupCodes.map((code, index) => `<div class="code">${index + 1}. ${code}</div>`).join('')}
        </div>
        <div class="footer">
          <p>生成时间：${new Date().toLocaleString('zh-CN')}</p>
          <p>剩余数量：${backupCodes.length} 个</p>
        </div>
      </body>
      </html>
    `;

    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(printContent);
      printWindow.document.close();
      printWindow.focus();
      printWindow.print();
      printWindow.close();
    }
  };

  return (
    <AnimatePresence>
      {isOpen ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className={studioModalOverlayClassName}
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 18 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 18 }}
            className={`${studioModalCardClassName} max-w-2xl`}
            style={{ fontFamily: studioPageFont }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="max-h-[82vh] overflow-y-auto pr-1">
              <div className="mb-5 flex items-start justify-between gap-4">
                <div className="flex min-w-0 gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-900 text-white">
                    <FaShieldAlt />
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-xl font-semibold text-slate-900">备用恢复码</h2>
                    <p className="mt-1 text-sm leading-6 text-slate-500">
                      在无法使用认证器时，用恢复码完成登录。
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-full border border-slate-200 bg-white/80 p-2 text-slate-400 transition hover:border-slate-300 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 focus-visible:ring-offset-2"
                  aria-label="关闭备用恢复码"
                  title="关闭"
                >
                  <FaTimes />
                </button>
              </div>

              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-slate-900" />
                </div>
              ) : error ? (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  {error}
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="rounded-[24px] border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-800">
                    <div className="mb-1 flex items-center gap-2 font-semibold">
                      <FaExclamationTriangle />
                      请妥善保存
                    </div>
                    每个恢复码只能使用一次。重新生成后，旧恢复码会立即失效。
                  </div>

                  <div className="rounded-[24px] border border-slate-200 bg-white/90 p-4">
                    {!showCodes ? (
                      <div className="py-6 text-center">
                        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
                          <FaShieldAlt />
                        </div>
                        <p className="text-sm text-slate-500">
                          当前有 <span className="font-semibold text-slate-900">{backupCodes.length}</span> 个恢复码。
                        </p>
                      </div>
                    ) : (
                      <div className="grid gap-2 sm:grid-cols-2">
                        {backupCodes.map((code, index) => (
                          <div
                            key={code}
                            className="rounded-2xl border border-slate-200 bg-slate-50/80 px-3 py-3 text-center"
                          >
                            <div className="text-[11px] text-slate-400">{index + 1}</div>
                            <div className="mt-1 font-mono text-sm font-semibold text-slate-900">
                              {code}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="grid gap-2 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => setShowCodes((shown) => !shown)}
                      className={studioPrimaryButtonClassName}
                    >
                      {showCodes ? <FaEyeSlash /> : <FaEye />}
                      {showCodes ? '隐藏恢复码' : '查看恢复码'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowRegenerateConfirm(true)}
                      className={`${studioGhostButtonClassName} border-rose-200 text-rose-600 hover:border-rose-300 hover:text-rose-700`}
                    >
                      <FaRedo />
                      重新生成
                    </button>
                    {showCodes ? (
                      <>
                        <button
                          type="button"
                          onClick={downloadBackupCodes}
                          className={studioGhostButtonClassName}
                        >
                          <FaDownload />
                          下载
                        </button>
                        <button
                          type="button"
                          onClick={printBackupCodes}
                          className={studioGhostButtonClassName}
                        >
                          <FaPrint />
                          打印
                        </button>
                      </>
                    ) : null}
                  </div>
                </div>
              )}
            </div>

            <AnimatePresence>
              {showRegenerateConfirm ? (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/30 p-4 backdrop-blur-sm"
                  onClick={() => setShowRegenerateConfirm(false)}
                >
                  <motion.div
                    initial={{ opacity: 0, scale: 0.96, y: 18 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.96, y: 18 }}
                    className={`${studioModalCardClassName} max-w-md`}
                    onClick={(event) => event.stopPropagation()}
                  >
                    <div className="mb-3 flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-rose-50 text-rose-600">
                        <FaExclamationTriangle />
                      </div>
                      <h3 className="text-lg font-semibold text-slate-900">重新生成恢复码</h3>
                    </div>
                    <p className="text-sm leading-6 text-slate-500">
                      这会替换所有现有恢复码，旧恢复码将无法再使用。
                    </p>
                    <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                      <button
                        type="button"
                        onClick={() => setShowRegenerateConfirm(false)}
                        className={`${studioGhostButtonClassName} w-full sm:w-auto`}
                        disabled={regenerating}
                      >
                        取消
                      </button>
                      <button
                        type="button"
                        onClick={() => void regenerateBackupCodes()}
                        className={`${studioPrimaryButtonClassName} w-full bg-rose-600 hover:bg-rose-700 sm:w-auto`}
                        disabled={regenerating}
                      >
                        {regenerating ? (
                          <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/50 border-t-white" />
                        ) : (
                          <FaRedo />
                        )}
                        确认生成
                      </button>
                    </div>
                  </motion.div>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
};

export default BackupCodesModal;
