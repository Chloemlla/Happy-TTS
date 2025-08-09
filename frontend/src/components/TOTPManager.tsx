import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import TOTPSetup from './TOTPSetup';
import BackupCodesModal from './BackupCodesModal';
import axios from 'axios';
import { TOTPStatus } from '../types/auth';
import { handleTOTPError, cleanTOTPToken, validateTOTPToken } from '../utils/totpUtils';
import { Input } from './ui';
import { useTwoFactorStatus } from '../hooks/useTwoFactorStatus';
import { PasskeySetup } from './PasskeySetup';
import { FaLock, FaCheck, FaClock, FaEye, FaKey } from 'react-icons/fa';

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

  // 获取API基础URL
  const getApiBaseUrl = () => {
    if (import.meta.env.DEV) return 'http://localhost:3000';
    if (import.meta.env.VITE_API_URL) return import.meta.env.VITE_API_URL;
    return 'https://api.hapxs.com';
  };

  const api = axios.create({
    baseURL: getApiBaseUrl(),
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${localStorage.getItem('token')}`
    }
  });

  useEffect(() => {
    fetchStatus();
  }, []);

  const fetchStatus = async () => {
    try {
      setLoading(true);
      const response = await api.get('/api/totp/status');
      setStatus(response.data);
      onStatusChange?.(response.data);
    } catch (error: any) {
      console.error('获取TOTP状态失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSetupSuccess = () => {
    fetchStatus();
  };

  const handleDisable = async () => {
    // 清理输入
    const cleanCode = cleanTOTPToken(disableCode);

    if (!cleanCode.trim()) {
      setError('请输入验证码');
      return;
    }

    if (!validateTOTPToken(cleanCode)) {
      setError('验证码必须是6位数字');
      return;
    }

    try {
      setError('');
      await api.post('/api/totp/disable', {
        token: cleanCode
      });

      setShowDisable(false);
      setDisableCode('');
      fetchStatus();
    } catch (error: any) {
      setError(handleTOTPError(error));
    }
  };

  if (loading) {
    return (
      <motion.div
        className="flex items-center justify-center p-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
      >
        <motion.div
          className="animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-indigo-500"
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
        />
      </motion.div>
    );
  }

  return (
    <>
      <motion.div
        className="bg-white rounded-lg shadow-sm border p-4"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
      >
        <motion.div
          className="flex items-center justify-between mb-4"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
        >
          <div className="flex items-center space-x-3">
            <span className="w-10 h-10 bg-gradient-to-br from-indigo-100 to-purple-100 rounded-lg flex items-center justify-center shadow-sm">
              <FaLock className="w-5 h-5 text-indigo-600" />
            </span>
            <div>
              <div className="text-lg font-semibold text-gray-900">二次验证</div>
              <div className="text-sm text-gray-600">增强账户安全性</div>
            </div>
          </div>
          <div className="flex items-center space-x-2 mt-2">
            {twoFactor.enabled ? (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                <FaCheck className="w-3 h-3 mr-1" />
                已启用（{twoFactor.type.join(' + ')}）
              </span>
            ) : (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800 ml-2 align-middle">
                <FaClock className="w-3 h-3 mr-1" />
                未启用
              </span>
            )}
          </div>
        </motion.div>

        <motion.div
          className="space-y-3"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.4 }}
        >
          {status?.enabled ? (
            <div className="space-y-3">
              <motion.div
                className="bg-green-50 border border-green-200 rounded-lg p-3"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.4, delay: 0.5 }}
                whileHover={{ scale: 1.02, y: -1 }}
              >
                <div className="flex items-start">
                  <FaCheck className="w-5 h-5 text-green-600 mt-0.5 mr-2" />
                  <div>
                    <motion.p
                      className="text-sm font-medium text-green-800"
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3, delay: 0.6 }}
                    >
                      二次验证已启用
                    </motion.p>
                    <motion.p
                      className="text-sm text-green-700 mt-1"
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3, delay: 0.7 }}
                    >
                      您的账户现在受到双重保护，登录时需要输入验证码。
                    </motion.p>
                  </div>
                </div>
              </motion.div>

              {status.hasBackupCodes && (
                <motion.div
                  className="bg-blue-50 border border-blue-200 rounded-lg p-3"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.4, delay: 0.6 }}
                  whileHover={{ scale: 1.02, y: -1 }}
                >
                  <div className="flex items-start">
                    <FaLock className="w-5 h-5 text-blue-600 mt-0.5 mr-2" />
                    <div>
                      <motion.p
                        className="text-sm font-medium text-blue-800"
                        initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.3, delay: 0.7 }}
                      >
                        备用恢复码可用
                      </motion.p>
                      <motion.p
                        className="text-sm text-blue-700 mt-1"
                        initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.3, delay: 0.8 }}
                      >
                        您有备用恢复码，可以在无法使用认证器时登录。
                      </motion.p>
                    </div>
                  </div>
                </motion.div>
              )}

              <motion.div
                className="space-y-2"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.7 }}
              >
                {status.hasBackupCodes && (
                  <motion.button
                    onClick={() => setShowBackupCodes(true)}
                    whileHover={{ scale: 1.02, y: -1 }}
                    whileTap={{ scale: 0.98 }}
                    className="w-full px-4 py-2 border border-blue-300 text-blue-700 rounded-lg hover:bg-blue-50 transition-all duration-200 flex items-center justify-center"
                  >
                    <FaEye className="w-4 h-4 mr-2" />
                    查看备用恢复码
                  </motion.button>
                )}

                <motion.button
                  onClick={() => setShowDisable(true)}
                  whileHover={{ scale: 1.02, y: -1 }}
                  whileTap={{ scale: 0.98 }}
                  className="w-full px-4 py-2 border border-red-300 text-red-700 rounded-lg hover:bg-red-50 transition-all duration-200"
                >
                  禁用二次验证
                </motion.button>
              </motion.div>
            </div>
          ) : (
            <div className="space-y-3">
              <motion.div
                className="bg-yellow-50 border border-yellow-200 rounded-lg p-3"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.4, delay: 0.5 }}
                whileHover={{ scale: 1.02, y: -1 }}
              >
                <div className="flex items-start">
                  <FaClock className="w-5 h-5 text-yellow-600 mt-0.5 mr-2" />
                  <div>
                    <motion.p
                      className="text-sm font-medium text-yellow-800"
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3, delay: 0.6 }}
                    >
                      建议启用二次验证
                    </motion.p>
                    <motion.p
                      className="text-sm text-yellow-700 mt-1"
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3, delay: 0.7 }}
                    >
                      启用二次验证可以为您的账户提供额外的安全保护。
                    </motion.p>
                  </div>
                </div>
              </motion.div>

              <motion.button
                onClick={() => setShowSetup(true)}
                className="w-full px-4 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-lg hover:from-indigo-700 hover:to-purple-700 transition-all duration-200 shadow-lg hover:shadow-xl flex items-center justify-center gap-2"
              >
                <motion.span
                  transition={{ duration: 0.5, type: 'spring', stiffness: 200 }}
                  className="inline-flex items-center"
                >
                  {/* 锁图标 */}
                  <FaLock className="w-5 h-5 text-white" />
                </motion.span>
                <span>设置二次验证</span>
              </motion.button>
            </div>
          )}
        </motion.div>
      </motion.div>

      {/* TOTP设置模态框 */}
      <TOTPSetup
        isOpen={showSetup}
        onClose={() => setShowSetup(false)}
        onSuccess={handleSetupSuccess}
      />

      {/* 备用恢复码模态框 */}
      <BackupCodesModal
        isOpen={showBackupCodes}
        onClose={() => setShowBackupCodes(false)}
      />

      {/* 禁用TOTP模态框 */}
      <AnimatePresence>
        {showDisable && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 overflow-y-auto"
            onClick={() => setShowDisable(false)}
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
                <motion.div
                  className="text-center mb-6"
                  initial={{ opacity: 0, y: -20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.1 }}
                >
                  <motion.h2
                    className="text-2xl font-bold text-gray-900 mb-2"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: 0.2 }}
                  >
                    禁用二次验证
                  </motion.h2>
                  <motion.p
                    className="text-gray-600"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: 0.3 }}
                  >
                    请输入当前验证码以确认禁用
                  </motion.p>
                </motion.div>

                <motion.div
                  className="space-y-4"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.2 }}
                >
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: 0.3 }}
                  >
                    <motion.label
                      className="block text-sm font-medium text-gray-700 mb-2"
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.3, delay: 0.4 }}
                    >
                      验证码
                    </motion.label>
                    <motion.input
                      type="text"
                      value={disableCode}
                      onChange={(e) => setDisableCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent text-center text-lg font-mono transition-all duration-200 hover:border-gray-300"
                      placeholder="000000"
                      maxLength={6}
                      whileFocus={{ scale: 1.02 }}
                    />
                  </motion.div>

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

                  <motion.div
                    className="flex flex-col sm:flex-row space-y-3 sm:space-y-0 sm:space-x-3"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, delay: 0.4 }}
                  >
                    <motion.button
                      onClick={() => setShowDisable(false)}
                      className="flex-1 px-4 py-3 border-2 border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-all duration-200"
                      whileHover={{ scale: 1.02, y: -1 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      取消
                    </motion.button>
                    <motion.button
                      onClick={handleDisable}
                      disabled={disableCode.length !== 6}
                      className="flex-1 px-4 py-3 bg-gradient-to-r from-red-600 to-red-700 text-white rounded-lg hover:from-red-700 hover:to-red-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-lg hover:shadow-xl"
                      whileHover={{ scale: 1.02, y: -1 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      确认禁用
                    </motion.button>
                  </motion.div>
                </motion.div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Passkey 设置按钮（仅TOTP启用时显示） */}
      {status?.enabled && (
        <AnimatePresence>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ duration: 0.5, delay: 0.4 }}
            className="mt-6 flex justify-center"
          >
            <motion.button
              onClick={() => setShowPasskeySetup(true)}
              whileHover={{ scale: 1.02, y: -1 }}
              whileTap={{ scale: 0.98 }}
              className="w-full px-4 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-lg hover:from-indigo-700 hover:to-purple-700 transition-all duration-200 shadow-lg hover:shadow-xl flex items-center justify-center gap-2 text-base font-medium"
            >
              <FaKey className="w-5 h-5 text-white mr-2" />
              <span>管理 Passkey 无密码认证</span>
            </motion.button>
          </motion.div>
        </AnimatePresence>
      )}
      <AnimatePresence>
        {showPasskeySetup && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 overflow-y-auto"
            onClick={() => setShowPasskeySetup(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 50 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 50 }}
              transition={{ duration: 0.4, type: 'spring', stiffness: 300, damping: 25 }}
              style={{ width: '90vw', maxWidth: '900px' }}
              className="bg-white rounded-2xl shadow-2xl w-full mx-auto my-8 min-h-fit border border-gray-100"
              onClick={e => e.stopPropagation()}
            >
              <div className="p-8 max-h-[90vh] overflow-y-auto">
                <PasskeySetup />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default TOTPManager; 