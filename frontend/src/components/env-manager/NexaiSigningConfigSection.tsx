import { m } from 'framer-motion';
import { FaSync } from 'react-icons/fa';
import CollapsibleSection from './CollapsibleSection';

interface NexaiSigningConfigSectionProps {
  isOpen: boolean;
  onToggle: (key: string) => void;
  prefersReducedMotion?: boolean | null;
  loading: boolean;
  saving: boolean;
  deleting: boolean;
  modeInput: 'off' | 'soft' | 'enforce';
  appSignSecretInput: string;
  appSignSecretPrevInput: string;
  maxDriftMsInput: string;
  currentAppSignSecret: string;
  currentAppSignSecretPrev: string;
  updatedAt?: string;
  onModeInputChange: (value: 'off' | 'soft' | 'enforce') => void;
  onAppSignSecretInputChange: (value: string) => void;
  onAppSignSecretPrevInputChange: (value: string) => void;
  onMaxDriftMsInputChange: (value: string) => void;
  onRefresh: () => void;
  onSave: () => void;
  onReset: () => void;
}

const REFRESH_BUTTON_CLASS =
  'inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60';

export default function NexaiSigningConfigSection({
  isOpen,
  onToggle,
  prefersReducedMotion,
  loading,
  saving,
  deleting,
  modeInput,
  appSignSecretInput,
  appSignSecretPrevInput,
  maxDriftMsInput,
  currentAppSignSecret,
  currentAppSignSecretPrev,
  updatedAt,
  onModeInputChange,
  onAppSignSecretInputChange,
  onAppSignSecretPrevInputChange,
  onMaxDriftMsInputChange,
  onRefresh,
  onSave,
  onReset,
}: NexaiSigningConfigSectionProps) {
  return (
    <CollapsibleSection
      title="NexAI 请求签名中间件配置"
      description="配置 NEXAI_REQUEST_SIGNING、NEXAI_APP_SIGN_SECRET(_PREV) 与 NEXAI_SIG_MAX_DRIFT_MS，用于 /api/nexai 匿名/受限路由（如 /api/nexai/security/status）的 HMAC 请求签名校验。保存后立即生效，无需重启服务。"
      sectionKey="nexaiSigning"
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
          <FaSync className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> 刷新
        </m.button>
      }
    >
      <div className="rounded-xl border border-emerald-100 bg-emerald-50/70 px-4 py-3 text-xs leading-5 text-emerald-900">
        <p>
          <code className="mx-1 rounded bg-white/80 px-1">NEXAI_REQUEST_SIGNING</code>
          支持 off / soft / enforce（未设置时默认 soft）。
          <code className="mx-1 rounded bg-white/80 px-1">NEXAI_APP_SIG_SECRET_PREV</code>
          用于密钥轮换期间新旧密钥同时生效。
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">NEXAI_REQUEST_SIGNING</label>
          <select
            value={modeInput}
            onChange={(event) => onModeInputChange(event.target.value as 'off' | 'soft' | 'enforce')}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 sm:text-base"
          >
            <option value="off">off（关闭签名校验）</option>
            <option value="soft">soft（校验但不阻断，默认）</option>
            <option value="enforce">enforce（强制校验，失败拒绝）</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">NEXAI_SIG_MAX_DRIFT_MS</label>
          <input
            type="number"
            min={1000}
            step={1000}
            value={maxDriftMsInput}
            onChange={(event) => onMaxDriftMsInputChange(event.target.value)}
            placeholder="300000"
            autoComplete="off"
            spellCheck={false}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 sm:text-base"
          />
          <div className="mt-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600">
            允许的时间戳最大漂移（毫秒），默认 300000（5 分钟）
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">NEXAI_APP_SIGN_SECRET</label>
          <input
            value={appSignSecretInput}
            onChange={(event) => onAppSignSecretInputChange(event.target.value)}
            placeholder="请输入应用签名密钥（仅用于 HMAC 校验，不会回显明文，留空表示保持现有）"
            autoComplete="off"
            spellCheck={false}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 sm:text-base"
          />
          <div className="mt-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600">
            当前配置（脱敏）：{loading ? '加载中...' : currentAppSignSecret || '未设置'}
          </div>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">NEXAI_APP_SIGN_SECRET_PREV（可选，用于轮换）</label>
          <input
            value={appSignSecretPrevInput}
            onChange={(event) => onAppSignSecretPrevInputChange(event.target.value)}
            placeholder="轮换期间的旧密钥，留空表示保持现有"
            autoComplete="off"
            spellCheck={false}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 sm:text-base"
          />
          <div className="mt-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600">
            当前配置（脱敏）：{loading ? '加载中...' : currentAppSignSecretPrev || '未设置'}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-end gap-3">
        <m.button
          onClick={onReset}
          disabled={deleting || saving}
          className="rounded-lg bg-red-500 px-3 py-2 text-sm font-medium text-white transition hover:bg-red-600 disabled:opacity-50 sm:px-4"
          whileTap={{ scale: 0.96 }}
        >
          {deleting ? '重置中...' : '重置'}
        </m.button>
        <m.button
          onClick={onSave}
          disabled={saving || deleting}
          className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:opacity-50 sm:px-4"
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
