import { useEffect, useState } from 'react';
import { m } from 'framer-motion';
import { FaSync } from 'react-icons/fa';
import CollapsibleSection from './CollapsibleSection';
import type { EmailSystemConfigItem } from './types';

const REFRESH_BUTTON_CLASS =
  'inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60';

export interface EmailSystemSettingsSectionProps {
  isOpen: boolean;
  onToggle: (key: string) => void;
  prefersReducedMotion?: boolean | null;
  loading: boolean;
  saving: boolean;
  deleting: boolean;
  config: EmailSystemConfigItem | null;
  onRefresh: () => void;
  onSave: (config: Partial<EmailSystemConfigItem>) => void;
  onDelete: () => void;
  disabled?: boolean;
}

export default function EmailSystemSettingsSection({
  isOpen,
  onToggle,
  prefersReducedMotion,
  loading,
  saving,
  deleting,
  config,
  onRefresh,
  onSave,
  onDelete,
  disabled = false,
}: EmailSystemSettingsSectionProps) {
  const [enabled, setEnabled] = useState(config?.enabled ?? false);
  const [resendDomain, setResendDomain] = useState(config?.resendDomain ?? '');
  const [resendApiKey, setResendApiKey] = useState(config?.resendApiKey ?? '');
  const [quotaTotal, setQuotaTotal] = useState(config?.quotaTotal ?? 100);
  const [outemailEnabled, setOutemailEnabled] = useState(config?.outemailEnabled ?? false);
  const [outemailDomain, setOutemailDomain] = useState(config?.outemailDomain ?? '');
  const [outemailApiKey, setOutemailApiKey] = useState(config?.outemailApiKey ?? '');
  const [outemailCode, setOutemailCode] = useState(config?.outemailCode ?? '');
  const [outemailQuotaTotal, setOutemailQuotaTotal] = useState(config?.outemailQuotaTotal ?? 100);

  // Sync local state when config changes
  useEffect(() => {
    setEnabled(config?.enabled ?? false);
    setResendDomain(config?.resendDomain ?? '');
    setResendApiKey(config?.resendApiKey ?? '');
    setQuotaTotal(config?.quotaTotal ?? 100);
    setOutemailEnabled(config?.outemailEnabled ?? false);
    setOutemailDomain(config?.outemailDomain ?? '');
    setOutemailApiKey(config?.outemailApiKey ?? '');
    setOutemailCode(config?.outemailCode ?? '');
    setOutemailQuotaTotal(config?.outemailQuotaTotal ?? 100);
  }, [config]);

  const handleSave = () => {
    onSave({
      enabled,
      resendDomain: resendDomain.trim(),
      resendApiKey: resendApiKey.trim(),
      quotaTotal: Math.max(1, Math.min(1000000, quotaTotal)),
      outemailEnabled,
      outemailDomain: outemailDomain.trim(),
      outemailApiKey: outemailApiKey.trim(),
      outemailCode: outemailCode.trim(),
      outemailQuotaTotal: Math.max(1, Math.min(1000000, outemailQuotaTotal)),
    });
  };

  return (
    <CollapsibleSection
      title="邮件系统配置"
      description="管理本系统内部发信（Resend，用于系统通知、验证码等）和对外发信 API（Outemail，供外部服务调用本系统发信）的全局设置，包括发信域名、Resend API Key、每日配额等。"
      sectionKey="emailSystem"
      isOpen={isOpen}
      onToggle={onToggle}
      prefersReducedMotion={prefersReducedMotion}
      headerRight={
        <m.button
          onClick={(e) => {
            e.stopPropagation();
            onRefresh();
          }}
          disabled={loading}
          className={REFRESH_BUTTON_CLASS}
          whileTap={{ scale: 0.95 }}
        >
          <FaSync className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> 刷新
        </m.button>
      }
    >
      {loading ? (
        <div className="px-4 py-6 text-sm text-gray-500">加载中...</div>
      ) : (
        <>
          {/* 主邮件系统 (Resend) */}
          <div className="mb-6">
            <h4 className="text-sm font-semibold text-gray-800 mb-3 border-b pb-1">主邮件系统 (Resend) — 供本系统内部发信（通知、验证码等）</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-3">
              <div className="flex items-center gap-3">
                <label className="text-sm font-medium text-gray-700">启用</label>
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={(e) => setEnabled(e.target.checked)}
                  disabled={disabled}
                  className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Resend API Key</label>
                <input
                  value={resendApiKey}
                  onChange={(e) => setResendApiKey(e.target.value)}
                  placeholder="re_... 留空保留原值"
                  disabled={disabled}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 text-sm sm:text-base"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">发信域名</label>
                <input
                  value={resendDomain}
                  onChange={(e) => setResendDomain(e.target.value)}
                  placeholder="例如: 951100.xyz"
                  disabled={disabled}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 text-sm sm:text-base"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">每日配额</label>
                <input
                  type="number"
                  min={1}
                  max={1000000}
                  value={quotaTotal}
                  onChange={(e) => setQuotaTotal(Number(e.target.value))}
                  disabled={disabled}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 text-sm sm:text-base"
                />
              </div>
            </div>
          </div>

          {/* 对外邮件系统 (Outemail) */}
          <div className="mb-6">
            <h4 className="text-sm font-semibold text-gray-800 mb-3 border-b pb-1">对外邮件系统 (Outemail) — 供外部服务调用本系统发信</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-3">
              <div className="flex items-center gap-3">
                <label className="text-sm font-medium text-gray-700">启用</label>
                <input
                  type="checkbox"
                  checked={outemailEnabled}
                  onChange={(e) => setOutemailEnabled(e.target.checked)}
                  disabled={disabled}
                  className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Outemail API Key</label>
                <input
                  value={outemailApiKey}
                  onChange={(e) => setOutemailApiKey(e.target.value)}
                  placeholder="re_... 留空保留原值"
                  disabled={disabled}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 text-sm sm:text-base"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">发信域名</label>
                <input
                  value={outemailDomain}
                  onChange={(e) => setOutemailDomain(e.target.value)}
                  placeholder="例如: chloemlla.com"
                  disabled={disabled}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 text-sm sm:text-base"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">鉴权码</label>
                <input
                  value={outemailCode}
                  onChange={(e) => setOutemailCode(e.target.value)}
                  placeholder="留空保留原值"
                  disabled={disabled}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 text-sm sm:text-base"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">每日配额</label>
                <input
                  type="number"
                  min={1}
                  max={1000000}
                  value={outemailQuotaTotal}
                  onChange={(e) => setOutemailQuotaTotal(Number(e.target.value))}
                  disabled={disabled}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 text-sm sm:text-base"
                />
              </div>
            </div>
          </div>

          {/* 操作按钮 */}
          <div className="flex items-center justify-end gap-3 mb-4">
            {config?.updatedAt && (
              <span className="text-xs text-gray-400 mr-auto">
                最后更新: {new Date(config.updatedAt).toLocaleString()}
              </span>
            )}
            <m.button
              onClick={handleSave}
              disabled={saving || disabled}
              className="px-3 sm:px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition disabled:opacity-50 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-medium"
              whileTap={{ scale: 0.96 }}
            >
              {saving ? '保存中...' : '保存'}
            </m.button>
            <m.button
              onClick={onDelete}
              disabled={deleting || disabled}
              className="px-3 sm:px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition disabled:opacity-50 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-medium"
              whileTap={{ scale: 0.95 }}
            >
              {deleting ? '重置中...' : '重置为默认'}
            </m.button>
          </div>
        </>
      )}
    </CollapsibleSection>
  );
}