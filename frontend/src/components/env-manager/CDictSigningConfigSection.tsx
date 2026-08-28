import { m } from 'framer-motion';
import { FaSync } from 'react-icons/fa';
import CollapsibleSection from './CollapsibleSection';

type SigningMode = 'off' | 'soft' | 'enforce';

interface CDictSigningConfigSectionProps {
  isOpen: boolean;
  onToggle: (key: string) => void;
  prefersReducedMotion?: boolean | null;
  disabled?: boolean;
  loading: boolean;
  saving: boolean;
  deleting: boolean;
  modeInput: SigningMode;
  appSignSecretInput: string;
  appSignSecretPrevInput: string;
  maxDriftMsInput: string;
  clearPreviousSecret: boolean;
  currentAppSignSecret: string;
  currentAppSignSecretPrev: string;
  updatedAt?: string;
  onModeInputChange: (value: SigningMode) => void;
  onAppSignSecretInputChange: (value: string) => void;
  onAppSignSecretPrevInputChange: (value: string) => void;
  onMaxDriftMsInputChange: (value: string) => void;
  onClearPreviousSecretChange: (value: boolean) => void;
  onRefresh: () => void;
  onSave: () => void;
  onReset: () => void;
}

const REFRESH_BUTTON_CLASS =
  'inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60';

export default function CDictSigningConfigSection({
  isOpen,
  onToggle,
  prefersReducedMotion,
  disabled = false,
  loading,
  saving,
  deleting,
  modeInput,
  appSignSecretInput,
  appSignSecretPrevInput,
  maxDriftMsInput,
  clearPreviousSecret,
  currentAppSignSecret,
  currentAppSignSecretPrev,
  updatedAt,
  onModeInputChange,
  onAppSignSecretInputChange,
  onAppSignSecretPrevInputChange,
  onMaxDriftMsInputChange,
  onClearPreviousSecretChange,
  onRefresh,
  onSave,
  onReset,
}: CDictSigningConfigSectionProps) {
  const isDisabled = saving || deleting || disabled;

  return (
    <CollapsibleSection
      title="CDict 官方客户端请求配置"
      description="管理 CDict 官方客户端的独立请求额度识别参数。密钥只会脱敏展示，保存后当前服务实例立即生效。"
      sectionKey="cdictSigning"
      isOpen={isOpen}
      onToggle={onToggle}
      prefersReducedMotion={prefersReducedMotion}
      headerRight={
        <m.button
          onClick={(event) => {
            event.stopPropagation();
            onRefresh();
          }}
          disabled={loading}
          className={REFRESH_BUTTON_CLASS}
          whileTap={{ scale: 0.95 }}
        >
          <FaSync className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> 刷新
        </m.button>
      }
    >
      <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-xs leading-5 text-amber-950">
        <p>生产环境必须连接共享 Redis，否则已签名客户端不会获得独立额度；enforce 模式下，携带无效签名的请求会被拒绝，完全未签名的旧客户端仍使用普通额度。</p>
        <p>密钥随客户端构建分发，只用于请求额度分层，不应作为账号身份或授权凭据。多实例部署保存后需同步重启其他实例。</p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">CDICT_REQUEST_SIGNING</label>
          <select
            value={modeInput}
            onChange={(event) => onModeInputChange(event.target.value as SigningMode)}
            disabled={disabled}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 sm:text-base"
          >
            <option value="off">off（关闭官方额度识别）</option>
            <option value="soft">soft（失败时使用普通额度，推荐）</option>
            <option value="enforce">enforce（拒绝携带无效签名的请求）</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">CDICT_SIG_MAX_DRIFT_MS</label>
          <input
            type="number"
            min={1000}
            max={86400000}
            step={1000}
            value={maxDriftMsInput}
            onChange={(event) => onMaxDriftMsInputChange(event.target.value)}
            disabled={disabled}
            placeholder="300000"
            autoComplete="off"
            spellCheck={false}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 sm:text-base"
          />
          <div className="mt-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600">
            有效范围 1000–86400000 毫秒，默认 300000（5 分钟）
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">CDICT_APP_SIGN_SECRET</label>
          <input
            type="password"
            value={appSignSecretInput}
            onChange={(event) => onAppSignSecretInputChange(event.target.value)}
            disabled={disabled}
            placeholder="输入至少 32 个字符；留空保持现有密钥"
            autoComplete="new-password"
            spellCheck={false}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 sm:text-base"
          />
          <div className="mt-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600">
            当前配置（脱敏）：{loading ? '加载中...' : currentAppSignSecret || '未设置'}
          </div>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">CDICT_APP_SIGN_SECRET_PREV（轮换旧密钥）</label>
          <input
            type="password"
            value={appSignSecretPrevInput}
            onChange={(event) => onAppSignSecretPrevInputChange(event.target.value)}
            disabled={disabled || clearPreviousSecret}
            placeholder="输入至少 32 个字符；留空保持现有旧密钥"
            autoComplete="new-password"
            spellCheck={false}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 sm:text-base disabled:bg-gray-100"
          />
          <div className="mt-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600">
            当前配置（脱敏）：{loading ? '加载中...' : currentAppSignSecretPrev || '未设置'}
          </div>
          <label className="mt-2 flex items-center gap-2 text-xs text-gray-700">
            <input
              type="checkbox"
              checked={clearPreviousSecret}
              onChange={(event) => onClearPreviousSecretChange(event.target.checked)}
              disabled={disabled}
              className="h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
            />
            保存时清除上一把密钥
          </label>
        </div>
      </div>

      <div className="flex items-center justify-end gap-3">
        <m.button
          onClick={onReset}
          disabled={isDisabled}
          className="rounded-lg bg-red-500 px-3 py-2 text-sm font-medium text-white transition hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-40 sm:px-4"
          whileTap={{ scale: 0.96 }}
        >
          {deleting ? '重置中...' : '恢复部署默认值'}
        </m.button>
        <m.button
          onClick={onSave}
          disabled={isDisabled}
          className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40 sm:px-4"
          whileTap={{ scale: 0.96 }}
        >
          {saving ? '保存中...' : '保存/更新'}
        </m.button>
      </div>

      <div className="mt-1 text-xs text-gray-500">
        最后更新时间：{updatedAt ? new Date(updatedAt).toLocaleString() : '-'}
      </div>
    </CollapsibleSection>
  );
}
