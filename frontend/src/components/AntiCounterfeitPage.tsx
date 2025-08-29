import React, { useState, useCallback, useMemo } from 'react';
import { LazyMotion, domAnimation, m, AnimatePresence, useReducedMotion } from 'framer-motion';
import { ProductInfo, AntiCounterfeitError, AntiCounterfeitErrorType, ProductQueryParams } from '../types/anta';
import ProductQueryForm from './ProductQueryForm';
import ProductDetails from './ProductDetails';
import ErrorDisplay from './ErrorDisplay';

interface AntiCounterfeitPageState {
  productId: string;
  queryParams: ProductQueryParams | null;
  queryResult: ProductInfo | null;
  loading: boolean;
  error: AntiCounterfeitError | null;
}

// 统一的进入动画与过渡配置，结合 useReducedMotion 可降级
const ENTER_INITIAL = { opacity: 0, y: 20 } as const;
const ENTER_ANIMATE = { opacity: 1, y: 0 } as const;
const DURATION_06 = { duration: 0.6 } as const;
const DURATION_03 = { duration: 0.3 } as const;
const NO_DURATION = { duration: 0 } as const;

const AntiCounterfeitPage: React.FC = () => {
  const [state, setState] = useState<AntiCounterfeitPageState>({
    productId: '',
    queryParams: null,
    queryResult: null,
    loading: false,
    error: null
  });

  const prefersReducedMotion = useReducedMotion();

  const trans06 = useMemo(() => (prefersReducedMotion ? NO_DURATION : DURATION_06), [prefersReducedMotion]);
  const trans03 = useMemo(() => (prefersReducedMotion ? NO_DURATION : DURATION_03), [prefersReducedMotion]);

  // 处理查询请求
  const handleQuery = useCallback(async (params: ProductQueryParams) => {
    setState(prev => ({
      ...prev,
      loading: true,
      error: null,
      productId: params.barcode, // 使用条码作为主要标识
      queryParams: params // 保存查询参数以便重试
    }));

    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/anta/query', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest'
        },
        credentials: 'same-origin',
        body: JSON.stringify(params)
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setState(prev => ({
          ...prev,
          loading: false,
          queryResult: data.data,
          error: null
        }));
      } else {
        setState(prev => ({
          ...prev,
          loading: false,
          queryResult: null,
          error: {
            type: data.error?.type || AntiCounterfeitErrorType.SERVER_ERROR,
            message: data.error?.message || data.error || '查询失败，请稍后重试'
          }
        }));
      }
    } catch (error) {
      setState(prev => ({
        ...prev,
        loading: false,
        queryResult: null,
        error: {
          type: AntiCounterfeitErrorType.NETWORK_ERROR,
          message: '网络连接异常，请检查网络连接后重试'
        }
      }));
    }
  }, []);

  // 重试查询
  const handleRetry = useCallback(() => {
    if (state.queryParams) {
      handleQuery(state.queryParams);
    }
  }, [state.queryParams, handleQuery]);

  // 重置状态
  const handleReset = useCallback(() => {
    setState({
      productId: '',
      queryParams: null,
      queryResult: null,
      loading: false,
      error: null
    });
  }, []);

  return (
    <LazyMotion features={domAnimation}>
      <m.div
        initial={ENTER_INITIAL}
        animate={ENTER_ANIMATE}
        transition={trans06}
        className="min-h-screen bg-gradient-to-br from-gray-50 via-blue-50/30 to-indigo-100/50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 py-8 px-4 sm:px-6 lg:px-8 relative overflow-hidden"
      >
        {/* 背景装饰元素 */}
        {!prefersReducedMotion && (
          <>
            <m.div
              className="absolute inset-0 opacity-30 dark:opacity-20"
              animate={{
                backgroundPosition: ["0% 0%", "100% 100%"]
              }}
              transition={{
                duration: 20,
                repeat: Infinity,
                repeatType: "reverse",
                ease: "linear"
              }}
              style={{
                backgroundImage: "radial-gradient(circle at 25% 25%, rgba(59, 130, 246, 0.1) 0%, transparent 50%), radial-gradient(circle at 75% 75%, rgba(239, 68, 68, 0.1) 0%, transparent 50%)",
                backgroundSize: "400% 400%"
              }}
            />

            {/* 浮动装饰圆圈 */}
            <m.div
              className="absolute top-20 left-10 w-32 h-32 bg-blue-200/20 dark:bg-blue-800/20 rounded-full blur-xl"
              animate={{
                y: [0, -20, 0],
                x: [0, 10, 0],
                scale: [1, 1.1, 1]
              }}
              transition={{
                duration: 8,
                repeat: Infinity,
                ease: "easeInOut"
              }}
            />
            <m.div
              className="absolute bottom-20 right-10 w-24 h-24 bg-red-200/20 dark:bg-red-800/20 rounded-full blur-xl"
              animate={{
                y: [0, 15, 0],
                x: [0, -8, 0],
                scale: [1, 0.9, 1]
              }}
              transition={{
                duration: 6,
                repeat: Infinity,
                ease: "easeInOut",
                delay: 1
              }}
            />
            <m.div
              className="absolute top-1/2 left-1/4 w-16 h-16 bg-indigo-200/20 dark:bg-indigo-800/20 rounded-full blur-lg"
              animate={{
                y: [0, -10, 0],
                rotate: [0, 180, 360]
              }}
              transition={{
                duration: 12,
                repeat: Infinity,
                ease: "linear"
              }}
            />
          </>
        )}

        <m.div
          initial={ENTER_INITIAL}
          animate={ENTER_ANIMATE}
          transition={trans03}
          className="max-w-4xl mx-auto relative z-10"
        >
          {/* 页面标题 */}
          <m.div
            initial={ENTER_INITIAL}
            animate={ENTER_ANIMATE}
            transition={{ ...trans03, delay: 0.1 }}
            className="text-center mb-8"
          >
            <div className="flex flex-col sm:flex-row items-center justify-center mb-4">
              <m.div
                whileHover={prefersReducedMotion ? {} : { scale: 1.05, rotate: 5 }}
                whileTap={prefersReducedMotion ? {} : { scale: 0.95 }}
                transition={{ type: "spring", stiffness: 400, damping: 10 }}
                className="w-20 h-20 bg-gradient-to-br from-red-500 via-red-600 to-red-700 dark:from-red-600 dark:via-red-700 dark:to-red-800 rounded-2xl flex items-center justify-center shadow-xl dark:shadow-red-900/20 mb-4 sm:mb-0 sm:mr-6 ring-4 ring-red-100 dark:ring-red-900/30"
              >
                <svg
                  className="w-10 h-10 text-white drop-shadow-lg"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2.5}
                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </m.div>
              <div className="text-center sm:text-left">
                <h1 className="text-4xl sm:text-5xl font-bold bg-gradient-to-r from-gray-900 via-red-700 to-red-600 dark:from-white dark:via-red-300 dark:to-red-400 bg-clip-text text-transparent mb-3">
                  安踏产品查询
                </h1>
                <p className="text-lg sm:text-xl text-gray-600 dark:text-gray-300 font-medium">
                  验证产品真伪，保障消费权益
                </p>
                <div className="flex items-center justify-center sm:justify-start mt-2 space-x-2">
                  <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
                  <span className="text-sm text-gray-500 dark:text-gray-400">官方认证平台</span>
                </div>
              </div>
            </div>
          </m.div>

          {/* 查询提示 */}
          <m.div
            initial={ENTER_INITIAL}
            animate={ENTER_ANIMATE}
            transition={{ ...trans03, delay: 0.2 }}
            className="mb-8"
          >
            <div className="bg-gradient-to-r from-blue-50 via-indigo-50 to-purple-50 dark:from-blue-900/20 dark:via-indigo-900/20 dark:to-purple-900/20 border border-blue-200 dark:border-blue-700/50 rounded-xl p-6 shadow-lg dark:shadow-blue-900/10 backdrop-blur-sm">
              <div className="flex items-start">
                <m.div
                  animate={prefersReducedMotion ? {} : { rotate: [0, 10, -10, 0] }}
                  transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                  className="flex-shrink-0 w-12 h-12 bg-gradient-to-br from-blue-500 to-indigo-600 dark:from-blue-600 dark:to-indigo-700 rounded-xl flex items-center justify-center mr-4 shadow-lg"
                >
                  <svg
                    className="w-6 h-6 text-white"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                </m.div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-blue-800 dark:text-blue-300 mb-2">
                    查询提示
                  </h3>
                  <p className="text-blue-700 dark:text-blue-200 leading-relaxed">
                    找到鞋盒贴标上的二维码ID，将ID完整输入查询框，点击右侧查询按钮
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-blue-100 dark:bg-blue-800/50 text-blue-800 dark:text-blue-200">
                      <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                      快速验证
                    </span>
                    <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-green-100 dark:bg-green-800/50 text-green-800 dark:text-green-200">
                      <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                      官方认证
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </m.div>

          {/* 查询表单 */}
          <m.div
            initial={ENTER_INITIAL}
            animate={ENTER_ANIMATE}
            transition={{ ...trans03, delay: 0.3 }}
            className="mb-8"
          >
            <ProductQueryForm
              onQuery={handleQuery}
              loading={state.loading}
              error={state.error}
            />
          </m.div>

          {/* 查询结果区域 */}
          <AnimatePresence mode="wait">
            {state.error && (
              <m.div
                key="error"
                initial={ENTER_INITIAL}
                animate={ENTER_ANIMATE}
                exit={ENTER_INITIAL}
                transition={trans03}
                className="mb-8"
              >
                <ErrorDisplay
                  error={state.error}
                  onRetry={handleRetry}
                  onReset={handleReset}
                />
              </m.div>
            )}

            {state.queryResult && !state.error && (
              <m.div
                key="result"
                initial={ENTER_INITIAL}
                animate={ENTER_ANIMATE}
                exit={ENTER_INITIAL}
                transition={trans03}
                className="mb-8"
              >
                <ProductDetails
                  product={state.queryResult}
                  queryCount={state.queryResult.queryCount}
                />
              </m.div>
            )}
          </AnimatePresence>

          {/* 页脚信息 */}
          <m.div
            initial={ENTER_INITIAL}
            animate={ENTER_ANIMATE}
            transition={{ ...trans03, delay: 0.4 }}
            className="text-center"
          >
            <div className="inline-flex items-center px-6 py-3 bg-white/60 dark:bg-gray-800/60 backdrop-blur-sm rounded-full border border-gray-200 dark:border-gray-700 shadow-lg">
              <svg className="w-4 h-4 text-gray-400 dark:text-gray-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-sm text-gray-600 dark:text-gray-300">
                数据来源：安踏官方 | 仅供参考，最终解释权归安踏所有
              </p>
            </div>
          </m.div>
        </m.div>
      </m.div>
    </LazyMotion>
  );
};

export default AntiCounterfeitPage;