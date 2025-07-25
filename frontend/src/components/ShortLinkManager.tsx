import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FaTrash, FaCopy, FaSearch, FaSync } from 'react-icons/fa';
import { toast } from 'react-toastify';
import { useNotification } from './Notification';
import getApiBaseUrl from '../api';
import { useAuth } from '../hooks/useAuth';

interface ShortLink {
  _id: string;
  code: string;
  target: string;
  createdAt: string;
  userId?: string;
  username?: string;
}

const PAGE_SIZE = 10;

const ShortLinkManager: React.FC = () => {
  const { user } = useAuth();
  const [links, setLinks] = useState<ShortLink[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [createTarget, setCreateTarget] = useState('');
  const [creating, setCreating] = useState(false);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const { setNotification } = useNotification();

  const fetchLinks = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${getApiBaseUrl()}/api/admin/shortlinks?search=${encodeURIComponent(search)}&page=${page}&pageSize=${PAGE_SIZE}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      setLinks(data.items || []);
      setTotal(data.total || 0);
    } catch {
      setLinks([]);
      setTotal(0);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchLinks();
    // eslint-disable-next-line
  }, [search, page]);

  const handleDelete = async (id: string) => {
    if (!window.confirm('确定要删除该短链吗？')) return;
    const token = localStorage.getItem('token');
    await fetch(`${getApiBaseUrl()}/api/admin/shortlinks/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    });
    setHighlightedId(id);
    setTimeout(() => setHighlightedId(null), 800);
    fetchLinks();
    setNotification({ message: '删除成功', type: 'success' });
  };

  const handleCopy = (code: string) => {
    const url = `${window.location.origin}/s/${code}`;
    navigator.clipboard.writeText(url);
    setNotification({ message: '短链已复制到剪贴板', type: 'info' });
  };

  const handleRefresh = () => {
    setRefreshing(true);
    fetchLinks().then(() => setRefreshing(false));
  };

  const handleCreate = async () => {
    if (!createTarget.trim()) {
      setNotification({ message: '请输入目标地址', type: 'warning' });
      return;
    }
    setCreating(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${getApiBaseUrl()}/api/admin/shortlinks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ target: createTarget.trim() })
      });
      const data = await res.json();
      if (data.success) {
        setNotification({ message: '短链创建成功', type: 'success' });
        setCreateTarget('');
        setHighlightedId(data.doc?._id);
        setTimeout(() => setHighlightedId(null), 800);
        fetchLinks();
      } else {
        setNotification({ message: data.error || '创建失败', type: 'error' });
      }
    } catch {
      setNotification({ message: '创建失败', type: 'error' });
    }
    setCreating(false);
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);

  if (!user || user.role !== 'admin') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
        <span style={{ fontSize: 120, lineHeight: 1 }}>🤡</span>
        <div className="text-3xl font-bold mt-6 mb-2 text-rose-600 drop-shadow-lg">你不是管理员，禁止访问！</div>
        <div className="text-lg text-gray-500 mb-8">请用管理员账号登录后再来玩哦~<br/><span className="text-rose-400">（小丑竟是你自己）</span></div>
        <div className="text-base text-gray-400 italic mt-4">仅限管理员使用，恶搞界面仅供娱乐。</div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex flex-col sm:flex-row sm:items-center mb-4 gap-2">
        <motion.input
          className="border rounded px-3 py-2 w-full sm:w-64 focus:ring-2 focus:ring-indigo-400"
          placeholder="搜索短链码或目标地址"
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1); }}
          whileFocus={{ scale: 1.03, borderColor: '#6366f1' }}
        />
        <motion.button
          className="flex items-center justify-center gap-1 px-4 py-2 bg-indigo-500 text-white rounded-lg shadow hover:bg-indigo-600 transition-all duration-150 text-base sm:text-sm w-full sm:w-auto"
          onClick={handleRefresh}
          disabled={refreshing}
          whileTap={{ scale: 0.95 }}
        >
          <FaSync className={refreshing ? 'animate-spin' : ''} /> 刷新
        </motion.button>
      </div>
      <div className="flex flex-col sm:flex-row sm:items-center mb-4 gap-2">
        <motion.input
          className="border rounded px-3 py-2 w-full sm:w-96 focus:ring-2 focus:ring-indigo-400"
          placeholder="请输入要生成短链的目标地址（如 https://...）"
          value={createTarget}
          onChange={e => setCreateTarget(e.target.value)}
          disabled={creating}
          whileFocus={{ scale: 1.03, borderColor: '#22c55e' }}
        />
        <motion.button
          className="flex items-center justify-center gap-1 px-4 py-2 bg-green-500 text-white rounded-lg shadow hover:bg-green-600 transition-all duration-150 text-base sm:text-sm w-full sm:w-auto"
          onClick={handleCreate}
          disabled={creating}
          whileTap={{ scale: 0.95 }}
        >
          {creating ? '创建中…' : '创建短链'}
        </motion.button>
      </div>
      <div className="overflow-x-auto rounded shadow bg-white">
        <table className="min-w-full text-sm text-gray-700">
          <thead>
            <tr className="bg-gray-100">
              <th className="py-2 px-2 sm:px-3 text-left">短链码</th>
              <th className="py-2 px-2 sm:px-3 text-left">目标地址</th>
              <th className="py-2 px-2 sm:px-3 text-left">创建时间</th>
              <th className="py-2 px-2 sm:px-3 text-left">用户</th>
              <th className="py-2 px-2 sm:px-3 text-left">用户ID</th>
              <th className="py-2 px-2 sm:px-3 text-center">操作</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="text-center py-8">加载中…</td></tr>
            ) : links.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-8 text-gray-400">暂无短链，快去生成吧！</td></tr>
            ) : links.map(link => (
              <motion.tr
                key={link._id}
                className={`border-b hover:bg-gray-50 ${highlightedId === link._id ? 'bg-green-100 animate-pulse' : ''}`}
                whileHover={{ y: -2, scale: 1.01 }}
                transition={{ type: 'spring', stiffness: 200, damping: 18 }}
              >
                <td className="py-2 px-2 sm:px-3 font-mono text-blue-600 break-all max-w-[120px] sm:max-w-xs cursor-pointer hover:text-blue-800 transition" onClick={() => window.open(`${getApiBaseUrl()}/s/${link.code}`, '_blank')}>{link.code}</td>
                <td className="py-2 px-2 sm:px-3 break-all max-w-[180px] sm:max-w-xs">{link.target}</td>
                <td className="py-2 px-2 sm:px-3 whitespace-nowrap">{new Date(link.createdAt).toLocaleString()}</td>
                <td className="py-2 px-2 sm:px-3 break-all max-w-[80px] sm:max-w-[120px] text-gray-700">{link.username || 'admin'}</td>
                <td className="py-2 px-2 sm:px-3 break-all max-w-[80px] sm:max-w-[120px] text-gray-500 text-xs">{link.userId || 'admin'}</td>
                <td className="py-2 px-2 sm:px-3 text-center flex gap-2 justify-center">
                  <motion.button
                    className="flex items-center justify-center bg-blue-100 hover:bg-blue-200 text-blue-700 rounded-lg px-2 py-1 sm:px-2 sm:py-1 text-lg sm:text-base shadow transition-all duration-150 relative group"
                    title="复制短链"
                    onClick={() => handleCopy(link.code)}
                    whileTap={{ scale: 0.9 }}
                  >
                    <FaCopy />
                    <span className="hidden lg:block absolute left-1/2 -translate-x-1/2 top-full mt-1 px-2 py-1 text-xs bg-black text-white rounded opacity-0 group-hover:opacity-100 pointer-events-none transition whitespace-nowrap z-20">复制</span>
                  </motion.button>
                  <motion.button
                    className="flex items-center justify-center bg-red-100 hover:bg-red-200 text-red-600 rounded-lg px-2 py-1 sm:px-2 sm:py-1 text-lg sm:text-base shadow transition-all duration-150 relative group"
                    title="删除"
                    onClick={() => handleDelete(link._id)}
                    whileTap={{ scale: 0.9 }}
                  >
                    <FaTrash />
                    <span className="hidden lg:block absolute left-1/2 -translate-x-1/2 top-full mt-1 px-2 py-1 text-xs bg-black text-white rounded opacity-0 group-hover:opacity-100 pointer-events-none transition whitespace-nowrap z-20">删除</span>
                  </motion.button>
                </td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-col sm:flex-row justify-between items-center mt-4 gap-2">
        <span className="text-gray-500 text-sm">共 {total} 条</span>
        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto justify-center items-center">
          <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 disabled:opacity-50 text-base sm:text-sm w-full sm:w-auto">上一页</button>
          <span className="px-2 text-base sm:text-sm flex items-center justify-center min-w-[48px] text-center">{page} / {totalPages || 1}</span>
          <button disabled={page >= totalPages} onClick={() => setPage(page + 1)} className="px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 disabled:opacity-50 text-base sm:text-sm w-full sm:w-auto">下一页</button>
        </div>
      </div>
    </div>
  );
};

export default ShortLinkManager; 