import { m } from 'framer-motion';
import { FaSync } from 'react-icons/fa';
import CollapsibleSection from './CollapsibleSection';
import type { ClarityConfigSetting } from './types';

const REFRESH_BUTTON_CLASS =
  'inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60';

export interface ClarityConfigSectionProps {
  isOpen: boolean;
  onToggle: (key: string) => void;
  prefersReducedMotion: boolean | null | undefined;
  loading: boolean;
  saving: boolean;
  deleting: boolean;
  config: ClarityConfigSetting | null;
  projectIdInput: string;
  onProjectIdChange: (value: string) => void;
  onRefresh: () => void;
  onSave: () => void;
  onDelete: () => void;
}

export default function ClarityConfigSection({
  isOpen,
  onToggle,
  prefersReducedMotion,
  loading,
  saving,
  deleting,
  config,
  projectIdInput,
  onProjectIdChange,
  onRefresh,
  onSave,
  onDelete
}: ClarityConfigSectionProps) {
  return (
    <CollapsibleSection title="Microsoft Clarity 配置设置" description="管理 Microsoft Clarity Project ID 和启用状态。" sectionKey="clarity" isOpen={isOpen} onToggle={onToggle} prefersReducedMotion={prefersReducedMotion} headerRight={
              <m.button onClick={(e) => { e.stopPropagation(); onRefresh(); }} disabled={loading} className={REFRESH_BUTTON_CLASS} whileTap={{ scale: 0.95 }}>
                <FaSync className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> 刷新
              </m.button>
            }>
              {/* Project ID 配置 */}
              <div className="mb-4">
                <h4 className="text-md font-semibold text-gray-700 mb-3">Project ID 配置</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Project ID
                      <span className="ml-2 text-xs text-gray-500">(10位小写字母数字组合)</span>
                    </label>
                    <input
                      value={projectIdInput}
                      onChange={(e) => onProjectIdChange(e.target.value.toLowerCase())}
                      placeholder="例如：t1dkcavsyz（10位小写字母数字）"
                      maxLength={10}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 text-sm sm:text-base font-mono"
                    />
                    <div className="mt-1 text-xs text-gray-500">
                      提示：自动转换为小写，仅支持字母和数字，长度必须为10位
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">当前配置</label>
                    <div className="px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-sm text-gray-700 min-h-[40px] flex items-center font-mono">
                      {loading ? '加载中...' : (config?.projectId || '未设置')}
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3">
                  <m.button
                    onClick={onDelete}
                    disabled={deleting}
                    className="px-3 sm:px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition disabled:opacity-50 text-sm font-medium"
                    whileTap={{ scale: 0.96 }}
                  >
                    {deleting ? '删除中...' : '删除'}
                  </m.button>
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

              {/* 状态信息 */}
              <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="flex items-center gap-2 text-sm text-blue-700">
                  <div className={`w-2 h-2 rounded-full ${config?.enabled ? 'bg-green-500' : 'bg-red-500'}`}></div>
                  <span className="font-medium">
                    Microsoft Clarity 状态：{config?.enabled ? '已启用' : '未启用'}
                  </span>
                </div>
                <div className="mt-2 text-xs text-blue-600 space-y-1">
                  <div>
                    <strong>说明：</strong>Microsoft Clarity 用于用户行为分析和网站性能监控。
                  </div>
                  <div>
                    <strong>Project ID 格式：</strong>必须为10位小写字母数字组合（如：t1dkcavsyz）
                  </div>
                  <div>
                    <strong>获取方式：</strong>登录 <a href="https://clarity.microsoft.com" target="_blank" rel="noopener noreferrer" className="underline hover:text-blue-800">clarity.microsoft.com</a> 创建项目后获取
                  </div>
                </div>
              </div>
            </CollapsibleSection>
  );
}
