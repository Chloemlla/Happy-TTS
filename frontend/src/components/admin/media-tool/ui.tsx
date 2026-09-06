import React from 'react';
import type { MediaJobStatus, MediaJobStage } from '../../../api/mediaTool';

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

export const inputCls =
  'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 disabled:cursor-not-allowed disabled:opacity-60';

export const textareaCls = `${inputCls} font-mono text-xs leading-6`;

export const btnBase =
  'inline-flex items-center justify-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50';

export const btnPrimary = cx(btnBase, 'bg-slate-900 text-white hover:bg-slate-800 shadow-sm');
export const btnIndigo = cx(btnBase, 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm');
export const btnViolet = cx(btnBase, 'bg-violet-600 text-white hover:bg-violet-700 shadow-sm');
export const btnDanger = cx(btnBase, 'bg-rose-600 text-white hover:bg-rose-700 shadow-sm');
export const btnGhost = cx(
  btnBase,
  'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-800',
);
export const btnTiny = cx(
  btnBase,
  'rounded-lg px-2 py-1 text-[11px]',
);

export const Field: React.FC<{
  label: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}> = ({ label, hint, children, className }) => (
  <label className={cx('block min-w-0', className)}>
    <span className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-slate-700">{label}</span>
    {children}
    {hint ? <span className="mt-1 block text-[11px] leading-4 text-slate-400">{hint}</span> : null}
  </label>
);

export const Toggle: React.FC<{ checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }> = ({
  checked,
  onChange,
  label,
  disabled,
}) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    disabled={disabled}
    onClick={() => onChange(!checked)}
    className="inline-flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-50"
  >
    <span
      className={cx(
        'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition',
        checked ? 'bg-emerald-500' : 'bg-slate-200',
      )}
    >
      <span
        className={cx(
          'inline-block size-3.5 transform rounded-full bg-white shadow transition',
          checked ? 'translate-x-[18px]' : 'translate-x-1',
        )}
      />
    </span>
    <span className="text-xs font-medium text-slate-600">{label}</span>
  </button>
);

const STATUS_VIEW: Record<MediaJobStatus, { label: string; cls: string }> = {
  queued: { label: '排队中', cls: 'border-slate-200 bg-slate-100 text-slate-600' },
  running: { label: '运行中', cls: 'border-indigo-200 bg-indigo-50 text-indigo-700' },
  succeeded: { label: '已完成', cls: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
  failed: { label: '失败', cls: 'border-rose-200 bg-rose-50 text-rose-700' },
  cancelled: { label: '已取消', cls: 'border-amber-200 bg-amber-50 text-amber-700' },
};

export const StatusBadge: React.FC<{ status: MediaJobStatus; pulse?: boolean }> = ({ status, pulse }) => {
  const v = STATUS_VIEW[status] ?? { label: status, cls: 'border-slate-200 bg-slate-100 text-slate-600' };
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-semibold',
        v.cls,
        pulse && status === 'running' && 'animate-pulse',
      )}
    >
      {status === 'running' ? (
        <span className="size-1.5 animate-ping rounded-full bg-indigo-500" />
      ) : (
        <span className="size-1.5 rounded-full bg-current opacity-70" />
      )}
      {v.label}
    </span>
  );
};

const STAGE_LABEL: Record<MediaJobStage, string> = {
  queued: '排队',
  prepare: '准备',
  create: '创建会话',
  upload: '上传',
  run: '启动识别',
  progress: '识别中',
  result: '取结果',
  download: '下载中',
  transcribe: '转写中',
  finalize: '收尾',
};

export const stageLabel = (stage: MediaJobStage): string => STAGE_LABEL[stage] ?? stage;

export function fmtBytes(value?: number | null): string {
  const n = Number(value) || 0;
  if (n <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v >= 100 || i === 0 ? Math.round(v) : v.toFixed(1)} ${units[i]}`;
}

export function fmtTime(value?: number | null): string {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '-';
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(d);
}

export function baseName(rel: string): string {
  const parts = rel.replace(/\\/g, '/').split('/');
  return parts[parts.length - 1] || rel;
}

export const ProgressBar: React.FC<{ percent: number; tone?: 'indigo' | 'emerald' }> = ({
  percent,
  tone = 'indigo',
}) => {
  const p = Math.max(0, Math.min(100, percent));
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
      <div
        className={cx(
          'h-full rounded-full transition-all duration-300',
          tone === 'emerald' ? 'bg-emerald-500' : 'bg-indigo-500',
        )}
        style={{ width: `${p}%` }}
      />
    </div>
  );
};

export const ErrLine: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="flex items-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
    {children}
  </div>
);

export const OkLine: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{children}</div>
);

export const EmptyHint: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="px-4 py-10 text-center text-sm text-slate-400">{children}</div>
);
