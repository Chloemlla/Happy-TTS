import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';
import { validateTOTPToken, validateBackupCode, cleanTOTPToken, cleanBackupCode } from '../utils/totpUtils';
import { Input } from './ui';

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
    if (import.meta.env.DEV) return '';
    if (import.meta.env.VITE_API_URL) return import.meta.env.VITE_API_URL;
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
        transition={{ duration: 0.3 }}
        className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 overflow-y-auto"
        onClick={handleClose}
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0, y: 50 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.9, opacity: 0, y: 50 }}
          transition={{ duration: 0.4, type: "spring", stiffness: 300, damping: 25 }}
          className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-auto my-8 min-h-fit border border-gray-100"
          onClick={(e) => e.stopPropagation()}
        >
          {/* 可滚动的内容容器 */}
          <div className="p-6 max-h-[90vh] overflow-y-auto">
            {/* 标题 */}
            <motion.div 
              className="text-center mb-6"
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
            >
              <div className="flex flex-col items-center">
                <div className="w-16 h-16 bg-gradient-to-br from-indigo-100 to-purple-100 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg">
                  <motion.svg 
                    className="w-8 h-8 text-indigo-600" 
                    fill="none" 
                    stroke="currentColor" 
                    viewBox="0 0 24 24"
                    initial={{ opacity: 0, rotate: -180 }}
                    animate={{ opacity: 1, rotate: 0 }}
                    transition={{ duration: 0.6, delay: 0.2, type: "spring", stiffness: 200 }}
                    whileHover={{ rotate: 5 }}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </motion.svg>
                </div>
                <h2 className="text-2xl font-bold text-gray-900 mb-2">二次验证</h2>
                <p className="text-gray-600">请输入验证码完成登录</p>
              </div>
            </motion.div>

            {/* 切换按钮 */}
            <motion.div 
              className="flex mb-6"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.5 }}
            >
              <motion.button
                onClick={() => setUseBackupCode(false)}
                className={`flex-1 py-2 px-4 rounded-l-lg text-sm font-medium transition-all duration-200 ${
                  !useBackupCode
                    ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-lg'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                验证码
              </motion.button>
              <motion.button
                onClick={() => setUseBackupCode(true)}
                className={`flex-1 py-2 px-4 rounded-r-lg text-sm font-medium transition-all duration-200 ${
                  useBackupCode
                    ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-lg'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                恢复码
              </motion.button>
            </motion.div>

            {/* 输入区域 */}
            <motion.div 
              className="space-y-4"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.6 }}
            >
              {!useBackupCode ? (
                <motion.div
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.4, delay: 0.7 }}
                >
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    6位验证码
                  </label>
                  <motion.input
                    type="text"
                    value={verificationCode}
                    onChange={(e) => setVerificationCode(cleanTOTPToken(e.target.value))}
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-center text-lg font-mono transition-all duration-200 hover:border-gray-300"
                    placeholder="000000"
                    maxLength={6}
                    autoFocus
                    whileFocus={{ scale: 1.02 }}
                  />
                  <motion.p 
                    className="text-xs text-gray-500 mt-1"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.3, delay: 0.8 }}
                  >
                    请在认证器应用中查看6位数字验证码
                  </motion.p>
                </motion.div>
              ) : (
                <motion.div
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.4, delay: 0.7 }}
                >
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    8位恢复码
                  </label>
                  <motion.input
                    type="text"
                    value={backupCode}
                    onChange={(e) => setBackupCode(cleanBackupCode(e.target.value))}
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-center text-lg font-mono transition-all duration-200 hover:border-gray-300"
                    placeholder="ABCD1234"
                    maxLength={8}
                    autoFocus
                    whileFocus={{ scale: 1.02 }}
                  />
                  <motion.p 
                    className="text-xs text-gray-500 mt-1"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.3, delay: 0.8 }}
                  >
                    请输入设置时保存的8位恢复码
                  </motion.p>
                </motion.div>
              )}

              {/* 错误信息 */}
              <AnimatePresence>
                {error && (
                  <motion.div 
                    className="bg-red-50 border border-red-200 rounded-lg p-3"
                    initial={{ opacity: 0, scale: 0.95, y: -10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: -10 }}
                    transition={{ duration: 0.3 }}
                  >
                    <motion.p 
                      className="text-red-700 text-sm"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 0.2, delay: 0.1 }}
                    >
                      {error}
                    </motion.p>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* 操作按钮 */}
              <motion.div 
                className="flex space-x-3"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.9 }}
              >
                <motion.button
                  onClick={handleClose}
                  className="flex-1 px-4 py-3 border-2 border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-all duration-200"
                  whileHover={{ scale: 1.02, y: -1 }}
                  whileTap={{ scale: 0.98 }}
                >
                  取消
                </motion.button>
                <motion.button
                  onClick={handleVerify}
                  disabled={loading || (!useBackupCode && verificationCode.length !== 6) || (useBackupCode && backupCode.length !== 8)}
                  className="flex-1 px-4 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-lg hover:from-indigo-700 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-lg hover:shadow-xl"
                  whileHover={{ scale: 1.02, y: -1 }}
                  whileTap={{ scale: 0.98 }}
                >
                  {loading ? (
                    <motion.div className="flex items-center justify-center">
                      <motion.div 
                        className="w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-2"
                        animate={{ rotate: 360 }}
                        transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                      />
                      验证中...
                    </motion.div>
                  ) : (
                    '验证'
                  )}
                </motion.button>
              </motion.div>
            </motion.div>

            {/* 帮助信息 */}
            <motion.div 
              className="mt-6 p-4 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg border border-blue-200"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 1.0 }}
              whileHover={{ scale: 1.02, y: -2 }}
            >
              <div className="flex items-start">
                <motion.svg 
                  className="w-5 h-5 text-blue-600 mt-0.5 mr-2 flex-shrink-0" 
                  fill="none" 
                  stroke="currentColor" 
                  viewBox="0 0 24 24"
                  whileHover={{ scale: 1.1, rotate: 5 }}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </motion.svg>
                <div>
                  <motion.p 
                    className="text-sm font-medium text-blue-800"
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.3, delay: 1.1 }}
                  >
                    需要帮助？
                  </motion.p>
                  <motion.p 
                    className="text-sm text-blue-700 mt-1"
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.3, delay: 1.2 }}
                  >
                    如果无法使用认证器，请使用备用恢复码登录。如果都没有，请联系管理员。
                  </motion.p>
                </div>
              </div>
            </motion.div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default TOTPVerification; 