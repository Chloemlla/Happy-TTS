import React from 'react';
import { motion } from 'framer-motion';
import { FaExclamationTriangle, FaRedo, FaSearch, FaTimesCircle } from 'react-icons/fa';
import { AntiCounterfeitError, AntiCounterfeitErrorType, getErrorMessage } from '../types/anta';
import { InfoPanel, InfoPrimaryButton } from './InfoQueryScaffold';

interface ErrorDisplayProps {
  error: AntiCounterfeitError;
  onRetry?: () => void;
  onReset?: () => void;
}

const getErrorConfig = (errorType: AntiCounterfeitErrorType) => {
  switch (errorType) {
    case AntiCounterfeitErrorType.INVALID_PRODUCT_ID:
      return {
        title: '输入格式错误',
        toneClass: 'border-amber-200 bg-amber-50/85 text-amber-800',
        iconClass: 'bg-amber-100 text-amber-700 ring-amber-200',
      };
    case AntiCounterfeitErrorType.PRODUCT_NOT_FOUND:
      return {
        title: '产品未找到',
        toneClass: 'border-orange-200 bg-orange-50/85 text-orange-800',
        iconClass: 'bg-orange-100 text-orange-700 ring-orange-200',
      };
    case AntiCounterfeitErrorType.NETWORK_ERROR:
      return {
        title: '网络连接异常',
        toneClass: 'border-sky-200 bg-sky-50/85 text-sky-800',
        iconClass: 'bg-sky-100 text-sky-700 ring-sky-200',
      };
    case AntiCounterfeitErrorType.API_TIMEOUT:
      return {
        title: '查询超时',
        toneClass: 'border-violet-200 bg-violet-50/85 text-violet-800',
        iconClass: 'bg-violet-100 text-violet-700 ring-violet-200',
      };
    case AntiCounterfeitErrorType.RATE_LIMIT_EXCEEDED:
      return {
        title: '查询过于频繁',
        toneClass: 'border-slate-200 bg-slate-100/85 text-slate-800',
        iconClass: 'bg-slate-200 text-slate-700 ring-slate-300',
      };
    default:
      return {
        title: '查询失败',
        toneClass: 'border-rose-200 bg-rose-50/85 text-rose-800',
        iconClass: 'bg-rose-100 text-rose-700 ring-rose-200',
      };
  }
};

const getActionSuggestions = (errorType: AntiCounterfeitErrorType): string[] => {
  switch (errorType) {
    case AntiCounterfeitErrorType.INVALID_PRODUCT_ID:
      return ['检查条码是否完整输入', '确认格式只包含字母、数字、连字符或下划线', '重新从产品标签复制完整条码'];
    case AntiCounterfeitErrorType.PRODUCT_NOT_FOUND:
      return ['确认条码来自安踏正品标签', '检查是否误填货号或 EAN 码', '联系安踏官方客服进一步确认'];
    case AntiCounterfeitErrorType.NETWORK_ERROR:
      return ['检查网络连接是否正常', '刷新页面后重新查询', '稍后再试'];
    case AntiCounterfeitErrorType.API_TIMEOUT:
      return ['网络响应较慢，请稍后重试', '检查网络稳定性', '避免在网络高峰期重复提交'];
    case AntiCounterfeitErrorType.RATE_LIMIT_EXCEEDED:
      return ['稍等片刻后再次查询', '避免频繁重复查询', '每分钟查询次数可能有限制'];
    default:
      return ['请稍后重试', '检查输入信息是否正确', '如问题持续，请联系技术支持'];
  }
};

const ErrorDisplay: React.FC<ErrorDisplayProps> = ({ error, onRetry, onReset }) => {
  const config = getErrorConfig(error.type);
  const suggestions = getActionSuggestions(error.type);
  const errorMessage = getErrorMessage(error);
  const showRetryButton = onRetry && [
    AntiCounterfeitErrorType.NETWORK_ERROR,
    AntiCounterfeitErrorType.API_TIMEOUT,
    AntiCounterfeitErrorType.SERVER_ERROR,
    AntiCounterfeitErrorType.PARSING_ERROR,
  ].includes(error.type);

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -14 }}
      transition={{ duration: 0.22 }}
    >
      <InfoPanel className={config.toneClass}>
        <div className="flex flex-col gap-5 md:flex-row md:items-start">
          <div className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-[24px] ring-1 ${config.iconClass}`}>
            <FaExclamationTriangle className="h-6 w-6" />
          </div>

          <div className="flex-1">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] opacity-70">Query Error</p>
            <h3 className="mt-2 text-2xl font-semibold">{config.title}</h3>
            <p className="mt-3 text-sm leading-7 opacity-90">{errorMessage}</p>

            <div className="mt-5 rounded-[22px] border border-current/15 bg-white/55 p-4">
              <h4 className="flex items-center gap-2 text-sm font-semibold">
                <FaSearch /> 解决建议
              </h4>
              <ul className="mt-3 space-y-2 text-sm leading-6">
                {suggestions.map((suggestion) => (
                  <li key={suggestion} className="flex items-start gap-2">
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-current" />
                    <span>{suggestion}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="mt-5 flex flex-wrap gap-3">
              {showRetryButton && (
                <InfoPrimaryButton tone="emerald" onClick={onRetry}>
                  <FaRedo /> 重试
                </InfoPrimaryButton>
              )}
              {onReset && (
                <button
                  type="button"
                  onClick={onReset}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-current/20 bg-white/70 px-4 py-2.5 text-sm font-semibold transition hover:bg-white"
                >
                  <FaTimesCircle /> 重新查询
                </button>
              )}
            </div>
          </div>
        </div>
      </InfoPanel>
    </motion.div>
  );
};

export default ErrorDisplay;
