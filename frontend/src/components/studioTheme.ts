import { cn } from '../utils/cn';

export const studioPageFont =
  '"Avenir Next","PingFang SC","Noto Sans SC","Microsoft YaHei",sans-serif';
export const studioDisplayFont =
  studioPageFont;

// Horizontal padding lives on the App shell wrapper — avoid double inset.
export const studioPageClassName =
  'mx-auto w-full max-w-none px-0 py-6 sm:py-8';

export const studioHeroCardClassName =
  'relative overflow-hidden rounded-[34px] border border-white/70 bg-white/88 p-6 shadow-[0_28px_110px_rgba(15,23,42,0.1)] backdrop-blur-xl sm:p-10';

export const studioMainSurfaceClassName =
  'relative min-w-0 overflow-hidden rounded-[34px] border border-white/70 bg-white/88 p-4 shadow-[0_28px_110px_rgba(15,23,42,0.1)] backdrop-blur-xl sm:p-6';

export const studioPanelClassName =
  'rounded-[30px] border border-white/70 bg-white/88 p-5 shadow-[0_24px_90px_rgba(15,23,42,0.09)] backdrop-blur-xl sm:rounded-[34px] sm:p-6';

export const studioSubPanelClassName =
  'min-w-0 rounded-[22px] border border-slate-200 bg-slate-50/80 p-4 sm:p-5';

export const studioElevatedPanelClassName =
  'min-w-0 rounded-[22px] border border-slate-200 bg-white/90 p-4 sm:p-5';

export const studioDarkPanelClassName =
  'rounded-[30px] border border-slate-900 bg-slate-900 p-5 text-white shadow-[0_24px_90px_rgba(15,23,42,0.18)] sm:rounded-[34px] sm:p-6';

export const studioFieldClassName =
  'w-full rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:bg-white focus:ring-2 focus:ring-slate-300';

export const studioTextareaClassName =
  'w-full resize-none rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 text-sm leading-7 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:bg-white focus:ring-2 focus:ring-slate-300';

export const studioGhostButtonClassName =
  'inline-flex items-center justify-center gap-2 rounded-full border border-slate-200 bg-white/80 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500 backdrop-blur-xl transition hover:border-slate-300 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 focus-visible:ring-offset-2';

export const studioPrimaryButtonClassName =
  'inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-900 px-5 py-3.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2';

export const studioMutedPrimaryButtonClassName =
  'inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-700 px-5 py-3.5 text-sm font-semibold text-white transition hover:bg-slate-600 disabled:cursor-not-allowed disabled:bg-slate-400';

// Above MobileNav portal (z-[9998]) so account menu never covers page dialogs.
export const studioModalOverlayClassName =
  'fixed inset-0 z-[10050] flex items-center justify-center bg-slate-950/30 p-4 backdrop-blur-sm';
export const studioModalCardClassName =
  'w-full rounded-[34px] border border-white/70 bg-white/92 p-6 shadow-[0_28px_110px_rgba(15,23,42,0.16)] backdrop-blur-xl sm:p-8';

export const studioEyebrowClassName =
  'text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500';

export const studioEyebrowPillClassName =
  'inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500';

export const studioEyebrowAccentPillClassName =
  'inline-flex max-w-full items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500';

export const studioSoftBadgeClassName =
  'flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-slate-500 sm:h-12 sm:w-12';

export const studioStrongBadgeClassName =
  'flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-900 text-white sm:h-11 sm:w-11';

export const studioAccentBlobBlueClassName =
  'pointer-events-none absolute h-40 w-40 rounded-full bg-[radial-gradient(circle,_rgba(59,130,246,0.22),_transparent_68%)]';
export const studioAccentBlobSkyClassName =
  'pointer-events-none absolute h-32 w-32 rounded-full bg-[radial-gradient(circle,_rgba(14,165,233,0.16),_transparent_70%)]';

export const studioInfoRowClassName =
  'flex flex-col gap-1 rounded-[20px] border border-slate-200 bg-white/80 px-4 py-3 text-[13px] sm:flex-row sm:items-center sm:justify-between sm:text-sm';

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
