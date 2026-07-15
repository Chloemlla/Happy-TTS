import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';
import { validateTOTPToken, validateBackupCode, cleanTOTPToken, cleanBackupCode } from '../utils/totpUtils';
import { FaLock, FaInfoCircle } from 'react-icons/fa';
import { getApiBaseUrl } from '../api/api';
import { cn } from '../utils/cn';
import {
import { setAuthToken } from '../utils/authSession';
  authAlertClassName,
  authFieldClassName,
  authModalCardClassName,
  authModalOverlayClassName,
  authPrimaryButtonClassName,
  authSecondaryButtonClassName,
  authSoftBadgeClassName,
  authWarningPanelClassName,
} from './authStudioTheme';
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

  const api = axios.create({
    baseURL: getApiBaseUrl(),
    headers: {
      'Content-Type': 'application/json'
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
        backupCode: useBackupCode ? backupCode : undefined,
        pendingToken: token,
      });

      if (response.data.verified) {
        // TOTP验证成功，保存JWT token并调用成功回调
        if (response.data.token) {
          setAuthToken(response.data.token);
        }
        onSuccess();
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
        className={authModalOverlayClassName}
        onClick={handleClose}
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0, y: 50 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.9, opacity: 0, y: 50 }}
          transition={{ duration: 0.4, type: "spring", stiffness: 300, damping: 25 }}
          className={authModalCardClassName}
          onClick={(e) => e.stopPropagation()}
        >
          {/* 可滚动的内容容器 */}
          <div className="p-4 sm:p-6 md:p-8 overflow-y-auto max-h-[85vh]">
            {/* 标题 */}
            <motion.div
              className="text-center mb-6"
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
            >
              <div className="flex flex-col items-center">
                <div className={cn(authSoftBadgeClassName, 'mx-auto mb-4 h-16 w-16')}>
                  <motion.div
                    initial={{ opacity: 0, rotate: -180 }}
                    animate={{ opacity: 1, rotate: 0 }}
                    transition={{ duration: 0.6, delay: 0.2, type: "spring", stiffness: 200 }}
                    whileHover={{ rotate: 5 }}
                  >
                    <FaLock className="h-8 w-8 text-slate-600" />
                  </motion.div>
                </div>
                <h2 className="mb-2 text-2xl font-semibold text-slate-900">二次验证</h2>
                <div className="text-slate-600">请输入验证码完成登录</div>
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
                className={`flex-1 py-2 px-4 rounded-l-lg text-sm font-medium transition-all duration-200 ${!useBackupCode
                    ? 'bg-slate-900 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                验证码
              </motion.button>
              <motion.button
                onClick={() => setUseBackupCode(true)}
                className={`flex-1 py-2 px-4 rounded-r-lg text-sm font-medium transition-all duration-200 ${useBackupCode
                    ? 'bg-slate-900 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
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
                  <label className="mb-2 block text-sm font-medium text-slate-700">
                    6位验证码
                  </label>
                  <motion.input
                    type="text"
                    value={verificationCode}
                    onChange={(e) => setVerificationCode(cleanTOTPToken(e.target.value))}
                    className={cn(authFieldClassName, 'px-4 text-center font-mono text-lg tracking-wider')}
                    placeholder="000000"
                    maxLength={6}
                    autoFocus
                    whileFocus={{ scale: 1.02 }}
                  />
                  <motion.p
                    className="mt-1 text-xs text-slate-500"
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
                  <label className="mb-2 block text-sm font-medium text-slate-700">
                    8位恢复码
                  </label>
                  <motion.input
                    type="text"
                    value={backupCode}
                    onChange={(e) => setBackupCode(cleanBackupCode(e.target.value))}
                    className={cn(authFieldClassName, 'px-4 text-center font-mono text-lg tracking-wider')}
                    placeholder="ABCD1234"
                    maxLength={8}
                    autoFocus
                    whileFocus={{ scale: 1.02 }}
                  />
                  <motion.p
                    className="mt-1 text-xs text-slate-500"
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
                    className={authAlertClassName}
                    initial={{ opacity: 0, scale: 0.95, y: -10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: -10 }}
                    transition={{ duration: 0.3 }}
                  >
                    <motion.p
                      className="text-sm"
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
                  className={authSecondaryButtonClassName}
                  whileHover={{ scale: 1.02, y: -1 }}
                  whileTap={{ scale: 0.98 }}
                >
                  取消
                </motion.button>
                <motion.button
                  onClick={handleVerify}
                  disabled={loading || (!useBackupCode && verificationCode.length !== 6) || (useBackupCode && backupCode.length !== 8)}
                  className={cn(authPrimaryButtonClassName, 'flex-1')}
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
              className={cn(authWarningPanelClassName, 'mt-6')}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 1.0 }}
              whileHover={{ scale: 1.02, y: -2 }}
            >
              <div className="flex items-start">
                <motion.div
                  whileHover={{ scale: 1.1, rotate: 5 }}
                >
                  <FaInfoCircle className="mr-2 mt-0.5 h-5 w-5 flex-shrink-0 text-slate-500" />
                </motion.div>
                <div>
                  <motion.p
                    className="text-sm font-medium text-slate-900"
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.3, delay: 1.1 }}
                  >
                    需要帮助？
                  </motion.p>
                  <motion.p
                    className="mt-1 text-sm text-slate-600"
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
