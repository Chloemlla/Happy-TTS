import React from 'react';
import type { IconType } from 'react-icons';

export type InfoTone = 'teal' | 'amber' | 'rose' | 'slate' | 'emerald' | 'sky' | 'violet';

const toneTextClasses: Record<InfoTone, string> = {
  teal: 'text-slate-500',
  amber: 'text-slate-500',
  rose: 'text-rose-500',
  slate: 'text-slate-500',
  emerald: 'text-emerald-600',
  sky: 'text-slate-500',
  violet: 'text-slate-500',
};

export const logSharePanelClass =
  'relative overflow-hidden rounded-[26px] border border-white/70 bg-white/82 shadow-[0_18px_60px_rgba(15,23,42,0.06)] backdrop-blur-xl';

export const logShareHeroClass =
  'relative overflow-hidden rounded-[34px] border border-white/70 bg-white/88 p-6 shadow-[0_28px_110px_rgba(15,23,42,0.1)] backdrop-blur-xl sm:p-10';

export const logShareTileClass =
  'rounded-[22px] border border-slate-200 bg-white/80 shadow-sm backdrop-blur-xl';

export const logShareInputClass =
  'w-full rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 transition focus:border-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-300';

export const logSharePrimaryButtonClass =
  'inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2';

export const logShareSecondaryButtonClass =
  'inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white/80 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-50';

export const logShareDangerButtonClass =
  'inline-flex items-center justify-center gap-2 rounded-2xl border border-rose-200 bg-rose-50/80 px-4 py-2.5 text-sm font-semibold text-rose-700 transition hover:border-rose-300 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50';

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
}> = ({ eyebrow, title, description, icon: Icon, tone = 'slate', meta, actions }) => (
  <section className={logShareHeroClass}>
    <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
      <div className="max-w-3xl">
        <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">
          <Icon className={`text-[10px] ${toneTextClasses[tone]}`} />
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

export const InfoBadge: React.FC<{
  children: React.ReactNode;
  tone?: InfoTone;
  className?: string;
}> = ({ children, tone = 'slate', className = '' }) => (
  <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${
    tone === 'rose'
      ? 'border-rose-200 bg-rose-50/80 text-rose-700'
      : tone === 'emerald'
        ? 'border-emerald-200 bg-emerald-50/80 text-emerald-700'
        : 'border-slate-200 bg-slate-50/80 text-slate-600'
  } ${className}`}>
    {children}
  </span>
);

export const InfoPanel: React.FC<{
  children: React.ReactNode;
  className?: string;
  compact?: boolean;
}> = ({ children, className = '', compact = false }) => (
  <section className={`${logSharePanelClass} ${compact ? 'p-4' : 'p-5 sm:p-7'} ${className}`}>
    {children}
  </section>
);

export const InfoMetricCard: React.FC<{
  label: string;
  value: React.ReactNode;
  detail?: string;
  icon: IconType;
  tone?: InfoTone;
}> = ({ label, value, detail, icon: Icon }) => (
  <div className={`${logShareTileClass} p-4`}>
    <div className="flex items-start justify-between gap-3">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</p>
        <div className="mt-2 text-2xl font-semibold text-slate-950">{value}</div>
        {detail && <p className="mt-2 text-xs leading-5 text-slate-500">{detail}</p>}
      </div>
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[18px] border border-slate-200 bg-slate-50 text-slate-500">
        <Icon className="h-4 w-4" />
      </div>
    </div>
  </div>
);

export const InfoSectionTitle: React.FC<{
  title: string;
  description?: string;
  icon?: IconType;
  tone?: InfoTone;
  action?: React.ReactNode;
  eyebrow?: string;
}> = ({ title, description, icon: Icon, action, eyebrow }) => (
  <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
    <div>
      {(Icon || eyebrow) && (
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.26em] text-slate-500">
          {Icon && <Icon className="text-slate-500" />}
          {eyebrow && <span>{eyebrow}</span>}
        </div>
      )}
      <h3 className="mt-2 text-xl font-semibold text-slate-900">{title}</h3>
      {description && <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">{description}</p>}
    </div>
    {action}
  </div>
);

export const InfoPrimaryButton: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & {
  tone?: InfoTone;
}> = ({ tone: _tone, className = '', children, ...props }) => (
  <button {...props} className={`${logSharePrimaryButtonClass} ${className}`}>
    {children}
  </button>
);
