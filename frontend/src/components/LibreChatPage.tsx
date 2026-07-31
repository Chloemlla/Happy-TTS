import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FaTimes,
  FaPaperPlane,
  FaDownload,
  FaTrash,
  FaEdit,
  FaRedo,
  FaHistory,
  FaUser,
  FaRobot,
  FaExclamationTriangle,
  FaInfoCircle,
  FaEnvelope,
  FaChevronLeft,
  FaChevronRight,
  FaEye,
  FaEyeSlash
} from 'react-icons/fa';
import MarkdownRenderer from './MarkdownRenderer';
import getApiBaseUrl from '../api';
import { useAuth } from '../hooks/useAuth';
import type { AiErrorDetails } from '../types/aiDiagnostics';
import { parseAiErrorDetails } from '../utils/aiDiagnostics';
import { AiErrorDetailsPanel } from './AiErrorDetailsPanel';
import { useNotification } from './Notification';
import AlertModal from './AlertModal';
import ConfirmModal from './ConfirmModal';
import PromptModal from './PromptModal';
import { UnifiedLoadingSpinner } from './LoadingSpinner';
import { LibreChatContext, LibreChatContextValue } from './LibreChatContext';
import { LibreChatRealtimeDialog } from './LibreChatRealtimeDialog';
import { getAuthToken } from '../utils/authSession';
import {
  InfoBadge,
  InfoPanel,
  InfoQueryHero,
  InfoQueryShell,
  InfoSectionTitle,
  logShareInputClass,
  logSharePanelClass,
  logSharePrimaryButtonClass,
  logShareSecondaryButtonClass,
  logShareTileClass
} from './LogShareStyleScaffold';

const librePanelClass = logSharePanelClass;
const libreTileClass = logShareTileClass;
const libreInputClass = logShareInputClass;
const librePrimaryButtonClass = logSharePrimaryButtonClass;
const libreGhostButtonClass = logShareSecondaryButtonClass;

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
  aiErrorDetails?: AiErrorDetails;
}

interface HistoryResponse {
  history: HistoryItem[];
  total: number;
  currentPage: number;
  totalPages: number;
  limit?: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function normalizeHistoryItem(value: unknown): HistoryItem | null {
  if (!isRecord(value)) return null;

  const message = readString(value.message);
  const content = readString(value.content);
  return {
    id: readString(value.id),
    role: readString(value.role) || 'user',
    message,
    content: message || content || '',
    timestamp: readString(value.timestamp),
    createdAt: readString(value.timestamp) || readString(value.createdAt),
    aiErrorDetails: parseAiErrorDetails(value.aiErrorDetails),
  };
}

function parseHistoryResponse(data: unknown, fallbackPage: number): HistoryResponse {
  const payload = isRecord(data) ? data : {};
  const history = Array.isArray(payload.history)
    ? payload.history.map(normalizeHistoryItem).filter((item): item is HistoryItem => Boolean(item))
    : [];

  return {
    history,
    total: readNumber(payload.total) || 0,
    currentPage: readNumber(payload.currentPage) || fallbackPage,
    totalPages: readNumber(payload.totalPages) || 1,
  };
}

async function readLibreChatError(response: Response, fallback: string): Promise<string> {
  try {
    const data = await response.clone().json();
    if (typeof data?.error === 'string' && data.error.trim()) return data.error;
    if (typeof data?.message === 'string' && data.message.trim()) return data.message;
  } catch {
    try {
      const text = await response.text();
      if (text.trim()) return text.trim();
    } catch {
      // Ignore unreadable response bodies and use the fallback below.
    }
  }
  return fallback;
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

const LibreChatPage: React.FC = () => {
  const { user } = useAuth();
  const isAdmin = user?.role?.toLowerCase().trim() === 'admin';
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
  const [token, setToken] = useState('');
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
  const [historyView, setHistoryView] = useState<'rendered' | 'source'>('rendered');
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
  const getAdminHistoryHeaders = useCallback((): Record<string, string> | undefined => {
    if (!isAdmin) return undefined;
    const sessionToken = getAuthToken();
    return sessionToken ? { Authorization: `Bearer ${sessionToken}` } : undefined;
  }, [isAdmin]);

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
      return;
    }

    try {
      initializingRef.current = true;
      setInitializing(true);

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
        setNotification({ type: 'warning', message: '部分数据加载失败，请刷新重试' });
      }
    } catch {
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
            credentials: 'include',
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
        const errorMessage = await readLibreChatError(res, '重试失败');
        setNotification({ type: 'error', message: errorMessage });
      }
    } catch (e: unknown) {
      const errorMessage = getErrorMessage(e, '重试失败');
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
      const res = await fetch(`${apiBase}/api/librechat/export`, {
        method: 'GET',
        credentials: 'include',
        headers: token ? { 'x-chat-token': token } : undefined,
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

  const renderChatContent = (
    content: string,
    role: HistoryItem['role'],
    interactive = true,
  ) => {
    const normalized = role === 'user' ? content : sanitizeAssistantText(content);

    if (!interactive) {
      return (
        <MarkdownRenderer
          content={normalized}
          density="compact"
          onCodeCopy={(success) => {
            setNotification({ type: success ? 'success' : 'error', message: success ? '代码已复制' : '复制失败' });
          }}
        />
      );
    }

    return (
      <MarkdownRenderer
        content={normalized}
        density="compact"
        controls={{
          showCopy: true,
          showSourceToggle: true,
          showExpandToggle: true,
          defaultMode: historyView === 'source' ? 'source' : 'rendered',
          defaultExpanded: false,
          collapsedHeight: 520,
        }}
        onContentCopy={(success) => {
          setNotification({ type: success ? 'success' : 'error', message: success ? 'Markdown内容已复制到剪贴板' : '复制失败' });
        }}
        onCodeCopy={(success) => {
          setNotification({ type: success ? 'success' : 'error', message: success ? '代码已复制' : '复制失败' });
        }}
      />
    );
  };

  const fetchHistory = async (toPage = 1) => {
    try {
      setLoadingHistory(true);
      const params = new URLSearchParams({ page: String(toPage), limit: String(limit) });
      const url = `${apiBase}/api/librechat/history?${params.toString()}`;
      const res = await fetch(url, {
        credentials: 'include',
        headers: {
          ...(getAdminHistoryHeaders() || {}),
          ...(token ? { 'x-chat-token': token } : {}),
        },
      });
      if (res.ok) {
        const data: unknown = await res.json();
        const mapped = parseHistoryResponse(data, toPage);
        setHistory(mapped);
        setPage(toPage);
        if (mapped.history.length > 0) {
          setNotification({ type: 'success', message: `已加载 ${mapped.history.length} 条历史记录` });
        } else {
          setNotification({ type: 'info', message: '暂无历史记录' });
        }
      } else {
        const errorMessage = await readLibreChatError(res, '加载历史记录失败');
        setHistory(null);
        setNotification({ type: 'error', message: errorMessage });
      }
    } catch {
      setHistory(null);
      setNotification({ type: 'error', message: '加载历史记录失败，请稍后再试' });
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleSend = async () => {
    setSendError('');
    if (sending || streaming) {
      setNotification({ type: 'warning', message: '正在处理中，请稍候...' });
      return;
    }
    const trimmedMessage = message.trim();
    if (!trimmedMessage) {
      setSendError('请输入消息内容');
      return;
    }

    // 自动截断超长消息
    let toSend = trimmedMessage;
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

      // 构建请求体
      const trimmedToken = token.trim();
      const requestBody: RequestBody = trimmedToken ? { token: trimmedToken, message: toSend } : { message: toSend };

      const res = await fetch(`${apiBase}/api/librechat/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(requestBody)
      });
      if (!res.ok) throw new Error(await readLibreChatError(res, '发送消息失败'));
      const data = await res.json();
      const txtRaw: string = (data && typeof data.response === 'string') ? data.response : '';
      const txt = txtRaw;
      setMessage('');

      if (txt) {
        setNotification({ type: 'success', message: 'AI回复已收到，正在生成...' });
      }

      // 检测历史记录中是否已有助手回复的函数
      const checkForExistingAssistantResponse = async () => {
        try {
          const params = new URLSearchParams({ page: '1', limit: '10' });
          const checkRes = await fetch(`${apiBase}/api/librechat/history?${params.toString()}`, {
            credentials: 'include',
            headers: {
              ...(getAdminHistoryHeaders() || {}),
              ...(token ? { 'x-chat-token': token } : {}),
            },
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
                return true;
              }
            }
          }
        } catch {
          // Ignore history polling failures during optimistic streaming.
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
            setNotification({ type: 'success', message: '对话完成，正在刷新历史记录...' });
            setTimeout(() => {
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
    } catch (error) {
      const errorMessage = getErrorMessage(error, '发送失败，请稍后再试');
      setSendError(errorMessage);
      setStreaming(false);
      setNotification({ type: 'error', message: errorMessage });
    } finally {
      setSending(false);
    }
  };

  const handleClear = async () => {
    try {
      setNotification({ type: 'info', message: '正在清除历史记录...' });

      // 构建请求体，确保包含token信息
      const requestBody: RequestBody = {};
      const trimmedToken = token.trim();
      if (trimmedToken) {
        requestBody.token = trimmedToken;
      }

      const res = await fetch(`${apiBase}/api/librechat/clear`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(requestBody)
      });

      if (res.ok) {
        await res.json().catch(() => ({}));
        setNotification({ type: 'success', message: '历史记录已清除' });

        // 清除本地状态
        setHistory(null);
        setSelectedIds([]);

        // 重新获取历史记录（应该为空）
        await fetchHistory(1);
      } else {
        const errorData = await res.json().catch(() => ({}));
        setNotification({ type: 'error', message: errorData.error || '清除历史记录失败' });
      }
    } catch {
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

    // 自动截断超长消息
    let toSend = rtMessage.trim();
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
      const userEntry: HistoryItem = { role: 'user', content: toSend };
      setRtHistory((prev) => [...prev, userEntry]);
      setRtMessage('');
      // 构建请求体
      const trimmedToken = token.trim();
      const requestBody: RequestBody = trimmedToken ? { token: trimmedToken, message: toSend } : { message: toSend };

      const res = await fetch(`${apiBase}/api/librechat/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(requestBody)
      });
      if (!res.ok) throw new Error(await readLibreChatError(res, '实时对话发送失败'));
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
          const checkRes = await fetch(`${apiBase}/api/librechat/history?${params.toString()}`, {
            credentials: 'include',
            headers: {
              ...(getAdminHistoryHeaders() || {}),
              ...(token ? { 'x-chat-token': token } : {}),
            },
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
                return true;
              }
            }
          }
        } catch {
          // Ignore history polling failures during optimistic realtime streaming.
        }
        return false;
      };

      // 放入一个助手占位项，随着流式更新
      let assistantIndex = -1;
      setRtHistory((prev) => {
        const assistantEntry: HistoryItem = { role: 'assistant', content: '' };
        const next = [...prev, assistantEntry];
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
              const current = next[assistantIndex];
              if (current) {
                next[assistantIndex] = { ...current, content: txt };
              }
              return next;
            });
            if (rtIntervalRef.current) {
              clearInterval(rtIntervalRef.current);
              rtIntervalRef.current = null;
            }
            setRtStreaming(false);
            setRtSending(false);

            // 实时对话框发送完成后也刷新历史记录
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
              const current = next[assistantIndex];
              if (current) {
                next[assistantIndex] = { ...current, content: processedPartial };
              }
              return next;
            });
          }
        } catch {
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
      const errorMessage = getErrorMessage(e, '发送失败，请稍后再试');
      setRtError(errorMessage);
      setRtStreaming(false);
      setRtSending(false);
      setNotification({ type: 'error', message: errorMessage });
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
      const sseUrl = `${apiBase}/api/librechat/sse`;

      const eventSource = new EventSource(sseUrl, { withCredentials: true });
      sseRef.current = eventSource;

      eventSource.onopen = () => {
        setSseConnected(true);
      };

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          switch (data.type) {
            case 'connected':
              break;

            case 'ping':
              // 心跳包，保持连接活跃
              break;

            case 'message_completed':
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
              break;
          }
        } catch {
          // Ignore malformed SSE payloads and keep the connection alive.
        }
      };

      eventSource.onerror = () => {
        setSseConnected(false);

        // 自动重连（延迟3秒）
        setTimeout(() => {
          if (sseRef.current === eventSource) {
            connectSSE();
          }
        }, 3000);
      };

    } catch {
      setSseConnected(false);
    }
  }, [apiBase, token]);

  // 断开SSE连接
  const disconnectSSE = useCallback(() => {
    if (sseRef.current) {
      sseRef.current.close();
      sseRef.current = null;
      setSseConnected(false);
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
      <InfoQueryShell maxWidthClassName="max-w-xl">
        <InfoPanel className="text-center">
          <UnifiedLoadingSpinner size="lg" />
          <p className="mt-4 text-sm text-slate-600">正在初始化页面...</p>
        </InfoPanel>
      </InfoQueryShell>
    );
  }

  const canSend = !sending && !streaming && message.trim().length > 0;
  const rtCanSend = !rtSending && !rtStreaming && rtMessage.trim().length > 0;

  const contextValue: LibreChatContextValue = {
    state: {
      rtOpen, token, rtMessage, rtSending, rtStreaming, rtError,
      rtCanSend,
      rtHistory, rtStreamContent, MAX_MESSAGE_LEN
    },
    actions: {
      closeRealtimeDialog, setToken, onChangeRtMessage, handleRealtimeSend,
      setNotification, sanitizeAssistantText
    },
    meta: {}
  };

  return (
    <LibreChatContext.Provider value={contextValue}>
      <InfoQueryShell>
      <motion.div
        className="space-y-6"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
      >
        <InfoQueryHero
          eyebrow="Entertainment"
          title="LibreChat 聊天"
          description="与 LibreChat 进行智能对话，支持历史记录管理、消息编辑、批量删除、导出和实时通知。"
          icon={FaEnvelope}
          tone="sky"
          meta={
            <>
              <InfoBadge tone={guestMode ? 'slate' : 'sky'}>{guestMode ? '游客模式' : '用户模式'}</InfoBadge>
              <InfoBadge tone={sseConnected ? 'emerald' : 'rose'}>{sseConnected ? '实时连接已建立' : '实时连接已断开'}</InfoBadge>
              <InfoBadge tone="violet">历史记录管理</InfoBadge>
            </>
          }
        />

        {/* 最新镜像信息 */}
        <motion.div
          className={`${librePanelClass} p-5 sm:p-6`}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <InfoSectionTitle title="LibreChat 最新镜像" icon={FaDownload} tone="sky" />
          {loadingLatest ? (
            <UnifiedLoadingSpinner
              size="md"
              text="正在获取最新镜像信息..."
              className="py-8"
            />
          ) : latest ? (
            <div className="space-y-3 text-slate-700">
              {latest.update_time && (
                <div className={`${libreTileClass} flex items-center gap-2 p-3 text-sm`}>
                  <FaInfoCircle className="text-slate-500" />
                  <span>更新时间：{latest.update_time}</span>
                </div>
              )}
              {latest.image_name && (
                <div className={`${libreTileClass} flex items-center gap-2 p-3 text-sm`}>
                  <FaDownload className="text-slate-500" />
                  <span>镜像名称：{latest.image_name}</span>
                </div>
              )}
              {latest.image_url && (
                <div className={`${libreTileClass} flex items-center gap-2 p-3 text-sm`}>
                  <FaEnvelope className="text-orange-500" />
                  <span className="break-all">镜像地址：{latest.image_url}</span>
                </div>
              )}
            </div>
          ) : (
            <div className="py-8 text-center text-slate-500">
              <FaDownload className="mx-auto mb-4 h-12 w-12 text-slate-300" />
              暂无数据
            </div>
          )}
        </motion.div>

        {/* 游客须知 */}
        <AnimatePresence>
          {guestMode && !guestNoticeDismissed && (
            <motion.div
              className={`${librePanelClass} relative p-5 sm:p-6`}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
            >
              <button
                onClick={() => setGuestNoticeDismissed(true)}
                className="absolute right-4 top-4 text-slate-400 transition-colors hover:text-slate-600"
                title="关闭并不再提示"
              >
                <FaTimes className="w-5 h-5" />
              </button>
              <InfoSectionTitle title="使用须知（游客）" icon={FaExclamationTriangle} tone="amber" />
              <div className="space-y-4 text-sm text-slate-700">
                <div>
                  <p className="mb-2 font-medium text-slate-900">1. 禁止内容范围：</p>
                  <ul className="list-disc list-inside ml-4 space-y-1">
                    <li>政治敏感、民族歧视内容</li>
                    <li>色情、暴力、恐怖主义内容</li>
                    <li>侵犯知识产权内容</li>
                    <li>虚假信息或误导性内容</li>
                  </ul>
                </div>
                <div>
                  <p className="mb-2 font-medium text-slate-900">2. 违规处理措施：</p>
                  <ul className="list-disc list-inside ml-4 space-y-1">
                    <li>立即停止服务并封禁账号</li>
                    <li>配合执法部门调查</li>
                    <li>提供使用记录和生成内容</li>
                    <li>保留追究法律责任权利</li>
                  </ul>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                  <h4 className="mb-2 flex items-center gap-2 font-semibold text-slate-700">
                    <FaEnvelope className="text-slate-500" />
                    联系我们
                  </h4>
                  <p className="text-sm text-slate-700">
                    如有任何问题或建议，请联系开发者：
                    <a
                      href="mailto:admin@chloemlla.com"
                      className="ml-1 font-medium underline transition-colors duration-200 hover:text-slate-900"
                    >
                      admin@chloemlla.com
                    </a>
                  </p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 发送消息 */}
        <motion.div
          className={`${librePanelClass} p-5 sm:p-6`}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <InfoSectionTitle
              title="发送消息"
              description="支持游客会话、Token 会话和单次实时对话。"
              icon={FaPaperPlane}
              tone="sky"
            />
            {guestMode && (
              <span
                className="inline-flex items-center rounded-full border border-slate-200 bg-white/80 px-3 py-1 text-xs text-slate-600"
                title="未填写令牌，将以游客模式使用 HttpOnly Cookie 维持会话"
              >
                <FaUser className="w-3 h-3 mr-1" />
                游客模式
              </span>
            )}
            {!guestMode && token && (
              <span
                className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-600"
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
                  className={libreInputClass}
                  aria-label="LibreChat Token"
                  placeholder="请输入 Token"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                />
              </div>
              <div className="relative sm:col-span-2">
                <textarea
                  className={`${libreInputClass} min-h-[96px] resize-y leading-6`}
                  aria-label="聊天消息"
                  placeholder="请输入消息"
                  value={message}
                  maxLength={MAX_MESSAGE_LEN}
                  onChange={(e) => onChangeMessage(e.target.value)}
                  onKeyDown={(e) => {
                    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                      e.preventDefault();
                      void handleSend();
                    }
                  }}
                />
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="text-xs text-slate-400">{message.length}/{MAX_MESSAGE_LEN}</div>
              {guestMode && !guestHintDismissed && (
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <span>当前以游客身份使用，会话通过浏览器 Cookie 保存。</span>
                  <button
                    className="text-slate-400 transition-colors hover:text-slate-600"
                    onClick={() => setGuestHintDismissed(true)}
                    title="不再提示"
                  >
                    <FaTimes className="w-3 h-3" />
                  </button>
                </div>
              )}
            </div>

            {sendError && (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-600">
                {sendError}
              </div>
            )}

            <div className="flex flex-wrap gap-3">
              <motion.button
                onClick={handleSend}
                disabled={!canSend}
                className={`${librePrimaryButtonClass} disabled:cursor-not-allowed disabled:opacity-50`}
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
                className={libreGhostButtonClass}
                whileTap={{ scale: 0.95 }}
              >
                清除历史
              </motion.button>
              <motion.button
                onClick={openRealtimeDialog}
                className={libreGhostButtonClass}
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
          className={`${librePanelClass} p-5 sm:p-6`}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          {/* 工具栏 */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-3">
            <InfoSectionTitle
              title="聊天历史"
              description={history ? `共 ${history.total} 条记录` : '查看、编辑、导出和删除历史消息。'}
              icon={FaHistory}
              tone="violet"
            />
            <div className="flex flex-wrap items-center gap-2 text-sm text-slate-500">
              <span>第 {page} / {history?.totalPages || 1} 页，共 {history?.total || 0} 条</span>
              <div className="inline-flex rounded-2xl border border-slate-200 bg-white/80 p-1">
                <button
                  type="button"
                  onClick={() => setHistoryView('rendered')}
                  className={`inline-flex items-center gap-1 rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
                    historyView === 'rendered' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-50'
                  }`}
                  aria-pressed={historyView === 'rendered'}
                >
                  <FaEye className="w-3 h-3" />
                  渲染
                </button>
                <button
                  type="button"
                  onClick={() => setHistoryView('source')}
                  className={`inline-flex items-center gap-1 rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
                    historyView === 'source' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-50'
                  }`}
                  aria-pressed={historyView === 'source'}
                >
                  <FaEyeSlash className="w-3 h-3" />
                  原文
                </button>
              </div>
              <motion.button
                onClick={refreshHistory}
                className={libreGhostButtonClass}
                title="刷新"
                whileTap={{ scale: 0.95 }}
              >
                <FaRedo className="w-3 h-3" />
                刷新
              </motion.button>
              <motion.button
                onClick={exportCurrentPage}
                className={libreGhostButtonClass}
                title="导出本页"
                whileTap={{ scale: 0.95 }}
              >
                <FaDownload className="w-3 h-3" />
                导出本页
              </motion.button>
              <motion.button
                onClick={exportAll}
                className={libreGhostButtonClass}
                title="导出全部"
                whileTap={{ scale: 0.95 }}
              >
                <FaDownload className="w-3 h-3" />
                导出全部
              </motion.button>
              <motion.button
                onClick={handleBatchDelete}
                disabled={selectedIds.length === 0}
                className={`${libreGhostButtonClass} ${selectedIds.length === 0
                  ? 'text-slate-300'
                  : 'border-rose-200 text-rose-600 hover:bg-rose-50'
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
          <div className="border-t border-white/70 pt-4">
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
                    className="mb-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                  >
                    <div className="flex items-center gap-3 mb-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-slate-50">
                        <FaRobot className="h-4 w-4 text-slate-500" />
                      </div>
                      <div className="flex flex-col">
                        <span className="text-sm font-medium text-slate-700">助手</span>
                        <span className="text-xs text-slate-500">生成中...</span>
                      </div>
                    </div>
                    {renderChatContent(streamContent || '...', 'assistant', false)}
                  </motion.div>
                )}
                {history && history.history.length > 0 ? (
                  <div className="space-y-5">
                    {history.history.map((m: HistoryItem, idx: number) => (
                      <motion.div
                        key={idx}
                        className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.3, delay: 0.05 * idx }}
                      >
                        <div className={`rounded-lg border p-4 shadow-sm ${
                          m.role === 'user'
                            ? 'max-w-[min(92%,_720px)] border-slate-200 bg-slate-50'
                            : 'w-full max-w-[980px] border-slate-200 bg-white'
                        }`}>
                          <div className="mb-3 flex items-center justify-between gap-3">
                            <div className="flex items-center gap-3">
                              <div className="flex items-center gap-2">
                                <div className={`flex h-8 w-8 items-center justify-center rounded-full border ${
                                  m.role === 'user'
                                    ? 'border-slate-300 bg-white text-slate-600'
                                    : 'border-slate-200 bg-slate-50 text-slate-500'
                                  }`}>
                                  {m.role === 'user' ? (
                                    <FaUser className="h-4 w-4" />
                                  ) : (
                                    <FaRobot className="h-4 w-4" />
                                  )}
                                </div>
                                <div className="flex flex-col">
                                  <span className="text-sm font-medium text-slate-700">
                                    {m.role === 'user' ? '用户' : '助手'}
                                  </span>
                                  {m.createdAt && (
                                    <span className="text-xs text-slate-500">{m.createdAt}</span>
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
                                  aria-label="选择此消息"
                                />
                              )}
                            </div>
                          </div>
                          {renderChatContent(m.content, m.role)}
                          {isAdmin && m.role !== 'user' && m.aiErrorDetails && (
                            <AiErrorDetailsPanel diagnostics={m.aiErrorDetails} />
                          )}
                          {m.id && (
                            <div className="mt-3 flex justify-end gap-2">
                              <motion.button
                                onClick={() => handleEdit(m.id, m.content)}
                                className="inline-flex items-center gap-1 rounded-2xl border border-slate-200 bg-white/80 px-3 py-1 text-xs text-slate-700 transition hover:bg-white"
                                whileTap={{ scale: 0.95 }}
                              >
                                <FaEdit className="w-3 h-3" />
                                编辑
                              </motion.button>
                              {m.role !== 'user' && (
                                <motion.button
                                  onClick={() => handleRetry(m.id)}
                                  className="inline-flex items-center gap-1 rounded-2xl border border-slate-200 bg-white/80 px-3 py-1 text-xs text-slate-700 transition hover:bg-white"
                                  whileTap={{ scale: 0.95 }}
                                >
                                  <FaRedo className="w-3 h-3" />
                                  重试
                                </motion.button>
                              )}
                              <motion.button
                                onClick={() => handleDelete(m.id)}
                                className="inline-flex items-center gap-1 rounded-2xl border border-rose-200 bg-rose-50/70 px-3 py-1 text-xs text-rose-700 transition hover:bg-rose-50"
                                whileTap={{ scale: 0.95 }}
                              >
                                <FaTrash className="w-3 h-3" />
                                删除
                              </motion.button>
                            </div>
                          )}
                        </div>
                      </motion.div>
                    ))}
                  </div>
                ) : (
                  <div className="py-12 text-center text-slate-500">
                    <FaHistory className="mx-auto mb-4 h-12 w-12 text-slate-300" />
                    {loadingHistory ? '加载中...' : '暂无历史记录'}
                  </div>
                )}
              </div>
            )}
            {/* 分页控制 */}
            {history && history.history.length > 0 && (
              <div className="mt-6 flex items-center justify-between border-t border-white/70 pt-4">
                <motion.button
                  className={libreGhostButtonClass}
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
                  className={libreGhostButtonClass}
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
      </InfoQueryShell>
    </LibreChatContext.Provider>
  );
};

export default LibreChatPage;
