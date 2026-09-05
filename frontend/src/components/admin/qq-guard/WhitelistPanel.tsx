import React, { useCallback, useEffect, useState } from 'react';
import { FaTrashAlt, FaUserPlus, FaUsers } from 'react-icons/fa';
import { qqGuardApi } from '../../../api/qqGuard';
import type { QqGuardWhitelistRow } from '../../../api/qqGuard';
import { SimpleLoadingSpinner } from '../../LoadingSpinner';
import {
  InfoSectionTitle,
  logSharePanelClass,
  logSharePrimaryButtonClass,
  logShareSecondaryButtonClass,
} from '../../LogShareStyleScaffold';
import { cx, formatDateTime } from './ui';

/**
 * 白名单（免 AI 审查成员）。面板增删即时写库；
 * bot 命令轮询/启动时同步合并，生效后其群消息不再送 AI、不被撤回。
 */
export const WhitelistPanel: React.FC = () => {
  const [items, setItems] = useState<QqGuardWhitelistRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const [userId, setUserId] = useState('');
  const [groupId, setGroupId] = useState('');
  const [name, setName] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await qqGuardApi.whitelist());
    } catch (err) {
      setError('白名单加载失败，请稍后重试');
      console.error('加载 QQ 群白名单失败:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    const uid = userId.trim();
    if (!uid) return;
    setBusy(true);
    setError(null);
    setMsg(null);
    try {
      const result = await qqGuardApi.addWhitelist({
        userId: uid,
        groupId: groupId.trim() || '*',
        name: name.trim() || undefined,
        reason: reason.trim() || undefined,
      });
      setMsg(result.existing ? `成员 ${uid} 已在白名单中（未重复添加）` : `成员 ${uid} 已加入白名单`);
      setUserId('');
      setName('');
      setReason('');
      await load();
    } catch (err) {
      setError('添加失败，请检查输入后重试');
      console.error('添加白名单失败:', err);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (uid: string) => {
    if (!window.confirm(`确认将成员 ${uid} 移出白名单？移出后其消息将重新接受 AI 审查。`)) return;
    setBusy(true);
    setError(null);
    setMsg(null);
    try {
      await qqGuardApi.removeWhitelist(uid);
      setMsg(`成员 ${uid} 已移出白名单`);
      await load();
    } catch (err) {
      setError('移除失败，请稍后重试');
      console.error('移除白名单失败:', err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <InfoSectionTitle
          title="白名单成员"
          description="白名单成员的消息不送 AI、不被撤回。常见场景：AI 误判申诉经群主确认后加入。"
          icon={FaUsers}
          tone="emerald"
        />
        <button onClick={() => void load()} disabled={loading} className={logShareSecondaryButtonClass}>
          刷新
        </button>
      </div>

      <form
        onSubmit={add}
        className={cx(logSharePanelClass, 'grid gap-3 sm:grid-cols-2 lg:grid-cols-[140px_120px_160px_1fr_auto]')}
      >
        <input
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          placeholder="QQ 号 *"
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-300"
        />
        <input
          value={groupId}
          onChange={(e) => setGroupId(e.target.value)}
          placeholder="群号（默认全群）"
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-300"
        />
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="姓名（可选）"
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-300"
        />
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="加入原因（可选）"
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-300"
        />
        <button type="submit" disabled={busy || !userId.trim()} className={logSharePrimaryButtonClass}>
          <FaUserPlus className="text-sm" />
          {busy ? '处理中...' : '加入'}
        </button>
      </form>

      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
      )}
      {msg && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{msg}</div>
      )}

      <div className={cx(logSharePanelClass, 'overflow-hidden')}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">QQ 号</th>
                <th className="px-4 py-3">群号</th>
                <th className="px-4 py-3">姓名</th>
                <th className="px-4 py-3">原因</th>
                <th className="px-4 py-3">添加人</th>
                <th className="px-4 py-3">添加时间</th>
                <th className="px-4 py-3 text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && !loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-slate-500">
                    白名单为空
                  </td>
                </tr>
              ) : (
                items.map((row) => (
                  <tr key={row._id ?? `${row.userId}-${row.groupId}`} className="border-b border-slate-100 hover:bg-slate-50/60">
                    <td className="px-4 py-3 font-mono text-xs text-slate-700">{row.userId}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-500">{row.groupId}</td>
                    <td className="px-4 py-3 text-slate-700">{row.name || '-'}</td>
                    <td className="max-w-[220px] truncate px-4 py-3 text-xs text-slate-500">{row.reason || '-'}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">{row.addedBy}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500">{formatDateTime(row.createdAt)}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => void remove(row.userId)}
                        disabled={busy}
                        className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-rose-600 transition hover:bg-rose-50"
                      >
                        <FaTrashAlt className="text-[10px]" />
                        移除
                      </button>
                    </td>
                  </tr>
                ))
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
