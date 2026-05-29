import React from 'react';
import type { IconType } from 'react-icons';

export type InfoTone = 'teal' | 'amber' | 'rose' | 'slate' | 'emerald' | 'sky' | 'violet';

const toneClasses: Record<InfoTone, {
  accent: string;
  icon: string;
  badge: string;
  text: string;
  button: string;
}> = {
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
    button: 'bg-slate-800 text-white hover:bg-slate-900 focus-visible:ring-slate-500',
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

export const getInfoToneClasses = (tone: InfoTone = 'teal') => toneClasses[tone];

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
}> = ({ eyebrow, title, description, icon: Icon, tone = 'teal', meta, actions }) => {
  const classes = getInfoToneClasses(tone);

  return (
    <section className="relative overflow-hidden rounded-[34px] border border-white/70 bg-white/88 p-6 shadow-[0_28px_110px_rgba(15,23,42,0.1)] backdrop-blur-xl sm:p-10">
      <div className={`pointer-events-none absolute inset-x-0 top-0 h-1 ${classes.accent}`} />
      <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-3xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">
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
}> = ({ children, tone = 'teal', className = '' }) => (
  <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${getInfoToneClasses(tone).badge} ${className}`}>
    {children}
  </span>
);

export const InfoPanel: React.FC<{
  children: React.ReactNode;
  className?: string;
  compact?: boolean;
}> = ({ children, className = '', compact = false }) => (
  <section className={`relative overflow-hidden rounded-[26px] border border-white/70 bg-white/82 shadow-[0_18px_60px_rgba(15,23,42,0.06)] backdrop-blur-xl ${compact ? 'p-4' : 'p-5 sm:p-7'} ${className}`}>
    {children}
  </section>
);

export const InfoMetricCard: React.FC<{
  label: string;
  value: React.ReactNode;
  detail?: string;
  icon: IconType;
  tone?: InfoTone;
}> = ({ label, value, detail, icon: Icon, tone = 'teal' }) => {
  const classes = getInfoToneClasses(tone);

  return (
    <div className="rounded-[24px] border border-white/70 bg-white/82 p-4 shadow-[0_10px_32px_rgba(15,23,42,0.05)] backdrop-blur-xl">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</p>
          <div className="mt-2 text-2xl font-semibold text-slate-950">{value}</div>
          {detail && <p className="mt-2 text-xs leading-5 text-slate-500">{detail}</p>}
        </div>
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-[18px] ring-1 ${classes.icon}`}>
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
}> = ({ title, description, icon: Icon, tone = 'teal', action }) => {
  const classes = getInfoToneClasses(tone);

  return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex gap-3">
        {Icon && (
          <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[16px] ring-1 ${classes.icon}`}>
            <Icon className="h-4 w-4" />
          </div>
        )}
        <div>
          <h2 className="text-lg font-semibold text-slate-950">{title}</h2>
          {description && <p className="mt-1 text-sm leading-6 text-slate-500">{description}</p>}
        </div>
      </div>
      {action}
    </div>
  );
};

export const InfoPrimaryButton: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & {
  tone?: InfoTone;
}> = ({ tone = 'teal', className = '', children, ...props }) => (
  <button
    {...props}
    className={`inline-flex items-center justify-center gap-2 rounded-2xl px-5 py-3 text-sm font-semibold shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 ${getInfoToneClasses(tone).button} ${className}`}
  >
    {children}
  </button>
);
