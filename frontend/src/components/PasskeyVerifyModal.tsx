import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../hooks/useAuth';
import { usePasskey } from '../hooks/usePasskey';
import { FaShieldAlt, FaExclamationTriangle, FaSync } from 'react-icons/fa';
import { cn } from '../utils/cn';
import {
  authAlertClassName,
  authElevatedPanelClassName,
  authEyebrowClassName,
  authModalCardClassName,
  authModalOverlayClassName,
  authPrimaryButtonClassName,
  authSecondaryButtonClassName,
  authSoftBadgeClassName,
  authSuccessPanelClassName,
} from './authStudioTheme';

interface PasskeyVerifyModalProps {
  open: boolean;
  username: string;
  onSuccess: () => void;
  onClose: () => void;
}

const PasskeyVerifyModal: React.FC<PasskeyVerifyModalProps> = ({ open, username, onSuccess, onClose }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false); // 新增认证成功状态
  const { authenticateWithPasskey } = usePasskey();

  const handlePasskeyAuth = async () => {
    setError('');
    setLoading(true);
    try {
      const result = await authenticateWithPasskey(username);
      if (result === true) {
        setSuccess(true); // 标记认证成功
        onSuccess();
      } else {
        setError('认证失败，请重试');
      }
    } catch (e: any) {
      setError(e?.message || '认证失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  // 关闭弹窗时重置状态
  const handleClose = () => {
    setSuccess(false);
    setError('');
    setLoading(false);
    onClose();
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className={authModalOverlayClassName}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={handleClose}
        >
          <motion.div
            className={authModalCardClassName}
            initial={{ scale: 0.8, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.8, opacity: 0, y: 20 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            onClick={e => e.stopPropagation()}
          >
            {/* 标题区域 */}
            <motion.div
              className="mb-6 text-center"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
            >
              <div className="flex justify-center mb-4">
                <motion.div
                  className={cn(authSoftBadgeClassName, 'h-16 w-16')}
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.2, type: "spring", damping: 15 }}
                >
                  <FaShieldAlt className="h-8 w-8 text-slate-600" />
                </motion.div>
              </div>
              <div className={authEyebrowClassName}>Passkey Verification</div>
              <h2 className="mt-2 text-2xl font-semibold text-slate-900">Passkey 二次校验</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                为了确保账户安全，请使用您的 Passkey 进行身份验证
              </p>
            </motion.div>

            {/* 用户信息提示 */}
            <motion.div
              className={cn(authElevatedPanelClassName, 'mb-6 p-4')}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.3 }}
            >
              <div className="flex items-center">
                <div className="mr-3 flex h-8 w-8 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50">
                  <span className="text-sm font-semibold text-slate-600">
                    {username.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div>
                  <span className="block text-sm font-medium text-slate-900">正在验证用户</span>
                  <span className="block text-sm text-slate-500">{username}</span>
                </div>
              </div>
            </motion.div>

            {/* 认证流程说明和安全提示 */}
            <motion.div
              className="mb-4"
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
            >
              <div className="flex items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50/80 p-3 text-sm leading-6 text-amber-800">
                <svg className="h-5 w-5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M12 20a8 8 0 100-16 8 8 0 000 16z" /></svg>
                <span>Passkey 是一种基于 FIDO2 的无密码认证方式，认证过程将唤起系统安全验证，保障账户安全。</span>
              </div>
            </motion.div>

            {/* 状态内容 */}
            <motion.div
              className="text-center"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
            >
              {loading ? (
                <div className="space-y-4">
                  <motion.div
                    className="flex justify-center"
                    animate={{ rotate: 360 }}
                    transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                  >
                    <FaSync className="h-8 w-8 text-slate-500" />
                  </motion.div>
                  <div className="space-y-2">
                    <div className="font-medium text-slate-800">正在进行 Passkey 认证</div>
                    <div className="text-sm text-slate-500">请在弹出的系统窗口中操作...</div>
                    <div className="mt-2 h-2 w-full rounded-full bg-slate-100">
                      <div className="h-2 animate-pulse rounded-full bg-slate-500" style={{ width: '80%' }}></div>
                    </div>
                  </div>
                </div>
              ) : error ? (
                <motion.div
                  className="space-y-4"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                >
                  <div className="flex justify-center">
                    <FaExclamationTriangle className="w-8 h-8 text-red-500" />
                  </div>
                  <div className={authAlertClassName}>
                    <div className="font-medium">{error}</div>
                    <div className="mt-2 text-xs">如多次失败，请检查浏览器是否支持 Passkey，或尝试更换浏览器/设备。</div>
                  </div>
                  <motion.button
                    onClick={handlePasskeyAuth}
                    className={authPrimaryButtonClassName}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    重新尝试
                  </motion.button>
                </motion.div>
              ) : (
                <motion.div
                  className="space-y-4"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  <div className="space-y-2">
                    <div className="font-medium text-slate-800">准备开始认证</div>
                    <div className="text-sm text-slate-500">
                      点击下方按钮开始 Passkey 身份验证流程
                    </div>
                  </div>
                  <motion.button
                    onClick={handlePasskeyAuth}
                    className={authPrimaryButtonClassName}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    开始 Passkey 认证
                  </motion.button>
                </motion.div>
              )}
            </motion.div>

            {/* 认证成功提示（仅认证成功后显示） */}
            {success && !loading && !error && (
              <motion.div
                className="flex flex-col items-center mt-6"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.2 }}
              >
                <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-100">
                  <FaShieldAlt className="h-7 w-7 text-emerald-600" />
                </div>
                <div className={authSuccessPanelClassName}>认证成功，已安全登录！</div>
              </motion.div>
            )}

            {/* 底部按钮优化：认证中禁用取消，认证成功后显示“完成” */}
            <motion.div
              className="mt-6 flex flex-col justify-end gap-2 border-t border-slate-200 pt-4 sm:flex-row"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
            >
              {success && !loading && !error ? (
                <motion.button
                  type="button"
                  onClick={handleClose}
                  className={authSecondaryButtonClassName}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  完成
                </motion.button>
              ) : (
                <motion.button
                  type="button"
                  onClick={handleClose}
                  disabled={loading}
                  className={authSecondaryButtonClassName}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  取消
                </motion.button>
              )}
            </motion.div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default PasskeyVerifyModal; 
