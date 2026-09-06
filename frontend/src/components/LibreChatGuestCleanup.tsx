import React, { useCallback, useEffect, useState } from 'react';
import {
  listUsers,
  deleteUser,
  batchDeleteUsers,
  deleteGuestHistories,
  AdminUserSummary,
} from '../api/librechatAdmin';
import { useNotification } from './Notification';
import { UnifiedLoadingSpinner } from './LoadingSpinner';
import { useAuth } from '../hooks/useAuth';
import { isSuperAdmin } from '../utils/rbac';
import {
  FaGhost,
  FaUser,
  FaComments,
  FaClock,
  FaCopy,
  FaUsers,
} from 'react-icons/fa';

const GUEST_KW = 'guest:';
const MAX_ROWS = 100;

const fmtTs = (ts?: string | null) => (ts ? new Date(ts).toLocaleString() : '');

type ApiErrorPayload = { error?: string; message?: string };

function errText(error: unknown, fallback: string): string {
  const record = error && typeof error === 'object' ? (error as Record<string, unknown>) : null;
  const response =
    record && typeof (record as { response?: unknown }).response === 'object'
      ? ((record as { response?: Record<string, unknown> }).response as Record<string, unknown>)
      : null;
  const data = response && typeof response.data === 'object' ? (response.data as Record<string, unknown>) : null;
  const payload = (data ?? record ?? {}) as ApiErrorPayload;
  return typeof payload.message === 'string' && payload.message
    ? payload.message
    : typeof payload.error === 'string' && payload.error
      ? payload.error
      : fallback;
}

/**
 * 登录化后遗留的 guest 孤儿历史管理：列表本身即“仅游客”筛选，
 * 支持单删 / 全选批量删 / 一键清理全部（均需超级管理员）。
 * onChanged 用于让宿主页面（用户列表）同步刷新。
 */
const LibreChatGuestCleanup: React.FC<{ onChanged?: () => void }> = ({ onChanged }) => {
  const { setNotification } = useNotification();
  const { user } = useAuth();
  const canWrite = isSuperAdmin(user?.role);

  const [rows, setRows] = useState<AdminUserSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listUsers({ kw: GUEST_KW, page: 1, limit: MAX_ROWS, includeDeleted: false });
      setRows(res.users || []);
      setTotal(res.total || 0);
      setSelectedIds([]);
    } catch (err) {
      setNotification({ type: 'error', message: errText(err, '加载 guest 历史列表失败') });
    } finally {
      setLoading(false);
    }
  }, [setNotification]);

  useEffect(() => {
    void load();
  }, [load]);

  const afterChange = () => {
    void load();
    onChanged?.();
  };

  const onSingleDelete = async (u: AdminUserSummary) => {
    const yes = window.confirm(`确定删除 guest 历史 ${u.userId} 的全部聊天记录吗？该操作不可恢复。`);
    if (!yes) return;
    setBusy(true);
    try {
      const res = await deleteUser(u.userId);
      setNotification({ type: 'success', message: res.message || '删除成功' });
      afterChange();
    } catch (err) {
      setNotification({ type: 'error', message: errText(err, '删除失败') });
    } finally {
      setBusy(false);
    }
  };

  const toggleAll = () => {
    if (selectedIds.length === rows.length) setSelectedIds([]);
    else setSelectedIds(rows.map((r) => r.userId));
  };

  const onBatchDelete = async () => {
    if (selectedIds.length === 0) {
      setNotification({ type: 'warning', message: '请先选择要删除的 guest 历史' });
      return;
    }
    const yes = window.confirm(`确定删除选中的 ${selectedIds.length} 条 guest 历史吗？该操作不可恢复。`);
    if (!yes) return;
    setBusy(true);
    try {
      const res = await batchDeleteUsers(selectedIds);
      setNotification({ type: 'success', message: res.message || `已删除 ${res.deleted} 条 guest 历史` });
      afterChange();
    } catch (err) {
      setNotification({ type: 'error', message: errText(err, '批量删除失败') });
    } finally {
      setBusy(false);
    }
  };

  const onClearAll = async () => {
    if (!window.confirm('确定一键清理全部 guest（游客）遗留历史吗？这些历史不属于任何登录账号，删除不可恢复。')) return;
    if (!window.confirm('再次确认：将清空所有 guest: 开头的孤儿历史记录。确定继续吗？')) return;
    setBusy(true);
    try {
      const res = await deleteGuestHistories();
      setNotification({ type: 'success', message: res.message || `已清理 ${res.deleted} 条 guest 历史` });
      afterChange();
    } catch (err) {
      setNotification({ type: 'error', message: errText(err, '清理 guest 历史失败') });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-2xl border border-amber-200 bg-white/80 p-5 shadow-sm backdrop-blur-xl">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-lg font-semibold text-slate-800">
          <FaGhost className="text-amber-500" />
          游客遗留历史（guest 孤儿）
        </h3>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-slate-500">共 {total} 条</span>
          <button
            className="rounded border bg-slate-100 px-3 py-1 text-sm transition hover:bg-slate-200 disabled:opacity-50"
            onClick={() => { void load(); setNotification({ type: 'info', message: '已刷新 guest 列表' }); }}
            disabled={loading || busy}
          >
            刷新
          </button>
          {canWrite && (
            <>
              <button
                className="rounded bg-red-600 px-3 py-1 text-sm text-white transition hover:bg-red-700 disabled:opacity-50"
                onClick={() => void onClearAll()}
                disabled={busy}
                title="清空所有 guest: 开头的孤儿历史（超级管理员）"
              >
                一键清理全部
              </button>
            </>
          )}
        </div>
      </div>

      {!canWrite ? (
        <p className="text-sm text-slate-500">需超级管理员权限才能清理 guest 遗留历史。</p>
      ) : loading ? (
        <UnifiedLoadingSpinner size="sm" text="正在加载 guest 历史..." className="py-6" />
      ) : total === 0 ? (
        <p className="flex items-center gap-2 text-sm text-slate-500">
          <FaUsers className="text-slate-300" />
          暂无 guest 遗留历史，无需清理。
        </p>
      ) : (
        <>
          <p className="mb-2 text-xs leading-5 text-slate-500">
            登录化后 guest: 开头的历史不再属于任何登录账号（孤儿）。此处仅列出前 {Math.min(MAX_ROWS, total)} 条；下方
            “一键清理全部”会清空所有 guest 历史（软删，与单用户删除语义一致）。
            {total > MAX_ROWS ? ` 实际共 ${total} 条，超出部分也会被一键清理。` : ''}
          </p>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" className="h-4 w-4" checked={selectedIds.length === rows.length} onChange={toggleAll} disabled={busy} />
              全选本页
            </label>
            {selectedIds.length > 0 && (
              <span className="text-sm text-slate-500">已选 {selectedIds.length} 条</span>
            )}
            <button
              className="rounded bg-red-500 px-2 py-1 text-xs text-white transition hover:bg-red-600 disabled:opacity-50"
              onClick={() => void onBatchDelete()}
              disabled={selectedIds.length === 0 || busy}
            >
              删除选中
            </button>
          </div>
          <div className="max-h-80 space-y-2 overflow-auto">
            {rows.map((u) => {
              const checked = selectedIds.includes(u.userId);
              return (
                <div key={u.userId} className="rounded-xl border border-slate-100 bg-slate-50/70 p-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <input
                      type="checkbox"
                      className="h-4 w-4"
                      checked={checked}
                      onChange={() =>
                        setSelectedIds((prev) => (checked ? prev.filter((id) => id !== u.userId) : [...prev, u.userId]))
                      }
                      disabled={busy}
                    />
                    <FaUser className="shrink-0 text-amber-500" />
                    <span className="min-w-0 flex-1 truncate font-mono text-xs text-slate-700" title={u.userId}>
                      {u.userId.length > 24 ? `${u.userId.slice(0, 20)}...${u.userId.slice(-4)}` : u.userId}
                    </span>
                    <span className="flex items-center gap-1 text-xs text-slate-500">
                      <FaComments className="text-green-500" />
                      {u.total} 条
                    </span>
                    <span className="flex items-center gap-1 text-xs text-slate-400">
                      <FaClock className="text-orange-400" />
                      {fmtTs(u.updatedAt)}
                    </span>
                    <button
                      className="rounded px-2 py-1 text-slate-400 transition hover:bg-slate-100 hover:text-blue-600"
                      onClick={() => {
                        if (!navigator.clipboard) return;
                        void navigator.clipboard
                          .writeText(u.userId)
                          .then(() => setNotification({ type: 'success', message: 'guest ownerKey 已复制' }))
                          .catch(() => undefined);
                      }}
                      title="复制完整 guest ownerKey"
                    >
                      <FaCopy className="text-xs" />
                    </button>
                    <button
                      className="rounded bg-red-50 px-2 py-1 text-xs text-red-600 transition hover:bg-red-100 disabled:opacity-50"
                      onClick={() => void onSingleDelete(u)}
                      disabled={busy}
                      title="删除该 guest 的全部历史"
                    >
                      删除
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
};

export default LibreChatGuestCleanup;
