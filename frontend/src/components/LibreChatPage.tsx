import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { FaTimes, FaPaperPlane } from 'react-icons/fa';
import { marked } from 'marked';
import markedKatex from 'marked-katex-extension';
import 'katex/dist/katex.min.css';
import DOMPurify from 'dompurify';
import getApiBaseUrl from '../api';

// 兼容部分模型返回的 <think> 思考内容与孤立 </think> 标签
function sanitizeAssistantText(text: string): string {
  if (!text) return text;
  try {
    return text
      // 移除完整的 <think ...>...</think> 段落（允许属性，跨行）
      .replace(/<think\b[^>]*>[\s\S]*?<\/?think>/gi, '')
      // 兜底：去掉可能残留的起止标签（含空白）
      .replace(/<\/?\s*think\b[^>]*>/gi, '')
      // 去除常见的可视化标记行（如“已深度思考”/“深度思考”/“Deep Thinking”开头的行）
      .replace(/^\s*(已深度思考|深度思考|Deep\s*Thinking)\b.*$/gmi, '')
      // 折叠多余空行
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  } catch {
    return text;
  }
}

// 配置 marked 支持 KaTeX
marked.use(markedKatex({ nonStandard: true }));

// 渲染并净化 Markdown
function renderMarkdown(content: string): string {
  try {
    const rawHtml = marked.parse(content || '', { async: false } as any) as unknown as string;
    return DOMPurify.sanitize(rawHtml, {
      ALLOWED_TAGS: [
        'p', 'br', 'pre', 'code', 'span', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
        'ul', 'ol', 'li', 'strong', 'em', 'table', 'thead', 'tbody', 'tr', 'th', 'td',
        'a', 'img', 'blockquote'
      ],
      ALLOWED_ATTR: ['href', 'title', 'alt', 'src', 'class', 'id', 'target', 'rel']
    });
  } catch (e) {
    // 回退为纯文本
    const safe = (content || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    return `<pre>${safe}</pre>`;
  }
}

// 复制到剪贴板
async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // fallback
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  }
}

// 导出当前页为 TXT
function downloadTextFile(filename: string, content: string) {
  // Ensure UTF-8 with BOM so Windows Notepad detects encoding correctly
  const utf8Content = content.startsWith('\uFEFF') ? content : '\uFEFF' + content;
  const blob = new Blob([utf8Content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

interface LatestRecord {
  update_time?: string;
  image_url?: string;
  image_name?: string;
}

interface HistoryItem {
  id?: string; // 可选：后端如返回则支持按消息删除
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
  // 作为 8192 tokens 的近似代理，前端采用同等数量的字符上限；
  // 真正的 token 计数应在后端/模型端完成（此处仅做输入侧保护）。
  const MAX_MESSAGE_LEN = 8192;
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
  // 批量操作：选中的消息ID
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // 单次实时对话框状态（与 WebhookEventsManager 模态对齐样式）
  const [rtOpen, setRtOpen] = useState(false);
  const [rtMessage, setRtMessage] = useState('');
  const [rtSending, setRtSending] = useState(false);
  const [rtStreaming, setRtStreaming] = useState(false);
  const [rtStreamContent, setRtStreamContent] = useState('');
  const [rtError, setRtError] = useState('');
  const [rtHistory, setRtHistory] = useState<HistoryItem[]>([]);

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

  // 受控输入：限制长度
  const onChangeMessage = (val: string) => {
    const next = val.length > MAX_MESSAGE_LEN ? val.slice(0, MAX_MESSAGE_LEN) : val;
    setMessage(next);
    if (next.length >= MAX_MESSAGE_LEN) setSendError(`消息已达上限（${MAX_MESSAGE_LEN} 字符）`);
    else if (sendError) setSendError('');
  };
  const onChangeRtMessage = (val: string) => {
    const next = val.length > MAX_MESSAGE_LEN ? val.slice(0, MAX_MESSAGE_LEN) : val;
    setRtMessage(next);
    if (next.length >= MAX_MESSAGE_LEN) setRtError(`消息已达上限（${MAX_MESSAGE_LEN} 字符）`);
    else if (rtError) setRtError('');
  };

  // 勾选切换
  const toggleSelect = (id?: string) => {
    if (!id) return;
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));
  };

  // 批量删除
  const handleBatchDelete = async () => {
    if (!token || selectedIds.length === 0) return;
    const yes = confirm(`确定批量删除选中的 ${selectedIds.length} 条消息吗？`);
    if (!yes) return;
    try {
      const res = await fetch(`${apiBase}/api/librechat/messages`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ token, messageIds: selectedIds })
      });
      if (res.ok) {
        setSelectedIds([]);
        await fetchHistory(page);
      } else {
        alert('批量删除失败');
      }
    } catch {
      alert('批量删除失败');
    }
  };

  // 编辑消息
  const handleEdit = async (id?: string, current?: string) => {
    if (!token || !id) return;
    const next = prompt('编辑消息内容：', current || '');
    if (next === null) return; // 取消
    const content = next.trim();
    if (!content) return;
    try {
      const res = await fetch(`${apiBase}/api/librechat/message`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ token, messageId: id, content })
      });
      if (res.ok) {
        await fetchHistory(page);
      } else {
        alert('修改失败');
      }
    } catch {
      alert('修改失败');
    }
  };

  const refreshHistory = () => {
    fetchHistory(page);
  };

  const exportCurrentPage = async () => {
    if (!history || !history.history || history.history.length === 0) return;
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10);
    const header = `LibreChat 历史导出（当前页）\n导出时间：${now.toLocaleString()}\n总条数：${history.history.length}\n\n`;
    const lines = history.history.map((m, idx) => {
      const role = m.role === 'user' ? '用户' : '助手';
      const content = m.role === 'user' ? m.content : sanitizeAssistantText(m.content);
      const ts = m.createdAt ? ` @ ${m.createdAt}` : '';
      return `#${idx + 1} 【${role}${ts}】\n${content}\n`;
    });
    const txt = header + lines.join('\n');
    downloadTextFile(`LibreChat_聊天历史_第${page}页_${dateStr}.txt`, txt);
  };

  // 导出全部历史（后端生成并返回TXT文件）
  const exportAll = async () => {
    if (!token) return;
    const params = new URLSearchParams({ token });
    const res = await fetch(`${apiBase}/api/librechat/export?${params.toString()}`, {
      method: 'GET',
      credentials: 'same-origin'
    });
    if (!res.ok) {
      alert('导出失败');
      return;
    }
    // Try to normalize to UTF-8 with BOM for broad editor compatibility
    const originalBlob = await res.blob();
    let blob: Blob;
    try {
      const text = await originalBlob.text();
      const utf8Text = text.startsWith('\uFEFF') ? text : '\uFEFF' + text;
      blob = new Blob([utf8Text], { type: 'text/plain;charset=utf-8' });
    } catch {
      // Fallback: if not readable as text, keep original
      blob = originalBlob;
    }
    // 从响应头尝试获取文件名
    const cd = res.headers.get('Content-Disposition') || '';
    const match = /filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i.exec(cd || '');
    let filename = '';
    if (match) {
      filename = decodeURIComponent(match[1] || match[2] || '');
    }
    if (!filename) {
      const date = new Date().toISOString().slice(0, 10);
      filename = `LibreChat_历史_${date}.txt`;
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // 删除单条消息（需要后端返回 id）
  const handleDelete = async (id?: string) => {
    if (!token || !id) return;
    const yes = confirm('确定删除该消息吗？');
    if (!yes) return;
    const params = new URLSearchParams({ token, messageId: id });
    const res = await fetch(`${apiBase}/api/librechat/message?${params.toString()}`, {
      method: 'DELETE',
      credentials: 'same-origin'
    });
    if (res.ok) {
      fetchHistory(page);
    } else {
      alert('删除失败');
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
        const data: any = await res.json();
        // 后端返回的消息字段为 message/timestamp/role，这里映射到前端使用的字段
        const mapped: HistoryResponse = {
          history: Array.isArray(data.history)
            ? data.history.map((m: any) => ({
              id: m.id,
              role: m.role || (m.token ? (m.message ? 'user' : 'assistant') : 'user'),
              content: m.message,
              createdAt: m.timestamp
            }))
            : [],
          total: data.total || 0,
          currentPage: data.currentPage || toPage,
          totalPages: data.totalPages || 1
        };
        setHistory(mapped);
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
    if (message.length > MAX_MESSAGE_LEN) {
      setSendError(`消息超出上限（最大 ${MAX_MESSAGE_LEN} 字符）`);
      return;
    }
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
      const txtRaw: string = (data && typeof data.response === 'string') ? data.response : '';
      const txt = sanitizeAssistantText(txtRaw);
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

  // 打开/关闭单次实时对话框
  const openRealtimeDialog = () => {
    setRtError('');
    setRtMessage('');
    setRtStreamContent('');
    setRtStreaming(false);
    setRtSending(false);
    setRtHistory([]);
    setRtOpen(true);
  };
  const closeRealtimeDialog = () => {
    if (rtSending) return; // 发送中避免误关
    setRtOpen(false);
  };

  // 对话框内发送（实时，支持上下文）
  const handleRealtimeSend = async () => {
    setRtError('');
    if (rtSending || rtStreaming) return; // 避免并发发送
    if (!token) {
      setRtError('请先填写 Token');
      return;
    }
    if (!rtMessage.trim()) return;
    if (rtMessage.length > MAX_MESSAGE_LEN) {
      setRtError(`消息超出上限（最大 ${MAX_MESSAGE_LEN} 字符）`);
      return;
    }
    try {
      setRtSending(true);
      setRtStreaming(true);
      setRtStreamContent('');
      // 先把用户消息加入对话框内的本地上下文
      const userEntry: HistoryItem = { role: 'user', content: rtMessage };
      setRtHistory((prev) => [...prev, userEntry]);
      setRtMessage('');
      const res = await fetch(`${apiBase}/api/librechat/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ token, message: userEntry.content })
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      // 客户端模拟流式展示（后端字段为 response）
      const txtRaw: string = (data && typeof data.response === 'string') ? data.response : '';
      const txt = sanitizeAssistantText(txtRaw);
      // 当后端按“模型身份”规则返回空字符串时，避免渲染空的助手消息
      if (!txt) {
        setRtStreaming(false);
        setRtSending(false);
        return;
      }
      // 放入一个助手占位项，随着流式更新
      let assistantIndex = -1;
      setRtHistory((prev) => {
        const next = [...prev, { role: 'assistant', content: '' } as HistoryItem];
        assistantIndex = next.length - 1;
        return next;
      });
      let i = 0;
      const interval = setInterval(() => {
        i = i + Math.max(1, Math.floor(txt.length / 80));
        if (i >= txt.length) {
          setRtStreamContent(txt); // 兼容旧显示区域
          // 最终写回完整助手内容
          setRtHistory((prev) => {
            const next = [...prev];
            if (assistantIndex >= 0 && assistantIndex < next.length) {
              next[assistantIndex] = { ...next[assistantIndex], content: txt } as HistoryItem;
            }
            return next;
          });
          clearInterval(interval);
          setRtStreaming(false);
          setRtSending(false);
        } else {
          const partial = txt.slice(0, i);
          setRtStreamContent(partial);
          setRtHistory((prev) => {
            const next = [...prev];
            if (assistantIndex >= 0 && assistantIndex < next.length) {
              next[assistantIndex] = { ...next[assistantIndex], content: partial } as HistoryItem;
            }
            return next;
          });
        }
      }, 30);
    } catch (e) {
      setRtError('发送失败，请稍后再试');
      setRtStreaming(false);
      setRtSending(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white w-full rounded-xl shadow-xl p-6 border border-gray-200"
      >
        <h2 className="text-lg font-semibold text-gray-800 mb-3">LibreChat 最新镜像</h2>
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
        className="bg-white w-full rounded-xl shadow-xl p-6 border border-gray-200"
      >
        <h2 className="text-lg font-semibold text-gray-800 mb-3">发送消息</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <input
            className="border-2 border-gray-200 rounded-lg px-3 py-2 w-full focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="请输入 Token"
            value={token}
            onChange={(e) => setToken(e.target.value)}
          />
          <input
            className="border-2 border-gray-200 rounded-lg px-3 py-2 w-full sm:col-span-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="请输入消息"
            value={message}
            maxLength={MAX_MESSAGE_LEN}
            onChange={(e) => onChangeMessage(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSend(); }}
          />
          <div className="text-xs text-gray-400 sm:col-span-2 text-right mt-1">{message.length}/{MAX_MESSAGE_LEN}</div>
        </div>
        {sendError && <div className="text-red-500 text-sm mt-2">{sendError}</div>}
        <div className="mt-3 flex gap-2">
          <button
            onClick={handleSend}
            disabled={sending}
            className="px-5 py-2.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
          >发送</button>
          <button
            onClick={handleClear}
            className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
          >清除历史</button>
          <button
            onClick={openRealtimeDialog}
            className="px-5 py-2.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 flex items-center gap-2"
            title="打开单次实时对话框"
          >
            <FaPaperPlane className="w-4 h-4" /> 单次对话
          </button>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white w-full rounded-xl shadow-xl p-6 border border-gray-200"
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-gray-800">聊天历史</h2>
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <span>第 {page} / {history?.totalPages || 1} 页，共 {history?.total || 0} 条</span>
            <button
              onClick={refreshHistory}
              className="px-3 py-1 rounded-lg border border-gray-300 hover:bg-gray-50"
              title="刷新"
            >刷新</button>
            <button
              onClick={exportCurrentPage}
              className="px-3 py-1 rounded-lg border border-gray-300 hover:bg-gray-50"
              title="导出本页"
            >导出本页</button>
            <button
              onClick={exportAll}
              className="px-3 py-1 rounded-lg border border-gray-300 hover:bg-gray-50"
              title="导出全部"
            >导出全部</button>
            <button
              onClick={handleBatchDelete}
              disabled={selectedIds.length === 0}
              className={`px-3 py-1 rounded-lg border ${selectedIds.length === 0 ? 'border-gray-200 text-gray-300' : 'border-red-200 text-red-600 hover:bg-red-50'}`}
              title="批量删除所选"
            >批量删除</button>
          </div>
        </div>
        {loadingHistory ? (
          <div className="text-gray-500">加载中...</div>
        ) : (
          <div className="max-h-[50vh] overflow-auto pr-1">
            {streaming && (
              <div className="mb-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div></div>
                <div className="p-3 rounded-lg border border-gray-200 bg-white">
                  <div className="text-xs text-gray-500 mb-1">助手（生成中...）</div>
                  <div
                    className="prose prose-sm max-w-none"
                    dangerouslySetInnerHTML={{ __html: renderMarkdown(sanitizeAssistantText(streamContent || '...')) }}
                  />
                </div>
              </div>
            )}
            {history && history.history.length > 0 ? (
              <div className="space-y-2">
                {history.history.map((m: HistoryItem, idx: number) => (
                  <div key={idx} className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {m.role === 'user' ? (
                      <div className="p-3 rounded-lg border border-gray-200 bg-white order-1">
                        <div className="flex items-center justify-between mb-1">
                          <div className="text-xs text-gray-500">用户{m.createdAt ? ` · ${m.createdAt}` : ''}</div>
                          <div className="flex items-center gap-2">
                            {m.id && (
                              <input
                                type="checkbox"
                                className="w-4 h-4"
                                checked={selectedIds.includes(m.id)}
                                onChange={() => toggleSelect(m.id)}
                                title="选择此消息"
                              />
                            )}
                            <button
                              onClick={() => copyText(m.content)}
                              className="text-xs px-2.5 py-1 rounded-lg border border-gray-300 hover:bg-gray-50"
                            >复制</button>
                          </div>
                        </div>
                        <div
                          className="prose prose-sm max-w-none"
                          dangerouslySetInnerHTML={{ __html: renderMarkdown(m.content) }}
                        />
                        {m.id && (
                          <div className="mt-2 text-right">
                            <button
                              onClick={() => handleEdit(m.id, m.content)}
                              className="text-xs px-2.5 py-1 rounded-lg border border-gray-300 hover:bg-gray-50 mr-2"
                            >编辑</button>
                            <button
                              onClick={() => handleDelete(m.id)}
                              className="text-xs px-2.5 py-1 rounded-lg border text-red-600 border-red-200 hover:bg-red-50"
                            >删除</button>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="hidden sm:block"></div>
                    )}
                    {m.role !== 'user' ? (
                      <div className="p-3 rounded-lg border border-gray-200 bg-white order-2">
                        <div className="flex items-center justify-between mb-1">
                          <div className="text-xs text-gray-500">助手{m.createdAt ? ` · ${m.createdAt}` : ''}</div>
                          <div className="flex items-center gap-2">
                            {m.id && (
                              <input
                                type="checkbox"
                                className="w-4 h-4"
                                checked={selectedIds.includes(m.id)}
                                onChange={() => toggleSelect(m.id)}
                                title="选择此消息"
                              />
                            )}
                            <button
                              onClick={() => copyText(sanitizeAssistantText(m.content))}
                              className="text-xs px-2.5 py-1 rounded-lg border border-gray-300 hover:bg-gray-50"
                            >复制</button>
                          </div>
                        </div>
                        <div
                          className="prose prose-sm max-w-none"
                          dangerouslySetInnerHTML={{ __html: renderMarkdown(sanitizeAssistantText(m.content)) }}
                        />
                        {m.id && (
                          <div className="mt-2 text-right">
                            <button
                              onClick={() => handleEdit(m.id, m.content)}
                              className="text-xs px-2.5 py-1 rounded-lg border border-gray-300 hover:bg-gray-50 mr-2"
                            >编辑</button>
                            <button
                              onClick={() => handleDelete(m.id)}
                              className="text-xs px-2.5 py-1 rounded-lg border text-red-600 border-red-200 hover:bg-red-50"
                            >删除</button>
                          </div>
                        )}
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
            className="px-4 py-2 rounded-lg border border-gray-300 hover:bg-gray-50"
            disabled={page <= 1}
          >上一页</button>
          <button
            onClick={() => fetchHistory(page + 1)}
            className="px-4 py-2 rounded-lg border border-gray-300 hover:bg-gray-50"
            disabled={history ? page >= history.totalPages : true}
          >下一页</button>
        </div>
      </motion.div>

      {/* 单次实时对话框（与 WebhookEventsManager 模态风格统一） */}
      {rtOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="w-full max-w-2xl bg-white rounded-xl p-6 shadow-sm border border-gray-200 relative"
          >
            <div className="flex items-center mb-4 pr-10">
              <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                <FaPaperPlane className="text-blue-500" />
                实时对话（支持上下文）
              </h3>
              <button
                onClick={closeRealtimeDialog}
                className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 hover:bg-gray-100 bg-white"
                aria-label="关闭"
                title="关闭"
              >
                <FaTimes className="w-4 h-4" />
              </button>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <input
                className="border-2 border-gray-200 rounded-lg px-3 py-2 w-full focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="请输入 Token"
                value={token}
                onChange={(e) => setToken(e.target.value)}
              />
              <input
                className="border-2 border-gray-200 rounded-lg px-3 py-2 w-full sm:col-span-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="请输入消息（支持上下文）"
                value={rtMessage}
                maxLength={MAX_MESSAGE_LEN}
                onChange={(e) => onChangeRtMessage(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !rtSending && !rtStreaming) handleRealtimeSend(); }}
              />
              <div className="text-xs text-gray-400 sm:col-span-2 text-right mt-1">{rtMessage.length}/{MAX_MESSAGE_LEN}</div>
            </div>
            {rtError && <div className="text-red-500 text-sm mt-2">{rtError}</div>}
            <div className="mt-3 flex items-center justify-end gap-2">
              <motion.button
                onClick={handleRealtimeSend}
                disabled={rtSending}
                className="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition disabled:opacity-50 text-sm font-medium flex items-center gap-2"
                whileTap={{ scale: 0.95 }}
              >
                <FaPaperPlane className="w-4 h-4" /> 发送
              </motion.button>
            </div>
            <div className="mt-4">
              {rtHistory.length > 0 ? (
                <div className="space-y-2 max-h-[45vh] overflow-auto pr-1">
                  {rtHistory.map((m, idx) => (
                    <div key={idx} className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {m.role === 'user' ? (
                        <div className="p-3 rounded-lg border border-gray-200 bg-white order-1">
                          <div className="text-xs text-gray-500 mb-1">用户</div>
                          <div
                            className="prose prose-sm max-w-none"
                            dangerouslySetInnerHTML={{ __html: renderMarkdown(m.content) }}
                          />
                        </div>
                      ) : (
                        <div className="hidden sm:block"></div>
                      )}
                      {m.role !== 'user' ? (
                        <div className="p-3 rounded-lg border border-gray-200 bg-white order-2">
                          <div className="text-xs text-gray-500 mb-1">助手{rtStreaming && idx === rtHistory.length - 1 ? '（生成中...）' : ''}</div>
                          <div
                            className="prose prose-sm max-w-none"
                            dangerouslySetInnerHTML={{ __html: renderMarkdown(sanitizeAssistantText(m.content)) }}
                          />
                        </div>
                      ) : (
                        <div className="hidden sm:block order-2"></div>
                      )}
                    </div>
                  ))}
                </div>
              ) : rtStreaming || rtStreamContent ? (
                <div className="p-3 rounded-lg border border-gray-200 bg-white">
                  <div className="text-xs text-gray-500 mb-1">助手{rtStreaming ? '（生成中...）' : ''}</div>
                  <div
                    className="prose prose-sm max-w-none"
                    dangerouslySetInnerHTML={{ __html: renderMarkdown(sanitizeAssistantText(rtStreamContent || '')) }}
                  />
                </div>
              ) : (
                <div className="text-gray-400 text-sm">输入内容并点击发送以开始单次对话。</div>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
};

export default LibreChatPage;
