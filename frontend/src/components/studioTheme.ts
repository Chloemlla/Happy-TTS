import { cn } from '../utils/cn';

export const studioPageFont =
  '"Avenir Next","PingFang SC","Noto Sans SC","Microsoft YaHei",sans-serif';
export const studioDisplayFont =
  '"Iowan Old Style","Noto Serif SC","Source Han Serif SC",serif';

export const studioPageClassName =
  'min-h-screen overflow-x-hidden bg-[radial-gradient(circle_at_top,_rgba(68,92,190,0.16),_transparent_32%),linear-gradient(180deg,#eef2ff_0%,#f9fafb_42%,#eef4ff_100%)] px-3 py-4 sm:px-6 sm:py-8 lg:px-10';
export const studioHeroCardClassName =
  'rounded-[28px] border border-white/70 bg-white/75 p-4 shadow-[0_24px_90px_rgba(32,48,90,0.12)] backdrop-blur-xl sm:rounded-[32px] sm:p-8 sm:shadow-[0_30px_120px_rgba(32,48,90,0.14)]';
export const studioMainSurfaceClassName =
  'relative min-w-0 rounded-[28px] border border-slate-200/80 bg-white/85 p-2.5 shadow-[0_20px_70px_rgba(32,48,90,0.1)] backdrop-blur-xl sm:rounded-[34px] sm:p-4 sm:shadow-[0_24px_90px_rgba(32,48,90,0.1)]';
export const studioPanelClassName =
  'rounded-[26px] border border-slate-200/80 bg-white/90 p-4 shadow-[0_20px_70px_rgba(32,48,90,0.08)] backdrop-blur-xl sm:rounded-[30px] sm:p-5';
export const studioSubPanelClassName =
  'min-w-0 rounded-[24px] border border-slate-200 bg-[#fbfcff] p-3 sm:rounded-[28px] sm:p-5';
export const studioElevatedPanelClassName =
  'min-w-0 rounded-[24px] border border-slate-200 bg-white p-3 sm:rounded-[28px] sm:p-5';
export const studioDarkPanelClassName =
  'rounded-[26px] border border-slate-200/80 bg-[#111827] p-4 text-white shadow-[0_20px_70px_rgba(17,24,39,0.18)] sm:rounded-[30px] sm:p-5';
export const studioFieldClassName =
  'w-full rounded-[18px] border border-slate-200 bg-white px-3 py-3 text-sm font-medium text-slate-700 outline-none transition focus:border-slate-300 focus:ring-0 sm:rounded-full sm:py-2.5';
export const studioTextareaClassName =
  'w-full resize-none rounded-[22px] border border-slate-200 bg-white/90 px-4 py-4 text-sm leading-7 text-slate-900 outline-none transition placeholder:text-slate-300 focus:border-slate-300 focus:ring-0 sm:rounded-[24px]';
export const studioGhostButtonClassName =
  'inline-flex items-center justify-center gap-2 rounded-[18px] border border-slate-200 bg-white px-3 py-2.5 text-[11px] font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-900 sm:rounded-full sm:py-2 sm:text-xs';
export const studioPrimaryButtonClassName =
  'inline-flex items-center justify-center gap-2 rounded-[18px] bg-[#2541b2] px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-[#2541b2]/20 transition hover:bg-[#1f3794] disabled:cursor-not-allowed disabled:opacity-60 sm:rounded-full sm:py-2.5';
export const studioModalOverlayClassName =
  'fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm';
export const studioModalCardClassName =
  'w-full rounded-[28px] border border-white/70 bg-white/95 p-6 shadow-[0_24px_90px_rgba(32,48,90,0.18)] backdrop-blur-xl sm:rounded-[32px] sm:p-8';

export function studioMetricToneClassName(
  tone: 'sky' | 'violet' | 'emerald' | 'amber' | 'rose' | 'slate' = 'slate',
): string {
  const map = {
    sky: 'border-sky-100 bg-[linear-gradient(145deg,rgba(240,249,255,0.94),rgba(255,255,255,0.98))]',
    violet:
      'border-violet-100 bg-[linear-gradient(145deg,rgba(245,243,255,0.94),rgba(255,255,255,0.98))]',
    emerald:
      'border-emerald-100 bg-[linear-gradient(145deg,rgba(236,253,245,0.94),rgba(255,255,255,0.98))]',
    amber:
      'border-amber-100 bg-[linear-gradient(145deg,rgba(255,251,235,0.94),rgba(255,255,255,0.98))]',
    rose: 'border-rose-100 bg-[linear-gradient(145deg,rgba(255,241,242,0.94),rgba(255,255,255,0.98))]',
    slate:
      'border-slate-200 bg-[linear-gradient(145deg,rgba(248,250,252,0.98),rgba(255,255,255,0.98))]',
  } as const;

  return map[tone];
}

export function studioPillClassName(
  active: boolean,
  tone: 'dark' | 'blue' | 'green' | 'amber' | 'rose' = 'dark',
): string {
  const activeMap = {
    dark: 'bg-slate-900 text-white shadow-sm',
    blue: 'bg-[#2541b2] text-white shadow-sm',
    green: 'bg-emerald-600 text-white shadow-sm',
    amber: 'bg-amber-500 text-white shadow-sm',
    rose: 'bg-rose-500 text-white shadow-sm',
  } as const;

  return cn(
    'shrink-0 rounded-full px-3 py-1.5 text-[11px] font-semibold transition sm:text-xs',
    active ? activeMap[tone] : 'bg-white text-slate-500 hover:bg-slate-100 hover:text-slate-900',
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
