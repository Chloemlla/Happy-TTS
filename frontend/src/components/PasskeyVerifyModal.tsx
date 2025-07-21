import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../hooks/useAuth';
import { usePasskey } from '../hooks/usePasskey';
import { ShieldCheckIcon, ExclamationTriangleIcon, ArrowPathIcon } from '@heroicons/react/24/outline';

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
          className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={handleClose}
        >
          <motion.div
            className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto"
            initial={{ scale: 0.8, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.8, opacity: 0, y: 20 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            onClick={e => e.stopPropagation()}
          >
            {/* 标题区域 */}
            <motion.div
              className="text-center mb-6"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
            >
              <div className="flex justify-center mb-4">
                <motion.div
                  className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center"
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.2, type: "spring", damping: 15 }}
                >
                  <ShieldCheckIcon className="w-8 h-8 text-blue-600" />
                </motion.div>
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Passkey 二次校验</h2>
              <p className="text-gray-600 text-sm">
                为了确保账户安全，请使用您的 Passkey 进行身份验证
              </p>
            </motion.div>

            {/* 用户信息提示 */}
            <motion.div
              className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.3 }}
            >
              <div className="flex items-center">
                <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center mr-3">
                  <span className="text-blue-600 font-semibold text-sm">
                    {username.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div>
                  <span className="text-blue-800 font-medium text-sm block">正在验证用户</span>
                  <span className="text-blue-600 text-sm block">{username}</span>
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
              <div className="bg-yellow-50 border-l-4 border-yellow-400 p-3 rounded text-yellow-800 text-sm flex items-center gap-2">
                <svg className="w-5 h-5 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M12 20a8 8 0 100-16 8 8 0 000 16z" /></svg>
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
                    <ArrowPathIcon className="w-8 h-8 text-blue-500" />
                  </motion.div>
                  <div className="space-y-2">
                    <div className="text-gray-700 font-medium">正在进行 Passkey 认证</div>
                    <div className="text-gray-500 text-sm">请在弹出的系统窗口中操作...</div>
                    <div className="w-full bg-gray-100 rounded-full h-2 mt-2">
                      <div className="bg-blue-400 h-2 rounded-full animate-pulse" style={{ width: '80%' }}></div>
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
                    <ExclamationTriangleIcon className="w-8 h-8 text-red-500" />
                  </div>
                  <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                    <div className="text-red-700 text-sm font-medium">{error}</div>
                    <div className="text-red-500 text-xs mt-2">如多次失败，请检查浏览器是否支持 Passkey，或尝试更换浏览器/设备。</div>
                  </div>
                  <motion.button
                    onClick={handlePasskeyAuth}
                    className="w-full bg-blue-500 text-white py-3 px-6 rounded-xl font-medium hover:bg-blue-600 transition-colors duration-200 shadow-lg hover:shadow-xl"
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
                    <div className="text-gray-700 font-medium">准备开始认证</div>
                    <div className="text-gray-500 text-sm">
                      点击下方按钮开始 Passkey 身份验证流程
                    </div>
                  </div>
                  <motion.button
                    onClick={handlePasskeyAuth}
                    className="w-full bg-blue-500 text-white py-3 px-6 rounded-xl font-medium hover:bg-blue-600 transition-colors duration-200 shadow-lg hover:shadow-xl"
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
                <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mb-2">
                  <ShieldCheckIcon className="w-7 h-7 text-green-600" />
                </div>
                <div className="text-green-700 font-semibold">认证成功，已安全登录！</div>
              </motion.div>
            )}

            {/* 底部按钮优化：认证中禁用取消，认证成功后显示“完成” */}
            <motion.div
              className="flex flex-col sm:flex-row justify-end gap-2 mt-6 pt-4 border-t border-gray-200"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
            >
              {success && !loading && !error ? (
                <motion.button
                  type="button"
                  onClick={handleClose}
                  className="px-4 py-2 text-green-700 font-medium rounded-lg bg-green-100 hover:bg-green-200 transition-colors duration-200"
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
                  className="px-4 py-2 text-gray-600 hover:text-gray-800 font-medium rounded-lg hover:bg-gray-100 transition-colors duration-200"
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