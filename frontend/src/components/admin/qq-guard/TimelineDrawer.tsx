import React, { useEffect, useState } from 'react';
import { FaTimes } from 'react-icons/fa';
import { qqGuardApi } from '../../../api/qqGuard';
import type { QqGuardAuditRow } from '../../../api/qqGuard';
import { SimpleLoadingSpinner } from '../../LoadingSpinner';
import { cx, eventBadge, formatDateTime, shortText } from './ui';

/**
 * 按 traceId 打开完整时间线（倒序展示：最新在上）。
 * 每个 attempt 独立一条，可逐次核对 AI 不可达期间的重试/终态，支撑误判申诉复核。
 */
export const TimelineDrawer: React.FC<{ traceId: string; onClose: () => void }> = ({ traceId, onClose }) => {
  const [events, setEvents] = useState<QqGuardAuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    qqGuardApi
      .timeline(traceId)
      .then((rows) => {
        if (alive) setEvents(rows);
      })
      .catch((err) => {
        if (alive) {
          setError('时间线加载失败，请稍后重试');
          console.error('加载 trace 时间线失败:', err);
        }
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [traceId]);

  const sorted = [...events].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div className="relative flex max-h-[86vh] w-full max-w-3xl flex-col overflow-hidden rounded-[26px] border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-6 py-4">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-slate-900">操作时间线</div>
            <div className="truncate font-mono text-xs text-slate-500">{traceId}</div>
          </div>
          <button
            onClick={onClose}
            className="flex size-8 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
            aria-label="关闭"
          >
            <FaTimes />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {loading && (
            <div className="flex justify-center py-10">
              <SimpleLoadingSpinner size={1} />
            </div>
          )}
          {!loading && error && (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
          )}
          {!loading && !error && sorted.length === 0 && (
            <div className="py-10 text-center text-sm text-slate-500">该 trace 暂无审计记录</div>
          )}
          {!loading && !error && sorted.length > 0 && (
            <ol className="relative space-y-4 border-l-2 border-slate-100 pl-5">
              {sorted.map((ev, i) => {
                const badge = eventBadge(ev.event, ev.verdict);
                return (
                  <li key={`${ev._id ?? i}`} className="relative">
                    <span className="absolute -left-[27px] top-2 size-2 rounded-full bg-slate-300 ring-4 ring-white" />
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={badge.className}>{badge.label}</span>
                      <span className="text-xs text-slate-400">{formatDateTime(ev.createdAt)}</span>
                      {typeof ev.attempt === 'number' && (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">
                          attempt #{ev.attempt}
                        </span>
                      )}
                      {ev.status && ev.status !== 'done' && (
                        <span className="font-mono text-[11px] text-slate-400">status: {ev.status}</span>
                      )}
                    </div>
                    {(ev.reason || ev.error) && (
                      <div className="mt-1 text-xs text-slate-600">
                        {ev.error ? <span className="text-orange-600">错误：{shortText(ev.error, 160)}</span> : null}
                        {ev.error && ev.reason ? ' · ' : null}
                        {ev.reason ? <span>原因：{shortText(ev.reason, 160)}</span> : null}
                      </div>
                    )}
                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 font-mono text-[11px] text-slate-400">
                      <span>群 {ev.groupId ?? '-'}</span>
                      <span>用户 {ev.userId ?? '-'}</span>
                      {ev.messageId && <span>消息 {ev.messageId}</span>}
                      {ev.action && <span>action {ev.action}</span>}
                    </div>
                    {ev.content ? (
                      <div
                        className={cx(
                          'mt-1.5 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-xs leading-6 text-slate-600',
                        )}
                      >
                        {shortText(ev.content, 220)}
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </div>
    </div>
  );
};
