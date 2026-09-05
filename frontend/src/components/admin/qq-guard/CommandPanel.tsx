import React, { useCallback, useEffect, useState } from 'react';
import { FaPaperPlane, FaRedo, FaTerminal } from 'react-icons/fa';
import { qqGuardApi } from '../../../api/qqGuard';
import type { QqGuardCommandRow } from '../../../api/qqGuard';
import { SimpleLoadingSpinner } from '../../LoadingSpinner';
import {
  InfoSectionTitle,
  logSharePanelClass,
  logSharePrimaryButtonClass,
  logShareSecondaryButtonClass,
} from '../../LogShareStyleScaffold';
import { cx, formatDateTime, shortText } from './ui';

const inputClass =
  'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 outline-none transition focus:border-indigo-300';

function statusBadge(row: QqGuardCommandRow): { label: string; className: string } {
  if (row.status === 'done') {
    const ok = row.result && row.result.ok !== false;
    return ok
      ? { label: '已完成', className: 'border-emerald-200 bg-emerald-50 text-emerald-700' }
      : { label: '执行失败', className: 'border-rose-200 bg-rose-50 text-rose-700' };
  }
  if (row.status === 'failed') return { label: '回执失败', className: 'border-rose-200 bg-rose-50 text-rose-700' };
  return { label: '待执行', className: 'border-amber-200 bg-amber-50 text-amber-700' };
}

const ACTION_LABEL: Record<QqGuardCommandRow['action'], string> = {
  retry: '立即复审',
  recall: '手动撤回',
  exempt: '豁免成员',
};

export const CommandPanel: React.FC = () => {
  const [commands, setCommands] = useState<QqGuardCommandRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const [retryTrace, setRetryTrace] = useState('');
  const [rcTrace, setRcTrace] = useState('');
  const [rcUser, setRcUser] = useState('');
  const [rcGroup, setRcGroup] = useState('');
  const [rcMsg, setRcMsg] = useState('');
  const [rcReason, setRcReason] = useState('');
  const [exUser, setExUser] = useState('');
  const [exReason, setExReason] = useState('');
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setCommands(await qqGuardApi.commands(50));
    } catch (err) {
      setError('命令历史加载失败，请稍后重试');
      console.error('加载 QQ 群命令失败:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const flash = (m: string) => {
    setMsg(m);
    window.setTimeout(() => setMsg(null), 5000);
  };

  const dispatch = async (action: 'retry' | 'recall' | 'exempt', payload: Record<string, unknown>, label: string) => {
    setBusyAction(action);
    setError(null);
    try {
      const { commandId } = await qqGuardApi.createCommand(action, payload);
      flash(`已下发「${label}」命令 ${commandId}，机器人约 20 秒内执行`);
      setRetryTrace('');
      setRcTrace('');
      setRcUser('');
      setRcGroup('');
      setRcMsg('');
      setRcReason('');
      setExUser('');
      setExReason('');
      await load();
    } catch (err) {
      setError(`「${label}」下发失败：请确认机器人数据就绪（Mongo 可用）`);
      console.error('下发 QQ 群命令失败:', err);
    } finally {
      setBusyAction(null);
    }
  };

  const field = (label: string, value: string, onChange: (v: string) => void, placeholder: string, wide = false) => (
    <label className={cx('block', wide && 'col-span-full')}>
      <span className="mb-1 block text-[11px] font-semibold text-slate-500">{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={inputClass} />
    </label>
  );

  const actionForm = (
    action: 'retry' | 'recall' | 'exempt',
    title: string,
    body: React.ReactNode,
  ) => (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (action === 'retry' && retryTrace.trim()) {
          void dispatch('retry', { traceId: retryTrace.trim() }, title);
        } else if (action === 'recall' && rcTrace.trim() && rcUser.trim() && rcGroup.trim() && rcMsg.trim()) {
          void dispatch(
            'recall',
            {
              traceId: rcTrace.trim(),
              userId: rcUser.trim(),
              groupId: rcGroup.trim(),
              messageId: rcMsg.trim(),
              ...(rcReason.trim() ? { reason: rcReason.trim() } : {}),
            },
            title,
          );
        } else if (action === 'exempt' && exUser.trim()) {
          void dispatch('exempt', { userId: exUser.trim(), ...(exReason.trim() ? { reason: exReason.trim() } : {}) }, title);
        }
      }}
      className="rounded-2xl border border-slate-100 bg-white/70 p-4"
    >
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-semibold text-slate-800">{title}</span>
        <button
          type="submit"
          disabled={busyAction !== null}
          className={logSharePrimaryButtonClass}
        >
          <FaPaperPlane className="text-xs" />
          {busyAction === action ? '下发中...' : '下发'}
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">{body}</div>
      {action === 'exempt' && (
        <p className="mt-2 text-[11px] leading-5 text-slate-400">
          豁免 = 加入白名单并撤销该成员 AI 审查；同时写入豁免审计，可在白名单页移除。
        </p>
      )}
    </form>
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <InfoSectionTitle
          title="命令中心"
          description="手动给机器人下发立即复审 / 追溯撤回 / 豁免。命令进 outbox，机器人轮询执行并回执。"
          icon={FaTerminal}
          tone="violet"
        />
        <button onClick={() => void load()} disabled={loading} className={logShareSecondaryButtonClass}>
          <FaRedo className="text-sm" />
          刷新
        </button>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        {actionForm(
          'retry',
          '立即复审（traceId）',
          <>
            {field('traceId', retryTrace, setRetryTrace, 'trace-xxxxxxxxxxxxxxxx', true)}
            <span className="col-span-full text-[11px] text-slate-400">
              对挂起复审（AI 不可达）的某条消息立即重试一次判定，违规则追溯撤回。
            </span>
          </>,
        )}
        {actionForm(
          'recall',
          '手动撤回',
          <>
            {field('traceId', rcTrace, setRcTrace, 'trace-xxxxxxxxxxxxxxxx')}
            {field('QQ号', rcUser, setRcUser, '成员 QQ')}
            {field('群号', rcGroup, setRcGroup, '群号')}
            {field('消息ID', rcMsg, setRcMsg, '消息 messageId')}
            {field('原因（可选）', rcReason, setRcReason, '管理员手动撤回', true)}
          </>,
        )}
        {actionForm(
          'exempt',
          '豁免成员',
          <>
            {field('QQ号', exUser, setExUser, '成员 QQ')}
            {field('原因（可选）', exReason, setExReason, '如：AI 误判，群主确认')}
          </>,
        )}
      </div>

      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
      )}
      {msg && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{msg}</div>
      )}

      <div className={cx(logSharePanelClass, 'overflow-hidden')}>
        <div className="px-5 pt-4 text-sm font-semibold text-slate-800">最近命令</div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">时间</th>
                <th className="px-4 py-3">类型</th>
                <th className="px-4 py-3">状态</th>
                <th className="px-4 py-3">payload</th>
                <th className="px-4 py-3">回执</th>
                <th className="px-4 py-3">下发人</th>
              </tr>
            </thead>
            <tbody>
              {commands.length === 0 && !loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-slate-500">
                    暂无命令记录
                  </td>
                </tr>
              ) : (
                commands.map((row) => {
                  const badge = statusBadge(row);
                  return (
                    <tr key={row._id ?? row.commandId} className="border-b border-slate-100 hover:bg-slate-50/60">
                      <td className="whitespace-nowrap px-4 py-2.5 text-xs text-slate-500">
                        {formatDateTime(row.createdAt)}
                      </td>
                      <td className="px-4 py-2.5 text-xs font-semibold text-slate-700">
                        {ACTION_LABEL[row.action]}
                        <span className="ml-1.5 font-mono text-[10px] font-normal text-slate-400">{row.action}</span>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={cx('rounded-full border px-2 py-0.5 text-[11px] font-semibold', badge.className)}>
                          {badge.label}
                        </span>
                      </td>
                      <td className="max-w-[240px] truncate px-4 py-2.5 font-mono text-[11px] text-slate-500">
                        {shortText(JSON.stringify(row.payload ?? {}), 90)}
                      </td>
                      <td className="max-w-[180px] truncate px-4 py-2.5 font-mono text-[11px] text-slate-500">
                        {row.result ? shortText(JSON.stringify(row.result), 80) : '-'}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-slate-500">{row.createdBy || '-'}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        {loading && (
          <div className="flex justify-center py-4">
            <SimpleLoadingSpinner size={0.9} />
          </div>
        )}
      </div>
    </div>
  );
};
