import React, { useState, useCallback, useMemo } from 'react';
import { LazyMotion, domAnimation, m, AnimatePresence, useReducedMotion } from 'framer-motion';
import { ProductInfo, AntiCounterfeitError, AntiCounterfeitErrorType, ProductQueryParams } from '../types/anta';
import ProductQueryForm from './ProductQueryForm';
import ProductDetails from './ProductDetails';
import ErrorDisplay from './ErrorDisplay';
import getApiBaseUrl from '../api';
import { FaShieldAlt, FaInfoCircle } from 'react-icons/fa';

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
      const response = await fetch(`${getApiBaseUrl()}/api/anta/query`, {
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
        className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 py-8 px-4 sm:px-6 lg:px-8 px-4 rounded-lg"
      >
        <div className="max-w-7xl mx-auto space-y-8">
          {/* 页面标题 */}
          <m.div
            className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-4 sm:p-6 border border-blue-100"
            initial={ENTER_INITIAL}
            animate={ENTER_ANIMATE}
            transition={trans06}
          >
            <h2 className="text-xl sm:text-2xl font-bold text-blue-700 mb-2 sm:mb-3 flex items-center gap-2">
              <FaShieldAlt className="text-xl sm:text-2xl text-blue-600" />
              安踏产品查询
            </h2>
            <div className="text-gray-600 space-y-2">
              <p className="text-sm sm:text-base">验证产品真伪，保障消费权益。</p>
              <div className="flex items-start gap-2 text-sm">
                <div>
                  <p className="font-semibold text-blue-700">功能说明：</p>
                  <ul className="list-disc list-inside space-y-1 mt-1">
                    <li className="leading-relaxed">输入产品条码进行查询</li>
                    <li className="leading-relaxed">验证产品真伪信息</li>
                    <li className="leading-relaxed">查看详细产品信息</li>
                    <li className="leading-relaxed">官方认证平台</li>
                  </ul>
                </div>
              </div>
            </div>
          </m.div>

          {/* 查询提示 */}
          <m.div
            className="bg-white rounded-xl p-4 sm:p-6 shadow-sm border border-gray-200"
            initial={ENTER_INITIAL}
            animate={ENTER_ANIMATE}
            transition={trans06}
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-0 mb-4">
              <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                <FaInfoCircle className="text-lg text-blue-500" />
                查询提示
              </h3>
            </div>
            <div className="mb-4 p-3 sm:p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="flex items-start gap-2 sm:gap-3 text-sm sm:text-base text-blue-700">
                <FaInfoCircle className="w-3 h-3 sm:w-4 sm:h-4 text-blue-500 flex-shrink-0 mt-0.5 sm:mt-0" />
                <span className="font-medium leading-relaxed">找到鞋盒贴标上的二维码ID，将ID完整输入查询框，点击查询按钮进行验证</span>
              </div>
            </div>
          </m.div>

          {/* 查询表单 */}
          <m.div
            className="bg-white rounded-xl p-4 sm:p-6 shadow-sm border border-gray-200"
            initial={ENTER_INITIAL}
            animate={ENTER_ANIMATE}
            transition={trans06}
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
            className="bg-white rounded-xl p-4 sm:p-6 shadow-sm border border-gray-200"
            initial={ENTER_INITIAL}
            animate={ENTER_ANIMATE}
            transition={trans06}
          >
            <div className="text-center">
              <div className="flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-gray-50 to-slate-50 border border-gray-200 rounded-lg justify-center">
                <div className="w-2 h-2 bg-gray-400 rounded-full"></div>
                <span className="text-xs sm:text-sm text-gray-600">
                  数据来源：安踏官方 | 仅供参考，最终解释权归安踏所有
                </span>
              </div>
            </div>
          </m.div>
        </div>
      </m.div>
    </LazyMotion>
  );
};

export default AntiCounterfeitPage;