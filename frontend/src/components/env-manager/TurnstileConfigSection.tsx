import { m } from 'framer-motion';
import { FaSync } from 'react-icons/fa';
import CollapsibleSection from './CollapsibleSection';
import type { TurnstileConfigSetting } from './types';
import ConfigFieldRow from './ConfigFieldRow';

const REFRESH_BUTTON_CLASS =
  'inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400';

export interface TurnstileConfigSectionProps {
  isOpen: boolean;
  onToggle: (key: string) => void;
  prefersReducedMotion: boolean | null | undefined;
  loading: boolean;
  saving: boolean;
  deleting: boolean;
  config: TurnstileConfigSetting | null;
  siteKeyInput: string;
  secretKeyInput: string;
  onSiteKeyChange: (value: string) => void;
  onSecretKeyChange: (value: string) => void;
  onRefresh: () => void;
  onSave: (key: 'TURNSTILE_SECRET_KEY' | 'TURNSTILE_SITE_KEY') => void;
  onDelete: (key: 'TURNSTILE_SECRET_KEY' | 'TURNSTILE_SITE_KEY') => void;
}

export default function TurnstileConfigSection({
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
}: TurnstileConfigSectionProps) {
  return (
    <CollapsibleSection title="Turnstile 配置设置" description="管理 Cloudflare Turnstile Site Key 和 Secret Key。用于前端人机验证（登录、注册等），保护后端接口免受自动化攻击。" sectionKey="turnstile" isOpen={isOpen} onToggle={onToggle} prefersReducedMotion={prefersReducedMotion} headerRight={
              <m.button onClick={(e) => { e.stopPropagation(); onRefresh(); }} disabled={loading} className={REFRESH_BUTTON_CLASS} whileTap={{ scale: 0.95 }}>
                <FaSync className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> 刷新
              </m.button>
            }>
              <div className="space-y-6">
                <div>
                  <h4 className="text-md font-semibold text-slate-700 mb-3">Site Key 配置</h4>
                  <ConfigFieldRow
                    inputLabel="Site Key"
                    value={siteKeyInput}
                    onChange={onSiteKeyChange}
                    placeholder="请输入 Turnstile Site Key（例如：0x4AAAAAAABkMYinukE5NHzg）"
                    currentLabel="当前配置"
                    currentValue={config?.siteKey || '未设置'}
                    loading={loading}
                    isSaving={saving}
                    isDeleting={deleting}
                    onSave={() => onSave('TURNSTILE_SITE_KEY')}
                    onDelete={() => onDelete('TURNSTILE_SITE_KEY')}
                  />
                </div>

                <div>
                  <h4 className="text-md font-semibold text-slate-700 mb-3">Secret Key 配置</h4>
                  <ConfigFieldRow
                    inputLabel="Secret Key"
                    value={secretKeyInput}
                    onChange={onSecretKeyChange}
                    placeholder="请输入 Turnstile Secret Key（仅用于后端验证，不回显明文）"
                    currentLabel="当前配置（脱敏）"
                    currentValue={config?.secretKey || '未设置'}
                    loading={loading}
                    isSaving={saving}
                    isDeleting={deleting}
                    isPassword
                    onSave={() => onSave('TURNSTILE_SECRET_KEY')}
                    onDelete={() => onDelete('TURNSTILE_SECRET_KEY')}
                  />
                </div>

                {/* 状态信息 */}
                <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                  <div className="flex items-center gap-2 text-sm text-slate-700">
                    <div className={`w-2 h-2 rounded-full ${config?.enabled ? 'bg-emerald-500' : 'bg-rose-500'}`}></div>
                    <span className="font-medium">
                      Turnstile 状态：{config?.enabled ? '已启用' : '未启用'}
                    </span>
                  </div>
                  <div className="mt-2 text-xs text-slate-500">
                    说明：Turnstile 用于人机验证，支持动态配置。Site Key 用于前端显示，Secret Key 用于后端验证。
                  </div>
                </div>
              </div>
            </CollapsibleSection>
  );
}