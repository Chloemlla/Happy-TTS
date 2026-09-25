import React, { useCallback, useRef, useState } from 'react';
import { FaChevronDown, FaChevronRight, FaInfoCircle, FaSync } from 'react-icons/fa';
import type { IpRiskDecision } from '@/api/ipRiskLogs';
import { useNotification } from '@/components/Notification';
import { cn } from '@/lib/utils';
import { CopyIconButton } from '@/components/admin/crash-reports/ui';
import { InfoBadge, InfoPanel } from '@/components/InfoQueryScaffold';
import { studioSecondaryButtonClassName } from '@/components/studioTheme';
import {
  ACTION_CONFIG,
  ACTION_ORDER,
  CALLER_HINTS,
  CALLER_LABELS,
  CHALLENGE_FLAGS,
  SOURCE_HINTS,
  SOURCE_LABELS,
  type BadgeStyle,
  boolLabel,
  describeReason,
  formatRelativeTime,
  formatTime,
  riskLevelStyle,
  shortText,
  stringifyJson,
} from './format';

export const Badge: React.FC<{ style: BadgeStyle; className?: string; title?: string }> = ({
  style,
  className,
  title,
}) => (
  <span
    title={title}
    className={cn(
      'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold',
      style.badgeClass,
      className,
    )}
  >
    <span className={cn('h-1.5 w-1.5 rounded-full', style.dotClass)} />
    {style.label}
  </span>
);

export const FieldRow: React.FC<{
  label: string;
  value?: React.ReactNode;
  copyValue?: string;
  hint?: string;
  mono?: boolean;
  /** 值为空字符串 / null / undefined 时也渲染（默认跳过）。 */
  always?: boolean;
}> = ({ label, value, copyValue, hint, mono = false, always = false }) => {
  if (!always && (value === undefined || value === null || value === '')) return null;
  return (
    <div className="group flex min-w-0 items-start gap-1">
      <div className="min-w-0 flex-1">
        <span className="text-slate-500">{label}：</span>
        <span
          className={cn('break-all text-slate-700', mono && 'font-mono text-xs')}
          title={hint ?? (typeof value === 'string' ? value : undefined)}
        >
          {value === undefined || value === null || value === '' ? '-' : value}
        </span>
      </div>
      {copyValue ? (
        <span className="opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
          <CopyIconButton getValue={() => copyValue} title={`复制${label}`} />
        </span>
      ) : null}
    </div>
  );
};

export const FieldGrid: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className,
}) => <div className={cn('grid grid-cols-1 gap-x-6 gap-y-1.5 text-xs sm:grid-cols-2', className)}>{children}</div>;

export const DataPanel: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className,
}) => <InfoPanel compact className={className}>{children}</InfoPanel>;

export const Collapsible: React.FC<{
  title: string;
  subtitle?: string;
  count?: number;
  defaultOpen?: boolean;
  actions?: React.ReactNode;
  children: React.ReactNode;
}> = ({ title, subtitle, count, defaultOpen = false, actions, children }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          aria-expanded={open}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 transition hover:text-slate-900"
        >
          {open ? <FaChevronDown className="text-[10px]" /> : <FaChevronRight className="text-[10px]" />}
          {title}
          {typeof count === 'number' ? <span className="font-normal text-slate-400">({count} 项)</span> : null}
        </button>
        {subtitle ? <span className="text-xs text-slate-400">{subtitle}</span> : null}
        <span className="flex flex-wrap items-center gap-2">{actions}</span>
      </div>
      {open ? <div className="mt-2">{children}</div> : null}
    </div>
  );
};

/** 原始 JSON：`whitespace-pre` + 外层横向滚动，长行只横向滚内部，不会撑破页面。 */
export const JsonBlock: React.FC<{ value: unknown; className?: string }> = ({ value, className }) => (
  <div className={cn('max-h-80 overflow-auto rounded-2xl border border-slate-200 bg-slate-50/80', className)}>
    <pre className="w-max min-w-full whitespace-pre px-3 py-2.5 font-mono text-xs leading-5 text-slate-700">
      {stringifyJson(value)}
    </pre>
  </div>
);

export const TableWrap: React.FC<{ children: React.ReactNode; minWidth?: string }> = ({
  children,
  minWidth = 'min-w-[900px]',
}) => (
  <div className="overflow-x-auto">
    <table className={cn('w-full text-left text-sm', minWidth)}>{children}</table>
  </div>
);

export const Th: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
  <th className={cn('px-3 py-2.5 text-xs uppercase tracking-wide text-slate-500', className)}>{children}</th>
);

export const Td: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
  <td className={cn('px-3 py-2.5 align-top text-xs', className)}>{children}</td>
);

export const Chip: React.FC<{ active: boolean; label: string; onClick: () => void; title?: string }> = ({
  active,
  label,
  onClick,
  title,
}) => (
  <button
    type="button"
    title={title ?? label}
    onClick={onClick}
    className={cn(
      'rounded-full border px-3.5 py-1.5 text-xs font-semibold transition',
      active
        ? 'border-indigo-200 bg-indigo-50 text-indigo-700'
        : 'border-slate-200 bg-white/80 text-slate-600 hover:border-slate-300',
    )}
  >
    {label}
  </button>
);

export const FilterSelect: React.FC<{
  value: string | number;
  onChange: (value: string) => void;
  options: ReadonlyArray<{ value: string | number; label: string }>;
  title: string;
  className?: string;
}> = ({ value, onChange, options, title, className }) => (
  <select
    value={value}
    title={title}
    aria-label={title}
    onChange={(event) => onChange(event.target.value)}
    className={cn(
      'rounded-2xl border border-slate-200 bg-white/80 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-300',
      className,
    )}
  >
    {options.map((option) => (
      <option key={String(option.value)} value={option.value}>
        {option.label}
      </option>
    ))}
  </select>
);

export const RefreshButton: React.FC<{ onClick: () => void; loading?: boolean; label?: string }> = ({
  onClick,
  loading = false,
  label = '刷新',
}) => (
  <button type="button" onClick={onClick} disabled={loading} className={studioSecondaryButtonClassName}>
    <FaSync className={cn('text-xs', loading && 'animate-spin')} />
    {label}
  </button>
);

/** 同一段错误文案只弹一次，避免自动刷新把后端故障刷成通知风暴。 */
export const useErrorNotice = (): ((message: string) => void) => {
  const { setNotification } = useNotification();
  const lastMessageRef = useRef<string | null>(null);
  return useCallback(
    (message: string) => {
      if (lastMessageRef.current === message) return;
      lastMessageRef.current = message;
      setNotification({ message, type: 'error' });
    },
    [setNotification],
  );
};

export const Pager: React.FC<{
  total: number;
  limit: number;
  offset: number;
  loading: boolean;
  onChange: (offset: number) => void;
}> = ({ total, limit, offset, loading, onChange }) => {
  const totalPages = Math.max(1, Math.ceil(total / Math.max(1, limit)));
  const currentPage = Math.min(totalPages, Math.floor(offset / Math.max(1, limit)) + 1);
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
      <span className="text-xs text-slate-500">
        共 {total.toLocaleString('zh-CN')} 条 · 第 {currentPage}/{totalPages} 页 · 每页 {limit} 条
      </span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onChange(0)}
          disabled={loading || offset <= 0}
          className={studioSecondaryButtonClassName}
        >
          首页
        </button>
        <button
          type="button"
          onClick={() => onChange(Math.max(0, offset - limit))}
          disabled={loading || offset <= 0}
          className={studioSecondaryButtonClassName}
        >
          上一页
        </button>
        <button
          type="button"
          onClick={() => onChange(offset + limit)}
          disabled={loading || offset + limit >= total}
          className={studioSecondaryButtonClassName}
        >
          下一页
        </button>
        <button
          type="button"
          onClick={() => onChange(Math.max(0, (totalPages - 1) * limit))}
          disabled={loading || offset + limit >= total}
          className={studioSecondaryButtonClassName}
        >
          末页
        </button>
      </div>
    </div>
  );
};

export const TableState: React.FC<{
  loading: boolean;
  error: string | null;
  empty: boolean;
  emptyText: string;
  colSpan: number;
}> = ({ loading, error, empty, emptyText, colSpan }) => (
  <>
    {loading ? (
      <tr>
        <td colSpan={colSpan} className="px-4 py-10 text-center text-slate-400">
          正在读取……
        </td>
      </tr>
    ) : error ? (
      <tr>
        <td colSpan={colSpan} className="px-4 py-10 text-center text-rose-600">
          {error}
        </td>
      </tr>
    ) : empty ? (
      <tr>
        <td colSpan={colSpan} className="px-4 py-10 text-center text-slate-500">
          {emptyText}
        </td>
      </tr>
    ) : null}
  </>
);

const decisionNoteClass =
  'flex items-start gap-1.5 rounded-xl border border-amber-200 bg-amber-50/70 px-3 py-2 text-xs leading-5 text-amber-800';

/**
 * 一条决策的完整字段。`derived` 表示这是按当前配置重算的结果，不是当时的记录 —— 必须显式告知。
 */
export const DecisionBlock: React.FC<{
  decision?: IpRiskDecision | null;
  /** true = 按当前配置重算（风险缓存页）；false = 写入日志时的真实快照。 */
  derived?: boolean;
  /** 旧行没有 decision 字段时的占位说明。 */
  missingText?: string;
}> = ({ decision, derived = false, missingText }) => {
  if (!decision) {
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
        {missingText ?? '这条记录写入时还没有 decision 字段（本面板上线前的旧数据）。'}
      </div>
    );
  }

  const action = ACTION_CONFIG[decision.action];
  const challengeByScore = decision.risk >= decision.threshold;
  const challengeByFlag = decision.flags.filter((flag) => CHALLENGE_FLAGS.includes(flag));

  return (
    <div className="space-y-2">
      <div className={decisionNoteClass}>
        <FaInfoCircle className="mt-0.5 shrink-0" />
        <span>
          {derived
            ? '本行决策是「按当前配置重算」的结果，不是历史上的记录：proxycheck_risk_cache 只存风险文档，不存当时算给前端的决策。caller 固定按 API 口径计算，所以 action 恒为「仅上报」。'
            : '本行决策是写入这条 lookup 日志时，真实算给前端（闸门 / API）的决策快照。'}
        </span>
      </div>

      <FieldGrid>
        <FieldRow label="caller（谁问的）" value={CALLER_LABELS[decision.caller]} hint={CALLER_HINTS[decision.caller]} />
        <FieldRow
          label="action（实际动作）"
          value={<Badge style={action} />}
          hint={action.description}
        />
        <FieldRow
          label="shouldChallenge"
          value={
            <span className="inline-flex items-center gap-1.5">
              <span className={decision.shouldChallenge ? 'font-semibold text-amber-700' : 'text-slate-600'}>
                {boolLabel(decision.shouldChallenge)}
              </span>
              {decision.caller === 'api' ? (
                <InfoBadge tone="slate" className="text-[10px]">
                  若按闸门判据
                </InfoBadge>
              ) : null}
            </span>
          }
          hint="闸门判据是否要求人机验证。caller=api 时它只是信息性的：接口本身不拦截。"
        />
        <FieldRow label="reason" value={describeReason(decision.reason)} mono />
        <FieldRow label="risk" value={decision.risk} />
        <FieldRow label="level" value={<Badge style={riskLevelStyle(decision.level)} />} />
        <FieldRow
          label="source"
          value={SOURCE_LABELS[decision.source] ?? decision.source}
          hint={SOURCE_HINTS[decision.source]}
        />
        <FieldRow label="threshold（当时生效）" value={decision.threshold} />
        <FieldRow label="failOpen（当时生效）" value={boolLabel(decision.failOpen)} />
        <FieldRow
          label="closedOnFailure"
          value={boolLabel(decision.closedOnFailure)}
          hint="= 没拿到结论 且 failOpen=false，即上游不可用时应当拒绝。"
        />
        <FieldRow
          label="flags"
          value={decision.flags.length > 0 ? decision.flags.join(', ') : '（无）'}
          mono
        />
      </FieldGrid>

      <div className="text-xs leading-5 text-slate-500">
        判据回顾：risk {decision.risk} {challengeByScore ? '≥' : '<'} 阈值 {decision.threshold}
        {challengeByScore ? '（仅凭分数就要求挑战）' : '（分数不足以单独触发挑战）'}；
        命中挑战标志 {challengeByFlag.length > 0 ? challengeByFlag.join(', ') : '无'}
        {challengeByFlag.length > 0 ? '（任一命中即要求挑战）' : '（hosting 单独命中不挑战）'}。
      </div>
    </div>
  );
};

/** 固定说明：action 五值语义 + report 只上报 + 缓存行决策是重算。面板内常驻可见。 */
export const DecisionLegend: React.FC = () => (
  <div className="space-y-3 text-xs leading-6 text-slate-600">
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
      {ACTION_ORDER.map((key) => {
        const action = ACTION_CONFIG[key];
        return (
          <div key={key} className="rounded-2xl border border-slate-200 bg-white/70 px-3 py-2">
            <div className="mb-1">
              <Badge style={action} />
              <span className="ml-2 font-mono text-[11px] text-slate-400">{key}</span>
            </div>
            <p className="text-slate-600">{action.description}</p>
          </div>
        );
      })}
    </div>
    <ul className="list-disc space-y-1 pl-5">
      <li>
        <span className="font-semibold">caller</span>：说明这次决策是谁来问的 ——
        api = <code>GET /api/ip-risk</code>（只上报结论，不拦截）；first_visit_gate = 首访闸门
        （<code>ipVerificationService.initializeSession</code>，会真的拦截）；batch = <code>getIpRiskBatch</code>
        一次问多个 IP。
      </li>
      <li>
        <span className="font-semibold">report 不等于放行</span>：caller=api 时 action 恒为
        「仅上报」，它表示这个端点只把风险结论交给调用方，拦截与否由调用方自己决定；此时 <code>shouldChallenge</code>
        只是「若按闸门判据会怎样」的参考值。
      </li>
      <li>
        <span className="font-semibold">缓存页的决策是重算</span>：命中 <code>proxycheck_risk_cache</code>
        时后端不写任何 lookup 日志（零上游、零写入），所以「那次给了前端什么决策」没有历史记录。
        风险缓存页里的 decision 是按<span className="font-semibold">当前</span> <code>challengeRiskScore</code> / <code>failOpen</code> 重新推算的，仅用于解释当下配置的含义。
      </li>
      <li>
        <span className="font-semibold">挑战判据</span>：<code>risk ≥ challengeRiskScore</code> 或命中
        {CHALLENGE_FLAGS.join(' / ')} 任一即要求挑战；hosting 单独命中不挑战。上游不可用时按
        <code>failOpen</code> 决定 fail_open / fail_closed。
      </li>
      <li>
        <span className="font-semibold">密钥不外泄</span>：所有密钥字段都是服务端 mask 后的值 +
        <code>hasXxx</code> 布尔，本面板原样展示，不做二次处理。
      </li>
    </ul>
  </div>
);

/** 每个 Tab 顶部的一行说明：这里展示什么、数据从哪来。 */
export const SectionNote: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="flex items-start gap-2 rounded-2xl border border-slate-200 bg-white/70 px-4 py-3 text-xs leading-6 text-slate-600">
    <FaInfoCircle className="mt-1 shrink-0 text-slate-400" />
    <div className="min-w-0">{children}</div>
  </div>
);

/** 密钥字段：只展示服务端 mask 值 + hasXxx 布尔，前端拿不到也不需要明文。 */
export const KeyField: React.FC<{
  label: string;
  has: boolean;
  masked: string;
  hint?: string;
}> = ({ label, has, masked, hint }) => (
  <div className="rounded-xl border border-slate-200 bg-white/70 px-3 py-2">
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-slate-500">{label}</span>
      {has ? (
        <InfoBadge tone="emerald" className="text-[10px]">
          已配置
        </InfoBadge>
      ) : (
        <InfoBadge tone="amber" className="text-[10px]">
          未配置
        </InfoBadge>
      )}
    </div>
    <div className="mt-1 break-all font-mono text-xs text-slate-700">{masked || '（空）'}</div>
    {hint ? <div className="mt-1 text-[11px] leading-5 text-slate-400">{hint}</div> : null}
  </div>
);

export const NumberField: React.FC<{ label: string; value: number; hint?: string }> = ({
  label,
  value,
  hint,
}) => (
  <FieldRow
    label={label}
    value={typeof value === 'number' && Number.isFinite(value) ? value : '-'}
    hint={hint}
    always
  />
);

export const BoolField: React.FC<{ label: string; value: boolean; hint?: string }> = ({
  label,
  value,
  hint,
}) => (
  <FieldRow
    label={label}
    value={
      <span className={value ? 'font-semibold text-emerald-700' : 'font-semibold text-slate-600'}>
        {boolLabel(value)}
      </span>
    }
    hint={hint}
    always
  />
);

export const TimeCell: React.FC<{ value?: string | null }> = ({ value }) => (
  <div className="whitespace-nowrap">
    <div className="text-slate-700">{formatTime(value)}</div>
    <div className="text-slate-400">{formatRelativeTime(value)}</div>
  </div>
);

export const IpCell: React.FC<{ ip?: string | null }> = ({ ip }) => (
  <span className="font-mono text-xs text-slate-700" title={ip ?? undefined}>
    {shortText(ip, 32)}
  </span>
);

export const HashCell: React.FC<{ hash?: string | null; label?: string }> = ({ hash, label }) => (
  <span className="font-mono text-[11px] text-slate-500" title={hash ?? undefined}>
    {hash ? shortText(hash, 12) : label ? `${label} -` : '-'}
  </span>
);
