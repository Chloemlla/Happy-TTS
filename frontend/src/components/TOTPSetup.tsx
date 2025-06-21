import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { QRCodeSVG } from 'qrcode.react';
import axios from 'axios';
import { TOTPSetupData } from '../types/auth';
import { handleTOTPError, cleanTOTPToken, validateTOTPToken } from '../utils/totpUtils';

interface TOTPSetupProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const TOTPSetup: React.FC<TOTPSetupProps> = ({ isOpen, onClose, onSuccess }) => {
  const [step, setStep] = useState<'loading' | 'setup' | 'verify' | 'success'>('loading');
  const [setupData, setSetupData] = useState<TOTPSetupData | null>(null);
  const [verificationCode, setVerificationCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showBackupCodes, setShowBackupCodes] = useState(false);

  // 获取API基础URL
  const getApiBaseUrl = () => {
    if (import.meta.env.VITE_API_URL) {
      return import.meta.env.VITE_API_URL;
    }
    return 'https://tts-api.hapxs.com';
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
      generateSetup();
    }
  }, [isOpen]);

  const generateSetup = async () => {
    try {
      setStep('loading');
      setError('');
      
      const response = await api.post('/api/totp/generate-setup');
      setSetupData(response.data);
      setStep('setup');
    } catch (error: any) {
      setError(error.response?.data?.error || '生成TOTP设置失败');
      setStep('setup');
    }
  };

  const handleVerify = async () => {
    // 清理输入
    const cleanCode = cleanTOTPToken(verificationCode);
    
    if (!cleanCode.trim()) {
      setError('请输入验证码');
      return;
    }

    if (!validateTOTPToken(cleanCode)) {
      setError('验证码必须是6位数字');
      return;
    }

    try {
      setLoading(true);
      setError('');
      
      const response = await api.post('/api/totp/verify-and-enable', {
        token: cleanCode
      });
      
      setStep('success');
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 2000);
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
    onClose();
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 overflow-y-auto"
        onClick={handleClose}
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-auto my-8 min-h-fit"
          onClick={(e) => e.stopPropagation()}
        >
          {/* 可滚动的内容容器 */}
          <div className="p-6 max-h-[90vh] overflow-y-auto">
            {/* 标题 */}
            <div className="text-center mb-6">
              <h2 className="text-2xl font-bold text-gray-900 mb-2">设置二次验证</h2>
              <p className="text-gray-600">使用认证器应用扫描QR码</p>
            </div>

            {/* 加载状态 */}
            {step === 'loading' && (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500 mx-auto mb-4"></div>
                <p className="text-gray-600">正在生成设置...</p>
              </div>
            )}

            {/* 设置步骤 */}
            {step === 'setup' && setupData && (
              <div className="space-y-6">
                {/* QR码 */}
                <div className="text-center">
                  <div className="bg-gray-50 rounded-lg p-4 inline-block">
                    <QRCodeSVG
                      value={setupData.otpauthUrl}
                      size={Math.min(256, window.innerWidth * 0.7)}
                      level="M"
                      includeMargin={true}
                      bgColor="#FFFFFF"
                      fgColor="#000000"
                    />
                  </div>
                  <p className="text-xs text-gray-500 mt-2">
                    使用Google Authenticator、Microsoft Authenticator等应用扫描
                  </p>
                </div>

                {/* 密钥 */}
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-sm text-gray-600 mb-2">手动输入密钥（如果无法扫描QR码）：</p>
                  <div className="flex flex-col sm:flex-row items-start sm:items-center space-y-2 sm:space-y-0 sm:space-x-2">
                    <code className="bg-white px-3 py-2 rounded border text-sm font-mono flex-1 break-all">
                      {setupData.secret}
                    </code>
                    <button
                      onClick={() => navigator.clipboard.writeText(setupData.secret)}
                      className="px-3 py-2 bg-indigo-100 text-indigo-700 rounded hover:bg-indigo-200 transition-colors whitespace-nowrap"
                    >
                      复制
                    </button>
                  </div>
                </div>

                {/* 备用恢复码 */}
                <div className="bg-yellow-50 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-medium text-yellow-800">备用恢复码</p>
                    <button
                      onClick={() => setShowBackupCodes(!showBackupCodes)}
                      className="text-sm text-yellow-700 hover:text-yellow-800"
                    >
                      {showBackupCodes ? '隐藏' : '显示'}
                    </button>
                  </div>
                  <p className="text-sm text-yellow-700 mb-2">
                    请妥善保存这些恢复码，在无法使用认证器时可以使用它们登录。
                  </p>
                  {showBackupCodes && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {setupData.backupCodes.map((code, index) => (
                        <code key={index} className="bg-white px-2 py-1 rounded text-xs font-mono text-center break-all">
                          {code}
                        </code>
                      ))}
                    </div>
                  )}
                </div>

                {/* 验证码输入 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    输入6位验证码
                  </label>
                  <input
                    type="text"
                    value={verificationCode}
                    onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-center text-lg font-mono"
                    placeholder="000000"
                    maxLength={6}
                  />
                </div>

                {/* 错误信息 */}
                {error && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                    <p className="text-red-700 text-sm">{error}</p>
                  </div>
                )}

                {/* 操作按钮 */}
                <div className="flex flex-col sm:flex-row space-y-3 sm:space-y-0 sm:space-x-3">
                  <button
                    onClick={handleClose}
                    className="flex-1 px-4 py-3 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    取消
                  </button>
                  <button
                    onClick={handleVerify}
                    disabled={loading || verificationCode.length !== 6}
                    className="flex-1 px-4 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {loading ? '验证中...' : '验证并启用'}
                  </button>
                </div>
              </div>
            )}

            {/* 成功状态 */}
            {step === 'success' && (
              <div className="text-center py-8">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">设置成功！</h3>
                <p className="text-gray-600">二次验证已启用，您的账户现在更加安全。</p>
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default TOTPSetup; 