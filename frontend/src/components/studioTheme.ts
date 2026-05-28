import { cn } from '../utils/cn';

export const studioPageFont =
  '"Avenir Next","PingFang SC","Noto Sans SC","Microsoft YaHei",sans-serif';
export const studioDisplayFont =
  '"Iowan Old Style","Noto Serif SC","Source Han Serif SC",serif';

// 页面外壳：与 App.tsx 中 AppLoadingScreen 的背景渐变完全一致
export const studioPageClassName =
  'min-h-screen overflow-x-hidden bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.22),_transparent_34%),linear-gradient(180deg,#f8fbff_0%,#eef2ff_55%,#f8fafc_100%)] px-3 py-4 sm:px-6 sm:py-8 lg:px-10';

// Hero 卡：与 NotFoundPage 头卡尺寸/阴影一致（slate-200 边、24-28 阴影）
export const studioHeroCardClassName =
  'rounded-[28px] border border-slate-200/80 bg-white/92 p-4 shadow-[0_24px_80px_rgba(15,23,42,0.08)] backdrop-blur-xl sm:rounded-[34px] sm:p-8 sm:shadow-[0_28px_110px_rgba(15,23,42,0.1)]';

// 主内容外壳（与 RouteLoadingShell 配色一致）
export const studioMainSurfaceClassName =
  'relative min-w-0 rounded-[28px] border border-slate-200/80 bg-white/88 p-2.5 shadow-[0_20px_70px_rgba(15,23,42,0.08)] backdrop-blur-xl sm:rounded-[34px] sm:p-4 sm:shadow-[0_24px_90px_rgba(15,23,42,0.08)]';

// 侧栏面板（白/雾化）
export const studioPanelClassName =
  'rounded-[26px] border border-slate-200/80 bg-white/92 p-4 shadow-[0_20px_70px_rgba(15,23,42,0.06)] backdrop-blur-xl sm:rounded-[30px] sm:p-5';

// 嵌套子面板（柔和）
export const studioSubPanelClassName =
  'min-w-0 rounded-[24px] border border-slate-200 bg-[#fbfcff] p-3 sm:rounded-[28px] sm:p-5';

// 嵌套抬升面板（纯白底，强调）
export const studioElevatedPanelClassName =
  'min-w-0 rounded-[24px] border border-slate-200 bg-white p-3 sm:rounded-[28px] sm:p-5';

// 深色提示面板（用于 Usage Flow / Tips 类信息）
export const studioDarkPanelClassName =
  'rounded-[26px] border border-slate-800/30 bg-slate-900 p-4 text-white shadow-[0_20px_70px_rgba(15,23,42,0.18)] sm:rounded-[30px] sm:p-5';

// 输入框
export const studioFieldClassName =
  'w-full rounded-[18px] border border-slate-200 bg-white px-3 py-3 text-sm font-medium text-slate-700 outline-none transition placeholder:text-slate-300 focus:border-slate-400 focus:ring-0 sm:rounded-full sm:py-2.5';

// 多行输入
export const studioTextareaClassName =
  'w-full resize-none rounded-[22px] border border-slate-200 bg-white/90 px-4 py-4 text-sm leading-7 text-slate-900 outline-none transition placeholder:text-slate-300 focus:border-slate-400 focus:ring-0 sm:rounded-[24px]';

// Ghost 二级按钮（与 NotFoundPage 的次按钮一致）
export const studioGhostButtonClassName =
  'inline-flex items-center justify-center gap-2 rounded-[18px] border border-slate-200 bg-white px-3 py-2.5 text-[11px] font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 focus-visible:ring-offset-2 sm:rounded-full sm:py-2 sm:text-xs';

// 主按钮（与 NotFoundPage 主 CTA 完全一致：slate-900）
export const studioPrimaryButtonClassName =
  'inline-flex items-center justify-center gap-2 rounded-[18px] bg-slate-900 px-4 py-3 text-sm font-semibold text-white shadow-[0_10px_30px_rgba(15,23,42,0.18)] transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 sm:rounded-full sm:py-2.5';

// 弱化主按钮（用于次要 CTA，但仍是实色）
export const studioMutedPrimaryButtonClassName =
  'inline-flex items-center justify-center gap-2 rounded-[18px] bg-slate-700 px-4 py-3 text-sm font-semibold text-white shadow-[0_8px_24px_rgba(15,23,42,0.12)] transition hover:bg-slate-600 disabled:cursor-not-allowed disabled:opacity-60 sm:rounded-full sm:py-2.5';

// 模态层
export const studioModalOverlayClassName =
  'fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm';
export const studioModalCardClassName =
  'w-full rounded-[28px] border border-slate-200/80 bg-white/95 p-6 shadow-[0_28px_110px_rgba(15,23,42,0.18)] backdrop-blur-xl sm:rounded-[32px] sm:p-8';

// Eyebrow（小标，loading shell 中 LOADING_EYEBROW_CLASS 的对齐）
export const studioEyebrowClassName =
  'text-[11px] font-semibold uppercase tracking-[0.26em] text-slate-400 sm:text-xs';

// Eyebrow 胶囊（带边、用于 hero 区域，与 NotFoundPage 的 404 徽章一致）
export const studioEyebrowPillClassName =
  'inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500';

// Badge：用于 hero 区域中显示状态的小标签（蓝调，呼应 loading shell radial 蓝）
export const studioEyebrowAccentPillClassName =
  'inline-flex max-w-full items-center gap-2 rounded-full border border-sky-200/80 bg-sky-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-sky-700 sm:px-3 sm:text-xs sm:tracking-[0.18em]';

// 软徽章（loading badge：圆角方块、slate-100 底）
export const studioSoftBadgeClassName =
  'flex h-10 w-10 items-center justify-center rounded-[18px] border border-slate-200 bg-slate-50 text-slate-500 sm:h-12 sm:w-12 sm:rounded-[22px]';

// 强徽章（深色，用于面板 hero 中的图标标）
export const studioStrongBadgeClassName =
  'flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-900 text-white sm:h-11 sm:w-11';

// 装饰性 radial blob（与 NotFoundPage 顶部 blob 完全一致）
export const studioAccentBlobBlueClassName =
  'pointer-events-none absolute h-40 w-40 rounded-full bg-[radial-gradient(circle,_rgba(59,130,246,0.22),_transparent_68%)]';
export const studioAccentBlobSkyClassName =
  'pointer-events-none absolute h-32 w-32 rounded-full bg-[radial-gradient(circle,_rgba(14,165,233,0.16),_transparent_70%)]';

// 行内信息条目（用于侧栏 key-value 列表）
export const studioInfoRowClassName =
  'flex flex-col gap-1 rounded-[20px] border border-slate-100 bg-white px-3 py-2.5 text-[13px] sm:flex-row sm:items-center sm:justify-between sm:rounded-2xl sm:py-3 sm:text-sm';

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
    blue: 'bg-slate-900 text-white shadow-sm',
    green: 'bg-emerald-600 text-white shadow-sm',
    amber: 'bg-amber-500 text-white shadow-sm',
    rose: 'bg-rose-500 text-white shadow-sm',
  } as const;

  return cn(
    'shrink-0 rounded-full px-3 py-1.5 text-[11px] font-semibold transition sm:text-xs',
    active ? activeMap[tone] : 'bg-white text-slate-500 hover:bg-slate-100 hover:text-slate-900 border border-slate-200',
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
