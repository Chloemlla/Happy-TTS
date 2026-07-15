import React, { useState, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ProductInfo, AntiCounterfeitError, AntiCounterfeitErrorType, ProductQueryParams } from '../types/anta';
import ProductQueryForm from './ProductQueryForm';
import ProductDetails from './ProductDetails';
import ErrorDisplay from './ErrorDisplay';
import getApiBaseUrl from '../api';
import { FaBarcode, FaCheckCircle, FaInfoCircle, FaShieldAlt } from 'react-icons/fa';
import {
import { getAuthToken } from '../utils/authSession';

  InfoBadge,
  InfoMetricCard,
  InfoPanel,
  InfoQueryHero,
  InfoQueryShell,
  InfoSectionTitle,
} from './InfoQueryScaffold';

interface AntiCounterfeitPageState {
  productId: string;
  queryParams: ProductQueryParams | null;
  queryResult: ProductInfo | null;
  loading: boolean;
  error: AntiCounterfeitError | null;
}

const AntiCounterfeitPage: React.FC = () => {
  const [state, setState] = useState<AntiCounterfeitPageState>({
    productId: '',
    queryParams: null,
    queryResult: null,
    loading: false,
    error: null,
  });

  const handleQuery = useCallback(async (params: ProductQueryParams) => {
    setState((prev) => ({
      ...prev,
      loading: true,
      error: null,
      productId: params.barcode,
      queryParams: params,
    }));

    try {
      const token = getAuthToken();
      const response = await fetch(`${getApiBaseUrl()}/api/anta/query`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
        },
        credentials: 'same-origin',
        body: JSON.stringify(params),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setState((prev) => ({
          ...prev,
          loading: false,
          queryResult: data.data,
          error: null,
        }));
        return;
      }

      setState((prev) => ({
        ...prev,
        loading: false,
        queryResult: null,
        error: {
          type: data.error?.type || AntiCounterfeitErrorType.SERVER_ERROR,
          message: data.error?.message || data.error || '查询失败，请稍后重试',
        },
      }));
    } catch (_) {
      setState((prev) => ({
        ...prev,
        loading: false,
        queryResult: null,
        error: {
          type: AntiCounterfeitErrorType.NETWORK_ERROR,
          message: '网络连接异常，请检查网络连接后重试',
        },
      }));
    }
  }, []);

  const handleRetry = useCallback(() => {
    if (state.queryParams) {
      handleQuery(state.queryParams);
    }
  }, [state.queryParams, handleQuery]);

  const handleReset = useCallback(() => {
    setState({
      productId: '',
      queryParams: null,
      queryResult: null,
      loading: false,
      error: null,
    });
  }, []);

  return (
    <InfoQueryShell>
      <div className="space-y-6">
        <InfoQueryHero
          eyebrow="Authenticity Query"
          title="安踏产品防伪查询"
          description="输入鞋盒贴标二维码 ID 或导入官方查询链接，系统会提交到后端接口进行防伪验证，并展示查询次数与产品信息。"
          icon={FaShieldAlt}
          tone="emerald"
          meta={(
            <>
              <InfoBadge tone="emerald">官方数据源</InfoBadge>
              <InfoBadge tone="sky">条码必填</InfoBadge>
              <InfoBadge tone="slate">结果仅供参考</InfoBadge>
            </>
          )}
        />

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <InfoMetricCard label="查询方式" value="条码 / 链接" detail="支持手动输入与官方 URL 导入" icon={FaBarcode} tone="sky" />
          <InfoMetricCard label="验证结果" value={state.queryResult ? '已返回' : '待查询'} detail={state.productId || '提交条码后展示'} icon={FaCheckCircle} tone="emerald" />
          <InfoMetricCard label="数据提示" value="仅供参考" detail="最终解释权归品牌方所有" icon={FaInfoCircle} tone="slate" />
        </div>

        <InfoPanel>
          <InfoSectionTitle
            title="查询信息"
            description="条码为必填项，货号、EAN、尺码可用于提高查询准确性。"
            icon={FaBarcode}
            tone="emerald"
          />
          <ProductQueryForm
            onQuery={handleQuery}
            loading={state.loading}
            error={state.error}
          />
        </InfoPanel>

        <AnimatePresence mode="wait">
          {state.error && (
            <motion.div
              key="error"
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -14 }}
              transition={{ duration: 0.22 }}
            >
              <ErrorDisplay
                error={state.error}
                onRetry={handleRetry}
                onReset={handleReset}
              />
            </motion.div>
          )}

          {state.queryResult && !state.error && (
            <motion.div
              key="result"
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -14 }}
              transition={{ duration: 0.22 }}
            >
              <ProductDetails
                product={state.queryResult}
                queryCount={state.queryResult.queryCount}
              />
            </motion.div>
          )}
        </AnimatePresence>

        <InfoPanel compact>
          <div className="flex flex-col gap-3 text-center sm:flex-row sm:items-center sm:justify-center">
            <span className="inline-flex items-center justify-center gap-2 text-sm font-semibold text-slate-700">
              <FaInfoCircle className="text-emerald-600" />
              数据来源：安踏官方 | 查询结果仅供参考，最终解释权归品牌方所有
            </span>
          </div>
        </InfoPanel>
      </div>
    </InfoQueryShell>
  );
};

export default AntiCounterfeitPage;
