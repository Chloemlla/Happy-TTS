import { m } from 'framer-motion';
import { FaSync } from 'react-icons/fa';
import CollapsibleSection from './CollapsibleSection';
import type { ChatProviderItem } from './types';

const REFRESH_BUTTON_CLASS =
  'inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60';

export interface LibreChatProvidersSectionProps {
  isOpen: boolean;
  onToggle: (key: string) => void;
  prefersReducedMotion: boolean | null | undefined;
  loading: boolean;
  saving: boolean;
  deletingId: string | null;
  providers: ChatProviderItem[];
  providerId: string | null;
  providerFilterGroup: string;
  providerBaseUrl: string;
  providerApiKey: string;
  providerModel: string;
  providerGroup: string;
  providerEnabled: boolean;
  providerWeight: number;
  onFilterGroupChange: (value: string) => void;
  onBaseUrlChange: (value: string) => void;
  onApiKeyChange: (value: string) => void;
  onModelChange: (value: string) => void;
  onGroupChange: (value: string) => void;
  onEnabledChange: (value: boolean) => void;
  onWeightChange: (value: number) => void;
  onRefresh: () => void;
  onSave: () => void;
  onReset: () => void;
  onEdit: (provider: ChatProviderItem) => void;
  onDelete: (id: string) => void;
}

export default function LibreChatProvidersSection({
  isOpen,
  onToggle,
  prefersReducedMotion,
  loading,
  saving,
  deletingId,
  providers,
  providerId,
  providerFilterGroup,
  providerBaseUrl,
  providerApiKey,
  providerModel,
  providerGroup,
  providerEnabled,
  providerWeight,
  onFilterGroupChange,
  onBaseUrlChange,
  onApiKeyChange,
  onModelChange,
  onGroupChange,
  onEnabledChange,
  onWeightChange,
  onRefresh,
  onSave,
  onReset,
  onEdit,
  onDelete
}: LibreChatProvidersSectionProps) {
  return (
    <CollapsibleSection title="LibreChat 提供者配置" description="管理 LibreChat 多提供者 Base URL、API Key、模型和权重。" sectionKey="providers" isOpen={isOpen} onToggle={onToggle} prefersReducedMotion={prefersReducedMotion} headerRight={
              <div className="flex flex-wrap items-center gap-2" onClick={(e) => e.stopPropagation()}>
                <input
                  value={providerFilterGroup}
                  onChange={(e) => onFilterGroupChange(e.target.value)}
                  placeholder="按 group 过滤"
                  className="w-full sm:w-auto px-2 sm:px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 text-sm"
                />
                <m.button
                  onClick={onRefresh}
                  disabled={loading}
                  className={`${REFRESH_BUTTON_CLASS} w-full justify-center sm:w-auto`}
                  whileTap={{ scale: 0.95 }}
                >
                  <FaSync className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> 刷新
                </m.button>
              </div>
            }>
              {/* 表单 */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Base URL</label>
                  <input
                    value={providerBaseUrl}
                    onChange={(e) => onBaseUrlChange(e.target.value)}
                    placeholder="https://your-openai-compatible.example"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 text-sm sm:text-base"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">API Key</label>
                  <input
                    value={providerApiKey}
                    onChange={(e) => onApiKeyChange(e.target.value)}
                    placeholder="re_xxx 或 sk-xxx"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 text-sm sm:text-base"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Model</label>
                  <input
                    value={providerModel}
                    onChange={(e) => onModelChange(e.target.value)}
                    placeholder="gpt-4o-mini / gpt-oss-120b 等"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 text-sm sm:text-base"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Group（可选）</label>
                  <input
                    value={providerGroup}
                    onChange={(e) => onGroupChange(e.target.value)}
                    placeholder="自定义分组名，用于归类"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 text-sm sm:text-base"
                  />
                </div>
                <div className="flex items-center gap-3">
                  <label className="text-sm font-medium text-gray-700">启用</label>
                  <input
                    type="checkbox"
                    checked={providerEnabled}
                    onChange={(e) => onEnabledChange(e.target.checked)}
                    className="h-4 w-4"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">权重（1-10）</label>
                  <input
                    type="number"
                    value={providerWeight}
                    onChange={(e) => onWeightChange(Math.max(1, Math.min(10, Number(e.target.value || 1))))}
                    min={1}
                    max={10}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 text-sm sm:text-base"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 mb-4">
                <m.button
                  onClick={onReset}
                  className="px-3 sm:px-4 py-2 bg-gray-100 text-gray-800 rounded-lg hover:bg-gray-200 transition text-sm font-medium"
                  whileTap={{ scale: 0.96 }}
                >
                  重置
                </m.button>
                <m.button
                  onClick={onSave}
                  disabled={saving}
                  className="px-3 sm:px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition disabled:opacity-50 text-sm font-medium"
                  whileTap={{ scale: 0.96 }}
                >
                  {saving ? '保存中...' : (providerId ? '更新' : '新增')}
                </m.button>
              </div>

              {/* 列表 */}
              {loading ? (
                <div className="text-gray-500 text-sm">加载中...</div>
              ) : providers.length === 0 ? (
                <div className="text-gray-500 text-sm">暂无提供者</div>
              ) : (
                <div className="overflow-x-auto border border-gray-200 rounded-lg">
                  {isMobile ? (
                    <div className="space-y-3 p-2">
                      {providers.map((p, i) => (
                        <m.div
                          key={p.id}
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={prefersReducedMotion ? NO_DURATION : { duration: 0.25, delay: i * 0.04 }}
                          className="border rounded-lg p-3 bg-white"
                        >
                          <div className="text-sm text-gray-800 break-all">
                            <div className="font-semibold">{p.baseUrl}</div>
                            <div className="mt-1">Model：{p.model}</div>
                            <div className="mt-1">Group：{p.group || '-'}</div>
                            <div className="mt-1">Enabled：{p.enabled ? '是' : '否'}｜Weight：{p.weight}</div>
                            <div className="mt-1 font-mono text-xs text-gray-700">{p.apiKey}</div>
                            <div className="mt-1 text-xs text-gray-500">{p.updatedAt ? new Date(p.updatedAt).toLocaleString() : '-'}</div>
                          </div>
                          <div className="mt-2 flex items-center justify-end gap-2">
                            <m.button
                              onClick={() => onEdit(p)}
                              className="px-2 sm:px-3 py-1.5 bg-gray-100 text-gray-800 rounded-lg hover:bg-gray-200 transition text-sm"
                              whileTap={{ scale: 0.95 }}
                            >
                              编辑
                            </m.button>
                            <m.button
                              onClick={() => onDelete(p.id)}
                              disabled={deletingId === p.id}
                              className="px-2 sm:px-3 py-1.5 bg-red-500 text-white rounded-lg hover:bg-red-600 transition disabled:opacity-50 text-sm"
                              whileTap={{ scale: 0.95 }}
                            >
                              {deletingId === p.id ? '删除中...' : '删除'}
                            </m.button>
                          </div>
                        </m.div>
                      ))}
                    </div>
                  ) : (
                    <table className="min-w-full">
                      <thead>
                        <tr className="bg-gray-50 border-b border-gray-200">
                          <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Base URL</th>
                          <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Model</th>
                          <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Group</th>
                          <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Enabled</th>
                          <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Weight</th>
                          <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">API Key（脱敏）</th>
                          <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Updated</th>
                          <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">操作</th>
                        </tr>
                      </thead>
                      <tbody>
                        {providers.map((p, i) => (
                          <m.tr
                            key={p.id}
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={prefersReducedMotion ? NO_DURATION : { duration: 0.25, delay: i * 0.04 }}
                            className="border-b last:border-b-0"
                          >
                            <td className="px-4 py-3 text-sm text-gray-800 break-all">{p.baseUrl}</td>
                            <td className="px-4 py-3 text-sm text-gray-800">{p.model}</td>
                            <td className="px-4 py-3 text-sm text-gray-800">{p.group || '-'}</td>
                            <td className="px-4 py-3 text-sm text-gray-800">{p.enabled ? '是' : '否'}</td>
                            <td className="px-4 py-3 text-sm text-gray-800">{p.weight}</td>
                            <td className="px-4 py-3 font-mono text-sm text-gray-700">{p.apiKey}</td>
                            <td className="px-4 py-3 text-sm text-gray-600">{p.updatedAt ? new Date(p.updatedAt).toLocaleString() : '-'}</td>
                            <td className="px-4 py-3 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <m.button
                                  onClick={() => onEdit(p)}
                                  className="px-2 sm:px-3 py-1.5 bg-gray-100 text-gray-800 rounded-lg hover:bg-gray-200 transition text-sm"
                                  whileTap={{ scale: 0.95 }}
                                >
                                  编辑
                                </m.button>
                                <m.button
                                  onClick={() => onDelete(p.id)}
                                  disabled={deletingId === p.id}
                                  className="px-2 sm:px-3 py-1.5 bg-red-500 text-white rounded-lg hover:bg-red-600 transition disabled:opacity-50 text-sm"
                                  whileTap={{ scale: 0.95 }}
                                >
                                  {deletingId === p.id ? '删除中...' : '删除'}
                                </m.button>
                              </div>
                            </td>
                          </m.tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </CollapsibleSection>
  );
}
