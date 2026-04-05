import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import type { IconType } from 'react-icons';
import {
  FiAlertCircle,
  FiCheck,
  FiCheckCircle,
  FiChevronLeft,
  FiClock,
  FiCpu,
  FiEdit2,
  FiFilter,
  FiInfo,
  FiMessageSquare,
  FiPlus,
  FiRefreshCw,
  FiSearch,
  FiSend,
  FiShield,
  FiTerminal,
  FiTrash2,
  FiUser,
  FiX,
} from 'react-icons/fi';
import { ticketApi, type ITicket, type ITicketMessage } from '../api/ticketApi';
import { useWebSocket, type WsServerMessage } from '../hooks/useWebSocket';
import { useAuth } from '../hooks/useAuth';
import { cn } from '../utils/cn';
import MarkdownRenderer from './MarkdownRenderer';
import { useNotification } from './Notification';
import {
  studioBadgeClassName,
  studioDarkPanelClassName,
  studioDisplayFont,
  studioElevatedPanelClassName,
  studioFieldClassName,
  studioGhostButtonClassName,
  studioHeroCardClassName,
  studioMainSurfaceClassName,
  studioMetricToneClassName,
  studioPageClassName,
  studioPageFont,
  studioPanelClassName,
  studioPillClassName,
  studioPrimaryButtonClassName,
  studioSubPanelClassName,
  studioTextareaClassName,
} from './studioTheme';

type TicketProcessStep =
  | 'audit_start'
  | 'audit_passed'
  | 'ai_start'
  | 'ai_complete'
  | 'saving'
  | 'audit_failed'
  | 'error';

const ROW_INITIAL = { opacity: 0, x: -20 } as const;
const ROW_ANIMATE = { opacity: 1, x: 0 } as const;

interface ProcessingMeta {
  label: string;
  description: string;
  icon: IconType;
  cardClassName: string;
  iconClassName: string;
}

function formatDate(value: string, mode: 'full' | 'date' | 'time' = 'full'): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  if (mode === 'date') {
    return date.toLocaleDateString('zh-CN', {
      month: 'short',
      day: 'numeric',
    });
  }

  if (mode === 'time') {
    return date.toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getStatusMeta(status: ITicket['status']) {
  switch (status) {
    case 'open':
      return { label: '待处理', badgeTone: 'blue' as const };
    case 'in-progress':
      return { label: '处理中', badgeTone: 'yellow' as const };
    case 'resolved':
      return { label: '已解决', badgeTone: 'green' as const };
    case 'closed':
      return { label: '已关闭', badgeTone: 'slate' as const };
    default:
      return { label: status, badgeTone: 'slate' as const };
  }
}

function getPriorityMeta(priority: ITicket['priority']) {
  switch (priority) {
    case 'high':
      return { label: '高优先级', badgeTone: 'rose' as const, pillTone: 'rose' as const };
    case 'medium':
      return { label: '中优先级', badgeTone: 'yellow' as const, pillTone: 'amber' as const };
    case 'low':
      return { label: '低优先级', badgeTone: 'green' as const, pillTone: 'green' as const };
    default:
      return { label: priority, badgeTone: 'slate' as const, pillTone: 'dark' as const };
  }
}

function getProcessingMeta(step: TicketProcessStep | null): ProcessingMeta | null {
  if (!step) {
    return null;
  }

  const map: Record<TicketProcessStep, ProcessingMeta> = {
    audit_start: {
      label: '内容审核中',
      description: 'AI 正在检查新工单和回复内容的安全性与合规性。',
      icon: FiSearch,
      cardClassName: 'border-amber-200 bg-amber-50 text-amber-800',
      iconClassName: 'text-amber-500',
    },
    audit_passed: {
      label: '审核通过',
      description: '内容已进入回复生成阶段，系统正在准备上下文。',
      icon: FiCheckCircle,
      cardClassName: 'border-emerald-200 bg-emerald-50 text-emerald-800',
      iconClassName: 'text-emerald-500',
    },
    ai_start: {
      label: 'AI 正在分析',
      description: '智能助手正在整理问题背景并生成建议回复。',
      icon: FiCpu,
      cardClassName: 'border-sky-200 bg-sky-50 text-sky-800',
      iconClassName: 'text-sky-500',
    },
    ai_complete: {
      label: '回复已生成',
      description: '系统正在进行最后同步，很快会把结果写回工单。',
      icon: FiCheckCircle,
      cardClassName: 'border-violet-200 bg-violet-50 text-violet-800',
      iconClassName: 'text-violet-500',
    },
    saving: {
      label: '写入中',
      description: '结果正在同步到服务端并广播到会话列表。',
      icon: FiTerminal,
      cardClassName: 'border-slate-200 bg-slate-50 text-slate-800',
      iconClassName: 'text-slate-500',
    },
    audit_failed: {
      label: '审核未通过',
      description: '当前内容未通过审核，建议调整描述后重新提交。',
      icon: FiAlertCircle,
      cardClassName: 'border-rose-200 bg-rose-50 text-rose-800',
      iconClassName: 'text-rose-500',
    },
    error: {
      label: '处理失败',
      description: '系统在处理过程中遇到异常，请稍后重试。',
      icon: FiAlertCircle,
      cardClassName: 'border-rose-200 bg-rose-50 text-rose-800',
      iconClassName: 'text-rose-500',
    },
  };

  return map[step];
}

function getMessageRoleLabel(message: ITicketMessage): string {
  if (message.senderRole === 'ai' || message.isAi) {
    return 'AI 助手';
  }

  if (message.senderRole === 'admin') {
    return '官方客服';
  }

  return '用户';
}

const TicketSystem: React.FC = () => {
  const { user } = useAuth();
  const { setNotification } = useNotification();
  const [tickets, setTickets] = useState<ITicket[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<ITicket | null>(null);
  const [loading, setLoading] = useState(true);
  const [replyContent, setReplyContent] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [newTicket, setNewTicket] = useState({ title: '', description: '', priority: 'medium' });
  const [adminFilter, setAdminFilter] = useState({ status: '', priority: '' });
  const [isMobile, setIsMobile] = useState(false);
  const [showDetailOnMobile, setShowDetailOnMobile] = useState(false);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editValue, setEditValue] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);
  const [processingStep, setProcessingStep] = useState<TicketProcessStep | null>(null);
  const [streamingAiResponse, setStreamingAiResponse] = useState<{ ticketId: string; content: string } | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const prefersReducedMotion = useReducedMotion();
  const isAdmin = user?.role?.toLowerCase().trim() === 'admin';

  useEffect(() => {
    let timer: NodeJS.Timeout;

    if (processingStep) {
      const isEnding = ['ai_complete', 'audit_failed', 'error'].includes(processingStep);
      timer = setTimeout(() => {
        setProcessingStep(null);
      }, isEnding ? 3000 : 20000);
    }

    return () => {
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [processingStep]);

  const onMessage = useCallback(
    (msg: WsServerMessage) => {
      if (msg.type === 'ticket:ai_response') {
        const { ticketId, content, isFinished } = msg.data;
        if (ticketId === selectedTicket?._id || (!selectedTicket && ticketId === 'new')) {
          if (isFinished) {
            setStreamingAiResponse(null);
          } else {
            setStreamingAiResponse((prev) => ({
              ticketId,
              content: (prev && prev.ticketId === ticketId ? prev.content : '') + content,
            }));
          }
        }
      }

      if (msg.type === 'ticket:update') {
        const updatedTicket = msg.data;
        setTickets((prev) => {
          const index = prev.findIndex((ticket) => ticket._id === updatedTicket._id);
          if (index !== -1) {
            const next = [...prev];
            next[index] = updatedTicket;
            return next;
          }
          return [updatedTicket, ...prev];
        });
        setSelectedTicket((prev) => (prev?._id === updatedTicket._id ? updatedTicket : prev));
        setProcessingStep(null);
      }

      if (msg.type === 'ticket:process') {
        const { ticketId, step } = msg.data;
        if (ticketId === 'new' || ticketId === selectedTicket?._id) {
          setProcessingStep(step);
        }
      }
    },
    [selectedTicket],
  );

  useWebSocket({ onMessage });

  const hoverScale = useCallback((scale: number) => (!prefersReducedMotion ? { scale } : undefined), [prefersReducedMotion]);
  const tapScale = useCallback((scale: number) => (!prefersReducedMotion ? { scale } : undefined), [prefersReducedMotion]);

  const processingMeta = useMemo(() => getProcessingMeta(processingStep), [processingStep]);
  const selectedMessages = selectedTicket?.messages ?? [];
  const latestMessage = selectedMessages[selectedMessages.length - 1];

  const statusCards = useMemo(
    () => [
      { label: 'Queue', value: `${tickets.length} 个工单`, tone: 'sky' as const },
      {
        label: 'Focus',
        value: isCreating ? '正在新建工单' : selectedTicket ? getStatusMeta(selectedTicket.status).label : '等待选择工单',
        tone: 'violet' as const,
      },
      { label: 'Mode', value: isAdmin ? '管理控制台' : '个人支持台', tone: 'emerald' as const },
    ],
    [isAdmin, isCreating, selectedTicket, tickets.length],
  );

  const queueRows = useMemo(
    () => [
      { label: '待处理', value: tickets.filter((ticket) => ticket.status === 'open').length },
      { label: '处理中', value: tickets.filter((ticket) => ticket.status === 'in-progress').length },
      {
        label: '已收敛',
        value: tickets.filter((ticket) => ticket.status === 'resolved' || ticket.status === 'closed').length,
      },
    ],
    [tickets],
  );

  const selectedTicketRows = useMemo(() => {
    if (!selectedTicket) {
      return [];
    }

    return [
      { label: '创建时间', value: formatDate(selectedTicket.createdAt) },
      { label: '最近更新', value: formatDate(selectedTicket.updatedAt) },
      { label: '消息数量', value: `${selectedTicket.messages.length} 条` },
      { label: '最近发言', value: latestMessage ? getMessageRoleLabel(latestMessage) : '暂无消息' },
    ];
  }, [latestMessage, selectedTicket]);
