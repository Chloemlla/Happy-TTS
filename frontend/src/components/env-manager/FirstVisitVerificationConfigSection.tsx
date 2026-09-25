import { m } from 'framer-motion';
import CollapsibleSection from './CollapsibleSection';
import {
  studioDangerButtonClassName,
  studioPrimaryButtonClassName,
  studioSecondaryButtonClassName,
} from '../studioTheme';

interface FirstVisitVerificationConfigSectionProps {
  isOpen: boolean;
  onToggle: () => void;
  prefersReducedMotion?: boolean | null;
  loading: boolean;
  saving: boolean;
  deleting: boolean;
  disabled: boolean;
  enabled: boolean;
  updatedAt?: string;
  onEnabledChange: (value: boolean) => void;
  onRefresh: () => void;
  onSave: () => void;
  onReset: () => void;
}

/**
 * 首访验证闸门（FIRST_VISIT_VERIFICATION）。这是 config.enableFirstVisitVerification
 * 唯一的配置入口：保存走运行时配置（Mongo），后端每次请求读内存缓存，无需重启即生效。
 *
 * 它的影响面比名字大——`/api/ip-verification` 中间件、Turnstile/hCaptcha 校验、访问令牌
 * 签发、以及 proxycheck 的 first_visit_gate 都读同一个值，因此这里只提供整体开关。
 */
export default function FirstVisitVerificationConfigSection({
  isOpen,
  onToggle,
  prefersReducedMotion,
  loading,
  saving,
  deleting,
  disabled,
  enabled,
  updatedAt,
  onEnabledChange,
  onRefresh,
  onSave,
  onReset,
}: FirstVisitVerificationConfigSectionProps) {
  const busy = loading || saving || deleting;

  return (
    <CollapsibleSection
      title="首访验证闸门"
      description="控制首访 IP/人机验证整条链路是否生效。仅此处可配置；保存后立即生效，无需重启。"
      sectionKey="firstVisitVerification"
      isOpen={isOpen}
      onToggle={onToggle}
      prefersReducedMotion={prefersReducedMotion}
    >
      <label className="flex items-start gap-3 rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-700">
        <input
          type="checkbox"
          className="mt-0.5 h-4 w-4"
          checked={enabled}
          onChange={(event) => onEnabledChange(event.target.checked)}
          disabled={disabled || busy}
        />
        <span>
          <span className="block font-medium text-slate-800">启用首访验证</span>
          <span className="mt-0.5 block text-slate-500">
            开启时，未持有验证令牌的首次访问会被要求走 IPQS / proxycheck / Turnstile 流程；
            关闭时所有请求一律视为已验证（直接放行），同时 proxycheck 的 first_visit_gate 闸门也不再评估。
          </span>
        </span>
      </label>

      <div className="rounded-2xl border border-slate-200 bg-slate-50/80 px-3 py-2 text-xs text-slate-600 sm:px-4 sm:py-3">
        <div>
          当前状态：{loading ? '加载中...' : enabled ? '首访需要验证' : '已关闭（全部放行）'}
        </div>
        <div className="mt-1">
          最后更新：
          {loading
            ? '加载中...'
            : updatedAt
              ? new Date(updatedAt).toLocaleString()
              : '未保存过（当前使用部署环境变量 ENABLE_FIRST_VISIT_VERIFICATION / 默认开启）'}
        </div>
        <div className="mt-1">
          关闭本闸门不会停掉 proxycheck 的公开查询接口
          <code className="mx-1 rounded bg-slate-100 px-1">GET /api/ip-risk</code>
          与客户端探测上报，那些开关在「proxycheck.io」分区。
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
