import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
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
  FaChevronRight,
  FaCode,
  FaEye,
  FaEyeSlash,
  FaExpand,
  FaCompress,
  FaQuestionCircle
} from 'react-icons/fa';
import MarkdownRenderer, { copyTextToClipboard } from './MarkdownRenderer';
import getApiBaseUrl from '../api';
import { useNotification } from './Notification';
import AlertModal from './AlertModal';
import ConfirmModal from './ConfirmModal';
import PromptModal from './PromptModal';
import { UnifiedLoadingSpinner } from './LoadingSpinner';
import { FaCopy as FaCopyIcon } from 'react-icons/fa';
import { TurnstileWidget } from './TurnstileWidget';
import { useTurnstileConfig } from '../hooks/useTurnstileConfig';
import { LibreChatContext, LibreChatContextValue } from './LibreChatContext';
import { LibreChatRealtimeDialog } from './LibreChatRealtimeDialog';

// 将英文标点符号替换为中文标点符号
function convertToChinesePunctuation(text: string): string {
  if (!text) return text;
  return text
    .replace(/\.\.\./g, '…')
    .replace(/,/g, '，')
    .replace(/!/g, '！')
    .replace(/\?/g, '？')
    .replace(/:/g, '：')
    .replace(/;/g, '；')
    .replace(/\[/g, '【')
    .replace(/\]/g, '】')
    .replace(/\{/g, '｛')
    .replace(/\}/g, '｝')
    .replace(/'/g, '’')
    .replace(/\./g, '。');
}

// 兼容部分模型返回的 <think> 思考内容与孤立 </think> 标签
function sanitizeAssistantText(text: string): string {
  if (!text) return text;
  try {
    // 保护数学公式，避免处理其中的换行符
    let processedText = text;

    // 临时替换数学公式，避免被后续处理影响
    const mathBlocks: string[] = [];
    processedText = processedText.replace(/\$\$([\s\S]*?)\$\$/g, (match, content) => {
      mathBlocks.push(match);
      return `__MATH_BLOCK_${mathBlocks.length - 1}__`;
    });

    processedText = processedText.replace(/\$([^$\n]*?)\$/g, (match, content) => {
      mathBlocks.push(match);
      return `__MATH_INLINE_${mathBlocks.length - 1}__`;
    });

    // 处理非数学公式部分
    processedText = processedText
      // 移除完整的 <think ...>...</think> 段落（允许属性，跨行）
      .replace(/<think\b[^>]*>[\s\S]*?<\/?think>/gi, '')
      // 兜底：去掉可能残留的起止标签（含空白）
      .replace(/<\/?\s*think\b[^>]*>/gi, '')
      // 去除常见的可视化标记行（如"已深度思考"/"深度思考"/"Deep Thinking"开头的行）
      .replace(/^\s*(已深度思考|深度思考|Deep\s*Thinking)\b.*$/gmi, '')
      // 折叠多余空行（仅在非数学公式部分）
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    // 恢复数学公式
    mathBlocks.forEach((block, index) => {
      processedText = processedText.replace(`__MATH_BLOCK_${index}__`, block);
      processedText = processedText.replace(`__MATH_INLINE_${index}__`, block);
    });

    return processedText;
  } catch {
    return text;
  }
}

// // 统一规范化 AI 输出（仅保留针对 Mermaid 的断行箭头修复）
// function normalizeAiOutput(input: string): string {
//   if (!input) return input;
//   try {
//     // 仅处理 ```mermaid 代码块：把换行起始的箭头合并到上一行，避免 "\n -->" 导致解析错误
//     return input.replace(/```\s*mermaid\s*[\r\n]+([\s\S]*?)```/gi, (m, code) => {
//       const fixed = code.replace(/\n\s*--[!>]*>/g, ' -->');
//       return '```mermaid\n' + fixed + '\n```';
//     });
//   } catch {
//     return input;
//   }
// }

// React 19: TypeScript 类型定义
interface RequestBody {
  token?: string;
  message?: string;
  cfToken?: string;
  userRole?: string;
  messageId?: string;
}

interface HistoryMessage {
  id?: string;
  role?: string;
  message?: string;
  content?: string;
  timestamp?: string;
  createdAt?: string;
}

// 增强的 Markdown 渲染组件
type EnhancedMarkdownRendererProps = {
  content: string;
  className?: string;
  showControls?: boolean;
  onContentCopy?: (success: boolean, content: string) => void;
  onCodeCopy?: (success: boolean) => void;
};

export const EnhancedMarkdownRenderer: React.FC<EnhancedMarkdownRendererProps> = ({
  content,
  className = "",
  showControls = true,
  onContentCopy,
  onCodeCopy,
}) => {
  const [showRaw, setShowRaw] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  const handleContentCopy = async () => {
    const success = await copyTextToClipboard(content);
    onContentCopy?.(success, content);
  };

  return (
    <div className={`relative group ${className}`}>
      {showControls && (
        <div className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity z-10 flex gap-2">
          <button
            type="button"
            onClick={() => void handleContentCopy()}
            className="p-1.5 bg-gray-100 text-gray-500 rounded hover:bg-gray-200 transition-colors shadow-sm"
            title="复制 Markdown"
          >
            <FaCopyIcon size={12} />
          </button>
          <button
            type="button"
            onClick={() => setShowRaw(!showRaw)}
            className="p-1.5 bg-gray-100 text-gray-500 rounded hover:bg-gray-200 transition-colors shadow-sm"
            title={showRaw ? '显示渲染' : '显示原文'}
          >
            {showRaw ? <FaEyeSlash size={12} /> : <FaEye size={12} />}
          </button>
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1.5 bg-gray-100 text-gray-500 rounded hover:bg-gray-200 transition-colors shadow-sm"
            title={isExpanded ? '缩小' : '展开'}
          >
            {isExpanded ? <FaCompress size={12} /> : <FaExpand size={12} />}
          </button>
        </div>
      )}
      
      <div className={`${isExpanded ? '' : 'max-h-[500px] overflow-y-auto'}`}>
        {showRaw ? (
          <pre className="p-4 bg-gray-50 text-gray-700 rounded-lg text-sm font-mono overflow-auto border border-gray-100 whitespace-pre-wrap">
            {content}
          </pre>
        ) : (
          <MarkdownRenderer content={content} onCodeCopy={onCodeCopy} />
        )}
      </div>
    </div>
  );
};

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
  message?: string;
  timestamp?: string;
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

  // 为 LibreChat 页面添加豁免标记，避免完整性检查器误报
  useEffect(() => {
    // 在页面根元素添加豁免标记
    const rootElement = document.querySelector('#root') || document.body;
    if (rootElement) {
      rootElement.setAttribute('data-component', 'LibreChatPage');
      rootElement.setAttribute('data-page', 'librechat');
    }

    // 清理函数
    return () => {
      if (rootElement) {
        rootElement.removeAttribute('data-component');
        rootElement.removeAttribute('data-page');
      }
    };
  }, []);

  // 作为 8192 tokens 的近似代理，前端采用同等数量的字符上限；
  // 真正的 token 计数应在后端/模型端完成（此处仅做输入侧保护）。
  const MAX_MESSAGE_LEN = 8192;
  const [token, setToken] = useState<string>(() => localStorage.getItem('librechat_token') || '');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');

  const [latest, setLatest] = useState<LatestRecord | null>(null);
  const [loadingLatest, setLoadingLatest] = useState(false);
  const [initializing, setInitializing] = useState(false);

  const [history, setHistory] = useState<HistoryResponse | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [streaming, setStreaming] = useState(false);
  const [streamContent, setStreamContent] = useState('');
  // 批量操作：选中的消息ID
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Turnstile 相关状态
  const { config: turnstileConfig, loading: turnstileConfigLoading } = useTurnstileConfig();
  const [turnstileToken, setTurnstileToken] = useState<string>('');
  const [turnstileVerified, setTurnstileVerified] = useState(false);
  const [turnstileError, setTurnstileError] = useState(false);
  const [turnstileKey, setTurnstileKey] = useState(0);

  // 单次实时对话框状态（与 WebhookEventsManager 模态对齐样式）
  const [rtOpen, setRtOpen] = useState(false);
  const [rtMessage, setRtMessage] = useState('');
  const [rtSending, setRtSending] = useState(false);
  const [rtStreaming, setRtStreaming] = useState(false);
  const [rtStreamContent, setRtStreamContent] = useState('');
  const [rtError, setRtError] = useState('');
  const [rtHistory, setRtHistory] = useState<HistoryItem[]>([]);
  // 持有实时对话的本地流式 interval，便于关闭对话框或卸载时清理
  const rtIntervalRef = useRef<number | null>(null);
  // 组件挂载追踪，避免在卸载后设置状态
  const isMountedRef = useRef(true);
  // 初始化状态追踪，使用ref避免useCallback依赖项循环
  const initializingRef = useRef(false);

  // 自定义弹窗状态
  const [alertModal, setAlertModal] = useState<{ open: boolean; title?: string; message: string; type?: 'warning' | 'danger' | 'info' | 'success' }>({ open: false, message: '' });
  const [confirmModal, setConfirmModal] = useState<{ open: boolean; title?: string; message: string; onConfirm: () => void; type?: 'warning' | 'danger' | 'info' }>({ open: false, message: '', onConfirm: () => { } });
  const [promptModal, setPromptModal] = useState<{ open: boolean; title?: string; message?: string; placeholder?: string; defaultValue?: string; codeEditor?: boolean; language?: string; maxLength?: number; onConfirm: (value: string) => void }>({ open: false, message: '', onConfirm: () => { } });

  const apiBase = useMemo(() => getApiBaseUrl(), []);

  // 复制到剪贴板
  const copyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setNotification({ type: 'success', message: '内容已复制到剪贴板' });
    } catch {
      // fallback
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setNotification({ type: 'success', message: '内容已复制到剪贴板' });
    }
  };

  // 游客模式：当未填写本地 token 时视为游客（服务端通过 HttpOnly Cookie 维持会话）
  const guestMode = useMemo(() => !token, [token]);
  const [guestHintDismissed, setGuestHintDismissed] = useState<boolean>(() => localStorage.getItem('lc_guest_hint_dismissed') === '1');
  useEffect(() => {
    localStorage.setItem('lc_guest_hint_dismissed', guestHintDismissed ? '1' : '0');
  }, [guestHintDismissed]);

  // 检查用户是否为管理员
  const isAdmin = useMemo(() => {
    const userRole = localStorage.getItem('userRole');
    return userRole === 'admin' || userRole === 'administrator';
  }, []);

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

  // 统一的页面初始化函数，避免竞态条件
  const initializePage = useCallback(async () => {
    // 防止重复初始化（使用ref避免依赖项循环）
    if (initializingRef.current) {
      console.log('Already initializing, skipping...');
      return;
    }

    try {
      initializingRef.current = true;
      setInitializing(true);
      console.log('Initializing page, token:', token);

      // 如果没有token，先获取游客token
      if (!token) {
        await ensureGuestToken();
      }

      // 并行获取数据，但等待完成后再更新状态
      const results = await Promise.allSettled([
        fetchLatest(),
        fetchHistory(1)
      ]);

      // 只在组件仍然挂载时设置通知
      if (!isMountedRef.current) return;

      // 根据结果设置通知
      const failures = results.filter(r => r.status === 'rejected');
      if (failures.length === 0) {
        if (!token) {
          setNotification({ type: 'info', message: '已切换到游客模式' });
        } else {
          setNotification({ type: 'success', message: '已切换到用户模式' });
        }
      } else {
        console.error('Some initialization requests failed:', failures);
        setNotification({ type: 'warning', message: '部分数据加载失败，请刷新重试' });
      }
    } catch (error) {
      console.error('Initialization error:', error);
      if (isMountedRef.current) {
        setNotification({ type: 'error', message: '初始化失败，请刷新页面' });
      }
    } finally {
      if (isMountedRef.current) {
        initializingRef.current = false;
        setInitializing(false);
      }
    }
  }, [token]);

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
    if (!id) {
      setNotification({ type: 'warning', message: '无法选择此消息' });
      return;
    }
    setSelectedIds((prev) => {
      const newIds = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id];
      if (newIds.length > prev.length) {
        setNotification({ type: 'info', message: '已选择消息' });
      } else {
        setNotification({ type: 'info', message: '已取消选择消息' });
      }
      return newIds;
    });
  };

  // 批量删除
  const handleBatchDelete = async () => {
    if (selectedIds.length === 0) {
      setNotification({ type: 'warning', message: '请先选择要删除的消息' });
      return;
    }
    setConfirmModal({
      open: true,
      title: '确认批量删除',
      message: `确定批量删除选中的 ${selectedIds.length} 条消息吗？`,
      type: 'danger',
      onConfirm: async () => {
        try {
          setNotification({ type: 'info', message: '正在批量删除消息...' });
          const res = await fetch(`${apiBase}/api/librechat/messages`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify(token ? { token, messageIds: selectedIds } : { messageIds: selectedIds })
          });
          if (res.ok) {
            setSelectedIds([]);
            setNotification({ type: 'success', message: `已删除 ${selectedIds.length} 条消息` });
            await fetchHistory(page);
          } else {
            setNotification({ type: 'error', message: '批量删除失败' });
          }
        } catch (e: unknown) {
          const errorMessage = e instanceof Error ? e.message : '批量删除失败';
          setNotification({ type: 'error', message: errorMessage });
        }
      }
    });
  };

  // 编辑消息
  const handleEdit = async (id?: string, current?: string) => {
    if (!id) {
      setNotification({ type: 'warning', message: '无法编辑此消息' });
      return;
    }
    setPromptModal({
      open: true,
      title: '编辑消息',
      message: '请输入新的消息内容：',
      placeholder: '请输入消息内容',
      defaultValue: current || '',
      codeEditor: true,
      language: 'auto',
      maxLength: MAX_MESSAGE_LEN,
      onConfirm: async (content: string) => {
        if (!content.trim()) {
          setNotification({ type: 'warning', message: '消息内容不能为空' });
          return;
        }
        try {
          setNotification({ type: 'info', message: '正在修改消息...' });
          const res = await fetch(`${apiBase}/api/librechat/message`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(token ? { token, messageId: id, content } : { messageId: id, content })
          });
          if (res.ok) {
            setNotification({ type: 'success', message: '消息修改成功' });
            await fetchHistory(page);
          } else {
            setNotification({ type: 'error', message: '修改失败' });
          }
        } catch (e: unknown) {
          const errorMessage = e instanceof Error ? e.message : '修改失败';
          setNotification({ type: 'error', message: errorMessage });
        }
      }
    });
  };

  // 重试助手消息（携带上下文，覆盖原消息）
  const handleRetry = async (id?: string) => {
    if (!id) {
      setNotification({ type: 'warning', message: '无法重试此消息' });
      return;
    }
    try {
      setNotification({ type: 'info', message: '正在重试AI回复...' });
      const requestBody: RequestBody = token ? { token, messageId: id } : { messageId: id };

      // 管理员发送 userRole 以跳过人机验证
      if (isAdmin) {
        requestBody.userRole = localStorage.getItem('userRole') || undefined;
      } else if (!!turnstileConfig.siteKey && turnstileToken) {
        requestBody.cfToken = turnstileToken;
      }

      const res = await fetch(`${apiBase}/api/librechat/retry`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(requestBody)
      });
      if (res.ok) {
        setNotification({ type: 'success', message: 'AI回复重试成功' });
        await fetchHistory(page);
      } else {
        setNotification({ type: 'error', message: '重试失败' });
      }
    } catch (e: unknown) {
      const errorMessage = e instanceof Error ? e.message : '重试失败';
      setNotification({ type: 'error', message: errorMessage });
    }
  };

  const refreshHistory = () => {
    setNotification({ type: 'info', message: '正在刷新历史记录...' });
    fetchHistory(page);
  };

  const exportCurrentPage = async () => {
    if (!history || !history.history || history.history.length === 0) {
      setNotification({ type: 'warning', message: '当前页无历史记录可导出' });
      return;
    }
    try {
      setNotification({ type: 'info', message: '正在导出当前页历史记录...' });
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
      setNotification({ type: 'success', message: `已导出 ${history.history.length} 条历史记录` });
    } catch (e) {
      setNotification({ type: 'error', message: '导出历史记录失败' });
    }
  };

  // 导出全部历史（后端生成并返回TXT文件）
  const exportAll = async () => {
    try {
      setNotification({ type: 'info', message: '正在导出全部历史记录...' });
      const params = new URLSearchParams();
      if (token) params.set('token', token);
      const res = await fetch(`${apiBase}/api/librechat/export?${params.toString()}`, {
        method: 'GET',
        credentials: 'include'
      });
      if (!res.ok) {
        setNotification({ type: 'error', message: '导出失败，请稍后再试' });
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
      setNotification({ type: 'success', message: '全部历史记录导出成功' });
    } catch (e) {
      setNotification({ type: 'error', message: '导出全部历史记录失败' });
    }
  };

  // 删除单条消息（需要后端返回 id）
  const handleDelete = async (id?: string) => {
    if (!id) {
      setNotification({ type: 'warning', message: '无法删除此消息' });
      return;
    }
    setConfirmModal({
      open: true,
      title: '确认删除',
      message: '确定删除该消息吗？',
      type: 'danger',
      onConfirm: async () => {
        try {
          setNotification({ type: 'info', message: '正在删除消息...' });
          const res = await fetch(`${apiBase}/api/librechat/messages`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(token ? { token, messageIds: [id] } : { messageIds: [id] })
          });
          if (res.ok) {
            setNotification({ type: 'success', message: '消息删除成功' });
            await fetchHistory(page);
          } else {
            setNotification({ type: 'error', message: '删除失败，请稍后再试' });
          }
        } catch {
          setNotification({ type: 'error', message: '删除失败，请稍后再试' });
        }
      }
    });
  };

  const fetchHistory = async (toPage = 1) => {
    console.log('fetchHistory called with page:', toPage); // 调试信息
    try {
      setLoadingHistory(true);
      const params = new URLSearchParams({ page: String(toPage), limit: String(limit) });
      // 若存在 token 则一并传递；否则依赖后端会话中的 userId
      if (token) params.set('token', token);
      const url = `${apiBase}/api/librechat/history?${params.toString()}`;
      console.log('Fetching history from:', url); // 调试信息
      const res = await fetch(url, { credentials: 'include' });
      if (res.ok) {
        const data: unknown = await res.json();
        console.log('History API response:', data); // 调试信息
        // 后端返回的消息字段为 message/timestamp/role，这里映射到前端使用的字段
        const responseData = data as { history?: HistoryItem[]; total?: number; currentPage?: number; totalPages?: number };
        const mapped: HistoryResponse = {
          history: Array.isArray(responseData.history)
            ? responseData.history.map((m: HistoryItem) => {
              console.log('Processing message:', m); // 调试信息
              return {
                id: m.id || `msg_${Date.now()}_${Math.random()}`, // 确保有ID
                role: m.role || 'user', // 简化role判断逻辑
                content: m.message || m.content || '',
                createdAt: m.timestamp || m.createdAt
              };
            })
            : [],
          total: responseData.total || 0,
          currentPage: responseData.currentPage || toPage,
          totalPages: responseData.totalPages || 1
        };
        console.log('Mapped history:', mapped); // 调试信息
        setHistory(mapped);
        setPage(toPage);
        console.log('History updated successfully'); // 调试信息
        if (mapped.history.length > 0) {
          setNotification({ type: 'success', message: `已加载 ${mapped.history.length} 条历史记录` });
        } else {
          setNotification({ type: 'info', message: '暂无历史记录' });
        }
      } else {
        console.error('History API error:', res.status, res.statusText); // 调试信息
        setHistory(null);
        setNotification({ type: 'error', message: '加载历史记录失败' });
      }
    } catch (e) {
      console.error('History fetch error:', e); // 调试信息
      setHistory(null);
      setNotification({ type: 'error', message: '加载历史记录失败，请稍后再试' });
    } finally {
      setLoadingHistory(false);
    }
  };

  // Turnstile 验证处理函数
  const handleTurnstileVerify = (token: string) => {
    setTurnstileToken(token);
    setTurnstileVerified(true);
    setTurnstileError(false);
  };

  const handleTurnstileExpire = () => {
    setTurnstileToken('');
    setTurnstileVerified(false);
    setTurnstileError(false);
  };

  const handleTurnstileError = () => {
    setTurnstileToken('');
    setTurnstileVerified(false);
    setTurnstileError(true);
  };

  const handleSend = async () => {
    setSendError('');
    if (!message.trim()) return;

    // 检查Turnstile验证（管理员除外）
    if (!isAdmin && !!turnstileConfig.siteKey && (!turnstileVerified || !turnstileToken)) {
      setSendError('请先完成人机验证');
      setNotification({ message: '请先完成人机验证', type: 'warning' });
      return;
    }

    // 自动截断超长消息
    let toSend = message;
    if (toSend.length > MAX_MESSAGE_LEN) {
      toSend = toSend.slice(0, MAX_MESSAGE_LEN);
      setSendError(`超出部分已自动截断（最大 ${MAX_MESSAGE_LEN} 字符）`);
      setNotification({ type: 'warning', message: `消息过长，已自动截断（最大 ${MAX_MESSAGE_LEN} 字符）` });
    }

    try {
      setSending(true);
      setStreaming(true);
      setStreamContent('');
      setNotification({ type: 'info', message: '正在发送消息...' });

      console.log('Sending message:', toSend); // 调试信息

      // 构建请求体
      const requestBody: RequestBody = token ? { token, message: toSend } : { message: toSend };

      // 管理员发送 userRole 以跳过人机验证
      if (isAdmin) {
        requestBody.userRole = localStorage.getItem('userRole') || undefined;
      } else if (!!turnstileConfig.siteKey && turnstileToken) {
        requestBody.cfToken = turnstileToken;
      }

      const res = await fetch(`${apiBase}/api/librechat/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(requestBody)
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      console.log('Send response:', data); // 调试信息
      const txtRaw: string = (data && typeof data.response === 'string') ? data.response : '';
      const txt = txtRaw;
      setMessage('');

      // 重置Turnstile状态
      if (!isAdmin) {
        setTurnstileToken('');
        setTurnstileVerified(false);
        setTurnstileKey(k => k + 1);
      }

      console.log('Message sent, waiting for response...'); // 调试信息
      if (txt) {
        console.log('AI response received:', txt.substring(0, 100) + '...'); // 调试信息
        setNotification({ type: 'success', message: 'AI回复已收到，正在生成...' });
      }

      // 检测历史记录中是否已有助手回复的函数
      const checkForExistingAssistantResponse = async () => {
        try {
          const params = new URLSearchParams({ page: '1', limit: '10' });
          if (token) params.set('token', token);
          const checkRes = await fetch(`${apiBase}/api/librechat/history?${params.toString()}`, {
            credentials: 'include'
          });
          if (checkRes.ok) {
            const checkData = await checkRes.json();
            if (checkData.history && Array.isArray(checkData.history)) {
              // 检查最新的几条记录中是否有助手回复
              const recentMessages = checkData.history.slice(0, 5); // 检查最新的5条
              const hasAssistantResponse = recentMessages.some((msg: HistoryMessage) => {
                const role = msg.role || 'user';
                const content = msg.message || msg.content || '';
                return role === 'assistant' && content.trim().length > 0;
              });

              if (hasAssistantResponse) {
                console.log('检测到历史记录中已有助手回复，停止流式展示');
                return true;
              }
            }
          }
        } catch (error) {
          console.warn('检查历史记录失败:', error);
        }
        return false;
      };

      // 智能流式展示：按字符逐步显示，但避免渲染不完整的 Mermaid 代码
      if (txt) {
        let i = 0;
        let checkCounter = 0;
        const startTime = Date.now();
        const maxCheckDuration = 10000; // 最多检测10秒
        const interval = setInterval(async () => {
          // 每5次更新检查一次历史记录，避免过多API调用
          // 并且只在开始后的10秒内进行检测
          checkCounter++;
          const elapsedTime = Date.now() - startTime;
          if (checkCounter % 5 === 0 && elapsedTime < maxCheckDuration) {
            const hasExistingResponse = await checkForExistingAssistantResponse();
            if (hasExistingResponse) {
              clearInterval(interval);
              setStreaming(false);
              setStreamContent('');
              console.log('检测到已有助手回复，立即停止流式展示并刷新历史');
              setNotification({ type: 'info', message: '检测到已有回复，正在刷新历史记录...' });
              fetchHistory(1);
              return;
            }
          }

          i = i + Math.max(1, Math.floor(txt.length / 80)); // 自适应步长
          if (i >= txt.length) {
            setStreamContent(txt);
            clearInterval(interval);
            setStreaming(false);
            // 完成后刷新历史，确保刷新第一页
            console.log('Streaming completed, refreshing history...'); // 调试信息
            setNotification({ type: 'success', message: '对话完成，正在刷新历史记录...' });
            setTimeout(() => {
              console.log('Delayed refresh triggered...'); // 调试信息
              fetchHistory(1);
            }, 2000); // 增加延迟到2秒确保后端数据已保存
          } else {
            const partialContent = txt.slice(0, i);

            // 检查是否包含不完整的 Mermaid 代码块
            const mermaidBlocks = partialContent.match(/```mermaid[\s\S]*?```/g) || [];
            const hasIncompleteMermaid = mermaidBlocks.some(block => {
              const code = block.replace(/```mermaid\n?/, '').replace(/```$/, '');
              const trimmed = code.trim();

              // 检查是否包含基本的 Mermaid 语法结构
              const hasGraphKeyword = /^(graph|flowchart|sequenceDiagram|classDiagram|stateDiagram|erDiagram|journey|gantt|pie|gitgraph|mindmap|timeline|zenuml|sankey)/i.test(trimmed);
              const hasEndMarker = /end\s*$/i.test(trimmed) || /}\s*$/i.test(trimmed) || /\)\s*$/i.test(trimmed);
              const hasBalancedBraces = (trimmed.match(/\{/g) || []).length === (trimmed.match(/\}/g) || []).length;
              const hasBalancedParens = (trimmed.match(/\(/g) || []).length === (trimmed.match(/\)/g) || []).length;

              // 对于简单的图表，不要求必须有结束标记
              const isSimpleChart = /^(pie|gantt|gitgraph|mindmap|timeline)/i.test(trimmed);

              return hasGraphKeyword && !(isSimpleChart || hasBalancedBraces || hasBalancedParens);
            });

            // 如果包含不完整的 Mermaid 代码，显示提示而不是渲染
            if (hasIncompleteMermaid) {
              const processedContent = partialContent.replace(/```mermaid[\s\S]*?```/g, (match) => {
                return match.replace(/```mermaid\n?/, '```mermaid\n[等待图表完成...]\n');
              });
              setStreamContent(processedContent);
            } else {
              setStreamContent(partialContent);
            }
          }
        }, 30);
      } else {
        setStreaming(false);
        setNotification({ type: 'warning', message: 'AI未返回有效回复，正在刷新历史记录...' });
        // 即使没有回复内容，也要刷新历史记录
        setTimeout(() => {
          fetchHistory(1);
        }, 500);
      }
    } catch (e) {
      console.error('Send message error:', e); // 调试信息
      setSendError('发送失败，请稍后再试');
      setStreaming(false);
      setNotification({ type: 'error', message: '发送消息失败，请稍后再试' });
    } finally {
      setSending(false);
    }
  };

  const handleClear = async () => {
    try {
      setNotification({ type: 'info', message: '正在清除历史记录...' });

      // 构建请求体，确保包含token信息
      const requestBody: RequestBody = {};
      if (token && token.trim()) {
        requestBody.token = token;
      }

      console.log('清除历史记录请求体:', requestBody); // 调试信息

      const res = await fetch(`${apiBase}/api/librechat/clear`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(requestBody)
      });

      if (res.ok) {
        const result = await res.json();
        console.log('清除历史记录成功:', result); // 调试信息
        setNotification({ type: 'success', message: '历史记录已清除' });

        // 清除本地状态
        setHistory(null);
        setSelectedIds([]);

        // 重新获取历史记录（应该为空）
        await fetchHistory(1);
      } else {
        const errorData = await res.json().catch(() => ({}));
        console.error('清除历史记录失败:', res.status, errorData); // 调试信息
        setNotification({ type: 'error', message: errorData.error || '清除历史记录失败' });
      }
    } catch (e) {
      console.error('清除历史记录异常:', e); // 调试信息
      setNotification({ type: 'error', message: '清除历史记录失败，请稍后再试' });
    }
  };

  // 移除重复的初始化逻辑，避免与下面的token useEffect产生冲突

  // 组件卸载时，确保清理实时流式 interval 和 SSE 连接，避免遗留计时器导致状态异常
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (rtIntervalRef.current) {
        clearInterval(rtIntervalRef.current);
        rtIntervalRef.current = null;
      }
      // 清理SSE连接
      if (sseRef.current) {
        sseRef.current.close();
        sseRef.current = null;
      }
    };
  }, []);

  // token 变更时统一初始化，避免竞态条件
  useEffect(() => {
    console.log('Token changed, initializing page...', token);
    initializePage();
  }, [token, initializePage]);

  // 打开/关闭单次实时对话框
  const openRealtimeDialog = () => {
    // 清理可能遗留的 interval
    if (rtIntervalRef.current) {
      clearInterval(rtIntervalRef.current);
      rtIntervalRef.current = null;
    }
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
    // 关闭对话框时，确保停止任何仍在进行的本地流式 interval
    if (rtIntervalRef.current) {
      clearInterval(rtIntervalRef.current);
      rtIntervalRef.current = null;
    }
    setRtStreaming(false);
    setRtOpen(false);
  };

  // 对话框内发送（实时，支持上下文）
  const handleRealtimeSend = async () => {
    setRtError('');
    if (rtSending || rtStreaming) {
      setNotification({ type: 'warning', message: '正在处理中，请稍候...' });
      return; // 避免并发发送
    }
    if (!rtMessage.trim()) {
      setNotification({ type: 'warning', message: '请输入消息内容' });
      return;
    }

    // 检查Turnstile验证（管理员除外）
    if (!isAdmin && !!turnstileConfig.siteKey && (!turnstileVerified || !turnstileToken)) {
      setRtError('请先完成人机验证');
      setNotification({ message: '请先完成人机验证', type: 'warning' });
      return;
    }

    // 自动截断超长消息
    let toSend = rtMessage;
    if (toSend.length > MAX_MESSAGE_LEN) {
      toSend = toSend.slice(0, MAX_MESSAGE_LEN);
      setRtError(`超出部分已自动截断（最大 ${MAX_MESSAGE_LEN} 字符）`);
      setNotification({ type: 'warning', message: `消息过长，已自动截断（最大 ${MAX_MESSAGE_LEN} 字符）` });
    }
    try {
      setRtSending(true);
      setRtStreaming(true);
      setRtStreamContent('');
      setNotification({ type: 'info', message: '正在发送消息...' });
      // 先把用户消息加入对话框内的本地上下文
      const userEntry: HistoryItem = { role: 'user', content: rtMessage };
      setRtHistory((prev) => [...prev, userEntry]);
      setRtMessage('');
      // 构建请求体
      const requestBody: RequestBody = token ? { token, message: toSend } : { message: toSend };

      // 管理员发送 userRole 以跳过人机验证
      if (isAdmin) {
        requestBody.userRole = localStorage.getItem('userRole') || undefined;
      } else if (!!turnstileConfig.siteKey && turnstileToken) {
        requestBody.cfToken = turnstileToken;
      }

      const res = await fetch(`${apiBase}/api/librechat/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(requestBody)
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      // 客户端模拟流式展示（后端字段为 response）
      const txtRaw: string = (data && typeof data.response === 'string') ? data.response : '';
      const txt = txtRaw;
      // 当后端按"模型身份"规则返回空字符串时，避免渲染空的助手消息
      if (!txt) {
        setRtStreaming(false);
        setRtSending(false);
        return;
      }

      // 检测历史记录中是否已有助手回复的函数（实时对话框版本）
      const checkForExistingAssistantResponseRealtime = async () => {
        try {
          const params = new URLSearchParams({ page: '1', limit: '10' });
          if (token) params.set('token', token);
          const checkRes = await fetch(`${apiBase}/api/librechat/history?${params.toString()}`, {
            credentials: 'include'
          });
          if (checkRes.ok) {
            const checkData = await checkRes.json();
            if (checkData.history && Array.isArray(checkData.history)) {
              // 检查最新的几条记录中是否有助手回复
              const recentMessages = checkData.history.slice(0, 5); // 检查最新的5条
              const hasAssistantResponse = recentMessages.some((msg: HistoryMessage) => {
                const role = msg.role || 'user';
                const content = msg.message || msg.content || '';
                return role === 'assistant' && content.trim().length > 0;
              });

              if (hasAssistantResponse) {
                console.log('实时对话框：检测到历史记录中已有助手回复，停止流式展示');
                return true;
              }
            }
          }
        } catch (error) {
          console.warn('实时对话框：检查历史记录失败:', error);
        }
        return false;
      };

      // 放入一个助手占位项，随着流式更新
      let assistantIndex = -1;
      setRtHistory((prev) => {
        const next = [...prev, { role: 'assistant', content: '' } as HistoryItem];
        assistantIndex = next.length - 1;
        return next;
      });
      // 启动前若已有旧计时器，先行清理
      if (rtIntervalRef.current) {
        clearInterval(rtIntervalRef.current);
        rtIntervalRef.current = null;
      }
      let i = 0;
      let checkCounter = 0;
      const interval = window.setInterval(async () => {
        try {
          // 每5次更新检查一次历史记录，避免过多API调用
          checkCounter++;
          if (checkCounter % 5 === 0) {
            const hasExistingResponse = await checkForExistingAssistantResponseRealtime();
            if (hasExistingResponse) {
              if (rtIntervalRef.current) {
                clearInterval(rtIntervalRef.current);
                rtIntervalRef.current = null;
              }
              setRtStreaming(false);
              setRtSending(false);
              setRtStreamContent('');
              // 移除刚添加的助手占位项
              setRtHistory((prev) => {
                const next = [...prev];
                if (assistantIndex >= 0 && assistantIndex < next.length) {
                  next.splice(assistantIndex, 1);
                }
                return next;
              });
              console.log('实时对话框：检测到已有助手回复，立即停止流式展示并刷新历史');
              setNotification({ type: 'info', message: '检测到已有回复，正在刷新历史记录...' });
              fetchHistory(1);
              return;
            }
          }

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
            if (rtIntervalRef.current) {
              clearInterval(rtIntervalRef.current);
              rtIntervalRef.current = null;
            }
            setRtStreaming(false);
            setRtSending(false);

            // 重置Turnstile状态
            if (!isAdmin) {
              setTurnstileToken('');
              setTurnstileVerified(false);
              setTurnstileKey(k => k + 1);
            }

            // 实时对话框发送完成后也刷新历史记录
            console.log('Realtime dialog completed, refreshing history...'); // 调试信息
            setNotification({ type: 'success', message: '实时对话完成，正在刷新历史记录...' });
            setTimeout(() => {
              fetchHistory(1);
            }, 500);
          } else {
            const partial = txt.slice(0, i);

            // 检查是否包含不完整的 Mermaid 代码块
            const mermaidBlocks = partial.match(/```mermaid[\s\S]*?```/g) || [];
            const hasIncompleteMermaid = mermaidBlocks.some(block => {
              const code = block.replace(/```mermaid\n?/, '').replace(/```$/, '');
              const trimmed = code.trim();

              // 检查是否包含基本的 Mermaid 语法结构
              const hasGraphKeyword = /^(graph|flowchart|sequenceDiagram|classDiagram|stateDiagram|erDiagram|journey|gantt|pie|gitgraph|mindmap|timeline|zenuml|sankey)/i.test(trimmed);
              const hasEndMarker = /end\s*$/i.test(trimmed) || /}\s*$/i.test(trimmed) || /\)\s*$/i.test(trimmed);
              const hasBalancedBraces = (trimmed.match(/\{/g) || []).length === (trimmed.match(/\}/g) || []).length;
              const hasBalancedParens = (trimmed.match(/\(/g) || []).length === (trimmed.match(/\)/g) || []).length;

              // 对于简单的图表，不要求必须有结束标记
              const isSimpleChart = /^(pie|gantt|gitgraph|mindmap|timeline)/i.test(trimmed);

              return hasGraphKeyword && !(isSimpleChart || hasBalancedBraces || hasBalancedParens);
            });

            // 如果包含不完整的 Mermaid 代码，显示提示而不是渲染
            let processedPartial = partial;
            if (hasIncompleteMermaid) {
              processedPartial = partial.replace(/```mermaid[\s\S]*?```/g, (match) => {
                return match.replace(/```mermaid\n?/, '```mermaid\n[等待图表完成...]\n');
              });
            }

            setRtStreamContent(processedPartial);
            setRtHistory((prev) => {
              const next = [...prev];
              if (assistantIndex >= 0 && assistantIndex < next.length) {
                next[assistantIndex] = { ...next[assistantIndex], content: processedPartial } as HistoryItem;
              }
              return next;
            });
          }
        } catch (err) {
          console.error('Realtime stream interval error:', err);
          if (rtIntervalRef.current) {
            clearInterval(rtIntervalRef.current);
            rtIntervalRef.current = null;
          }
          setRtStreaming(false);
          setRtSending(false);
          setRtError('生成中发生错误，已停止');
          setNotification({ type: 'error', message: '实时对话生成过程中出现错误，已停止' });
        }
      }, 30);
      rtIntervalRef.current = interval;
    } catch (e) {
      setRtError('发送失败，请稍后再试');
      setRtStreaming(false);
      setRtSending(false);
      setNotification({ type: 'error', message: '实时对话发送失败，请稍后再试' });
    }
  };

  // 新增：SSE 连接管理
  const [sseConnected, setSseConnected] = useState(false);
  const sseRef = useRef<EventSource | null>(null);

  // 建立SSE连接
  const connectSSE = useCallback(() => {
    if (sseRef.current) {
      sseRef.current.close();
    }

    try {
      const params = new URLSearchParams();
      if (token) params.set('token', token);
      const sseUrl = `${apiBase}/api/librechat/sse?${params.toString()}`;

      const eventSource = new EventSource(sseUrl);
      sseRef.current = eventSource;

      eventSource.onopen = () => {
        console.log('[SSE] 连接已建立');
        setSseConnected(true);
      };

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log('[SSE] 收到消息:', data);

          switch (data.type) {
            case 'connected':
              console.log('[SSE] 连接确认，客户端ID:', data.clientId);
              break;

            case 'ping':
              // 心跳包，保持连接活跃
              break;

            case 'message_completed':
              console.log('[SSE] 消息完成通知:', data.data);
              // 立即停止流式展示并刷新历史记录
              setStreaming(false);
              setStreamContent('');
              setSending(false);
              setRtStreaming(false);
              setRtStreamContent('');
              setRtSending(false);

              // 立即刷新历史记录
              setNotification({ type: 'success', message: 'AI回复已完成，正在刷新历史记录...' });
              fetchHistory(1);
              break;

            case 'retry_completed':
              console.log('[SSE] 重试完成通知:', data.data);
              // 立即停止流式展示并刷新历史记录
              setStreaming(false);
              setStreamContent('');
              setSending(false);
              setRtStreaming(false);
              setRtStreamContent('');
              setRtSending(false);

              // 立即刷新历史记录
              setNotification({ type: 'success', message: 'AI重试已完成，正在刷新历史记录...' });
              fetchHistory(1);
              break;

            default:
              console.log('[SSE] 未知消息类型:', data.type);
          }
        } catch (error) {
          console.error('[SSE] 解析消息失败:', error);
        }
      };

      eventSource.onerror = (error) => {
        console.error('[SSE] 连接错误:', error);
        setSseConnected(false);

        // 自动重连（延迟3秒）
        setTimeout(() => {
          if (sseRef.current === eventSource) {
            console.log('[SSE] 尝试重新连接...');
            connectSSE();
          }
        }, 3000);
      };

    } catch (error) {
      console.error('[SSE] 建立连接失败:', error);
      setSseConnected(false);
    }
  }, [apiBase, token]);

  // 断开SSE连接
  const disconnectSSE = useCallback(() => {
    if (sseRef.current) {
      sseRef.current.close();
      sseRef.current = null;
      setSseConnected(false);
      console.log('[SSE] 连接已断开');
    }
  }, []);

  // 监听token变化，重新建立SSE连接
  useEffect(() => {
    if (token || guestMode) {
      connectSSE();
    } else {
      disconnectSSE();
    }

    // 组件卸载时清理连接
    return () => {
      disconnectSSE();
    };
  }, [token, guestMode, connectSSE, disconnectSSE]);

  // 初始化加载指示器
  if (initializing && !latest && !history) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center space-y-4">
          <UnifiedLoadingSpinner size="lg" />
          <p className="text-gray-600">正在初始化页面...</p>
        </div>
      </div>
    );
  }

  const contextValue: LibreChatContextValue = {
    state: {
      rtOpen, token, rtMessage, rtSending, rtStreaming, rtError,
      isAdmin, turnstileConfigLoading, turnstileConfig, turnstileVerified, turnstileKey,
      rtHistory, rtStreamContent, MAX_MESSAGE_LEN
    },
    actions: {
      closeRealtimeDialog, setToken, onChangeRtMessage, handleRealtimeSend,
      handleTurnstileVerify, handleTurnstileExpire, handleTurnstileError,
      setNotification, sanitizeAssistantText
    },
    meta: {}
  };

  return (
    <LibreChatContext.Provider value={contextValue}>
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
                  <li>消息编辑和批量删除（支持VSCode Dark+主题代码编辑器）</li>
                  <li>聊天记录导出功能</li>
                  <li>游客模式和用户模式</li>
                  <li>实时通知和自动刷新</li>
                </ul>
              </div>
            </div>
            {/* SSE连接状态指示器 */}
            <div className="flex items-center gap-2 mt-2">
              <div className={`w-2 h-2 rounded-full ${sseConnected ? 'bg-green-500' : 'bg-red-500'}`}></div>
              <span className="text-xs text-gray-500">
                {sseConnected ? '实时连接已建立' : '实时连接已断开'}
              </span>
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
            <UnifiedLoadingSpinner
              size="md"
              text="正在获取最新镜像信息..."
              className="py-8"
            />
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
                      href="mailto:admin@951100.xyz"
                      className="font-medium hover:text-blue-800 transition-colors duration-200 ml-1 underline"
                    >
                      admin@951100.xyz
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
            {!guestMode && token && (
              <span
                className="inline-flex items-center text-xs text-blue-600 bg-blue-50 border border-blue-200 rounded-full px-3 py-1"
                title={`当前Token: ${token.substring(0, 8)}...`}
              >
                <FaUser className="w-3 h-3 mr-1" />
                用户模式
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

            {/* Turnstile 人机验证（非管理员用户） */}
            {!isAdmin && !turnstileConfigLoading && turnstileConfig.siteKey && typeof turnstileConfig.siteKey === 'string' && (
              <motion.div
                className="mt-4 p-4 bg-gray-50 rounded-lg border border-gray-200"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
              >
                <div className="text-sm text-gray-700 mb-3 text-center">
                  人机验证
                  {turnstileVerified && (
                    <span className="ml-2 text-green-600 font-medium">✓ 验证通过</span>
                  )}
                </div>

                <TurnstileWidget
                  key={turnstileKey}
                  siteKey={turnstileConfig.siteKey}
                  onVerify={handleTurnstileVerify}
                  onExpire={handleTurnstileExpire}
                  onError={handleTurnstileError}
                  theme="light"
                  size="normal"
                />

                {turnstileError && (
                  <div className="mt-2 text-sm text-red-500 text-center">
                    验证失败，请重新验证
                  </div>
                )}
              </motion.div>
            )}

            <div className="flex flex-wrap gap-3">
              <motion.button
                onClick={handleSend}
                disabled={sending || (!isAdmin && !!turnstileConfig.siteKey && !turnstileVerified)}
                className="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition font-medium flex items-center gap-2 disabled:opacity-50"
                whileTap={{ scale: 0.95 }}
              >
                <FaPaperPlane className="w-4 h-4" />
                {sending ? '发送中...' : '发送'}
              </motion.button>
              <motion.button
                onClick={() => {
                  setConfirmModal({
                    open: true,
                    title: '确认清除历史',
                    message: '确定要清除所有聊天历史记录吗？此操作不可恢复。',
                    type: 'danger',
                    onConfirm: handleClear
                  });
                }}
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
              <motion.button
                onClick={() => {
                  setPromptModal({
                    open: true,
                    title: '测试代码编辑器',
                    message: '这是一个测试，展示原生代码编辑器功能：',
                    placeholder: '请输入代码内容...',
                    defaultValue: `// 这是一个JavaScript示例
function greet(name) {
  return \`Hello, \${name}!\`;
}

const user = "World";
console.log(greet(user));

// JSON示例
const config = {
  "theme": "vscDarkPlus",
  "language": "javascript",
  "features": ["syntax-highlighting", "line-numbers", "auto-detection"]
};`,
                    codeEditor: true,
                    language: 'auto',
                    maxLength: 5000,
                    onConfirm: (content: string) => {
                      setNotification({ type: 'success', message: '代码编辑器测试完成！' });
                      console.log('测试代码内容:', content);
                    }
                  });
                }}
                className="px-6 py-3 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition font-medium flex items-center gap-2"
                title="测试代码编辑器功能"
                whileTap={{ scale: 0.95 }}
              >
                <FaCode className="w-4 h-4" />
                测试编辑器
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
          {/* 工具栏 */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-3">
            <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
              <FaHistory className="text-lg text-blue-500" />
              聊天历史
              {history && (
                <span className="text-sm text-gray-500 font-normal">
                  (共 {history.total} 条记录)
                </span>
              )}
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
                className={`px-3 py-1 rounded-lg border transition flex items-center gap-1 ${selectedIds.length === 0
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

          {/* 聊天记录内容区域 */}
          <div className="border-t border-gray-200 pt-4">
            {loadingHistory ? (
              <UnifiedLoadingSpinner
                size="md"
                text="正在加载聊天历史..."
                className="py-8"
              />
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
                    <EnhancedMarkdownRenderer
                      content={sanitizeAssistantText(streamContent || '...')}
                      showControls={false}
                      onCodeCopy={(success) => {
                        if (success) {
                          setNotification({ type: 'success', message: '代码已复制' });
                        } else {
                          setNotification({ type: 'error', message: '复制失败' });
                        }
                      }}
                    />
                  </motion.div>
                )}
                {/* 调试信息 */}
                <div className="text-xs text-gray-500 mb-2">
                  历史记录状态: {history ? `已加载 (${history.history.length} 条)` : '未加载'} |
                  加载状态: {loadingHistory ? '加载中' : '已完成'}
                </div>
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
                              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${m.role === 'user'
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
                                <span className={`text-sm font-medium ${m.role === 'user'
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
                        <EnhancedMarkdownRenderer
                          content={m.role === 'user' ? m.content : sanitizeAssistantText(m.content)}
                          showControls={true}
                          onContentCopy={(success) => {
                            if (success) {
                              setNotification({ type: 'success', message: 'Markdown内容已复制到剪贴板' });
                            } else {
                              setNotification({ type: 'error', message: '复制失败' });
                            }
                          }}
                          onCodeCopy={(success) => {
                            if (success) {
                              setNotification({ type: 'success', message: '代码已复制' });
                            } else {
                              setNotification({ type: 'error', message: '复制失败' });
                            }
                          }}
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
                            {m.role !== 'user' && (
                              <motion.button
                                onClick={() => handleRetry(m.id)}
                                className="px-3 py-1 text-xs rounded border border-blue-200 text-blue-600 hover:bg-blue-50 transition flex items-center gap-1"
                                whileTap={{ scale: 0.95 }}
                              >
                                <FaRedo className="w-3 h-3" />
                                重试
                              </motion.button>
                            )}
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
                    {loadingHistory ? '加载中...' : '暂无历史记录'}
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
                  onClick={() => {
                    setNotification({ type: 'info', message: '正在加载上一页...' });
                    fetchHistory(Math.max(1, page - 1));
                  }}
                  whileTap={{ scale: 0.95 }}
                >
                  <FaChevronLeft className="text-xs" />
                  上一页
                </motion.button>
                <motion.button
                  className="px-4 py-2 border border-gray-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 transition flex items-center gap-2"
                  disabled={history ? page >= history.totalPages : true}
                  onClick={() => {
                    setNotification({ type: 'info', message: '正在加载下一页...' });
                    fetchHistory(page + 1);
                  }}
                  whileTap={{ scale: 0.95 }}
                >
                  下一页
                  <FaChevronRight className="text-xs" />
                </motion.button>
              </div>
            )}
          </div>
        </motion.div>

        {/* 单次实时对话框 */}
        <LibreChatRealtimeDialog />

        {/* 自定义弹窗组件 */}
        <AlertModal
          open={alertModal.open}
          onClose={() => setAlertModal({ open: false, message: '' })}
          title={alertModal.title}
          message={alertModal.message}
          type={alertModal.type}
        />

        <ConfirmModal
          open={confirmModal.open}
          onClose={() => setConfirmModal({ open: false, message: '', onConfirm: () => { } })}
          onConfirm={confirmModal.onConfirm}
          title={confirmModal.title}
          message={confirmModal.message}
          type={confirmModal.type}
        />

        <PromptModal
          open={promptModal.open}
          onClose={() => setPromptModal({ open: false, message: '', onConfirm: () => { } })}
          onConfirm={promptModal.onConfirm}
          title={promptModal.title}
          message={promptModal.message}
          placeholder={promptModal.placeholder}
          defaultValue={promptModal.defaultValue}
          codeEditor={promptModal.codeEditor}
          language={promptModal.language}
          maxLength={promptModal.maxLength}
        />
      </motion.div>
    </LibreChatContext.Provider>
  );
};

export default LibreChatPage;
