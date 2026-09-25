import { m } from 'framer-motion';
import CollapsibleSection from './CollapsibleSection';
import {
  studioDangerButtonClassName,
  studioPrimaryButtonClassName,
  studioSecondaryButtonClassName,
} from '../studioTheme';

interface RegistrationInviteConfigSectionProps {
  isOpen: boolean;
  onToggle: () => void;
  prefersReducedMotion?: boolean | null;
  loading: boolean;
  saving: boolean;
  deleting: boolean;
  disabled: boolean;
  required: boolean;
  updatedAt?: string;
  onRequiredChange: (value: boolean) => void;
  onRefresh: () => void;
  onSave: () => void;
  onReset: () => void;
}

/**
 * 注册邀请码闸门（REGISTRATION_INVITE）。这是该开关唯一的配置入口；
 * 保存走运行时配置（Mongo），注册接口每次请求读内存缓存，无需重启即生效。
 */
export default function RegistrationInviteConfigSection({
  isOpen,
  onToggle,
  prefersReducedMotion,
  loading,
  saving,
  deleting,
  disabled,
  required,
  updatedAt,
  onRequiredChange,
  onRefresh,
  onSave,
  onReset,
}: RegistrationInviteConfigSectionProps) {
  const busy = loading || saving || deleting;

  return (
    <CollapsibleSection
      title="注册邀请码"
      description="控制本地账号注册是否必须提供邀请码。仅此处可配置；保存后立即生效，无需重启。"
      sectionKey="registrationInvite"
      isOpen={isOpen}
      onToggle={onToggle}
      prefersReducedMotion={prefersReducedMotion}
    >
      <label className="flex items-start gap-3 rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-700">
        <input
          type="checkbox"
          className="mt-0.5 h-4 w-4"
          checked={required}
          onChange={(event) => onRequiredChange(event.target.checked)}
          disabled={disabled || busy}
        />
        <span>
          <span className="block font-medium text-slate-800">注册必须提供邀请码</span>
          <span className="mt-0.5 block text-slate-500">
            开启后未填写邀请码的注册会被拒绝；关闭后可直接注册（填了邀请码的请求仍会校验其有效性）。
          </span>
        </span>
      </label>

      <div className="rounded-2xl border border-slate-200 bg-slate-50/80 px-3 py-2 text-xs text-slate-600 sm:px-4 sm:py-3">
        <div>
          当前状态：{loading ? '加载中...' : required ? '必须提供邀请码' : '邀请码可选'}
        </div>
        <div className="mt-1">
          最后更新：
          {loading
            ? '加载中...'
            : updatedAt
              ? new Date(updatedAt).toLocaleString()
              : '未保存过（当前使用部署环境变量 / 默认值）'}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-3">
        <m.button
          type="button"
          onClick={onRefresh}
          disabled={busy}
          className={studioSecondaryButtonClassName}
          whileTap={{ scale: 0.97 }}
        >
          {loading ? '刷新中...' : '刷新'}
        </m.button>
        <m.button
          type="button"
          onClick={onReset}
          disabled={disabled || busy}
          className={studioDangerButtonClassName}
          whileTap={{ scale: 0.97 }}
        >
          {deleting ? '重置中...' : '重置'}
        </m.button>
        <m.button
          type="button"
          onClick={onSave}
          disabled={disabled || busy}
          className={studioPrimaryButtonClassName}
          whileTap={{ scale: 0.97 }}
        >
          {saving ? '保存中...' : '保存'}
        </m.button>
      </div>
    </CollapsibleSection>
  );
}
