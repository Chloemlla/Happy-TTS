import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';
import { validateTOTPToken, validateBackupCode, cleanTOTPToken, cleanBackupCode } from '../utils/totpUtils';

interface TOTPVerificationProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  userId: string;
  token: string;
}

const TOTPVerification: React.FC<TOTPVerificationProps> = ({ 
  isOpen, 
  onClose, 
  onSuccess,
  userId,
  token
}) => {
  const [verificationCode, setVerificationCode] = useState('');
  const [backupCode, setBackupCode] = useState('');
  const [useBackupCode, setUseBackupCode] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

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
      'Authorization': `Bearer ${token}`
    }
  });

  const handleVerify = async () => {
    // 输入验证
    if (!useBackupCode) {
      if (!verificationCode.trim()) {
        setError('请输入验证码');
        return;
      }
      if (!validateTOTPToken(verificationCode)) {
        setError('验证码必须是6位数字');
        return;
      }
    } else {
      if (!backupCode.trim()) {
        setError('请输入恢复码');
        return;
      }
      if (!validateBackupCode(backupCode)) {
        setError('恢复码必须是8位字母数字组合');
        return;
      }
    }

    try {
      setLoading(true);
      setError('');
      
      const response = await api.post('/api/totp/verify-token', {
        userId: userId,
        token: useBackupCode ? undefined : verificationCode,
        backupCode: useBackupCode ? backupCode : undefined
      });

      if (response.data.verified) {
        // TOTP验证成功，保存token并刷新页面
        localStorage.setItem('token', token);
        window.location.reload();
      } else {
        throw new Error('TOTP验证失败');
      }
    } catch (error: any) {
      const errorData = error.response?.data;
      
      if (error.response?.status === 429) {
        // 验证尝试次数过多
        const remainingTime = Math.ceil((errorData.lockedUntil - Date.now()) / 1000 / 60);
        setError(`验证尝试次数过多，请${remainingTime}分钟后再试`);
      } else if (errorData?.remainingAttempts !== undefined) {
        // 显示剩余尝试次数
        const remainingAttempts = errorData.remainingAttempts;
        if (remainingAttempts === 0) {
          const remainingTime = Math.ceil((errorData.lockedUntil - Date.now()) / 1000 / 60);
          setError(`验证码错误，账户已被锁定，请${remainingTime}分钟后再试`);
        } else {
          setError(`验证码错误，还剩${remainingAttempts}次尝试机会`);
        }
      } else {
        setError(errorData?.error || error.message || '验证失败');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setVerificationCode('');
    setBackupCode('');
    setUseBackupCode(false);
    setError('');
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
              <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">二次验证</h2>
              <p className="text-gray-600">请输入验证码完成登录</p>
            </div>

            {/* 切换按钮 */}
            <div className="flex mb-6">
              <button
                onClick={() => setUseBackupCode(false)}
                className={`flex-1 py-2 px-4 rounded-l-lg text-sm font-medium transition-colors ${
                  !useBackupCode
                    ? 'bg-indigo-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                验证码
              </button>
              <button
                onClick={() => setUseBackupCode(true)}
                className={`flex-1 py-2 px-4 rounded-r-lg text-sm font-medium transition-colors ${
                  useBackupCode
                    ? 'bg-indigo-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                恢复码
              </button>
            </div>

            {/* 输入区域 */}
            <div className="space-y-4">
              {!useBackupCode ? (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    6位验证码
                  </label>
                  <input
                    type="text"
                    value={verificationCode}
                    onChange={(e) => setVerificationCode(cleanTOTPToken(e.target.value))}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-center text-lg font-mono"
                    placeholder="000000"
                    maxLength={6}
                    autoFocus
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    请在认证器应用中查看6位数字验证码
                  </p>
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    8位恢复码
                  </label>
                  <input
                    type="text"
                    value={backupCode}
                    onChange={(e) => setBackupCode(cleanBackupCode(e.target.value))}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-center text-lg font-mono"
                    placeholder="ABCD1234"
                    maxLength={8}
                    autoFocus
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    请输入设置时保存的8位恢复码
                  </p>
                </div>
              )}

              {/* 错误信息 */}
              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                  <p className="text-red-700 text-sm">{error}</p>
                </div>
              )}

              {/* 操作按钮 */}
              <div className="flex space-x-3">
                <button
                  onClick={handleClose}
                  className="flex-1 px-4 py-3 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={handleVerify}
                  disabled={loading || (!useBackupCode && verificationCode.length !== 6) || (useBackupCode && backupCode.length !== 8)}
                  className="flex-1 px-4 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {loading ? '验证中...' : '验证'}
                </button>
              </div>
            </div>

            {/* 帮助信息 */}
            <div className="mt-6 p-4 bg-blue-50 rounded-lg">
              <div className="flex items-start">
                <svg className="w-5 h-5 text-blue-600 mt-0.5 mr-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div>
                  <p className="text-sm font-medium text-blue-800">需要帮助？</p>
                  <p className="text-sm text-blue-700 mt-1">
                    如果无法使用认证器，请使用备用恢复码登录。如果都没有，请联系管理员。
                  </p>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default TOTPVerification; 