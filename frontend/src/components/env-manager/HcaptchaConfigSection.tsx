import { m } from 'framer-motion';
import { FaSync } from 'react-icons/fa';
import CollapsibleSection from './CollapsibleSection';
import type { HCaptchaConfigSetting } from './types';

const REFRESH_BUTTON_CLASS =
  'inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60';

export interface HcaptchaConfigSectionProps {
  isOpen: boolean;
  onToggle: (key: string) => void;
  prefersReducedMotion: boolean | null | undefined;
  loading: boolean;
  saving: boolean;
  deleting: boolean;
  config: HCaptchaConfigSetting | null;
  siteKeyInput: string;
  secretKeyInput: string;
  onSiteKeyChange: (value: string) => void;
  onSecretKeyChange: (value: string) => void;
  onRefresh: () => void;
  onSave: (key: 'HCAPTCHA_SECRET_KEY' | 'HCAPTCHA_SITE_KEY') => void;
  onDelete: (key: 'HCAPTCHA_SECRET_KEY' | 'HCAPTCHA_SITE_KEY') => void;
}

export default function HcaptchaConfigSection({
  isOpen,
  onToggle,
  prefersReducedMotion,
  loading,
  saving,
  deleting,
  config,
  siteKeyInput,
  secretKeyInput,
  onSiteKeyChange,
  onSecretKeyChange,
  onRefresh,
  onSave,
  onDelete
}: HcaptchaConfigSectionProps) {
  return (
    <CollapsibleSection title="hCaptcha 配置设置" description="管理 hCaptcha Site Key 和 Secret Key。" sectionKey="hcaptcha" isOpen={isOpen} onToggle={onToggle} prefersReducedMotion={prefersReducedMotion} headerRight={
              <m.button onClick={(e) => { e.stopPropagation(); onRefresh(); }} disabled={loading} className={REFRESH_BUTTON_CLASS} whileTap={{ scale: 0.95 }}>
                <FaSync className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> 刷新
              </m.button>
            }>
              {/* Site Key 配置 */}
              <div className="mb-6">
                <h4 className="text-md font-semibold text-gray-700 mb-3">Site Key 配置</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Site Key</label>
                    <input
                      value={siteKeyInput}
                      onChange={(e) => onSiteKeyChange(e.target.value)}
                      placeholder="请输入 hCaptcha Site Key（例如：10000000-ffff-ffff-ffff-000000000001）"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 text-sm sm:text-base"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">当前配置</label>
                    <div className="px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-sm text-gray-700 min-h-[40px] flex items-center">
                      {loading ? '加载中...' : (config?.siteKey || '未设置')}
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3">
                  <m.button
                    onClick={() => onDelete('HCAPTCHA_SITE_KEY')}
                    disabled={deleting}
                    className="px-3 sm:px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition disabled:opacity-50 text-sm font-medium"
                    whileTap={{ scale: 0.96 }}
                  >
                    {deleting ? '删除中...' : '删除'}
                  </m.button>
                  <m.button
                    onClick={() => onSave('HCAPTCHA_SITE_KEY')}
                    disabled={saving}
                    className="px-3 sm:px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition disabled:opacity-50 text-sm font-medium"
                    whileTap={{ scale: 0.96 }}
                  >
                    {saving ? '保存中...' : '保存/更新'}
                  </m.button>
                </div>
              </div>

              {/* Secret Key 配置 */}
              <div className="mb-4">
                <h4 className="text-md font-semibold text-gray-700 mb-3">Secret Key 配置</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Secret Key</label>
                    <input
                      value={secretKeyInput}
                      onChange={(e) => onSecretKeyChange(e.target.value)}
                      placeholder="请输入 hCaptcha Secret Key（仅用于后端验证，不回显明文）"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 text-sm sm:text-base"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">当前配置（脱敏）</label>
                    <div className="px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-sm text-gray-700 min-h-[40px] flex items-center">
                      {loading ? '加载中...' : (config?.secretKey || '未设置')}
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3">
                  <m.button
                    onClick={() => onDelete('HCAPTCHA_SECRET_KEY')}
                    disabled={deleting}
                    className="px-3 sm:px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition disabled:opacity-50 text-sm font-medium"
                    whileTap={{ scale: 0.96 }}
                  >
                    {deleting ? '删除中...' : '删除'}
                  </m.button>
                  <m.button
                    onClick={() => onSave('HCAPTCHA_SECRET_KEY')}
                    disabled={saving}
                    className="px-3 sm:px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition disabled:opacity-50 text-sm font-medium"
                    whileTap={{ scale: 0.96 }}
                  >
                    {saving ? '保存中...' : '保存/更新'}
                  </m.button>
                </div>
              </div>

              {/* 状态信息 */}
              <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg">
                <div className="flex items-center gap-2 text-sm text-green-700">
                  <div className={`w-2 h-2 rounded-full ${config?.enabled ? 'bg-green-500' : 'bg-red-500'}`}></div>
                  <span className="font-medium">
                    hCaptcha 状态：{config?.enabled ? '已启用' : '未启用'}
                  </span>
                </div>
                <div className="mt-2 text-xs text-green-600">
                  说明：hCaptcha 用于人机验证，支持动态配置。Site Key 用于前端显示，Secret Key 用于后端验证。
                </div>
              </div>
            </CollapsibleSection>
  );
}
