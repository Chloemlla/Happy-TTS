import { m } from 'framer-motion';
import { FaSync } from 'react-icons/fa';
import CollapsibleSection from './CollapsibleSection';

interface SynapseAndroidConfigSectionProps {
  isOpen: boolean;
  onToggle: (key: string) => void;
  prefersReducedMotion?: boolean | null;
  loading: boolean;
  saving: boolean;
  deleting: boolean;
  packageInput: string;
  fingerprintsInput: string;
  googleClientIdInput: string;
  disabled: boolean;
  currentPackage: string;
  currentFingerprints: string[];
  currentGoogleClientId: string;
  updatedAt?: string;
  onPackageInputChange: (value: string) => void;
  onFingerprintsInputChange: (value: string) => void;
  onGoogleClientIdInputChange: (value: string) => void;
  onDisabledChange: (value: boolean) => void;
  onRefresh: () => void;
  onSave: () => void;
  onReset: () => void;
}

const REFRESH_BUTTON_CLASS =
  'inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60';

export default function SynapseAndroidConfigSection({
  isOpen,
  onToggle,
  prefersReducedMotion,
  loading,
  saving,
  deleting,
  packageInput,
  fingerprintsInput,
  googleClientIdInput,
  disabled,
  currentPackage,
  currentFingerprints,
  currentGoogleClientId,
  updatedAt,
  onPackageInputChange,
  onFingerprintsInputChange,
  onGoogleClientIdInputChange,
  onDisabledChange,
  onRefresh,
  onSave,
  onReset,
}: SynapseAndroidConfigSectionProps) {
  return (
    <CollapsibleSection
      title="Synapse Android / assetlinks 配置"
      description="配置 Synapse-Client 的 ANDROID_PACKAGE_NAME、SHA-256 证书指纹与可选 SIWG Client ID。保存后写入运行时 SYNAPSE_ANDROID，并立即影响 /.well-known/assetlinks.json；不覆盖 NexAI 默认项与环境变量全量覆盖。"
      sectionKey="synapseAndroid"
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
          运行时配置仅对指定 package 做 upsert / disable；不会删除 NexAI 默认 assetlinks，也不会覆盖
          <code className="mx-1 rounded bg-white/80 px-1">NEXAI_ANDROID_ASSETLINKS_JSON</code>
          全量覆盖。
        </p>
        <p className="mt-1">
          生效路径：
          <code className="rounded bg-white/80 px-1">/.well-known/assetlinks.json</code>
          。可选
          <code className="mx-1 rounded bg-white/80 px-1">SYNAPSE_ANDROID_GOOGLE_CLIENT_ID</code>
          作为 Android Credential Manager SIWG 的 serverClientId 覆盖；留空则回退主站 GOOGLE_CLIENT_ID。
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">ANDROID_PACKAGE_NAME</label>
          <input
            value={packageInput}
            onChange={(event) => onPackageInputChange(event.target.value)}
            placeholder="com.synapse.mobile"
            autoComplete="off"
            spellCheck={false}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 sm:text-base"
          />
          <div className="mt-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600">
            当前生效：{loading ? '加载中...' : currentPackage || '未设置'}
          </div>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            SYNAPSE_ANDROID_GOOGLE_CLIENT_ID（可选）
          </label>
          <input
            value={googleClientIdInput}
            onChange={(event) => onGoogleClientIdInputChange(event.target.value)}
            placeholder="xxxx.apps.googleusercontent.com"
            autoComplete="off"
            spellCheck={false}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 sm:text-base"
          />
          <div className="mt-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600">
            当前生效：
            {loading ? '加载中...' : currentGoogleClientId || '未设置（回退 GOOGLE_CLIENT_ID）'}
          </div>
        </div>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">
          SHA-256 证书指纹（每行一个，也可用逗号分隔）
        </label>
        <textarea
          value={fingerprintsInput}
          onChange={(event) => onFingerprintsInputChange(event.target.value)}
          placeholder="E9:D8:5A:D2:52:C3:8D:86:C6:E4:B2:A8:C0:49:B8:B5:A9:FA:79:AC:6E:BB:11:8C:94:0A:83:03:B6:96:39:98"
          rows={4}
          spellCheck={false}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-emerald-400 sm:text-sm"
        />
        <div className="mt-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600">
          当前生效：
          {loading
            ? '加载中...'
            : currentFingerprints.length > 0
              ? currentFingerprints.join(', ')
              : '未设置'}
        </div>
      </div>

      <label className="flex items-start gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700">
        <input
          type="checkbox"
          checked={disabled}
          onChange={(event) => onDisabledChange(event.target.checked)}
          className="mt-1 h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
        />
        <span>
          禁用该 package 的 runtime assetlinks 条目
          <span className="mt-1 block text-xs text-gray-500">
            勾选后仅从 assetlinks 中移除本配置对应 package；不会删除 NexAI 或其他 package。
          </span>
        </span>
      </label>

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
