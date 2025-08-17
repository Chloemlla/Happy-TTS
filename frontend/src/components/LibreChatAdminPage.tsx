import React, { useEffect, useMemo, useState } from 'react';
import { listUsers, getUserHistory, deleteUser, AdminUserSummary, AdminUserHistoryItem } from '../api/librechatAdmin';

const PAGE_SIZES = [10, 20, 50];

const formatTs = (ts?: string | null) => ts ? new Date(ts).toLocaleString() : '';

const LibreChatAdminPage: React.FC = () => {
  // Users list state
  const [kw, setKw] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [users, setUsers] = useState<AdminUserSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / limit)), [total, limit]);

  // Selected user details
  const [selectedUser, setSelectedUser] = useState<AdminUserSummary | null>(null);
  const [hPage, setHPage] = useState(1);
  const [hLimit, setHLimit] = useState(20);
  const [history, setHistory] = useState<AdminUserHistoryItem[]>([]);
  const [hTotal, setHTotal] = useState(0);
  const [hLoading, setHLoading] = useState(false);

  const fetchUsers = async (toPage = page) => {
    setLoading(true);
    try {
      const res = await listUsers({ kw, page: toPage, limit });
      setUsers(res.users || []);
      setTotal(res.total || 0);
      setPage(toPage);
    } catch (e) {
      console.error('加载用户列表失败', e);
    } finally {
      setLoading(false);
    }
  };

  const fetchHistory = async (userId: string, toPage = 1) => {
    setHLoading(true);
    try {
      const res = await getUserHistory(userId, { page: toPage, limit: hLimit });
      setHistory(res.messages || []);
      setHTotal(res.total || 0);
      setHPage(toPage);
    } catch (e) {
      console.error('加载用户历史失败', e);
    } finally {
      setHLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [limit]);

  const onSearch = () => fetchUsers(1);

  const onSelectUser = (u: AdminUserSummary) => {
    setSelectedUser(u);
    setHPage(1);
    fetchHistory(u.userId, 1);
  };

  const onDeleteUser = async (u: AdminUserSummary) => {
    const yes = confirm(`确定删除用户 ${u.userId} 的全部聊天历史吗？该操作不可恢复。`);
    if (!yes) return;
    try {
      await deleteUser(u.userId);
      // 如果在右侧被选中，清空
      if (selectedUser?.userId === u.userId) {
        setSelectedUser(null);
        setHistory([]);
        setHTotal(0);
      }
      await fetchUsers(page);
      alert('删除成功');
    } catch (e) {
      console.error('删除用户历史失败', e);
      alert('删除失败');
    }
  };

  const hTotalPages = useMemo(() => Math.max(1, Math.ceil(hTotal / hLimit)), [hTotal, hLimit]);

  return (
    <div className="p-4 max-w-7xl mx-auto">
      <h1 className="text-xl font-semibold mb-4">LibreChat 管理</h1>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Users list */}
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-4">
            <input
              className="border-2 border-gray-200 rounded-lg px-3 py-2 w-full sm:max-w-xs focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="搜索 userId (支持模糊)"
              value={kw}
              onChange={(e) => setKw(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') onSearch(); }}
            />
            <button
              className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800"
              onClick={onSearch}
              disabled={loading}
            >{loading ? '搜索中...' : '搜索'}</button>
            <div className="flex items-center gap-2 ml-auto">
              <span className="text-sm text-gray-500">每页</span>
              <select
                className="border rounded px-2 py-1"
                value={limit}
                onChange={(e) => setLimit(parseInt(e.target.value))}
              >
                {PAGE_SIZES.map(ps => <option key={ps} value={ps}>{ps}</option>)}
              </select>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-gray-700">
                  <th className="px-3 py-2 text-left">UserID</th>
                  <th className="px-3 py-2 text-left">消息数</th>
                  <th className="px-3 py-2 text-left">最近更新</th>
                  <th className="px-3 py-2 text-left">操作</th>
                </tr>
              </thead>
              <tbody>
                {users.length === 0 && (
                  <tr><td className="px-3 py-3 text-gray-500" colSpan={4}>{loading ? '加载中...' : '暂无数据'}</td></tr>
                )}
                {users.map(u => (
                  <tr key={u.userId} className="border-t">
                    <td className="px-3 py-2 font-mono text-xs break-all">{u.userId}</td>
                    <td className="px-3 py-2">{u.total}</td>
                    <td className="px-3 py-2">{formatTs(u.updatedAt)}</td>
                    <td className="px-3 py-2 flex gap-2">
                      <button className="px-3 py-1 rounded bg-sky-500 text-white hover:bg-sky-600" onClick={() => onSelectUser(u)}>查看</button>
                      <button className="px-3 py-1 rounded bg-red-500 text-white hover:bg-red-600" onClick={() => onDeleteUser(u)}>删除</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between mt-3">
            <div className="text-sm text-gray-500">共 {total} 条 · 第 {page}/{totalPages} 页</div>
            <div className="flex gap-2">
              <button className="px-3 py-1 border rounded disabled:opacity-50" disabled={page <= 1} onClick={() => fetchUsers(page - 1)}>上一页</button>
              <button className="px-3 py-1 border rounded disabled:opacity-50" disabled={page >= totalPages} onClick={() => fetchUsers(page + 1)}>下一页</button>
            </div>
          </div>
        </div>

        {/* Right: Selected user's history */}
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="font-semibold">用户历史</div>
            {selectedUser && (
              <div className="text-xs text-gray-500">{selectedUser.userId} · 共 {hTotal} 条</div>
            )}
          </div>

          {!selectedUser ? (
            <div className="text-gray-500">请选择左侧用户以查看详情</div>
          ) : (
            <>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-sm text-gray-500">每页</span>
                <select
                  className="border rounded px-2 py-1"
                  value={hLimit}
                  onChange={(e) => { setHLimit(parseInt(e.target.value)); fetchHistory(selectedUser.userId, 1); }}
                >
                  {PAGE_SIZES.map(ps => <option key={ps} value={ps}>{ps}</option>)}
                </select>
              </div>
              <div className="space-y-3 max-h-[60vh] overflow-y-auto">
                {hLoading && <div className="text-gray-500">加载中...</div>}
                {!hLoading && history.length === 0 && <div className="text-gray-500">暂无消息</div>}
                {history.map((m) => (
                  <div key={m.id} className="p-3 border rounded">
                    <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                      <div>{m.role === 'user' ? '用户' : '助手'} · {formatTs(m.timestamp)}</div>
                      <div className="font-mono text-[10px] text-gray-400">{m.id}</div>
                    </div>
                    <div className="whitespace-pre-wrap break-words text-sm">{m.message}</div>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between mt-3">
                <div className="text-sm text-gray-500">第 {hPage}/{hTotalPages} 页</div>
                <div className="flex gap-2">
                  <button className="px-3 py-1 border rounded disabled:opacity-50" disabled={hPage <= 1} onClick={() => fetchHistory(selectedUser.userId, hPage - 1)}>上一页</button>
                  <button className="px-3 py-1 border rounded disabled:opacity-50" disabled={hPage >= hTotalPages} onClick={() => fetchHistory(selectedUser.userId, hPage + 1)}>下一页</button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default LibreChatAdminPage;
