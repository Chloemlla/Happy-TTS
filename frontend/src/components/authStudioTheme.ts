import { cn } from '../utils/cn';
import {
  studioElevatedPanelClassName,
  studioEyebrowAccentPillClassName,
  studioEyebrowClassName,
  studioFieldClassName,
  studioGhostButtonClassName,
  studioMainSurfaceClassName,
  studioModalCardClassName,
  studioModalOverlayClassName,
  studioPageClassName,
  studioPageFont,
  studioPrimaryButtonClassName,
  studioSoftBadgeClassName,
  studioStrongBadgeClassName,
  studioSubPanelClassName,
} from './studioTheme';

export { studioPageFont };

export const authPageShellClassName = cn(
  studioPageClassName,
  'flex min-h-[calc(100vh-8rem)] items-center justify-center',
);

export const authFrameClassName = 'w-full max-w-md';
export const authWideFrameClassName = 'w-full max-w-xl';

export const authBrandBlockClassName = 'mb-5 text-center sm:mb-7';
export const authBrandPillClassName = cn(studioEyebrowAccentPillClassName, 'mx-auto');
export const authBrandTitleClassName = 'mt-4 text-3xl font-semibold leading-tight text-slate-900';
export const authBrandSubtitleClassName = 'mt-2 text-sm leading-6 text-slate-600';

export const authCardClassName = studioMainSurfaceClassName;
export const authCardBodyClassName = 'rounded-[22px] border border-slate-200 bg-white/80 p-5 sm:p-7';
export const authCardHeaderClassName = 'mb-6 flex items-start gap-3';
export const authHeaderBadgeClassName = studioStrongBadgeClassName;
export const authSoftBadgeClassName = studioSoftBadgeClassName;
export const authEyebrowClassName = studioEyebrowClassName;
export const authTitleClassName = 'mt-1 text-xl font-semibold text-slate-900';
export const authDescriptionClassName = 'mt-1 text-sm leading-6 text-slate-600';

export const authFormClassName = 'space-y-5';
export const authLabelClassName = 'mb-2 block text-sm font-medium text-slate-700';
export const authFieldClassName = cn(studioFieldClassName, 'pl-10');
export const authPasswordFieldClassName = cn(studioFieldClassName, 'pl-10 pr-10');
export const authFieldIconClassName =
  'absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400';
export const authFieldActionClassName =
  'absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 transition hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300';

export const authPrimaryButtonClassName = cn(studioPrimaryButtonClassName, 'w-full');
export const authSecondaryButtonClassName = cn(
  studioGhostButtonClassName,
  'w-full px-5 py-3.5 tracking-[0.16em]',
);
export const authTextLinkClassName =
  'font-semibold text-slate-900 underline decoration-slate-300 underline-offset-2 transition hover:text-slate-700';
export const authMutedLinkClassName =
  'text-sm font-medium text-slate-500 transition hover:text-slate-900';
export const authBackLinkClassName =
  'inline-flex items-center gap-2 text-sm font-medium text-slate-500 transition hover:text-slate-900';

export const authDividerClassName = 'relative my-6';
export const authDividerLineClassName = 'w-full border-t border-slate-200';
export const authDividerLabelClassName = 'bg-white px-4 text-xs font-medium text-slate-400';

export const authAlertClassName =
  'rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm leading-6 text-rose-700';
export const authInfoPanelClassName = cn(studioSubPanelClassName, 'text-left');
export const authElevatedPanelClassName = cn(studioElevatedPanelClassName, 'text-left');
export const authSuccessPanelClassName =
  'rounded-2xl border border-emerald-200 bg-emerald-50/80 px-4 py-3 text-sm leading-6 text-emerald-800';
export const authWarningPanelClassName =
  'rounded-2xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm leading-6 text-amber-800';

export const authCheckboxClassName =
  'h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-300';
export const authModalOverlayClassName = studioModalOverlayClassName;
export const authModalCardClassName = cn(studioModalCardClassName, 'max-w-md');
