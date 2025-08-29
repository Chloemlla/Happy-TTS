import React from 'react';
import { motion, AnimatePresence, Variants } from 'framer-motion';
import { AntiCounterfeitError, AntiCounterfeitErrorType, getErrorMessage } from '../types/anta';

interface ErrorDisplayProps {
  error: AntiCounterfeitError;
  onRetry?: () => void;
  onReset?: () => void;
}

const ErrorDisplay: React.FC<ErrorDisplayProps> = ({ error, onRetry, onReset }) => {
  // 根据错误类型获取样式配置
  const getErrorConfig = (errorType: AntiCounterfeitErrorType) => {
    switch (errorType) {
      case AntiCounterfeitErrorType.INVALID_PRODUCT_ID:
        return {
          color: 'yellow',
          icon: '⚠️',
          title: '输入格式错误',
          bgClass: 'bg-yellow-50 border-yellow-200',
          textClass: 'text-yellow-800',
          iconBgClass: 'bg-yellow-100',
          buttonClass: 'bg-yellow-600 hover:bg-yellow-700 focus:ring-yellow-500'
        };
      case AntiCounterfeitErrorType.PRODUCT_NOT_FOUND:
        return {
          color: 'orange',
          icon: '🔍',
          title: '产品未找到',
          bgClass: 'bg-orange-50 border-orange-200',
          textClass: 'text-orange-800',
          iconBgClass: 'bg-orange-100',
          buttonClass: 'bg-orange-600 hover:bg-orange-700 focus:ring-orange-500'
        };
      case AntiCounterfeitErrorType.NETWORK_ERROR:
        return {
          color: 'blue',
          icon: '🌐',
          title: '网络连接异常',
          bgClass: 'bg-blue-50 border-blue-200',
          textClass: 'text-blue-800',
          iconBgClass: 'bg-blue-100',
          buttonClass: 'bg-blue-600 hover:bg-blue-700 focus:ring-blue-500'
        };
      case AntiCounterfeitErrorType.API_TIMEOUT:
        return {
          color: 'purple',
          icon: '⏱️',
          title: '查询超时',
          bgClass: 'bg-purple-50 border-purple-200',
          textClass: 'text-purple-800',
          iconBgClass: 'bg-purple-100',
          buttonClass: 'bg-purple-600 hover:bg-purple-700 focus:ring-purple-500'
        };
      case AntiCounterfeitErrorType.RATE_LIMIT_EXCEEDED:
        return {
          color: 'indigo',
          icon: '🚫',
          title: '查询过于频繁',
          bgClass: 'bg-indigo-50 border-indigo-200',
          textClass: 'text-indigo-800',
          iconBgClass: 'bg-indigo-100',
          buttonClass: 'bg-indigo-600 hover:bg-indigo-700 focus:ring-indigo-500'
        };
      default:
        return {
          color: 'red',
          icon: '❌',
          title: '查询失败',
          bgClass: 'bg-red-50 border-red-200',
          textClass: 'text-red-800',
          iconBgClass: 'bg-red-100',
          buttonClass: 'bg-red-600 hover:bg-red-700 focus:ring-red-500'
        };
    }
  };

  // 获取操作建议
  const getActionSuggestions = (errorType: AntiCounterfeitErrorType): string[] => {
    switch (errorType) {
      case AntiCounterfeitErrorType.INVALID_PRODUCT_ID:
        return [
          '检查产品ID是否完整输入',
          '确认产品ID格式正确（支持字母数字、连字符、下划线）',
          '重新从产品标签上复制完整的产品ID'
        ];
      case AntiCounterfeitErrorType.PRODUCT_NOT_FOUND:
        return [
          '确认产品ID是否正确',
          '检查产品ID是否来自安踏正品标签',
          '尝试重新输入或联系安踏客服'
        ];
      case AntiCounterfeitErrorType.NETWORK_ERROR:
        return [
          '检查网络连接是否正常',
          '尝试刷新页面后重新查询',
          '如问题持续，请稍后再试'
        ];
      case AntiCounterfeitErrorType.API_TIMEOUT:
        return [
          '网络响应较慢，请稍后重试',
          '检查网络连接稳定性',
          '避免在网络高峰期查询'
        ];
      case AntiCounterfeitErrorType.RATE_LIMIT_EXCEEDED:
        return [
          '请稍等片刻后再次查询',
          '避免频繁重复查询',
          '每分钟查询次数有限制'
        ];
      default:
        return [
          '请稍后重试',
          '如问题持续，请联系技术支持',
          '检查输入信息是否正确'
        ];
    }
  };

  const config = getErrorConfig(error.type);
  const suggestions = getActionSuggestions(error.type);
  const errorMessage = getErrorMessage(error);

  // 动画变体
  const containerVariants: Variants = {
    hidden: { 
      opacity: 0, 
      y: 30, 
      scale: 0.9,
      rotateX: 15
    },
    visible: {
      opacity: 1,
      y: 0,
      scale: 1,
      rotateX: 0,
      transition: {
        type: "spring" as const,
        stiffness: 120,
        damping: 20,
        staggerChildren: 0.15,
        delayChildren: 0.1
      }
    },
    exit: {
      opacity: 0,
      y: -30,
      scale: 0.9,
      rotateX: -15,
      transition: {
        duration: 0.3,
        ease: [0.4, 0, 0.2, 1]
      }
    }
  };

  const itemVariants = {
    hidden: { 
      opacity: 0, 
      x: -30,
      scale: 0.9
    },
    visible: (custom: number) => ({
      opacity: 1,
      x: 0,
      scale: 1,
      transition: {
        type: "spring" as const,
        stiffness: 120,
        damping: 20,
        delay: custom * 0.1
      }
    })
  };

  const buttonVariants = {
    idle: { 
      scale: 1,
      boxShadow: "0 4px 14px 0 rgba(0, 0, 0, 0.1)"
    },
    hover: { 
      scale: 1.05,
      y: -2,
      boxShadow: "0 8px 25px 0 rgba(0, 0, 0, 0.15)",
      transition: {
        type: "spring" as const,
        stiffness: 400,
        damping: 10
      }
    },
    tap: { 
      scale: 0.95,
      y: 0,
      boxShadow: "0 2px 8px 0 rgba(0, 0, 0, 0.1)"
    }
  };

  const iconVariants = {
    hidden: { 
      scale: 0, 
      rotate: -180,
      opacity: 0
    },
    visible: {
      scale: 1,
      rotate: 0,
      opacity: 1,
      transition: {
        type: "spring" as const,
        stiffness: 200,
        damping: 15,
        delay: 0.2
      }
    }
  };

  // 判断是否显示重试按钮
  const showRetryButton = onRetry && [
    AntiCounterfeitErrorType.NETWORK_ERROR,
    AntiCounterfeitErrorType.API_TIMEOUT,
    AntiCounterfeitErrorType.SERVER_ERROR,
    AntiCounterfeitErrorType.PARSING_ERROR
  ].includes(error.type);

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
      className="w-full max-w-2xl mx-auto"
    >
      <div className={`border rounded-2xl p-8 shadow-2xl backdrop-blur-sm ${config.bgClass} dark:${config.bgClass.replace('50', '900/20').replace('200', '700/50')}`}>
        {/* 错误头部 */}
        <div className="flex items-start">
          <motion.div
            variants={iconVariants}
            animate={{
              x: [0, -2, 2, -2, 2, 0],
              rotate: [0, -5, 5, -5, 5, 0]
            }}
            transition={{
              duration: 0.6,
              ease: "easeInOut",
              delay: 0.5
            }}
            className={`flex-shrink-0 w-16 h-16 rounded-2xl flex items-center justify-center mr-6 shadow-xl ${config.iconBgClass} dark:${config.iconBgClass.replace('100', '800/50')}`}
          >
            <motion.span 
              className="text-3xl drop-shadow-lg" 
              role="img" 
              aria-label="error-icon"
              animate={{
                scale: [1, 1.1, 1]
              }}
              transition={{
                duration: 2,
                repeat: Infinity,
                ease: "easeInOut"
              }}
            >
              {config.icon}
            </motion.span>
          </motion.div>
          
          <div className="flex-1">
            <motion.h3 variants={itemVariants} className={`text-2xl font-bold mb-3 ${config.textClass} dark:${config.textClass.replace('800', '300')}`}>
              {config.title}
            </motion.h3>
            
            <motion.p variants={itemVariants} className={`text-base mb-6 leading-relaxed ${config.textClass} dark:${config.textClass.replace('800', '200')}`}>
              {errorMessage}
            </motion.p>

            {/* 操作建议 */}
            <motion.div variants={itemVariants} className="mb-6">
              <h4 className={`text-lg font-bold mb-4 ${config.textClass} dark:${config.textClass.replace('800', '300')}`}>
                解决建议：
              </h4>
              <ul className="space-y-3">
                {suggestions.map((suggestion, index) => (
                  <motion.li
                    key={index}
                    variants={itemVariants}
                    custom={index}
                    className={`flex items-start ${config.textClass} dark:${config.textClass.replace('800', '200')}`}
                    whileHover={{ x: 4 }}
                    transition={{ type: "spring", stiffness: 400, damping: 10 }}
                  >
                    <motion.div 
                      className="flex-shrink-0 w-6 h-6 rounded-full bg-current/20 flex items-center justify-center mr-3 mt-0.5"
                      whileHover={{ scale: 1.1 }}
                    >
                      <span className="w-2 h-2 rounded-full bg-current" />
                    </motion.div>
                    <span className="font-medium leading-relaxed">{suggestion}</span>
                  </motion.li>
                ))}
              </ul>
            </motion.div>

            {/* 操作按钮 */}
            <motion.div variants={itemVariants} className="flex flex-wrap gap-3">
              {showRetryButton && (
                <motion.button
                  variants={buttonVariants}
                  initial="idle"
                  whileHover="hover"
                  whileTap="tap"
                  onClick={onRetry}
                  className={`
                    px-6 py-3 text-white font-semibold rounded-xl
                    transition-all duration-300 ease-in-out shadow-lg hover:shadow-xl
                    focus:outline-none focus:ring-4 focus:ring-opacity-20
                    ${config.buttonClass}
                  `}
                >
                  <div className="flex items-center space-x-2">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    <span>重试</span>
                  </div>
                </motion.button>
              )}

              {onReset && (
                <motion.button
                  variants={buttonVariants}
                  initial="idle"
                  whileHover="hover"
                  whileTap="tap"
                  onClick={onReset}
                  className="px-6 py-3 bg-gray-600 hover:bg-gray-700 dark:bg-gray-700 dark:hover:bg-gray-600 text-white font-semibold rounded-xl transition-all duration-300 ease-in-out focus:outline-none focus:ring-4 focus:ring-gray-500 focus:ring-opacity-20 shadow-lg hover:shadow-xl"
                >
                  <div className="flex items-center space-x-2">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    <span>重新查询</span>
                  </div>
                </motion.button>
              )}
            </motion.div>
          </div>
        </div>

        {/* 错误详情（开发模式） */}
        {process.env.NODE_ENV === 'development' && error.details && (
          <motion.div variants={itemVariants} className="mt-4 pt-4 border-t border-gray-200">
            <details className="text-xs">
              <summary className={`cursor-pointer font-medium ${config.textClass}`}>
                错误详情 (开发模式)
              </summary>
              <pre className="mt-2 p-2 bg-gray-100 rounded text-gray-700 overflow-auto">
                {JSON.stringify(error.details, null, 2)}
              </pre>
            </details>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
};

export default ErrorDisplay;