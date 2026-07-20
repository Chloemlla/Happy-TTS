import { m } from 'framer-motion';
import { FaSync } from 'react-icons/fa';
import CollapsibleSection from './CollapsibleSection';
import type { OutemailSettingItem } from './types';

const REFRESH_BUTTON_CLASS =
  'inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60';

export interface OutemailSettingsSectionProps {
  isOpen: boolean;
  onToggle: (key: string) => void;
  prefersReducedMotion?: boolean | null;
  loading: boolean;
  saving: boolean;
  deletingDomain: string | null;
  domain: string;
  code: string;
  apiKey: string;
  settings: OutemailSettingItem[];
  onDomainChange: (value: string) => void;
  onCodeChange: (value: string) => void;
  onApiKeyChange: (value: string) => void;
  onRefresh: () => void;
  onSave: () => void;
  onDelete: (domain: string) => void;
}

export default function OutemailSettingsSection({
  isOpen,
  onToggle,
  prefersReducedMotion,
  loading,
  saving,
  deletingDomain,
  domain,
  code,
  apiKey,
  settings,
  onDomainChange,
  onCodeChange,
  onApiKeyChange,
  onRefresh,
  onSave,
  onDelete,
}: OutemailSettingsSectionProps) {
  return (
    <CollapsibleSection
      title="对外邮件 API 鉴权设置"
      description="管理外部应用调用对外邮件 API 的共享鉴权信息（外部 API Key / 兼容校验码）。也可在 admin?tab=apikeys 创建带 outemail 权限的平台 API Key，两种方式均可调用 /api/outemail/*。"
      sectionKey="outemail"
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
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">域名（可留空表示默认）</label>
          <input
            value={domain}
            onChange={(e) => onDomainChange(e.target.value)}
            placeholder="例如: chloemlla.com 或 留空"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 text-sm sm:text-base"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">鉴权码</label>
          <input
            value={code}
            onChange={(e) => onCodeChange(e.target.value)}
            placeholder="请输入鉴权码"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 text-sm sm:text-base"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">API Key（可选）</label>
          <input
            value={apiKey}
            onChange={(e) => onApiKeyChange(e.target.value)}
            placeholder="可选 API Key"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 text-sm sm:text-base"
          />
        </div>
      </div>

      <div className="flex items-center justify-end gap-3 mb-4">
        <m.button
          onClick={onSave}
          disabled={saving}
          className="px-3 sm:px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition disabled:opacity-50 text-sm font-medium"
          whileTap={{ scale: 0.96 }}
        >
          {saving ? '保存中...' : '保存/更新'}
        </m.button>
      </div>

      <div className="rounded-xl border border-gray-200 overflow-hidden">
        <div className="bg-gray-50 px-4 py-2 text-sm font-medium text-gray-700">已配置域名</div>
        {loading ? (
          <div className="px-4 py-6 text-sm text-gray-500">加载中...</div>
        ) : settings.length === 0 ? (
          <div className="px-4 py-6 text-sm text-gray-500">暂无配置</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-white">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">域名</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">API Key</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">鉴权码</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">更新时间</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {settings.map((s) => (
                  <tr key={s.domain || '__default__'}>
                    <td className="px-4 py-3 text-sm text-gray-800">{s.domain || '默认'}</td>
                    <td className="px-4 py-3 font-mono text-sm text-gray-700">{s.apiKey || '未配置'}</td>
                    <td className="px-4 py-3 font-mono text-sm text-gray-700">{s.code || '未配置'}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {s.updatedAt ? new Date(s.updatedAt).toLocaleString() : '-'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <m.button
                        onClick={() => onDelete(s.domain || '')}
                        disabled={deletingDomain === (s.domain || '')}
                        className="px-3 py-1.5 bg-red-500 text-white rounded-lg hover:bg-red-600 transition disabled:opacity-50 text-sm"
                        whileTap={{ scale: 0.95 }}
                      >
                        {deletingDomain === (s.domain || '') ? '删除中...' : '删除'}
                      </m.button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </CollapsibleSection>
  );
}
