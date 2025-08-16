import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import getApiBaseUrl from '../api';
import MarkdownPreview from './MarkdownPreview';

interface LatestRecord {
  update_time?: string;
  image_url?: string;
  image_name?: string;
}

interface HistoryItem {
  role: 'user' | 'assistant' | string;
  content: string;
  createdAt?: string;
}

interface HistoryResponse {
  history: HistoryItem[];
  total: number;
  currentPage: number;
  totalPages: number;
}

const LibreChatPage: React.FC = () => {
  const [token, setToken] = useState<string>(() => localStorage.getItem('librechat_token') || '');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');

  const [latest, setLatest] = useState<LatestRecord | null>(null);
  const [loadingLatest, setLoadingLatest] = useState(false);

  const [history, setHistory] = useState<HistoryResponse | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [streaming, setStreaming] = useState(false);
  const [streamContent, setStreamContent] = useState('');

  const apiBase = useMemo(() => getApiBaseUrl(), []);

  // 将 librechat_token 持久化；若没有则尝试从 URL 和 登录态注入
  useEffect(() => {
    const url = new URL(window.location.href);
    const qpToken = url.searchParams.get('token');
    if (!token && qpToken) {
      setToken(qpToken);
      return;
    }
    if (!token) {
      const authToken = localStorage.getItem('token');
      if (authToken) setToken(authToken);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (token) localStorage.setItem('librechat_token', token);
  }, [token]);

  const fetchLatest = async () => {
    try {
      setLoadingLatest(true);
      // 优先新API /lc（image_name 字段）；兼容旧API /librechat-image（image_url 字段）
      const res = await fetch(`${apiBase}/api/librechat/lc`, { credentials: 'same-origin' });
      if (res.ok) {
        const data: LatestRecord = await res.json();
        setLatest(data);
      } else {
        const res2 = await fetch(`${apiBase}/api/librechat/librechat-image`, { credentials: 'same-origin' });
        if (res2.ok) setLatest(await res2.json());
        else setLatest(null);
      }
    } catch (e) {
      setLatest(null);
    } finally {
      setLoadingLatest(false);
    }
  };

  const fetchHistory = async (toPage = 1) => {
    if (!token) {
      setHistory(null);
      return;
    }
    try {
      setLoadingHistory(true);
      const params = new URLSearchParams({ token, page: String(toPage), limit: String(limit) });
      const res = await fetch(`${apiBase}/api/librechat/history?${params.toString()}`, { credentials: 'same-origin' });
      if (res.ok) {
        const data: HistoryResponse = await res.json();
        setHistory(data);
        setPage(toPage);
      } else {
        setHistory(null);
      }
    } catch (e) {
      setHistory(null);
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleSend = async () => {
    setSendError('');
    if (!token) {
      setSendError('请先填写 Token');
      return;
    }
    if (!message.trim()) return;
    try {
      setSending(true);
      setStreaming(true);
      setStreamContent('');
      const res = await fetch(`${apiBase}/api/librechat/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ token, message })
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const txt: string = (data && typeof data.response === 'string') ? data.response : '';
      setMessage('');
      // 简单的前端流式展示：按字符逐步显示
      if (txt) {
        let i = 0;
        const interval = setInterval(() => {
          i = i + Math.max(1, Math.floor(txt.length / 80)); // 自适应步长
          if (i >= txt.length) {
            setStreamContent(txt);
            clearInterval(interval);
            setStreaming(false);
            // 完成后刷新历史
            fetchHistory(page);
          } else {
            setStreamContent(txt.slice(0, i));
          }
        }, 30);
      } else {
        setStreaming(false);
        await fetchHistory(page);
      }
    } catch (e) {
      setSendError('发送失败，请稍后再试');
      setStreaming(false);
    } finally {
      setSending(false);
    }
  };

  const handleClear = async () => {
    if (!token) return;
    try {
      const res = await fetch(`${apiBase}/api/librechat/clear`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ token })
      });
      if (res.ok) {
        await fetchHistory(1);
      }
    } catch (e) {
      // ignore
    }
  };

  useEffect(() => {
    fetchLatest();
  }, []);

  useEffect(() => {
    if (token) fetchHistory(1);
  }, [token]);

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white/70 backdrop-blur rounded-xl shadow p-4"
      >
        <h2 className="text-lg font-semibold mb-3">LibreChat 最新镜像</h2>
        {loadingLatest ? (
          <div className="text-gray-500">加载中...</div>
        ) : latest ? (
          <div className="text-sm text-gray-700 space-y-1">
            {latest.update_time && <div>更新时间：{latest.update_time}</div>}
            {latest.image_name && <div>镜像名称：{latest.image_name}</div>}
            {latest.image_url && <div>镜像地址：{latest.image_url}</div>}
          </div>
        ) : (
          <div className="text-gray-400">暂无数据</div>
        )}
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white/70 backdrop-blur rounded-xl shadow p-4"
      >
        <h2 className="text-lg font-semibold mb-3">发送消息</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <input
            className="border rounded px-3 py-2 w-full"
            placeholder="请输入 Token"
            value={token}
            onChange={(e) => setToken(e.target.value)}
          />
          <input
            className="border rounded px-3 py-2 w-full sm:col-span-2"
            placeholder="请输入消息"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSend(); }}
          />
        </div>
        {sendError && <div className="text-red-500 text-sm mt-2">{sendError}</div>}
        <div className="mt-3 flex gap-2">
          <button
            onClick={handleSend}
            disabled={sending}
            className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50"
          >发送</button>
          <button
            onClick={handleClear}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
          >清除历史</button>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white/70 backdrop-blur rounded-xl shadow p-4"
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">聊天历史</h2>
          <div className="text-sm text-gray-500">第 {page} / {history?.totalPages || 1} 页，共 {history?.total || 0} 条</div>
        </div>
        {loadingHistory ? (
          <div className="text-gray-500">加载中...</div>
        ) : (
          <div className="max-h-[50vh] overflow-auto pr-1">
            {streaming && (
              <div className="mb-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div></div>
                <div className="p-2 rounded border bg-white/90">
                  <div className="text-xs text-gray-500 mb-1">助手（生成中...）</div>
                  <MarkdownPreview markdown={streamContent || '...'} />
                </div>
              </div>
            )}
            {history && history.history.length > 0 ? (
              <div className="space-y-2">
                {history.history.map((m: HistoryItem, idx: number) => (
                  <div key={idx} className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {m.role === 'user' ? (
                      <div className="p-2 rounded border bg-white/80 order-1">
                        <div className="text-xs text-gray-500 mb-1">用户</div>
                        <MarkdownPreview markdown={m.content} />
                      </div>
                    ) : (
                      <div className="hidden sm:block"></div>
                    )}
                    {m.role !== 'user' ? (
                      <div className="p-2 rounded border bg-white/80 order-2">
                        <div className="text-xs text-gray-500 mb-1">助手</div>
                        <MarkdownPreview markdown={m.content} />
                      </div>
                    ) : (
                      <div className="hidden sm:block order-2"></div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-gray-400">暂无历史</div>
            )}
          </div>
        )}
        <div className="mt-3 flex gap-2">
          <button
            onClick={() => fetchHistory(Math.max(1, page - 1))}
            className="px-3 py-1 border rounded hover:bg-gray-50"
            disabled={page <= 1}
          >上一页</button>
          <button
            onClick={() => fetchHistory(page + 1)}
            className="px-3 py-1 border rounded hover:bg-gray-50"
            disabled={history ? page >= history.totalPages : true}
          >下一页</button>
        </div>
      </motion.div>
    </div>
  );
};

export default LibreChatPage;
