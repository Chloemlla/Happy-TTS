import React from 'react';
import type { IconType } from 'react-icons';
import { cn } from '../utils/cn';

export const studioPageFont =
  '"Avenir Next","PingFang SC","Noto Sans SC","Microsoft YaHei",sans-serif';
export const studioDisplayFont =
  studioPageFont;

// Horizontal padding lives on the App shell wrapper — avoid double inset.
export const studioPageClassName =
  'mx-auto w-full max-w-none px-0 py-6 sm:py-8';

export const studioHeroCardClassName =
  'relative overflow-hidden rounded-2xl border border-slate-200 bg-white/80 p-6 shadow-sm backdrop-blur-xl sm:p-10';

export const studioMainSurfaceClassName =
  'relative min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-sm backdrop-blur-xl sm:p-6';

export const studioPanelClassName =
  'rounded-2xl border border-slate-200 bg-white/80 p-5 shadow-sm backdrop-blur-xl sm:p-6';

export const studioSubPanelClassName =
  'min-w-0 rounded-2xl border-2 border-slate-200 bg-slate-50/80 p-4 sm:p-5';

export const studioElevatedPanelClassName =
  'min-w-0 rounded-2xl border-2 border-slate-200 bg-white/80 p-4 sm:p-5';

// 无内边距的裸面/磁贴：padding 由调用方给，供复用组件（InfoPanel/InfoMetricCard）拼装。
export const studioSurfaceClassName =
  'relative overflow-hidden rounded-2xl border border-slate-200 bg-white/80 shadow-sm backdrop-blur-xl';

export const studioTileClassName =
  'min-w-0 rounded-2xl border border-slate-200 bg-white/80 shadow-sm backdrop-blur-xl';

export const studioSecondaryButtonClassName =
  'inline-flex items-center justify-center gap-2 rounded-2xl border-2 border-slate-200 bg-white/80 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 focus-visible:ring-offset-2';

export const studioDangerButtonClassName =
  'inline-flex items-center justify-center gap-2 rounded-2xl border-2 border-rose-200 bg-rose-50/80 px-4 py-2.5 text-sm font-semibold text-rose-700 transition hover:border-rose-300 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300 focus-visible:ring-offset-2';

export const studioDarkPanelClassName =
  'rounded-2xl border border-slate-900 bg-slate-900 p-5 text-white shadow-sm sm:p-6';

export const studioFieldClassName =
  'w-full rounded-2xl border-2 border-slate-200 bg-white/80 px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:bg-white focus:ring-2 focus:ring-slate-300';

export const studioTextareaClassName =
  'w-full resize-none rounded-2xl border-2 border-slate-200 bg-white/80 px-4 py-3 text-sm leading-7 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:bg-white focus:ring-2 focus:ring-slate-300';

export const studioGhostButtonClassName =
  'inline-flex items-center justify-center gap-2 rounded-2xl border-2 border-slate-200 bg-white/80 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500 backdrop-blur-xl transition hover:border-slate-300 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 focus-visible:ring-offset-2';

export const studioPrimaryButtonClassName =
  'inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-900 px-5 py-3.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2';

export const studioMutedPrimaryButtonClassName =
  'inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-700 px-5 py-3.5 text-sm font-semibold text-white transition hover:bg-slate-600 disabled:cursor-not-allowed disabled:bg-slate-400';

// Above MobileNav portal (z-[9998]) so account menu never covers page dialogs.
export const studioModalOverlayClassName =
  'fixed inset-0 z-[10050] flex items-center justify-center bg-slate-950/30 p-4 backdrop-blur-sm';
export const studioModalCardClassName =
  'w-full rounded-2xl border border-slate-200 bg-white/80 p-6 shadow-sm backdrop-blur-xl sm:p-8';

export const studioEyebrowClassName =
  'text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500';

export const studioEyebrowPillClassName =
  'inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500';

export const studioEyebrowAccentPillClassName =
  'inline-flex max-w-full items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500';

export const studioSoftBadgeClassName =
  'flex h-10 w-10 items-center justify-center rounded-2xl border-2 border-slate-200 bg-slate-50 text-slate-500 sm:h-12 sm:w-12';

export const studioStrongBadgeClassName =
  'flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-900 text-white sm:h-11 sm:w-11';

export const studioAccentBlobBlueClassName =
  'pointer-events-none absolute h-40 w-40 rounded-full bg-[radial-gradient(circle,_rgba(59,130,246,0.22),_transparent_68%)]';
export const studioAccentBlobSkyClassName =
  'pointer-events-none absolute h-32 w-32 rounded-full bg-[radial-gradient(circle,_rgba(14,165,233,0.16),_transparent_70%)]';

export const studioInfoRowClassName =
  'flex flex-col gap-1 rounded-2xl border-2 border-slate-200 bg-white/80 px-4 py-3 text-[13px] sm:flex-row sm:items-center sm:justify-between sm:text-sm';

export function studioMetricToneClassName(
  tone: 'sky' | 'violet' | 'emerald' | 'amber' | 'rose' | 'slate' = 'slate',
): string {
  const map = {
    sky: 'border-slate-200 bg-slate-50/80',
    violet:
      'border-slate-200 bg-slate-50/80',
    emerald:
      'border-emerald-200 bg-emerald-50/80',
    amber:
      'border-amber-200 bg-amber-50/80',
    rose: 'border-rose-200 bg-rose-50/80',
    slate:
      'border-slate-200 bg-slate-50/80',
  } as const;

  return map[tone];
}

export function studioPillClassName(
  active: boolean,
  tone: 'dark' | 'blue' | 'green' | 'amber' | 'rose' = 'dark',
): string {
  const activeMap = {
    dark: 'bg-slate-900 text-white shadow-sm',
    blue: 'bg-slate-900 text-white shadow-sm',
    green: 'bg-slate-900 text-white shadow-sm',
    amber: 'bg-slate-900 text-white shadow-sm',
    rose: 'bg-slate-900 text-white shadow-sm',
  } as const;

  return cn(
    'shrink-0 rounded-full border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] transition',
    active ? cn('border-slate-900', activeMap[tone]) : 'border-slate-200 bg-white/80 text-slate-500 hover:bg-white hover:text-slate-900',
  );
}

export function studioBadgeClassName(
  tone: 'blue' | 'yellow' | 'green' | 'slate' | 'rose' | 'violet' = 'slate',
): string {
  const map = {
    blue: 'bg-sky-100 text-sky-700',
    yellow: 'bg-amber-100 text-amber-700',
    green: 'bg-emerald-100 text-emerald-700',
    slate: 'bg-slate-100 text-slate-700',
    rose: 'bg-rose-100 text-rose-700',
    violet: 'bg-violet-100 text-violet-700',
  } as const;

  return cn('inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-semibold', map[tone]);
}

// ---------------------------------------------------------------------------
// Info* 组件族（调用方直接从这里取）：
// 结构类一律复用上面的 studio* 常量，此处只保留 tone 语义调色板与组装逻辑。
// ---------------------------------------------------------------------------

export type InfoTone = 'teal' | 'amber' | 'rose' | 'slate' | 'emerald' | 'sky' | 'violet';

const toneClasses: Record<
  InfoTone,
  { accent: string; icon: string; badge: string; text: string; button: string }
> = {
  teal: {
    accent: 'bg-teal-500',
    icon: 'bg-teal-50 text-teal-700 ring-teal-100',
    badge: 'border-teal-200 bg-teal-50 text-teal-700',
    text: 'text-teal-700',
    button: 'bg-teal-700 text-white hover:bg-teal-800 focus-visible:ring-teal-500',
  },
  amber: {
    accent: 'bg-amber-500',
    icon: 'bg-amber-50 text-amber-700 ring-amber-100',
    badge: 'border-amber-200 bg-amber-50 text-amber-700',
    text: 'text-amber-700',
    button: 'bg-amber-600 text-white hover:bg-amber-700 focus-visible:ring-amber-500',
  },
  rose: {
    accent: 'bg-rose-500',
    icon: 'bg-rose-50 text-rose-700 ring-rose-100',
    badge: 'border-rose-200 bg-rose-50 text-rose-700',
    text: 'text-rose-700',
    button: 'bg-rose-700 text-white hover:bg-rose-800 focus-visible:ring-rose-500',
  },
  slate: {
    accent: 'bg-slate-500',
    icon: 'bg-slate-100 text-slate-700 ring-slate-200',
    badge: 'border-slate-200 bg-slate-100 text-slate-700',
    text: 'text-slate-700',
    button: 'bg-slate-900 text-white hover:bg-slate-800 focus-visible:ring-slate-400',
  },
  emerald: {
    accent: 'bg-emerald-500',
    icon: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
    badge: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    text: 'text-emerald-700',
    button: 'bg-emerald-700 text-white hover:bg-emerald-800 focus-visible:ring-emerald-500',
  },
  sky: {
    accent: 'bg-sky-500',
    icon: 'bg-sky-50 text-sky-700 ring-sky-100',
    badge: 'border-sky-200 bg-sky-50 text-sky-700',
    text: 'text-sky-700',
    button: 'bg-sky-700 text-white hover:bg-sky-800 focus-visible:ring-sky-500',
  },
  violet: {
    accent: 'bg-violet-500',
    icon: 'bg-violet-50 text-violet-700 ring-violet-100',
    badge: 'border-violet-200 bg-violet-50 text-violet-700',
    text: 'text-violet-700',
    button: 'bg-violet-700 text-white hover:bg-violet-800 focus-visible:ring-violet-500',
  },
};

export const getInfoToneClasses = (tone: InfoTone = 'slate') => toneClasses[tone];

export const InfoQueryShell: React.FC<{
  children: React.ReactNode;
  className?: string;
  maxWidthClassName?: string;
}> = ({ children, className = '', maxWidthClassName = 'max-w-6xl' }) => (
  <section className={`mx-auto ${maxWidthClassName} px-4 py-10 text-slate-900 sm:py-12 ${className}`}>
    {children}
  </section>
);

export const InfoQueryHero: React.FC<{
  eyebrow: string;
  title: string;
  description: string;
  icon: IconType;
  tone?: InfoTone;
  meta?: React.ReactNode;
  actions?: React.ReactNode;
}> = ({ eyebrow, title, description, icon: Icon, tone = 'slate', meta, actions }) => {
  const classes = getInfoToneClasses(tone);

  return (
    <section className={studioHeroCardClassName}>
      <div className={`pointer-events-none absolute inset-x-0 top-0 h-1 ${classes.accent}`} />
      <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-3xl">
          <div className={studioEyebrowPillClassName}>
            <Icon className={`text-[10px] ${classes.text}`} />
            {eyebrow}
          </div>
          <h1 className="mt-5 text-3xl font-semibold leading-tight text-slate-900 sm:text-4xl">{title}</h1>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-600 sm:text-base">{description}</p>
          {meta && <div className="mt-5 flex flex-wrap gap-2">{meta}</div>}
        </div>
        {actions && <div className="flex flex-wrap gap-3 lg:justify-end">{actions}</div>}
      </div>
    </section>
  );
};

export const InfoBadge: React.FC<{
  children: React.ReactNode;
  tone?: InfoTone;
  className?: string;
}> = ({ children, tone = 'slate', className = '' }) => (
  <span
    className={cn(
      'inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold',
      getInfoToneClasses(tone).badge,
      className,
    )}
  >
    {children}
  </span>
);

export const InfoPanel: React.FC<{
  children: React.ReactNode;
  className?: string;
  compact?: boolean;
}> = ({ children, className = '', compact = false }) => (
  <section className={cn(studioSurfaceClassName, compact ? 'p-4' : 'p-5 sm:p-7', className)}>
    {children}
  </section>
);

export const InfoMetricCard: React.FC<{
  label: string;
  value: React.ReactNode;
  detail?: string;
  icon: IconType;
  tone?: InfoTone;
}> = ({ label, value, detail, icon: Icon, tone = 'slate' }) => {
  const classes = getInfoToneClasses(tone);

  return (
    <div className={cn(studioTileClassName, 'p-4')}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</p>
          <div className="mt-2 text-2xl font-semibold text-slate-950">{value}</div>
          {detail && <p className="mt-2 text-xs leading-5 text-slate-500">{detail}</p>}
        </div>
        <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ring-1', classes.icon)}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
    </div>
  );
};

export const InfoSectionTitle: React.FC<{
  title: string;
  description?: string;
  icon?: IconType;
  tone?: InfoTone;
  action?: React.ReactNode;
  eyebrow?: string;
}> = ({ title, description, icon: Icon, tone = 'slate', action, eyebrow }) => {
  const classes = getInfoToneClasses(tone);

  return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex gap-3">
        {Icon && (
          <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl ring-1', classes.icon)}>
            <Icon className="h-4 w-4" />
          </div>
        )}
        <div>
          {eyebrow && (
            <div className="text-[11px] font-semibold uppercase tracking-[0.26em] text-slate-500">
              {eyebrow}
            </div>
          )}
          <h3 className="mt-1 text-xl font-semibold text-slate-900">{title}</h3>
          {description && <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">{description}</p>}
        </div>
      </div>
      {action}
    </div>
  );
};

export const InfoPrimaryButton: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & {
  tone?: InfoTone;
}> = ({ tone = 'slate', className = '', children, ...props }) => (
  <button {...props} className={cn(studioPrimaryButtonClassName, getInfoToneClasses(tone).button, className)}>
    {children}
  </button>
);
