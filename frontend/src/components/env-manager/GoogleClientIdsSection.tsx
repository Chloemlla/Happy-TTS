import { m } from 'framer-motion';
import { FaSync } from 'react-icons/fa';
import CollapsibleSection from './CollapsibleSection';

const REFRESH_BUTTON_CLASS =
  'inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60';

interface GoogleClientIdsSectionProps {
  isOpen: boolean;
  onToggle: (key: string) => void;
  prefersReducedMotion?: boolean | null;
  loading: boolean;
  saving: boolean;
  deleting: boolean;
  googleClientIdInput: string;
  nexaiGoogleClientIdInput: string;
  googleClientIdCurrent: string;
  nexaiGoogleClientIdCurrent: string;
  updatedAt?: string;
  onGoogleClientIdInputChange: (value: string) => void;
  onNexaiGoogleClientIdInputChange: (value: string) => void;
  onRefresh: () => void;
  onSave: () => void;
  onReset: () => void;
}

export default function GoogleClientIdsSection({
  isOpen,
  onToggle,
  prefersReducedMotion,
  loading,
  saving,
  deleting,
  googleClientIdInput,
  nexaiGoogleClientIdInput,
  googleClientIdCurrent,
  nexaiGoogleClientIdCurrent,
  updatedAt,
  onGoogleClientIdInputChange,
  onNexaiGoogleClientIdInputChange,
  onRefresh,
  onSave,
  onReset,
}: GoogleClientIdsSectionProps) {
  return (
    <CollapsibleSection
      title="Google / NexAI Client ID 环境变量"
      description="直接配置 GOOGLE_CLIENT_ID 与 NEXAI_GOOGLE_CLIENT_ID。保存后写入运行时配置并立即生效；进程环境 / .env 同名变量仅作启动默认值。"
      sectionKey="googleClientIds"
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
      <div className="rounded-xl border border-indigo-100 bg-indigo-50/70 px-4 py-3 text-xs leading-5 text-indigo-900">
        <p>
          <code className="rounded bg-white/80 px-1">GOOGLE_CLIENT_ID</code>
          ：主站 Google Identity Services（GSI）Web Client ID。
        </p>
        <p className="mt-1">
          <code className="rounded bg-white/80 px-1">NEXAI_GOOGLE_CLIENT_ID</code>
          ：NexAI Google 登录 Client ID；未配置时可回退主站 ID。
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">GOOGLE_CLIENT_ID</label>
          <input
            value={googleClientIdInput}
            onChange={(event) => onGoogleClientIdInputChange(event.target.value)}
            placeholder="xxxx.apps.googleusercontent.com"
            autoComplete="off"
            spellCheck={false}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 sm:text-base"
          />
          <div className="mt-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600">
            当前生效：
            {loading ? '加载中...' : googleClientIdCurrent || '未设置'}
          </div>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">NEXAI_GOOGLE_CLIENT_ID</label>
          <input
            value={nexaiGoogleClientIdInput}
            onChange={(event) => onNexaiGoogleClientIdInputChange(event.target.value)}
            placeholder="xxxx.apps.googleusercontent.com"
            autoComplete="off"
            spellCheck={false}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 sm:text-base"
          />
          <div className="mt-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600">
            当前生效：
            {loading
              ? '加载中...'
              : nexaiGoogleClientIdCurrent || '未设置（可回退 GOOGLE_CLIENT_ID）'}
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
          className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:opacity-50 sm:px-4"
          whileTap={{ scale: 0.96 }}
        >
          {saving ? '保存中...' : '保存/更新'}
        </m.button>
      </div>

      <div className="mt-1 text-xs text-gray-500">
        最后更新时间：
        {updatedAt ? new Date(updatedAt).toLocaleString() : '-'}
      </div>
    </CollapsibleSection>
  );
}
