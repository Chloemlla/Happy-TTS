import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { listUsers, getUserHistory, deleteUser, batchDeleteUsers, deleteAllUsers, AdminUserSummary, AdminUserHistoryItem } from '../api/librechatAdmin';
import { useNotification } from './Notification';
import {
  FaUsers,
  FaSearch,
  FaEye,
  FaTrash,
  FaChevronLeft,
  FaChevronRight,
  FaHistory,
  FaUser,
  FaComments,
  FaClock,
  FaEnvelope
} from 'react-icons/fa';

const PAGE_SIZES = [10, 20, 50];

const formatTs = (ts?: string | null) => ts ? new Date(ts).toLocaleString() : '';

const LibreChatAdminPage: React.FC = () => {
  const { setNotification } = useNotification();
  
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

  // 批量操作状态
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [selectAll, setSelectAll] = useState(false);
  // 操作中（禁用关键按钮）
  const [actionLoading, setActionLoading] = useState(false);

  const fetchUsers = async (toPage = page, showTip = false) => {
    setLoading(true);
    try {
      const res = await listUsers({ kw, page: toPage, limit });
      setUsers(res.users || []);
      setTotal(res.total || 0);
      setPage(toPage);
      if (showTip) setNotification({ type: 'success', message: `已获取 ${res.users?.length || 0} 个用户` });
    } catch (e: any) {
      console.error('加载用户列表失败', e);
      setNotification({ type: 'error', message: e?.response?.data?.error || e?.message || '加载用户列表失败' });
    } finally {
      setLoading(false);
    }
  };

  const fetchHistory = async (userId: string, toPage = 1, showTip = false) => {
    setHLoading(true);
    try {
      const res = await getUserHistory(userId, { page: toPage, limit: hLimit });
      setHistory(res.messages || []);
      setHTotal(res.total || 0);
      setHPage(toPage);
      if (showTip) setNotification({ type: 'success', message: `已获取 ${res.messages?.length || 0} 条历史记录` });
    } catch (e: any) {
      console.error('加载用户历史失败', e);
      setNotification({ type: 'error', message: e?.response?.data?.error || e?.message || '加载用户历史失败' });
    } finally {
      setHLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers(1, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [limit]);

  // 同步全选状态
  useEffect(() => {
    if (users.length > 0 && selectedUserIds.length === users.length) {
      setSelectAll(true);
    } else {
      setSelectAll(false);
    }
  }, [selectedUserIds, users.length]);

  const onSearch = () => fetchUsers(1, true);

  const onSelectUser = (u: AdminUserSummary) => {
    setSelectedUser(u);
    setHPage(1);
    fetchHistory(u.userId, 1, true);
  };

  const onDeleteUser = async (u: AdminUserSummary) => {
    const yes = confirm(`确定删除用户 ${u.userId} 的全部聊天历史吗？该操作不可恢复。`);
    if (!yes) return;
    try {
      setActionLoading(true);
      await deleteUser(u.userId);
      // 如果在右侧被选中，清空
      if (selectedUser?.userId === u.userId) {
        setSelectedUser(null);
        setHistory([]);
        setHTotal(0);
      }
      await fetchUsers(page);
      setNotification({ type: 'success', message: '删除成功' });
    } catch (e: any) {
      console.error('删除用户历史失败', e);
      setNotification({ type: 'error', message: e?.response?.data?.error || e?.message || '删除失败' });
    } finally {
      setActionLoading(false);
    }
  };

  const hTotalPages = useMemo(() => Math.max(1, Math.ceil(hTotal / hLimit)), [hTotal, hLimit]);

  // 批量操作功能
  const toggleSelectUser = (userId: string) => {
    setSelectedUserIds(prev => 
      prev.includes(userId) 
        ? prev.filter(id => id !== userId)
        : [...prev, userId]
    );
  };

  const toggleSelectAll = () => {
    if (selectAll) {
      setSelectedUserIds([]);
      setSelectAll(false);
    } else {
      setSelectedUserIds(users.map(u => u.userId));
      setSelectAll(true);
    }
  };

  const handleBatchDelete = async () => {
    if (selectedUserIds.length === 0) {
      setNotification({ type: 'warning', message: '请先选择要删除的用户' });
      return;
    }
    const yes = confirm(`确定删除选中的 ${selectedUserIds.length} 个用户的全部聊天历史吗？该操作不可恢复。`);
    if (!yes) return;
    try {
      setActionLoading(true);
      const res = await batchDeleteUsers(selectedUserIds);
      setSelectedUserIds([]);
      setSelectAll(false);
      // 如果当前选中的用户被删除，清空右侧详情
      if (selectedUser && selectedUserIds.includes(selectedUser.userId)) {
        setSelectedUser(null);
        setHistory([]);
        setHTotal(0);
      }
      await fetchUsers(page);
      setNotification({ type: 'success', message: res.message || `已删除 ${res.deleted} 个用户历史` });
    } catch (e: any) {
      console.error('批量删除失败', e);
      setNotification({ type: 'error', message: e?.response?.data?.error || e?.message || '批量删除失败' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteAll = async () => {
    const yes = confirm('确定删除所有用户的聊天历史吗？这是一个危险操作，不可恢复！');
    if (!yes) return;
    const confirmAgain = confirm('再次确认：这将删除所有用户的聊天历史（无需选择任何用户）。确定继续吗？');
    if (!confirmAgain) return;
    try {
      setActionLoading(true);
      const res = await deleteAllUsers();
      setSelectedUserIds([]);
      setSelectAll(false);
      setSelectedUser(null);
      setHistory([]);
      setHTotal(0);
      await fetchUsers(1);
      setNotification({ type: 'success', message: res.message || '已删除全部历史' });
    } catch (e: any) {
      console.error('删除所有用户失败', e);
      setNotification({ type: 'error', message: e?.response?.data?.error || e?.message || '删除所有用户失败' });
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <motion.div
      className="space-y-6"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6 }}
    >
      {/* 标题和说明 */}
      <motion.div
        className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-6 border border-blue-100"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
      >
        <h2 className="text-2xl font-bold text-blue-700 mb-3 flex items-center gap-2">
          <FaEnvelope className="text-blue-500" />
          LibreChat 管理
        </h2>
        <div className="text-gray-600 space-y-2">
          <p>管理 LibreChat 用户聊天历史，包括查看、搜索和删除用户对话记录。</p>
          <div className="flex items-start gap-2 text-sm">
            <div>
              <p className="font-semibold text-blue-700">功能说明：</p>
              <ul className="list-disc list-inside space-y-1 mt-1">
                <li>查看所有 LibreChat 用户列表</li>
                <li>搜索特定用户</li>
                <li>查看用户聊天历史</li>
                <li>删除用户全部聊天记录</li>
                <li>响应式设计，支持移动端</li>
              </ul>
            </div>
          </div>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Left: Users list */}
        <motion.div
          className="bg-white rounded-xl p-6 shadow-sm border border-gray-200"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          {/* 危险操作提示 */}
          <div className="mb-4 p-3 rounded-lg border border-red-200 bg-red-50 text-red-700 text-sm">
            危险操作提示：点击 “删除全部” 将清空所有用户的聊天历史（无需选择）。
          </div>

          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
              <FaUsers className="text-lg text-blue-500" />
              用户列表
            </h3>
            <div className="flex items-center gap-3">
              <div className="text-sm text-gray-500">共 {total} 条</div>
              <motion.button
                className="px-3 py-1 bg-gray-100 hover:bg-gray-200 border rounded text-sm transition"
                onClick={() => { fetchUsers(page, true); setNotification({ type: 'info', message: '已刷新列表' }); }}
                disabled={loading || actionLoading}
                whileTap={{ scale: 0.95 }}
              >
                刷新
              </motion.button>
              {selectedUserIds.length > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-blue-600">已选择 {selectedUserIds.length} 个用户</span>
                  <motion.button
                    className="px-3 py-1 bg-red-500 text-white rounded text-sm hover:bg-red-600 transition flex items-center gap-1"
                    onClick={handleBatchDelete}
                    disabled={actionLoading}
                    whileTap={{ scale: 0.95 }}
                  >
                    <FaTrash className="text-xs" />
                    批量删除
                  </motion.button>
                </div>
              )}
            </div>
          </div>

          {/* 搜索和分页控制 */}
          <div className="space-y-4 mb-6">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1">
                <div className="relative">
                  <input
                    className="w-full px-4 py-2 pl-10 border-2 border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 transition-all"
                    placeholder="搜索 userId (支持模糊)"
                    value={kw}
                    onChange={(e) => setKw(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') onSearch(); }}
                    onBlur={() => kw.trim() && onSearch()}
                  />
                  <FaSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                </div>
              </div>
              <motion.button
                className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition font-medium flex items-center gap-2"
                onClick={onSearch}
                disabled={loading || actionLoading}
                whileTap={{ scale: 0.95 }}
              >
                {loading ? '搜索中...' : '搜索'}
              </motion.button>
              <motion.button
                className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition font-medium flex items-center gap-2"
                onClick={handleDeleteAll}
                disabled={loading || actionLoading}
                title="删除所有用户历史（无需选择）"
                whileTap={{ scale: 0.95 }}
              >
                <FaTrash className="text-xs" />
                {actionLoading ? '处理中...' : '删除全部'}
                <span className="text-[10px] opacity-80">(无需选择)</span>
              </motion.button>
            </div>
            
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-500">每页</span>
                <select
                  className="border rounded px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                  value={limit}
                  onChange={(e) => { setLimit(parseInt(e.target.value)); setNotification({ type: 'info', message: `每页 ${e.target.value} 条` }); }}
                  disabled={loading || actionLoading}
                >
                  {PAGE_SIZES.map(ps => <option key={ps} value={ps}>{ps}</option>)}
                </select>
              </div>
              <div className="text-sm text-gray-500">
                第 {page}/{totalPages} 页
              </div>
            </div>
          </div>

          {/* 用户列表 */}
          {loading ? (
            <div className="text-center py-8 text-gray-500">
              <svg className="animate-spin h-8 w-8 mx-auto mb-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              加载中...
            </div>
          ) : (
            <div className="space-y-3">
              {users.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <FaUsers className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                  暂无用户数据
                </div>
              ) : (
                <>
                  {/* 全选和批量删除 */}
                  <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border">
                    <div className="flex items-center gap-3">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          className="w-4 h-4"
                          checked={selectAll}
                          onChange={toggleSelectAll}
                          disabled={actionLoading}
                        />
                        <span className="text-sm font-medium text-gray-700">全选</span>
                      </label>
                      {selectedUserIds.length > 0 && (
                        <span className="text-sm text-blue-600">已选择 {selectedUserIds.length} 个用户</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <motion.button
                        className="px-3 py-1 bg-red-500 text-white rounded text-sm hover:bg-red-600 transition flex items-center gap-1"
                        onClick={handleBatchDelete}
                        disabled={selectedUserIds.length === 0 || actionLoading}
                        whileTap={{ scale: 0.95 }}
                      >
                        <FaTrash className="text-xs" />
                        批量删除
                      </motion.button>
                    </div>
                  </div>
                  {users.map((u, idx) => (
                    <motion.div
                      key={u.userId}
                      className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.3, delay: 0.1 * idx }}
                      whileHover={{ backgroundColor: '#f0f9ff' }}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center gap-3 min-w-0">
                        <div className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            className="w-4 h-4"
                            checked={selectedUserIds.includes(u.userId)}
                            onChange={() => toggleSelectUser(u.userId)}
                            disabled={actionLoading}
                          />
                          <div className="flex-1 min-w-0 max-w-full">
                            <div className="flex items-center gap-2 mb-2">
                              <FaUser className="text-blue-500 flex-shrink-0" />
                              <span className="font-medium text-gray-800 truncate max-w-32" title={u.userId}>
                                {u.userId.length > 24 ? `${u.userId.slice(0, 20)}...${u.userId.slice(-4)}` : u.userId}
                              </span>
                            </div>
                            <div className="flex flex-col sm:flex-row sm:items-center gap-2 text-sm text-gray-600">
                              <div className="flex items-center gap-1">
                                <FaComments className="text-green-500" />
                                <span>{u.total} 条消息</span>
                              </div>
                              <div className="flex items-center gap-1">
                                <FaClock className="text-orange-500" />
                                <span>{formatTs(u.updatedAt)}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                        <div className="flex gap-2 flex-shrink-0">
                          <motion.button
                            className="px-3 py-1 bg-sky-500 text-white rounded text-sm hover:bg-sky-600 transition flex items-center gap-1"
                            onClick={() => onSelectUser(u)}
                            disabled={actionLoading}
                            whileTap={{ scale: 0.95 }}
                          >
                            <FaEye className="text-xs" />
                            查看
                          </motion.button>
                          <motion.button
                            className="px-3 py-1 bg-red-500 text-white rounded text-sm hover:bg-red-600 transition flex items-center gap-1"
                            onClick={() => onDeleteUser(u)}
                            disabled={actionLoading}
                            whileTap={{ scale: 0.95 }}
                          >
                            <FaTrash className="text-xs" />
                            删除
                          </motion.button>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </>
              )}
            </div>
          )}

          {/* 分页控制 */}
          {users.length > 0 && (
            <div className="flex items-center justify-between mt-6 pt-4 border-t border-gray-200">
              <motion.button
                className="px-4 py-2 border border-gray-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 transition flex items-center gap-2"
                disabled={page <= 1 || actionLoading}
                onClick={async () => { await fetchUsers(page - 1); setNotification({ type: 'info', message: `已切换到第 ${page - 1} 页` }); }}
                whileTap={{ scale: 0.95 }}
              >
                <FaChevronLeft className="text-xs" />
                上一页
              </motion.button>
              <motion.button
                className="px-4 py-2 border border-gray-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 transition flex items-center gap-2"
                disabled={page >= totalPages || actionLoading}
                onClick={async () => { await fetchUsers(page + 1); setNotification({ type: 'info', message: `已切换到第 ${page + 1} 页` }); }}
                whileTap={{ scale: 0.95 }}
              >
                下一页
                <FaChevronRight className="text-xs" />
              </motion.button>
            </div>
          )}
        </motion.div>

        {/* Right: Selected user's history */}
        <motion.div
          className="bg-white rounded-xl p-6 shadow-sm border border-gray-200"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
              <FaHistory className="text-lg text-blue-500" />
              用户历史
            </h3>
            {selectedUser && (
              <div className="text-sm text-gray-500 truncate max-w-48" title={selectedUser.userId}>
                {selectedUser.userId.length > 24 ? `${selectedUser.userId.slice(0, 20)}...${selectedUser.userId.slice(-4)}` : selectedUser.userId} · 共 {hTotal} 条
              </div>
            )}
          </div>

          {!selectedUser ? (
            <div className="text-center py-12 text-gray-500">
              <FaHistory className="w-12 h-12 mx-auto mb-4 text-gray-300" />
              <p>请选择左侧用户以查看详情</p>
            </div>
          ) : (
            <>
              {/* 分页控制 */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-500">每页</span>
                  <select
                    className="border rounded px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                    value={hLimit}
                    onChange={(e) => { setHLimit(parseInt(e.target.value)); fetchHistory(selectedUser.userId, 1, true); }}
                    disabled={actionLoading}
                  >
                    {PAGE_SIZES.map(ps => <option key={ps} value={ps}>{ps}</option>)}
                  </select>
                </div>
                <div className="text-sm text-gray-500">
                  第 {hPage}/{hTotalPages} 页
                </div>
              </div>

              {/* 历史记录列表 */}
              <div className="space-y-3 max-h-[60vh] overflow-y-auto">
                {hLoading ? (
                  <div className="text-center py-8 text-gray-500">
                    <svg className="animate-spin h-6 w-6 mx-auto mb-2 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    加载中...
                  </div>
                ) : history.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <FaComments className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                    暂无消息
                  </div>
                ) : (
                  history.map((m, idx) => (
                    <motion.div
                      key={m.id}
                      className="p-4 border border-gray-200 rounded-lg"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3, delay: 0.05 * idx }}
                    >
                      <div className="flex items-center justify-between text-xs text-gray-500 mb-2">
                        <div className="flex items-center gap-2 min-w-0 flex-1 max-w-full">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium flex-shrink-0 ${
                            m.role === 'user' 
                              ? 'bg-blue-100 text-blue-800' 
                              : 'bg-green-100 text-green-800'
                          }`}>
                            {m.role === 'user' ? '用户' : '助手'}
                          </span>
                          <span className="truncate max-w-32">{formatTs(m.timestamp)}</span>
                        </div>
                        <div className="font-mono text-[10px] text-gray-400 truncate max-w-28 ml-2 flex-shrink-0" title={m.id}>
                          {m.id.length > 16 ? `${m.id.slice(0, 12)}...${m.id.slice(-4)}` : m.id}
                        </div>
                      </div>
                      <div className="whitespace-pre-wrap break-words text-sm bg-gray-50 p-3 rounded border max-h-40 overflow-y-auto overflow-x-hidden">
                        {m.message}
                      </div>
                    </motion.div>
                  ))
                )}
              </div>

              {/* 历史记录分页控制 */}
              {history.length > 0 && (
                <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-200">
                  <motion.button
                    className="px-4 py-2 border border-gray-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 transition flex items-center gap-2"
                    disabled={hPage <= 1 || actionLoading}
                    onClick={async () => { await fetchHistory(selectedUser.userId, hPage - 1); setNotification({ type: 'info', message: `已切换到第 ${hPage - 1} 页` }); }}
                    whileTap={{ scale: 0.95 }}
                  >
                    <FaChevronLeft className="text-xs" />
                    上一页
                  </motion.button>
                  <motion.button
                    className="px-4 py-2 border border-gray-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 transition flex items-center gap-2"
                    disabled={hPage >= hTotalPages || actionLoading}
                    onClick={async () => { await fetchHistory(selectedUser.userId, hPage + 1); setNotification({ type: 'info', message: `已切换到第 ${hPage + 1} 页` }); }}
                    whileTap={{ scale: 0.95 }}
                  >
                    下一页
                    <FaChevronRight className="text-xs" />
                  </motion.button>
                </div>
              )}
            </>
          )}
        </motion.div>
      </div>
    </motion.div>
  );
};

export default LibreChatAdminPage;
