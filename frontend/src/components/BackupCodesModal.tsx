import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';
import { useNotification } from './Notification';

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

  // 获取API基础URL
  const getApiBaseUrl = () => {
    if (import.meta.env.DEV) return 'http://localhost:3000';
    if (import.meta.env.VITE_API_URL) return import.meta.env.VITE_API_URL;
    return 'https://api.951100.xyz';
  };

  const api = axios.create({
    baseURL: getApiBaseUrl(),
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${localStorage.getItem('token')}`
    }
  });

  useEffect(() => {
    if (isOpen) {
      fetchBackupCodes();
    }
  }, [isOpen]);

  const fetchBackupCodes = async () => {
    try {
      setLoading(true);
      setError('');
      const response = await api.get<BackupCodesResponse>('/api/totp/backup-codes');
      setBackupCodes(response.data.backupCodes);
    } catch (error: any) {
      console.error('获取备用恢复码失败:', error);
      setNotification({ message: error.response?.data?.error || '获取备用恢复码失败', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const regenerateBackupCodes = async () => {
    try {
      setRegenerating(true);
      setError('');
      const response = await api.post<BackupCodesResponse>('/api/totp/regenerate-backup-codes');
      setBackupCodes(response.data.backupCodes);
      setShowRegenerateConfirm(false);
      setShowCodes(true); // 重新生成后自动显示新的恢复码
    } catch (error: any) {
      console.error('重新生成备用恢复码失败:', error);
      setNotification({ message: error.response?.data?.error || '重新生成备用恢复码失败', type: 'error' });
    } finally {
      setRegenerating(false);
    }
  };

  const downloadBackupCodes = () => {
    const content = `Happy TTS 备用恢复码

重要提示：
- 请妥善保管这些恢复码，它们可以用于在无法使用认证器时登录您的账户
- 每个恢复码只能使用一次
- 如果所有恢复码都用完，您需要重新生成

您的备用恢复码：
${backupCodes.map((code, index) => `${index + 1}. ${code}`).join('\n')}

生成时间：${new Date().toLocaleString('zh-CN')}
剩余数量：${backupCodes.length} 个

安全建议：
- 将恢复码保存在安全的地方
- 不要与他人分享这些恢复码
- 如果怀疑恢复码泄露，请立即重新生成`;

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
          body { font-family: Arial, sans-serif; margin: 20px; }
          .header { text-align: center; margin-bottom: 30px; }
          .warning { background: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; margin: 20px 0; border-radius: 5px; }
          .codes { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; margin: 20px 0; }
          .code { background: #f8f9fa; padding: 10px; border-radius: 5px; font-family: monospace; font-size: 16px; text-align: center; }
          .footer { margin-top: 30px; font-size: 12px; color: #666; }
          @media print { body { margin: 0; } }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>Happy TTS 备用恢复码</h1>
        </div>
        
        <div class="warning">
          <strong>重要提示：</strong>
          <ul>
            <li>请妥善保管这些恢复码，它们可以用于在无法使用认证器时登录您的账户</li>
            <li>每个恢复码只能使用一次</li>
            <li>如果所有恢复码都用完，您需要重新生成</li>
          </ul>
        </div>
        
        <h2>您的备用恢复码：</h2>
        <div class="codes">
          ${backupCodes.map((code, index) => `<div class="code">${index + 1}. ${code}</div>`).join('')}
        </div>
        
        <div class="footer">
          <p>生成时间：${new Date().toLocaleString('zh-CN')}</p>
          <p>剩余数量：${backupCodes.length} 个</p>
          <p><strong>安全建议：</strong></p>
          <ul>
            <li>将恢复码保存在安全的地方</li>
            <li>不要与他人分享这些恢复码</li>
            <li>如果怀疑恢复码泄露，请立即重新生成</li>
          </ul>
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

  const handleShowCodes = () => {
    setShowCodes(true);
  };

  const handleHideCodes = () => {
    setShowCodes(false);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 overflow-y-auto"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-auto my-8 min-h-fit"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-gray-900">备用恢复码</h2>
                <button
                  onClick={onClose}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-indigo-500"></div>
                </div>
              ) : error ? (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <p className="text-red-700">{error}</p>
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <div className="flex items-start">
                      <svg className="w-5 h-5 text-blue-600 mt-0.5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <div>
                        <p className="text-sm font-medium text-blue-800">重要提示</p>
                        <ul className="text-sm text-blue-700 mt-1 space-y-1">
                          <li>• 请妥善保管这些恢复码，它们可以用于在无法使用认证器时登录您的账户</li>
                          <li>• 每个恢复码只能使用一次</li>
                          <li>• 如果所有恢复码都用完，您需要重新生成</li>
                        </ul>
                      </div>
                    </div>
                  </div>

                  {!showCodes ? (
                    <div className="text-center py-8">
                      <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <svg className="w-8 h-8 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                        </svg>
                      </div>
                      <p className="text-gray-600 mb-4">您有 {backupCodes.length} 个备用恢复码</p>
                      <div className="flex flex-col sm:flex-row gap-3 justify-center">
                        <button
                          onClick={handleShowCodes}
                          className="px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
                        >
                          查看恢复码
                        </button>
                        <button
                          onClick={() => setShowRegenerateConfirm(true)}
                          className="px-6 py-3 border border-red-300 text-red-600 rounded-lg hover:bg-red-50 transition-colors"
                        >
                          重新生成
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-3">
                        {backupCodes.map((code, index) => (
                          <div
                            key={index}
                            className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-center"
                          >
                            <div className="text-xs text-gray-500 mb-1">{index + 1}</div>
                            <div className="font-mono text-lg font-semibold text-gray-900">{code}</div>
                          </div>
                        ))}
                      </div>

                      <div className="flex flex-col sm:flex-row gap-3 pt-4">
                        <button
                          onClick={downloadBackupCodes}
                          className="flex-1 px-4 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors flex items-center justify-center"
                        >
                          <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                          下载为文本文件
                        </button>
                        <button
                          onClick={printBackupCodes}
                          className="flex-1 px-4 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors flex items-center justify-center"
                        >
                          <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                          </svg>
                          打印
                        </button>
                      </div>

                      <div className="flex flex-col sm:flex-row gap-3">
                        <button
                          onClick={handleHideCodes}
                          className="flex-1 px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
                        >
                          隐藏恢复码
                        </button>
                        <button
                          onClick={() => setShowRegenerateConfirm(true)}
                          className="flex-1 px-4 py-2 border border-red-300 text-red-600 rounded-lg hover:bg-red-50 transition-colors"
                        >
                          重新生成
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* 重新生成确认对话框 */}
              <AnimatePresence>
                {showRegenerateConfirm && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-60"
                    onClick={() => setShowRegenerateConfirm(false)}
                  >
                    <motion.div
                      initial={{ scale: 0.9, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0.9, opacity: 0 }}
                      className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md mx-4"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex items-center mb-4">
                        <svg className="w-6 h-6 text-red-600 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                        </svg>
                        <h3 className="text-lg font-semibold text-gray-900">重新生成恢复码</h3>
                      </div>

                      <p className="text-gray-600 mb-6">
                        重新生成将替换所有现有的备用恢复码。旧的恢复码将无法再使用。
                        确定要继续吗？
                      </p>

                      <div className="flex gap-3">
                        <button
                          onClick={() => setShowRegenerateConfirm(false)}
                          className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                          disabled={regenerating}
                        >
                          取消
                        </button>
                        <button
                          onClick={regenerateBackupCodes}
                          className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
                          disabled={regenerating}
                        >
                          {regenerating ? (
                            <div className="flex items-center justify-center">
                              <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white mr-2"></div>
                              生成中...
                            </div>
                          ) : (
                            '确认重新生成'
                          )}
                        </button>
                      </div>
                    </motion.div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default BackupCodesModal; 