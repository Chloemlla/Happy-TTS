import React, { useState } from 'react';
import { motion as m } from 'framer-motion';
import HCaptchaVerificationPage from './HCaptchaVerificationPage';

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

/**
 * hCaptcha 验证页面使用示例
 * 
 * 这个组件展示了如何使用 HCaptchaVerificationPage 组件
 * 包括处理验证成功和失败的回调函数
 */
const HCaptchaVerificationExample: React.FC = () => {
  const [showVerification, setShowVerification] = useState(false);
  const [verificationResult, setVerificationResult] = useState<VerificationResult | null>(null);
  const [error, setError] = useState<string>('');

  // 处理验证成功
  const handleVerificationSuccess = (result: VerificationResult) => {
    console.log('验证成功:', result);
    setVerificationResult(result);
    setError('');
    
    // 在这里可以执行验证成功后的逻辑
    // 例如：跳转到下一页、解锁功能、提交表单等
    setTimeout(() => {
      setShowVerification(false);
      alert('验证成功！可以继续操作了。');
    }, 2000);
  };

  // 处理验证失败
  const handleVerificationFailure = (errorMessage: string) => {
    console.error('验证失败:', errorMessage);
    setError(errorMessage);
    setVerificationResult(null);
  };

  // 开始验证
  const startVerification = () => {
    setShowVerification(true);
    setVerificationResult(null);
    setError('');
  };

  // 返回主页面
  const handleBack = () => {
    setShowVerification(false);
  };

  if (showVerification) {
    return (
      <HCaptchaVerificationPage
        title="安全验证"
        description="为了确保您的账户安全，请完成以下人机验证"
        onVerificationSuccess={handleVerificationSuccess}
        onVerificationFailure={handleVerificationFailure}
        showBackButton={true}
        onBack={handleBack}
      />
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center p-4">
      <m.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-md"
      >
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">hCaptcha 验证示例</h1>
          <p className="text-gray-600">点击下方按钮体验 hCaptcha 验证功能</p>
        </div>

        <div className="space-y-4">
          <button
            onClick={startVerification}
            className="w-full px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
          >
            开始验证
          </button>

          {/* 显示上次验证结果 */}
          {verificationResult && (
            <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
              <h3 className="font-semibold text-green-800 mb-2">上次验证结果</h3>
              <div className="text-sm text-green-700 space-y-1">
                <p>状态: {verificationResult.success ? '成功' : '失败'}</p>
                <p>消息: {verificationResult.message}</p>
                {verificationResult.score && (
                  <p>分数: {verificationResult.score}</p>
                )}
                {verificationResult.timestamp && (
                  <p>时间: {new Date(verificationResult.timestamp).toLocaleString()}</p>
                )}
              </div>
            </div>
          )}

          {/* 显示错误信息 */}
          {error && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
              <h3 className="font-semibold text-red-800 mb-2">验证错误</h3>
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}
        </div>

        {/* 使用说明 */}
        <div className="mt-8 pt-6 border-t border-gray-200">
          <h3 className="font-semibold text-gray-900 mb-3">使用说明</h3>
          <div className="text-sm text-gray-600 space-y-2">
            <p>• 点击"开始验证"按钮启动 hCaptcha 验证</p>
            <p>• 完成验证后会显示后端返回的验证结果</p>
            <p>• 支持自定义验证成功和失败的回调处理</p>
            <p>• 可以配置验证页面的标题、描述等属性</p>
          </div>
        </div>
      </m.div>
    </div>
  );
};

export default HCaptchaVerificationExample;
