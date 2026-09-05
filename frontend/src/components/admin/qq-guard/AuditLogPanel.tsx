import React, { useCallback, useEffect, useState } from 'react';
import { FaListUl, FaRedo, FaSearch } from 'react-icons/fa';
import { qqGuardApi } from '../../../api/qqGuard';
import type { QqGuardAuditRow } from '../../../api/qqGuard';
import { SimpleLoadingSpinner } from '../../LoadingSpinner';
import {
  InfoSectionTitle,
  logSharePanelClass,
  logSharePrimaryButtonClass,
  logShareSecondaryButtonClass,
} from '../../LogShareStyleScaffold';
import { cx, eventBadge, formatDateTime, shortText } from './ui';

const PAGE_SIZE = 30;

const EVENT_OPTIONS = [
  'message',
  'moderate',
  'violation',
  'recalled',
  'recall_failed',
  'dm_sent',
  'dm_suppressed',
  'dm_failed',
  'pass',
  'review_pending',
  'review_clean',
  'review_violated',
  'exempted',
  'command',
];

interface FilterState {
  fTrace: string;
  fUser: string;
  fGroup: string;
  fEvent: string;
  fVerdict: string;
}

const EMPTY_FILTERS: FilterState = { fTrace: '', fUser: '', fGroup: '', fEvent: '', fVerdict: '' };

interface AuditLogPanelProps {
  onOpenTrace: (traceId: string) => void;
}

export const AuditLogPanel: React.FC<AuditLogPanelProps> = ({ onOpenTrace }) => {
  const [rows, setRows] = useState<QqGuardAuditRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [fTrace, setFTrace] = useState('');
  const [fUser, setFUser] = useState('');
  const [fGroup, setFGroup] = useState('');
  const [fEvent, setFEvent] = useState('');
  const [fVerdict, setFVerdict] = useState('');
  const [page, setPage] = useState(1);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const currentFilters = (): FilterState => ({ fTrace, fUser, fGroup, fEvent, fVerdict });

  const load = useCallback(async (targetPage: number, params: FilterState) => {
    setLoading(true);
    setError(null);
    try {
      const { audits, total: t } = await qqGuardApi.audits({
        page: targetPage,
        limit: PAGE_SIZE,
        traceId: params.fTrace || undefined,
        userId: params.fUser || undefined,
        groupId: params.fGroup || undefined,
        event: params.fEvent || undefined,
        verdict: params.fVerdict || undefined,
      });
      setRows(audits);
      setTotal(t);
    } catch (err) {
      setError('审计加载失败，请稍后重试');
      console.error('加载 QQ 群审计失败:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(1, EMPTY_FILTERS);
  }, [load]);

  const applySearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    void load(1, currentFilters());
  };

  const refresh = () => void load(page, currentFilters());

  const goTo = (p: number) => {
    if (p < 1 || p > totalPages) return;
    setPage(p);
    void load(p, currentFilters());
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <InfoSectionTitle
          title="审计日志"
          description="bot 回推 + AI 裁决 + 面板命令的完整留痕。点 traceId 看单条消息的操作时间线。"
          icon={FaListUl}
          tone="slate"
        />
        <button onClick={refresh} disabled={loading} className={logShareSecondaryButtonClass}>
          <FaRedo className="text-sm" />
          刷新
        </button>
      </div>

      <form
        onSubmit={applySearch}
        className="grid grid-cols-2 gap-2.5 rounded-2xl border border-slate-100 bg-white p-3 sm:grid-cols-3 lg:grid-cols-6"
      >
        <input
          value={fTrace}
          onChange={(e) => setFTrace(e.target.value)}
          placeholder="traceId"
          className="col-span-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-indigo-300 sm:col-span-1"
        />
        <input
          value={fUser}
          onChange={(e) => setFUser(e.target.value)}
          placeholder="QQ号"
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-indigo-300"
        />
        <input
          value={fGroup}
          onChange={(e) => setFGroup(e.target.value)}
          placeholder="群号"
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-indigo-300"
        />
        <select
          value={fEvent}
          onChange={(e) => setFEvent(e.target.value)}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-indigo-300"
        >
          <option value="">全部事件</option>
          {EVENT_OPTIONS.map((ev) => (
            <option key={ev} value={ev}>
              {ev}
            </option>
          ))}
        </select>
        <select
          value={fVerdict}
          onChange={(e) => setFVerdict(e.target.value)}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-indigo-300"
        >
          <option value="">全部判定</option>
          <option value="violated">violated</option>
          <option value="clean">clean</option>
          <option value="undetermined">undetermined</option>
        </select>
        <button type="submit" className={cx(logSharePrimaryButtonClass, 'col-span-2 sm:col-span-1')}>
          <FaSearch className="text-xs" />
          查询
        </button>
      </form>

      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
      )}

      <div className={cx(logSharePanelClass, 'overflow-hidden')}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">时间</th>
                <th className="px-4 py-3">事件</th>
                <th className="px-4 py-3">traceId</th>
                <th className="px-4 py-3">成员</th>
                <th className="px-4 py-3">内容摘要</th>
                <th className="px-4 py-3">说明</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && !loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-slate-500">
                    暂无审计记录
                  </td>
                </tr>
              ) : (
                rows.map((row, i) => {
                  const badge = eventBadge(row.event, row.verdict);
                  return (
                    <tr
                      key={row._id ?? `${row.traceId}-${i}`}
                      className="border-b border-slate-100 hover:bg-slate-50/60"
                    >
                      <td className="whitespace-nowrap px-4 py-2.5 text-xs text-slate-500">
                        {formatDateTime(row.createdAt)}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={badge.className}>{badge.label}</span>
                      </td>
                      <td className="px-4 py-2.5">
                        <button
                          onClick={() => onOpenTrace(row.traceId)}
                          className="max-w-[190px] truncate rounded-md px-1 font-mono text-xs text-indigo-600 transition hover:bg-indigo-50"
                          title="查看时间线"
                        >
                          {row.traceId}
                        </button>
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs text-slate-600">
                        {row.userId ?? '-'}
                        {row.groupId ? <span className="text-slate-400"> / {row.groupId}</span> : null}
                      </td>
                      <td className="max-w-[220px] truncate px-4 py-2.5 text-xs text-slate-600">
                        {shortText(row.content, 60)}
                      </td>
                      <td className="max-w-[200px] truncate px-4 py-2.5 text-xs text-slate-500">
                        {row.error ? (
                          <span className="text-orange-600">{shortText(row.error, 80)}</span>
                        ) : (
                          shortText(row.reason, 80)
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between px-4 py-3">
          <span className="text-xs text-slate-500">
            共 {total} 条 · 第 {page}/{totalPages} 页
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => goTo(page - 1)}
              disabled={page <= 1 || loading}
              className={logShareSecondaryButtonClass}
            >
              上一页
            </button>
            <button
              onClick={() => goTo(page + 1)}
              disabled={page >= totalPages || loading}
              className={logSharePrimaryButtonClass}
            >
              下一页
            </button>
          </div>
        </div>
        {loading && (
          <div className="flex justify-center pb-4">
            <SimpleLoadingSpinner size={0.9} />
          </div>
        )}
      </div>
    </div>
  );
};
