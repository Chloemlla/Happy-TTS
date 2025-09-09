import React, { useState, useRef, useCallback, useEffect } from 'react';
import { motion as m, AnimatePresence } from 'framer-motion';
import HCaptchaWidget, { HCaptchaWidgetRef } from './HCaptchaWidget';
import { LoadingSpinner } from './LoadingSpinner';
import { api } from '../api/api';

interface VerificationResult {
  success: boolean;
  message: string;
  score?: number;
  timestamp?: string;
  details?: {
    hostname?: string;
    challenge_ts?: string;
    error_codes?: string[];
  };
}

interface HCaptchaVerificationPageProps {
  siteKey?: string;
  onVerificationSuccess?: (result: VerificationResult) => void;
  onVerificationFailure?: (error: string) => void;
  title?: string;
  description?: string;
  showBackButton?: boolean;
  onBack?: () => void;
}

const HCaptchaVerificationPage: React.FC<HCaptchaVerificationPageProps> = ({
  siteKey,
  onVerificationSuccess,
  onVerificationFailure,
  title = "人机验证",
  description = "请完成以下验证以继续访问",
  showBackButton = false,
  onBack
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [verificationResult, setVerificationResult] = useState<VerificationResult | null>(null);
  const [error, setError] = useState<string>('');
  const [captchaToken, setCaptchaToken] = useState<string>('');
  const [siteKeyConfig, setSiteKeyConfig] = useState<string>('');
  const hcaptchaRef = useRef<HCaptchaWidgetRef>(null);

  // 获取 hCaptcha 配置
  useEffect(() => {
    const fetchHCaptchaConfig = async () => {
      try {
        // 首先尝试从公共配置获取
        const response = await api.get('/api/turnstile/public-config');
        if (response.data?.hcaptchaEnabled && response.data?.hcaptchaSiteKey) {
          setSiteKeyConfig(response.data.hcaptchaSiteKey);
        } else {
          setError('hCaptcha 未启用或配置不完整');
        }
      } catch (err) {
        console.error('获取 hCaptcha 配置失败:', err);
        setError('无法获取验证配置，请稍后重试');
      }
    };

    if (!siteKey) {
      fetchHCaptchaConfig();
    } else {
      setSiteKeyConfig(siteKey);
    }
  }, [siteKey]);

  // 处理 hCaptcha 验证完成
  const handleCaptchaVerify = useCallback(async (token: string) => {
    setCaptchaToken(token);
    setIsLoading(true);
    setError('');
    setVerificationResult(null);

    try {
      // 向后端发送验证请求
      const response = await api.post('/api/turnstile/hcaptcha-verify', {
        token,
        timestamp: new Date().toISOString()
      });

      const result: VerificationResult = {
        success: response.data.success || false,
        message: response.data.message || '验证完成',
        score: response.data.score,
        timestamp: response.data.timestamp || new Date().toISOString(),
        details: response.data.details
      };

      setVerificationResult(result);

      if (result.success) {
        onVerificationSuccess?.(result);
      } else {
        onVerificationFailure?.(result.message);
      }
    } catch (err: any) {
      const errorMessage = err.response?.data?.message || '验证失败，请重试';
      setError(errorMessage);
      onVerificationFailure?.(errorMessage);
      
      // 重置验证码
      hcaptchaRef.current?.reset();
    } finally {
      setIsLoading(false);
    }
  }, [onVerificationSuccess, onVerificationFailure]);

  // 处理验证码过期
  const handleCaptchaExpire = useCallback(() => {
    setCaptchaToken('');
    setVerificationResult(null);
    setError('验证码已过期，请重新验证');
  }, []);

  // 处理验证码错误
  const handleCaptchaError = useCallback((error: any) => {
    console.error('hCaptcha 错误:', error);
    setError('验证组件加载失败，请刷新页面重试');
  }, []);

  // 重新验证
  const handleRetry = useCallback(() => {
    setError('');
    setVerificationResult(null);
    setCaptchaToken('');
    hcaptchaRef.current?.reset();
  }, []);

  // 页面动画变体
  const pageVariants = {
    initial: { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -20 }
  };

  const cardVariants = {
    initial: { scale: 0.9, opacity: 0 },
    animate: { scale: 1, opacity: 1 },
    exit: { scale: 0.9, opacity: 0 }
  };

  return (
    <m.div
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4"
    >
      <m.div
        variants={cardVariants}
        initial="initial"
        animate="animate"
        transition={{ delay: 0.1, duration: 0.5 }}
        className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-md"
      >
        {/* 头部 */}
        <div className="text-center mb-8">
          <m.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
            className="w-16 h-16 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-full flex items-center justify-center mx-auto mb-4"
          >
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </m.div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">{title}</h1>
          <p className="text-gray-600">{description}</p>
        </div>

        {/* 验证区域 */}
        <div className="space-y-6">
          {/* hCaptcha 组件 */}
          {siteKeyConfig && !verificationResult && (
            <m.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
              className="flex justify-center"
            >
              <HCaptchaWidget
                ref={hcaptchaRef}
                siteKey={siteKeyConfig}
                onVerify={handleCaptchaVerify}
                onExpire={handleCaptchaExpire}
                onError={handleCaptchaError}
                theme="light"
                size="normal"
              />
            </m.div>
          )}

          {/* 加载状态 */}
          <AnimatePresence>
            {isLoading && (
              <m.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                className="flex flex-col items-center space-y-3"
              >
                <LoadingSpinner />
                <p className="text-sm text-gray-600">正在验证中...</p>
              </m.div>
            )}
          </AnimatePresence>

          {/* 验证结果 */}
          <AnimatePresence>
            {verificationResult && (
              <m.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className={`p-4 rounded-lg border-2 ${
                  verificationResult.success
                    ? 'bg-green-50 border-green-200'
                    : 'bg-red-50 border-red-200'
                }`}
              >
                <div className="flex items-start space-x-3">
                  <div className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center ${
                    verificationResult.success ? 'bg-green-500' : 'bg-red-500'
                  }`}>
                    {verificationResult.success ? (
                      <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    )}
                  </div>
                  <div className="flex-1">
                    <h3 className={`font-semibold ${
                      verificationResult.success ? 'text-green-800' : 'text-red-800'
                    }`}>
                      {verificationResult.success ? '验证成功' : '验证失败'}
                    </h3>
                    <p className={`text-sm mt-1 ${
                      verificationResult.success ? 'text-green-700' : 'text-red-700'
                    }`}>
                      {verificationResult.message}
                    </p>
                    
                    {/* 详细信息 */}
                    {verificationResult.details && (
                      <div className="mt-3 space-y-1">
                        {verificationResult.score !== undefined && (
                          <p className="text-xs text-gray-600">
                            验证分数: {verificationResult.score}
                          </p>
                        )}
                        {verificationResult.timestamp && (
                          <p className="text-xs text-gray-600">
                            验证时间: {new Date(verificationResult.timestamp).toLocaleString()}
                          </p>
                        )}
                        {verificationResult.details.hostname && (
                          <p className="text-xs text-gray-600">
                            主机名: {verificationResult.details.hostname}
                          </p>
                        )}
                        {verificationResult.details.error_codes && verificationResult.details.error_codes.length > 0 && (
                          <p className="text-xs text-red-600">
                            错误代码: {verificationResult.details.error_codes.join(', ')}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </m.div>
            )}
          </AnimatePresence>

          {/* 错误信息 */}
          <AnimatePresence>
            {error && (
              <m.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="p-4 bg-red-50 border border-red-200 rounded-lg"
              >
                <div className="flex items-start space-x-3">
                  <svg className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div>
                    <h3 className="font-semibold text-red-800">验证错误</h3>
                    <p className="text-sm text-red-700 mt-1">{error}</p>
                  </div>
                </div>
              </m.div>
            )}
          </AnimatePresence>

          {/* 操作按钮 */}
          <div className="flex space-x-3">
            {showBackButton && (
              <button
                onClick={onBack}
                className="flex-1 px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium transition-colors"
              >
                返回
              </button>
            )}
            
            {(error || (verificationResult && !verificationResult.success)) && (
              <button
                onClick={handleRetry}
                className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
              >
                重新验证
              </button>
            )}
            
            {verificationResult?.success && (
              <button
                onClick={() => window.location.reload()}
                className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors"
              >
                继续
              </button>
            )}
          </div>
        </div>

        {/* 底部信息 */}
        <div className="mt-8 pt-6 border-t border-gray-200">
          <p className="text-xs text-gray-500 text-center">
            此验证由 hCaptcha 提供技术支持
          </p>
        </div>
      </m.div>
    </m.div>
  );
};

export default HCaptchaVerificationPage;
