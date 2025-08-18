import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  FaTimes, 
  FaPaperPlane, 
  FaDownload, 
  FaTrash, 
  FaEdit, 
  FaCopy, 
  FaRedo,
  FaHistory,
  FaUser,
  FaRobot,
  FaExclamationTriangle,
  FaInfoCircle,
  FaEnvelope,
  FaChevronLeft,
  FaChevronRight
} from 'react-icons/fa';
import { marked } from 'marked';
import markedKatex from 'marked-katex-extension';
import 'katex/dist/katex.min.css';
import DOMPurify from 'dompurify';
import getApiBaseUrl from '../api';
import { useNotification } from './Notification';

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
  const { setNotification } = useNotification();
  
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

  // 游客模式：当未填写本地 token 时视为游客（服务端通过 HttpOnly Cookie 维持会话）
  const guestMode = useMemo(() => !token, [token]);
  const [guestHintDismissed, setGuestHintDismissed] = useState<boolean>(() => localStorage.getItem('lc_guest_hint_dismissed') === '1');
  useEffect(() => {
    localStorage.setItem('lc_guest_hint_dismissed', guestHintDismissed ? '1' : '0');
  }, [guestHintDismissed]);

  // 游客须知面板的隐藏状态
  const [guestNoticeDismissed, setGuestNoticeDismissed] = useState<boolean>(() => localStorage.getItem('lc_guest_notice_dismissed') === '1');
  useEffect(() => {
    localStorage.setItem('lc_guest_notice_dismissed', guestNoticeDismissed ? '1' : '0');
  }, [guestNoticeDismissed]);

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

  // 若无本地 token，则尝试申请游客 token（服务端通过 HttpOnly Cookie 下发）
  const ensureGuestToken = async () => {
    if (token) return;
    try {
      await fetch(`${apiBase}/api/librechat/guest`, {
        method: 'POST',
        credentials: 'include',
      });
    } catch {
      // 忽略错误：可能未启用游客模式或网络异常
    }
  };

  const fetchLatest = async () => {
    try {
      setLoadingLatest(true);
      // 优先新API /lc（image_name 字段）；兼容旧API /librechat-image（image_url 字段）
      const res = await fetch(`${apiBase}/api/librechat/lc`, { credentials: 'include' });
      if (res.ok) {
        const data: LatestRecord = await res.json();
        setLatest(data);
      } else {
        const res2 = await fetch(`${apiBase}/api/librechat/librechat-image`, { credentials: 'include' });
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
    if (next.length >= MAX_MESSAGE_LEN) setSendError(`已达到上限，将自动截断发送（${MAX_MESSAGE_LEN} 字符）`);
    else if (sendError) setSendError('');
  };
  const onChangeRtMessage = (val: string) => {
    const next = val.length > MAX_MESSAGE_LEN ? val.slice(0, MAX_MESSAGE_LEN) : val;
    setRtMessage(next);
    if (next.length >= MAX_MESSAGE_LEN) setRtError(`已达到上限，将自动截断发送（${MAX_MESSAGE_LEN} 字符）`);
    else if (rtError) setRtError('');
  };

  // 勾选切换
  const toggleSelect = (id?: string) => {
    if (!id) return;
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));
  };

  // 批量删除
  const handleBatchDelete = async () => {
    if (selectedIds.length === 0) return;
    const yes = confirm(`确定批量删除选中的 ${selectedIds.length} 条消息吗？`);
    if (!yes) return;
    try {
      const res = await fetch(`${apiBase}/api/librechat/messages`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(token ? { token, messageIds: selectedIds } : { messageIds: selectedIds })
      });
      if (res.ok) {
        setSelectedIds([]);
        await fetchHistory(page);
      } else {
        setNotification({ type: 'error', message: '批量删除失败' });
      }
    } catch (e: any) {
      setNotification({ type: 'error', message: e?.message || '批量删除失败' });
    }
  };

  // 编辑消息
  const handleEdit = async (id?: string, current?: string) => {
    if (!id) return;
    const next = prompt('编辑消息内容：', current || '');
    if (next === null) return; // 取消
    const content = next.trim();
    if (!content) return;
    try {
      const res = await fetch(`${apiBase}/api/librechat/message`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(token ? { token, messageId: id, content } : { messageId: id, content })
      });
      if (res.ok) {
        await fetchHistory(page);
      } else {
        setNotification({ type: 'error', message: '修改失败' });
      }
    } catch (e: any) {
      setNotification({ type: 'error', message: e?.message || '修改失败' });
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
    const params = new URLSearchParams();
    if (token) params.set('token', token);
    const res = await fetch(`${apiBase}/api/librechat/export?${params.toString()}`, {
      method: 'GET',
      credentials: 'include'
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
    if (!id) return;
    const yes = confirm('确定删除该消息吗？');
    if (!yes) return;
    const params = new URLSearchParams({ messageId: id });
    if (token) params.set('token', token);
    const res = await fetch(`${apiBase}/api/librechat/message?${params.toString()}`, {
      method: 'DELETE',
      credentials: 'include'
    });
    if (res.ok) {
      fetchHistory(page);
    } else {
      alert('删除失败');
    }
  };

  const fetchHistory = async (toPage = 1) => {
    try {
      setLoadingHistory(true);
      const params = new URLSearchParams({ page: String(toPage), limit: String(limit) });
      // 若存在 token 则一并传递；否则依赖后端会话中的 userId
      if (token) params.set('token', token);
      const res = await fetch(`${apiBase}/api/librechat/history?${params.toString()}`, { credentials: 'include' });
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
    if (!message.trim()) return;
    // 自动截断超长消息
    let toSend = message;
    if (toSend.length > MAX_MESSAGE_LEN) {
      toSend = toSend.slice(0, MAX_MESSAGE_LEN);
      setSendError(`超出部分已自动截断（最大 ${MAX_MESSAGE_LEN} 字符）`);
    }
    try {
      setSending(true);
      setStreaming(true);
      setStreamContent('');
      const res = await fetch(`${apiBase}/api/librechat/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        // 如果无 token，后端将使用登录会话中的 userId
        body: JSON.stringify(token ? { token, message: toSend } : { message: toSend })
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
    try {
      const res = await fetch(`${apiBase}/api/librechat/clear`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(token ? { token } : {})
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
    if (!token) ensureGuestToken();
  }, []);

  useEffect(() => {
    // token 变更时刷新；无 token 也尝试从后端（会话）拉取
    fetchHistory(1);
    if (!token) ensureGuestToken();
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
    if (!rtMessage.trim()) return;
    // 自动截断超长消息
    let toSend = rtMessage;
    if (toSend.length > MAX_MESSAGE_LEN) {
      toSend = toSend.slice(0, MAX_MESSAGE_LEN);
      setRtError(`超出部分已自动截断（最大 ${MAX_MESSAGE_LEN} 字符）`);
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
        body: JSON.stringify(token ? { token, message: toSend } : { message: toSend })
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
          LibreChat 聊天
        </h2>
        <div className="text-gray-600 space-y-2">
          <p>与 LibreChat 进行智能对话，支持历史记录管理、消息编辑和导出功能。</p>
          <div className="flex items-start gap-2 text-sm">
            <div>
              <p className="font-semibold text-blue-700">功能说明：</p>
              <ul className="list-disc list-inside space-y-1 mt-1">
                <li>智能对话和流式响应</li>
                <li>历史记录查看和管理</li>
                <li>消息编辑和批量删除</li>
                <li>聊天记录导出功能</li>
                <li>游客模式和用户模式</li>
              </ul>
            </div>
          </div>
        </div>
      </motion.div>

      {/* 最新镜像信息 */}
      <motion.div
        className="bg-white rounded-xl p-6 shadow-sm border border-gray-200"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
      >
        <h3 className="text-lg font-semibold text-gray-800 mb-3 flex items-center gap-2">
          <FaDownload className="text-lg text-blue-500" />
          LibreChat 最新镜像
        </h3>
        {loadingLatest ? (
          <div className="text-center py-8 text-gray-500">
            <svg className="animate-spin h-8 w-8 mx-auto mb-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            加载中...
          </div>
        ) : latest ? (
          <div className="space-y-3">
            {latest.update_time && (
              <div className="flex items-center gap-2 text-sm text-gray-700">
                <FaInfoCircle className="text-blue-500" />
                <span>更新时间：{latest.update_time}</span>
              </div>
            )}
            {latest.image_name && (
              <div className="flex items-center gap-2 text-sm text-gray-700">
                <FaDownload className="text-green-500" />
                <span>镜像名称：{latest.image_name}</span>
              </div>
            )}
            {latest.image_url && (
              <div className="flex items-center gap-2 text-sm text-gray-700">
                <FaEnvelope className="text-orange-500" />
                <span className="break-all">镜像地址：{latest.image_url}</span>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-8 text-gray-500">
            <FaDownload className="w-12 h-12 mx-auto mb-4 text-gray-300" />
            暂无数据
          </div>
        )}
      </motion.div>

      {/* 游客须知 */}
      <AnimatePresence>
        {guestMode && !guestNoticeDismissed && (
          <motion.div
            className="bg-white rounded-xl p-6 shadow-sm border border-gray-200 relative"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3 }}
          >
            <button
              onClick={() => setGuestNoticeDismissed(true)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors"
              title="关闭并不再提示"
            >
              <FaTimes className="w-5 h-5" />
            </button>
            <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <FaExclamationTriangle className="text-orange-500" />
              使用须知（游客）
            </h3>
            <div className="space-y-4 text-sm text-gray-700">
              <div>
                <p className="font-medium mb-2 text-gray-800">1. 禁止内容范围：</p>
                <ul className="list-disc list-inside ml-4 space-y-1">
                  <li>政治敏感、民族歧视内容</li>
                  <li>色情、暴力、恐怖主义内容</li>
                  <li>侵犯知识产权内容</li>
                  <li>虚假信息或误导性内容</li>
                </ul>
              </div>
              <div>
                <p className="font-medium mb-2 text-gray-800">2. 违规处理措施：</p>
                <ul className="list-disc list-inside ml-4 space-y-1">
                  <li>立即停止服务并封禁账号</li>
                  <li>配合执法部门调查</li>
                  <li>提供使用记录和生成内容</li>
                  <li>保留追究法律责任权利</li>
                </ul>
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                <h4 className="text-blue-700 font-semibold mb-2 flex items-center gap-2">
                  <FaEnvelope className="text-blue-500" />
                  联系我们
                </h4>
                <p className="text-blue-700 text-sm">
                  如有任何问题或建议，请联系开发者：
                  <a
                    href="mailto:admin@hapxs.com"
                    className="font-medium hover:text-blue-800 transition-colors duration-200 ml-1 underline"
                  >
                    admin@hapxs.com
                  </a>
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 发送消息 */}
      <motion.div
        className="bg-white rounded-xl p-6 shadow-sm border border-gray-200"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
            <FaPaperPlane className="text-lg text-blue-500" />
            发送消息
          </h3>
          {guestMode && (
            <span
              className="inline-flex items-center text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded-full px-3 py-1"
              title="未填写令牌，将以游客模式使用 HttpOnly Cookie 维持会话"
            >
              <FaUser className="w-3 h-3 mr-1" />
              游客模式
            </span>
          )}
        </div>
        
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="relative">
              <input
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 transition-all"
                placeholder="请输入 Token"
                value={token}
                onChange={(e) => setToken(e.target.value)}
              />
            </div>
            <div className="relative sm:col-span-2">
              <input
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 transition-all"
                placeholder="请输入消息"
                value={message}
                maxLength={MAX_MESSAGE_LEN}
                onChange={(e) => onChangeMessage(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSend(); }}
              />
            </div>
          </div>
          
          <div className="flex items-center justify-between">
            <div className="text-xs text-gray-400">{message.length}/{MAX_MESSAGE_LEN}</div>
            {guestMode && !guestHintDismissed && (
              <div className="text-xs text-gray-500 flex items-center gap-2">
                <span>当前以游客身份使用，会话通过浏览器 Cookie 保存。</span>
                <button
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                  onClick={() => setGuestHintDismissed(true)}
                  title="不再提示"
                >
                  <FaTimes className="w-3 h-3" />
                </button>
              </div>
            )}
          </div>
          
          {sendError && (
            <div className="text-red-500 text-sm bg-red-50 border border-red-200 rounded-lg p-3">
              {sendError}
            </div>
          )}
          
          <div className="flex flex-wrap gap-3">
            <motion.button
              onClick={handleSend}
              disabled={sending}
              className="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition font-medium flex items-center gap-2 disabled:opacity-50"
              whileTap={{ scale: 0.95 }}
            >
              <FaPaperPlane className="w-4 h-4" />
              {sending ? '发送中...' : '发送'}
            </motion.button>
            <motion.button
              onClick={handleClear}
              className="px-4 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition font-medium"
              whileTap={{ scale: 0.95 }}
            >
              清除历史
            </motion.button>
            <motion.button
              onClick={openRealtimeDialog}
              className="px-6 py-3 bg-green-500 text-white rounded-lg hover:bg-green-600 transition font-medium flex items-center gap-2"
              title="打开单次实时对话框"
              whileTap={{ scale: 0.95 }}
            >
              <FaPaperPlane className="w-4 h-4" />
              单次对话
            </motion.button>
          </div>
        </div>
      </motion.div>

      {/* 聊天历史 */}
      <motion.div
        className="bg-white rounded-xl p-6 shadow-sm border border-gray-200"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-3">
          <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
            <FaHistory className="text-lg text-blue-500" />
            聊天历史
          </h3>
          <div className="flex flex-wrap items-center gap-2 text-sm text-gray-500">
            <span>第 {page} / {history?.totalPages || 1} 页，共 {history?.total || 0} 条</span>
            <motion.button
              onClick={refreshHistory}
              className="px-3 py-1 rounded-lg border border-gray-300 hover:bg-gray-50 transition flex items-center gap-1"
              title="刷新"
              whileTap={{ scale: 0.95 }}
            >
              <FaRedo className="w-3 h-3" />
              刷新
            </motion.button>
            <motion.button
              onClick={exportCurrentPage}
              className="px-3 py-1 rounded-lg border border-gray-300 hover:bg-gray-50 transition flex items-center gap-1"
              title="导出本页"
              whileTap={{ scale: 0.95 }}
            >
              <FaDownload className="w-3 h-3" />
              导出本页
            </motion.button>
            <motion.button
              onClick={exportAll}
              className="px-3 py-1 rounded-lg border border-gray-300 hover:bg-gray-50 transition flex items-center gap-1"
              title="导出全部"
              whileTap={{ scale: 0.95 }}
            >
              <FaDownload className="w-3 h-3" />
              导出全部
            </motion.button>
            <motion.button
              onClick={handleBatchDelete}
              disabled={selectedIds.length === 0}
              className={`px-3 py-1 rounded-lg border transition flex items-center gap-1 ${
                selectedIds.length === 0 
                  ? 'border-gray-200 text-gray-300' 
                  : 'border-red-200 text-red-600 hover:bg-red-50'
              }`}
              title="批量删除所选"
              whileTap={{ scale: 0.95 }}
            >
              <FaTrash className="w-3 h-3" />
              批量删除
            </motion.button>
          </div>
        </div>
        {loadingHistory ? (
          <div className="text-center py-8 text-gray-500">
            <svg className="animate-spin h-8 w-8 mx-auto mb-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            加载中...
          </div>
        ) : (
          <div className="max-h-[60vh] overflow-auto pr-1">
                          {streaming && (
                <motion.div 
                  className="mb-4 p-4 border border-gray-200 rounded-lg bg-white"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-8 h-8 rounded-full bg-green-500 flex items-center justify-center">
                      <FaRobot className="w-4 h-4 text-white" />
                    </div>
                    <div className="flex flex-col">
                      <span className="text-sm font-medium text-green-700">助手</span>
                      <span className="text-xs text-gray-500">生成中...</span>
                    </div>
                  </div>
                <div
                  className="prose prose-sm max-w-none"
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(sanitizeAssistantText(streamContent || '...')) }}
                />
              </motion.div>
            )}
            {history && history.history.length > 0 ? (
              <div className="space-y-4">
                {history.history.map((m: HistoryItem, idx: number) => (
                  <motion.div 
                    key={idx} 
                    className="p-4 border border-gray-200 rounded-lg bg-white"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: 0.05 * idx }}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                            m.role === 'user' 
                              ? 'bg-blue-500' 
                              : 'bg-green-500'
                          }`}>
                            {m.role === 'user' ? (
                              <FaUser className="w-4 h-4 text-white" />
                            ) : (
                              <FaRobot className="w-4 h-4 text-white" />
                            )}
                          </div>
                          <div className="flex flex-col">
                            <span className={`text-sm font-medium ${
                              m.role === 'user' 
                                ? 'text-blue-700' 
                                : 'text-green-700'
                            }`}>
                              {m.role === 'user' ? '用户' : '助手'}
                            </span>
                            {m.createdAt && (
                              <span className="text-xs text-gray-500">{m.createdAt}</span>
                            )}
                          </div>
                        </div>
                      </div>
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
                        <motion.button
                          onClick={() => copyText(m.role === 'user' ? m.content : sanitizeAssistantText(m.content))}
                          className="px-2 py-1 text-xs rounded border border-gray-300 hover:bg-gray-50 transition flex items-center gap-1"
                          whileTap={{ scale: 0.95 }}
                        >
                          <FaCopy className="w-3 h-3" />
                          复制
                        </motion.button>
                      </div>
                    </div>
                    <div
                      className="prose prose-sm max-w-none bg-gray-50 p-3 rounded border"
                      dangerouslySetInnerHTML={{ __html: renderMarkdown(m.role === 'user' ? m.content : sanitizeAssistantText(m.content)) }}
                    />
                    {m.id && (
                      <div className="mt-3 flex justify-end gap-2">
                        <motion.button
                          onClick={() => handleEdit(m.id, m.content)}
                          className="px-3 py-1 text-xs rounded border border-gray-300 hover:bg-gray-50 transition flex items-center gap-1"
                          whileTap={{ scale: 0.95 }}
                        >
                          <FaEdit className="w-3 h-3" />
                          编辑
                        </motion.button>
                        <motion.button
                          onClick={() => handleDelete(m.id)}
                          className="px-3 py-1 text-xs rounded border border-red-200 text-red-600 hover:bg-red-50 transition flex items-center gap-1"
                          whileTap={{ scale: 0.95 }}
                        >
                          <FaTrash className="w-3 h-3" />
                          删除
                        </motion.button>
                      </div>
                    )}
                  </motion.div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12 text-gray-500">
                <FaHistory className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                暂无历史记录
              </div>
            )}
          </div>
        )}
        {/* 分页控制 */}
        {history && history.history.length > 0 && (
          <div className="flex items-center justify-between mt-6 pt-4 border-t border-gray-200">
            <motion.button
              className="px-4 py-2 border border-gray-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 transition flex items-center gap-2"
              disabled={page <= 1}
              onClick={() => fetchHistory(Math.max(1, page - 1))}
              whileTap={{ scale: 0.95 }}
            >
              <FaChevronLeft className="text-xs" />
              上一页
            </motion.button>
            <motion.button
              className="px-4 py-2 border border-gray-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 transition flex items-center gap-2"
              disabled={history ? page >= history.totalPages : true}
              onClick={() => fetchHistory(page + 1)}
              whileTap={{ scale: 0.95 }}
            >
              下一页
              <FaChevronRight className="text-xs" />
            </motion.button>
          </div>
        )}
      </motion.div>

      {/* 单次实时对话框 */}
      <AnimatePresence>
        {rtOpen && (
          <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="w-full max-w-2xl bg-white rounded-xl p-6 shadow-sm border border-gray-200 relative"
            >
              <div className="flex items-center mb-4 pr-10">
                <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                  <FaPaperPlane className="text-blue-500" />
                  实时对话（支持上下文）
                </h3>
                <button
                  onClick={closeRealtimeDialog}
                  className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 hover:bg-gray-100 bg-white transition-colors"
                  aria-label="关闭"
                  title="关闭"
                >
                  <FaTimes className="w-4 h-4" />
                </button>
              </div>
              
              <div className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-3">
                  <input
                    className="border-2 border-gray-200 rounded-lg px-3 py-2 w-full focus:outline-none focus:ring-2 focus:ring-blue-400 transition-all"
                    placeholder="请输入 Token"
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                  />
                  <input
                    className="border-2 border-gray-200 rounded-lg px-3 py-2 w-full sm:col-span-2 focus:outline-none focus:ring-2 focus:ring-blue-400 transition-all"
                    placeholder="请输入消息（支持上下文）"
                    value={rtMessage}
                    maxLength={MAX_MESSAGE_LEN}
                    onChange={(e) => onChangeRtMessage(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !rtSending && !rtStreaming) handleRealtimeSend(); }}
                  />
                </div>
                
                <div className="flex items-center justify-between">
                  <div className="text-xs text-gray-400">{rtMessage.length}/{MAX_MESSAGE_LEN}</div>
                  {rtError && <div className="text-red-500 text-sm">{rtError}</div>}
                </div>
                
                <div className="flex items-center justify-end gap-2">
                  <motion.button
                    onClick={handleRealtimeSend}
                    disabled={rtSending}
                    className="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition disabled:opacity-50 text-sm font-medium flex items-center gap-2"
                    whileTap={{ scale: 0.95 }}
                  >
                    <FaPaperPlane className="w-4 h-4" />
                    {rtSending ? '发送中...' : '发送'}
                  </motion.button>
                </div>
                
                <div className="mt-4">
                  {rtHistory.length > 0 ? (
                    <div className="space-y-3 max-h-[45vh] overflow-auto pr-1">
                      {rtHistory.map((m, idx) => (
                        <motion.div 
                          key={idx} 
                          className="p-4 border border-gray-200 rounded-lg bg-white"
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                        >
                          <div className="flex items-center gap-3 mb-3">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                              m.role === 'user' 
                                ? 'bg-blue-500' 
                                : 'bg-green-500'
                            }`}>
                              {m.role === 'user' ? (
                                <FaUser className="w-4 h-4 text-white" />
                              ) : (
                                <FaRobot className="w-4 h-4 text-white" />
                              )}
                            </div>
                            <div className="flex flex-col">
                              <span className={`text-sm font-medium ${
                                m.role === 'user' 
                                  ? 'text-blue-700' 
                                  : 'text-green-700'
                              }`}>
                                {m.role === 'user' ? '用户' : '助手'}
                                {rtStreaming && idx === rtHistory.length - 1 ? '（生成中...）' : ''}
                              </span>
                            </div>
                          </div>
                          <div
                            className="prose prose-sm max-w-none bg-gray-50 p-3 rounded border"
                            dangerouslySetInnerHTML={{ __html: renderMarkdown(m.role === 'user' ? m.content : sanitizeAssistantText(m.content)) }}
                          />
                        </motion.div>
                      ))}
                    </div>
                  ) : rtStreaming || rtStreamContent ? (
                    <motion.div 
                      className="p-4 border border-gray-200 rounded-lg bg-white"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                    >
                      <div className="flex items-center gap-3 mb-3">
                        <div className="w-8 h-8 rounded-full bg-green-500 flex items-center justify-center">
                          <FaRobot className="w-4 h-4 text-white" />
                        </div>
                        <div className="flex flex-col">
                          <span className="text-sm font-medium text-green-700">
                            助手{rtStreaming ? '（生成中...）' : ''}
                          </span>
                        </div>
                      </div>
                      <div
                        className="prose prose-sm max-w-none bg-gray-50 p-3 rounded border"
                        dangerouslySetInnerHTML={{ __html: renderMarkdown(sanitizeAssistantText(rtStreamContent || '')) }}
                      />
                    </motion.div>
                  ) : (
                    <div className="text-center py-8 text-gray-500">
                      <FaPaperPlane className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                      输入内容并点击发送以开始单次对话
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default LibreChatPage;
