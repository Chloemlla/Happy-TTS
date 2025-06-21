import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import TOTPSetup from './TOTPSetup';
import axios from 'axios';
import { TOTPStatus } from '../types/auth';
import { handleTOTPError, cleanTOTPToken, validateTOTPToken } from '../utils/totpUtils';

interface TOTPManagerProps {
  onStatusChange?: (status: TOTPStatus) => void;
}

const TOTPManager: React.FC<TOTPManagerProps> = ({ onStatusChange }) => {
  const [status, setStatus] = useState<TOTPStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [showSetup, setShowSetup] = useState(false);
  const [showDisable, setShowDisable] = useState(false);
  const [disableCode, setDisableCode] = useState('');
  const [error, setError] = useState('');

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
      <div className="flex items-center justify-center p-4">
        <div className="animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-indigo-500"></div>
      </div>
    );
  }

  return (
    <>
      <div className="bg-white rounded-lg shadow-sm border p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center">
              <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">二次验证</h3>
              <p className="text-sm text-gray-600">增强账户安全性</p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            {status?.enabled ? (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                已启用
              </span>
            ) : (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                未启用
              </span>
            )}
          </div>
        </div>

        <div className="space-y-3">
          {status?.enabled ? (
            <div className="space-y-3">
              <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                <div className="flex items-start">
                  <svg className="w-5 h-5 text-green-600 mt-0.5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div>
                    <p className="text-sm font-medium text-green-800">二次验证已启用</p>
                    <p className="text-sm text-green-700 mt-1">
                      您的账户现在受到双重保护，登录时需要输入验证码。
                    </p>
                  </div>
                </div>
              </div>

              {status.hasBackupCodes && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <div className="flex items-start">
                    <svg className="w-5 h-5 text-blue-600 mt-0.5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                    <div>
                      <p className="text-sm font-medium text-blue-800">备用恢复码可用</p>
                      <p className="text-sm text-blue-700 mt-1">
                        您有备用恢复码，可以在无法使用认证器时登录。
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <motion.button
                onClick={() => setShowDisable(true)}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="w-full px-4 py-2 border border-red-300 text-red-700 rounded-lg hover:bg-red-50 transition-colors"
              >
                禁用二次验证
              </motion.button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                <div className="flex items-start">
                  <svg className="w-5 h-5 text-yellow-600 mt-0.5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                  </svg>
                  <div>
                    <p className="text-sm font-medium text-yellow-800">建议启用二次验证</p>
                    <p className="text-sm text-yellow-700 mt-1">
                      启用二次验证可以为您的账户提供额外的安全保护。
                    </p>
                  </div>
                </div>
              </div>

              <motion.button
                onClick={() => setShowSetup(true)}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="w-full px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
              >
                设置二次验证
              </motion.button>
            </div>
          )}
        </div>
      </div>

      {/* TOTP设置模态框 */}
      <TOTPSetup
        isOpen={showSetup}
        onClose={() => setShowSetup(false)}
        onSuccess={handleSetupSuccess}
      />

      {/* 禁用TOTP模态框 */}
      {showDisable && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 overflow-y-auto"
          onClick={() => setShowDisable(false)}
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
              <div className="text-center mb-6">
                <h2 className="text-2xl font-bold text-gray-900 mb-2">禁用二次验证</h2>
                <p className="text-gray-600">请输入当前验证码以确认禁用</p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    验证码
                  </label>
                  <input
                    type="text"
                    value={disableCode}
                    onChange={(e) => setDisableCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent text-center text-lg font-mono"
                    placeholder="000000"
                    maxLength={6}
                  />
                </div>

                {error && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                    <p className="text-red-700 text-sm">{error}</p>
                  </div>
                )}

                <div className="flex flex-col sm:flex-row space-y-3 sm:space-y-0 sm:space-x-3">
                  <button
                    onClick={() => setShowDisable(false)}
                    className="flex-1 px-4 py-3 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    取消
                  </button>
                  <button
                    onClick={handleDisable}
                    disabled={disableCode.length !== 6}
                    className="flex-1 px-4 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    确认禁用
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </>
  );
};

export default TOTPManager; 