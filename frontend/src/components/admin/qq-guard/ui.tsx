import React from 'react';

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

export function formatDateTime(value?: string | number | Date | null): string {
  if (!value) return '未知时间';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(date);
}

export function shortText(value?: string | null, max = 80): string {
  if (!value) return '-';
  const text = value.replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

export interface EventBadgeView {
  label: string;
  className: string;
}

const EVENT_LABELS: Record<string, string> = {
  message: '收到消息',
  moderate: 'AI 裁决',
  violation: '判定违规',
  recalled: '已撤回',
  recall_failed: '撤回失败',
  dm: '私信',
  dm_sent: '已私信',
  dm_suppressed: '限频免私信',
  dm_failed: '私信失败',
  pass: '已通过',
  review_pending: '挂起复审',
  review_clean: '复审通过',
  review_violated: '复审违规',
  exempted: '已豁免',
  command: '命令',
  bot_offline: '机器人离线',
  bot_recovered: '机器人恢复',
};

function badgeClass(color: string): string {
  return cx(
    'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap',
    color,
  );
}

export function eventBadge(event: string, verdict?: string): EventBadgeView {
  let color = 'border-slate-200 bg-slate-100 text-slate-600';
  if (event === 'moderate') {
    color =
      verdict === 'violated'
        ? 'border-rose-200 bg-rose-50 text-rose-700'
        : 'border-amber-200 bg-amber-50 text-amber-700';
  } else if (event === 'recalled' || event === 'review_violated' || event === 'violation') {
    color = 'border-rose-200 bg-rose-50 text-rose-700';
  } else if (event === 'bot_offline') {
    color = 'border-rose-200 bg-rose-50 text-rose-700';
  } else if (event === 'recall_failed' || event === 'dm_failed') {
    color = 'border-orange-200 bg-orange-50 text-orange-700';
  } else if (event === 'dm_sent' || event === 'dm') {
    color = 'border-sky-200 bg-sky-50 text-sky-700';
  } else if (event === 'dm_suppressed') {
    color = 'border-slate-200 bg-slate-100 text-slate-500';
  } else if (event === 'pass' || event === 'review_clean') {
    color = 'border-emerald-200 bg-emerald-50 text-emerald-700';
  } else if (event === 'bot_recovered') {
    color = 'border-emerald-200 bg-emerald-50 text-emerald-700';
  } else if (event === 'review_pending') {
    color = 'border-amber-200 bg-amber-50 text-amber-700';
  } else if (event === 'exempted') {
    color = 'border-violet-200 bg-violet-50 text-violet-700';
  }
  const baseLabel = EVENT_LABELS[event] ?? event;
  let label = baseLabel;
  if (event === 'moderate' && verdict) {
    label = verdict === 'violated' ? `${baseLabel} · 违规` : `${baseLabel} · 未定`;
  }
  return { label, className: badgeClass(color) };
}

export const StatusDot: React.FC<{ tone?: 'ok' | 'warn' | 'bad' | 'idle' }> = ({ tone = 'idle' }) => {
  const color =
    tone === 'ok'
      ? 'bg-emerald-500'
      : tone === 'warn'
        ? 'bg-amber-500'
        : tone === 'bad'
          ? 'bg-rose-500'
          : 'bg-slate-300';
  return <span className={cx('inline-block size-1.5 rounded-full align-middle', color)} />;
};
