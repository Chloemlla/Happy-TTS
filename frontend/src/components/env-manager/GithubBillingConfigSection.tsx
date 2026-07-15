import { m } from 'framer-motion';
import { FaSync } from 'react-icons/fa';
import CollapsibleSection from './CollapsibleSection';
import type { MultiGitHubBillingConfig } from './types';

const REFRESH_BUTTON_CLASS =
  'inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60';

export interface GithubBillingConfigSectionProps {
  isOpen: boolean;
  onToggle: (key: string) => void;
  prefersReducedMotion: boolean | null | undefined;
  loading: boolean;
  saving: boolean;
  curlInput: string;
  selectedConfigKey: 'config1' | 'config2' | 'config3';
  multiConfig: MultiGitHubBillingConfig | null;
  onCurlInputChange: (value: string) => void;
  onSelectedConfigKeyChange: (value: 'config1' | 'config2' | 'config3') => void;
  onRefresh: () => void;
  onSave: () => void;
  onDelete: () => void;
}

export default function GithubBillingConfigSection({
  isOpen,
  onToggle,
  prefersReducedMotion,
  loading,
  saving,
  curlInput,
  selectedConfigKey,
  multiConfig,
  onCurlInputChange,
  onSelectedConfigKeyChange,
  onRefresh,
  onSave,
  onDelete
}: GithubBillingConfigSectionProps) {
  return (
    <CollapsibleSection title="GitHub Billing 配置设置" description="管理 GitHub Billing curl 配置和账单数据读取参数。" sectionKey="githubBilling" isOpen={isOpen} onToggle={onToggle} prefersReducedMotion={prefersReducedMotion} headerRight={
              <m.button onClick={(e) => { e.stopPropagation(); onRefresh(); }} disabled={loading} className={REFRESH_BUTTON_CLASS} whileTap={{ scale: 0.95 }}>
                <FaSync className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> 刷新
              </m.button>
            }>
              {/* Curl 命令配置 */}
              <div className="mb-4">
                <h4 className="text-md font-semibold text-gray-700 mb-3">Curl 命令配置</h4>
                <div className="grid grid-cols-1 gap-4 mb-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">GitHub Billing Curl 命令</label>
                    <textarea
                      value={curlInput}
                      onChange={(e) => onCurlInputChange(e.target.value)}
                      placeholder="请粘贴从浏览器开发者工具复制的 GitHub Billing curl 命令..."
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 text-sm sm:text-base min-h-[120px] font-mono"
                      rows={6}
                    />
                    <div className="mt-1 text-xs text-gray-500">
                      提示：从浏览器开发者工具的网络标签页中复制 GitHub Billing 相关的 curl 命令
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3">
                  <m.button
                    onClick={onSave}
                    disabled={saving}
                    className="px-3 sm:px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition disabled:opacity-50 text-sm font-medium"
                    whileTap={{ scale: 0.96 }}
                  >
                    {saving ? '保存中...' : '保存/更新'}
                  </m.button>
                </div>
              </div>

              {/* 当前配置状态 */}
              {multiConfig && multiConfig[selectedConfigKey] && (
                <div className="mb-4 p-3 bg-gray-50 border border-gray-200 rounded-lg">
                  <h5 className="text-sm font-semibold text-gray-700 mb-2">当前配置信息 ({selectedConfigKey})</h5>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="font-medium text-gray-600">URL:</span>
                      <span className="ml-2 text-gray-800 break-all">{multiConfig[selectedConfigKey]?.url || '未设置'}</span>
                    </div>
                    <div>
                      <span className="font-medium text-gray-600">方法:</span>
                      <span className="ml-2 text-gray-800">{multiConfig[selectedConfigKey]?.method || '未设置'}</span>
                    </div>
                    <div>
                      <span className="font-medium text-gray-600">Customer ID:</span>
                      <span className="ml-2 text-gray-800">{multiConfig[selectedConfigKey]?.customerId || '未设置'}</span>
                    </div>
                    <div>
                      <span className="font-medium text-gray-600">Headers:</span>
                      <span className="ml-2 text-gray-800">{multiConfig[selectedConfigKey]?.headersCount || 0} 个</span>
                    </div>
                    <div>
                      <span className="font-medium text-gray-600">Cookies:</span>
                      <span className="ml-2 text-gray-800">{multiConfig[selectedConfigKey]?.hasCookies ? '已配置' : '未配置'}</span>
                    </div>
                    <div>
                      <span className="font-medium text-gray-600">更新时间:</span>
                      <span className="ml-2 text-gray-800">
                        {multiConfig[selectedConfigKey]?.updatedAt ? new Date(multiConfig[selectedConfigKey]!.updatedAt!).toLocaleString() : '未知'}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* 状态信息 */}
              <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="flex items-center gap-2 text-sm text-blue-700">
                  <div className={`w-2 h-2 rounded-full ${multiConfig && multiConfig[selectedConfigKey] ? 'bg-green-500' : 'bg-red-500'}`}></div>
                  <span className="font-medium">
                    GitHub Billing 状态：{multiConfig && multiConfig[selectedConfigKey] ? '已配置' : '未配置'}
                  </span>
                </div>
                <div className="mt-2 text-xs text-blue-600">
                  说明：GitHub Billing 配置用于获取 GitHub 账单使用情况数据。需要从浏览器开发者工具复制有效的 curl 命令。
                </div>
              </div>
            </CollapsibleSection>
  );
}
