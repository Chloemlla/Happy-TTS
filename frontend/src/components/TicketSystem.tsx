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

  const fetchTickets = async () => {
    try {
      setLoading(true);
      const data = isAdmin ? await ticketApi.getAllTickets(adminFilter) : await ticketApi.getMyTickets();
      setTickets(data);

      if (data.length > 0 && !selectedTicket && !isCreating && !isMobile) {
        setSelectedTicket(data[0]);
      }
    } catch {
      setNotification({ type: 'error', message: '加载工单失败' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTickets();
  }, [adminFilter, isAdmin, user?.id]);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 1024);
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({
      behavior: prefersReducedMotion ? 'auto' : 'smooth',
    });
  }, [prefersReducedMotion, processingStep, selectedMessages, streamingAiResponse?.content]);

  const handleSelectTicket = (ticket: ITicket) => {
    setSelectedTicket(ticket);
    setIsCreating(false);
    setEditingIdx(null);
    if (isMobile) {
      setShowDetailOnMobile(true);
    }
  };

  const handleBackToList = () => {
    setShowDetailOnMobile(false);
    setIsCreating(false);
  };

  const handleStartCreate = () => {
    setSelectedTicket(null);
    setEditingIdx(null);
    setIsCreating(true);
    if (isMobile) {
      setShowDetailOnMobile(true);
    }
  };

  const handleAdminEdit = async (ticketId: string, idx: number) => {
    if (!editValue.trim()) {
      return;
    }

    setIsUpdating(true);
    try {
      const updated = await ticketApi.adminEditMessage(ticketId, idx, editValue);
      setSelectedTicket(updated);
      setTickets((prev) => prev.map((ticket) => (ticket._id === updated._id ? updated : ticket)));
      setEditingIdx(null);
      setNotification({ type: 'success', message: '消息已更新' });
    } catch {
      setNotification({ type: 'error', message: '修改消息失败' });
    } finally {
      setIsUpdating(false);
    }
  };

  const handleAdminDelete = async (ticketId: string, idx: number) => {
    if (!window.confirm('确定要删除这条消息吗？此操作不可撤销。')) {
      return;
    }

    try {
      const updated = await ticketApi.adminDeleteMessage(ticketId, idx);
      setSelectedTicket(updated);
      setTickets((prev) => prev.map((ticket) => (ticket._id === updated._id ? updated : ticket)));
      setNotification({ type: 'success', message: '消息已删除' });
    } catch {
      setNotification({ type: 'error', message: '删除消息失败' });
    }
  };

  const handleCreateTicket = async (event: React.FormEvent) => {
    event.preventDefault();

    try {
      const created = await ticketApi.createTicket(newTicket);
      setNotification({ type: 'success', message: '工单已提交' });
      setIsCreating(false);
      setShowDetailOnMobile(false);
      setNewTicket({ title: '', description: '', priority: 'medium' });
      setSelectedTicket(created);
      fetchTickets();
    } catch (error: any) {
      if (error.response?.status === 403) {
        const data = error.response.data;
        setNotification({
          type: 'error',
          title: data.error || '提交失败',
          message: data.punishment || '当前内容未通过 AI 审核',
          details: data.details ? data.details.split('\n') : undefined,
          duration: 6000,
        });
      } else {
        setNotification({ type: 'error', message: '提交工单失败' });
      }
    }
  };

  const handleReply = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedTicket || !replyContent.trim()) {
      return;
    }

    try {
      const updated = await ticketApi.replyTicket(selectedTicket._id, replyContent);
      setSelectedTicket(updated);
      setReplyContent('');
      setTickets((prev) => prev.map((ticket) => (ticket._id === updated._id ? updated : ticket)));
    } catch (error: any) {
      if (error.response?.status === 403) {
        const data = error.response.data;
        setNotification({
          type: 'error',
          title: data.error || '发送失败',
          message: data.punishment || '当前回复未通过 AI 审核',
          details: data.details ? data.details.split('\n') : undefined,
          duration: 6000,
        });
      } else {
        setNotification({ type: 'error', message: '发送回复失败' });
      }
    }
  };

  const handleUpdateStatus = async (ticketId: string, status: string) => {
    try {
      const updated = await ticketApi.updateStatus(ticketId, status);
      if (selectedTicket?._id === ticketId) {
        setSelectedTicket(updated);
      }
      setTickets((prev) => prev.map((ticket) => (ticket._id === updated._id ? updated : ticket)));
      setNotification({ type: 'success', message: '工单状态已更新' });
    } catch {
      setNotification({ type: 'error', message: '更新工单状态失败' });
    }
  };

  const guideItems = [
    '新建工单时尽量把问题背景、复现步骤和期望结果一次写清。',
    '管理员可以直接在消息流里编辑或删除回复，适合修正措辞或清理误发内容。',
    'AI 处理阶段会经过审核、生成和写入三个环节，右下角会显示实时状态。',
  ];

  return (
    <div className={studioPageClassName} style={{ fontFamily: studioPageFont }}>
      <div className="mx-auto max-w-7xl min-w-0">
        <motion.div
          className={cn('mb-5 sm:mb-8', studioHeroCardClassName)}
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45 }}
        >
          <div className="flex min-w-0 flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl min-w-0">
              <div className="mb-3 inline-flex max-w-full items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-sky-700 sm:px-3 sm:text-xs sm:tracking-[0.18em]">
                <FiMessageSquare />
                Ticket Support Studio
              </div>
              <h1
                className="text-[2rem] font-semibold leading-[1.05] text-slate-900 sm:text-5xl sm:leading-tight"
                style={{ fontFamily: studioDisplayFont }}
              >
                把工单流转整合进同一块工作台
              </h1>
              <p className="mt-3 max-w-2xl text-[13px] leading-6 text-slate-600 sm:text-base sm:leading-7">
                列表、详情、实时 AI 回执和管理员操作全部收进同一套玻璃工作区，视觉语言直接对齐 DeepLX 页面，但保留原来的工单业务流程。
              </p>
            </div>

            <div className="w-full lg:w-auto">
              <div className="grid gap-2 sm:grid-cols-3 sm:gap-3">
                {statusCards.map((item) => (
                  <div
                    key={item.label}
                    className={cn(
                      'min-w-0 rounded-[22px] border px-3 py-2.5 sm:rounded-2xl sm:px-4 sm:py-3',
                      studioMetricToneClassName(item.tone),
                    )}
                  >
                    <div className="text-[10px] uppercase tracking-[0.24em] text-slate-400">{item.label}</div>
                    <div className="mt-2 break-words text-sm font-semibold text-slate-800">{item.value}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </motion.div>

        <div className="grid gap-4 sm:gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
          <motion.div
            className={studioMainSurfaceClassName}
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.05 }}
          >
            <div className="grid min-w-0 gap-2.5 sm:gap-3 lg:grid-cols-[320px_minmax(0,1fr)]">
              <AnimatePresence mode="wait">
                {(!isMobile || !showDetailOnMobile) && (
                  <motion.section
                    key="ticket-list"
                    className={cn(studioSubPanelClassName, 'flex min-h-[520px] flex-col lg:min-h-[640px]')}
                    initial={isMobile ? { opacity: 0, x: -16 } : { opacity: 0, y: 8 }}
                    animate={{ opacity: 1, x: 0, y: 0 }}
                    exit={isMobile ? { opacity: 0, x: -16 } : { opacity: 0 }}
                    transition={{ duration: 0.25 }}
                  >
                    <div className="mb-4 flex items-start justify-between gap-3">
                      <div>
                        <div className="text-[10px] uppercase tracking-[0.24em] text-slate-400">Queue</div>
                        <div className="mt-1 text-lg font-semibold text-slate-900">{isAdmin ? '工单广场' : '我的工单'}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button type="button" onClick={() => fetchTickets()} className={studioGhostButtonClassName} title="刷新工单列表">
                          <FiRefreshCw className={loading ? 'animate-spin' : undefined} />
                          刷新
                        </button>
                        {!isAdmin ? (
                          <motion.button
                            type="button"
                            onClick={handleStartCreate}
                            className={cn(studioPrimaryButtonClassName, 'px-3 py-2 text-xs sm:px-4 sm:text-xs')}
                            whileHover={hoverScale(1.02)}
                            whileTap={tapScale(0.98)}
                          >
                            <FiPlus />
                            新建
                          </motion.button>
                        ) : null}
                      </div>
                    </div>

                    {isAdmin ? (
                      <div className="mb-4 grid gap-2 sm:grid-cols-2">
                        <select
                          className={studioFieldClassName}
                          value={adminFilter.status}
                          onChange={(event) =>
                            setAdminFilter((prev) => ({
                              ...prev,
                              status: event.target.value,
                            }))
                          }
                        >
                          <option value="">全部状态</option>
                          <option value="open">待处理</option>
                          <option value="in-progress">处理中</option>
                          <option value="resolved">已解决</option>
                          <option value="closed">已关闭</option>
                        </select>
                        <select
                          className={studioFieldClassName}
                          value={adminFilter.priority}
                          onChange={(event) =>
                            setAdminFilter((prev) => ({
                              ...prev,
                              priority: event.target.value,
                            }))
                          }
                        >
                          <option value="">全部优先级</option>
                          <option value="high">高优先级</option>
                          <option value="medium">中优先级</option>
                          <option value="low">低优先级</option>
                        </select>
                      </div>
                    ) : null}

                    <div className="flex-1 overflow-y-auto pr-1">
                      {loading ? (
                        <div className="flex h-full min-h-[280px] flex-col items-center justify-center gap-4 rounded-[22px] border border-dashed border-slate-200 bg-white/70 text-center">
                          <div className="h-9 w-9 animate-spin rounded-full border-2 border-slate-200 border-t-[#2541b2]" />
                          <p className="text-sm text-slate-400">正在同步工单列表...</p>
                        </div>
                      ) : tickets.length === 0 ? (
                        <div className="flex h-full min-h-[280px] flex-col items-center justify-center gap-4 rounded-[22px] border border-dashed border-slate-200 bg-white/70 px-6 text-center">
                          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-slate-300">
                            <FiInfo size={28} />
                          </div>
                          <div>
                            <div className="text-base font-semibold text-slate-500">当前没有可显示的工单</div>
                            <p className="mt-2 text-sm leading-6 text-slate-400">
                              {isAdmin ? '尝试切换筛选条件，或等待新的用户工单进入队列。' : '点击右上角的新建按钮，发起第一条支持请求。'}
                            </p>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {tickets.map((ticket, index) => {
                            const statusMeta = getStatusMeta(ticket.status);
                            const priorityMeta = getPriorityMeta(ticket.priority);
                            const isSelected = selectedTicket?._id === ticket._id && !isCreating;
                            const preview = ticket.description || ticket.messages[ticket.messages.length - 1]?.content || '暂无描述';
