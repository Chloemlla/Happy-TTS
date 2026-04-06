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
  if (Number.isNaN(date.getTime())) return value;

  if (mode === 'date') {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  if (mode === 'time') {
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  }

  return date.toLocaleString('en-US', {
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
      return { label: 'Open', badgeTone: 'blue' as const };
    case 'in-progress':
      return { label: 'In Progress', badgeTone: 'yellow' as const };
    case 'resolved':
      return { label: 'Resolved', badgeTone: 'green' as const };
    case 'closed':
      return { label: 'Closed', badgeTone: 'slate' as const };
    default:
      return { label: status, badgeTone: 'slate' as const };
  }
}

function getPriorityMeta(priority: ITicket['priority']) {
  switch (priority) {
    case 'high':
      return { label: 'High', badgeTone: 'rose' as const, pillTone: 'rose' as const };
    case 'medium':
      return { label: 'Medium', badgeTone: 'yellow' as const, pillTone: 'amber' as const };
    case 'low':
      return { label: 'Low', badgeTone: 'green' as const, pillTone: 'green' as const };
    default:
      return { label: priority, badgeTone: 'slate' as const, pillTone: 'dark' as const };
  }
}

function getProcessingMeta(step: TicketProcessStep | null): ProcessingMeta | null {
  if (!step) return null;

  const map: Record<TicketProcessStep, ProcessingMeta> = {
    audit_start: {
      label: 'Content Review',
      description: 'AI is checking the new ticket and reply content for safety and compliance.',
      icon: FiSearch,
      cardClassName: 'border-amber-200 bg-amber-50 text-amber-800',
      iconClassName: 'text-amber-500',
    },
    audit_passed: {
      label: 'Review Passed',
      description: 'The content passed review and the system is preparing the response context.',
      icon: FiCheckCircle,
      cardClassName: 'border-emerald-200 bg-emerald-50 text-emerald-800',
      iconClassName: 'text-emerald-500',
    },
    ai_start: {
      label: 'AI Drafting',
      description: 'The assistant is analyzing the issue and drafting a suggested reply.',
      icon: FiCpu,
      cardClassName: 'border-sky-200 bg-sky-50 text-sky-800',
      iconClassName: 'text-sky-500',
    },
    ai_complete: {
      label: 'Draft Ready',
      description: 'The system is doing the final sync before writing the result back to the ticket.',
      icon: FiCheckCircle,
      cardClassName: 'border-violet-200 bg-violet-50 text-violet-800',
      iconClassName: 'text-violet-500',
    },
    saving: {
      label: 'Saving',
      description: 'The result is being synced to the server and broadcast to the list.',
      icon: FiTerminal,
      cardClassName: 'border-slate-200 bg-slate-50 text-slate-800',
      iconClassName: 'text-slate-500',
    },
    audit_failed: {
      label: 'Review Failed',
      description: 'The current content did not pass review. Adjust the wording and submit again.',
      icon: FiAlertCircle,
      cardClassName: 'border-rose-200 bg-rose-50 text-rose-800',
      iconClassName: 'text-rose-500',
    },
    error: {
      label: 'Process Failed',
      description: 'The system hit an unexpected error during processing. Please try again later.',
      icon: FiAlertCircle,
      cardClassName: 'border-rose-200 bg-rose-50 text-rose-800',
      iconClassName: 'text-rose-500',
    },
  };

  return map[step];
}

function getMessageRoleLabel(message: ITicketMessage): string {
  if (message.senderRole === 'ai' || message.isAi) return 'AI Assistant';
  if (message.senderRole === 'admin') return 'Official Support';
  return 'User';
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
      timer = setTimeout(() => setProcessingStep(null), isEnding ? 3000 : 20000);
    }
    return () => {
      if (timer) clearTimeout(timer);
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
      { label: 'Queue', value: `${tickets.length} tickets`, tone: 'sky' as const },
      {
        label: 'Focus',
        value: isCreating ? 'Creating ticket' : selectedTicket ? getStatusMeta(selectedTicket.status).label : 'Waiting',
        tone: 'violet' as const,
      },
      { label: 'Mode', value: isAdmin ? 'Admin console' : 'Personal desk', tone: 'emerald' as const },
    ],
    [isAdmin, isCreating, selectedTicket, tickets.length],
  );

  const queueRows = useMemo(
    () => [
      { label: 'Open', value: tickets.filter((ticket) => ticket.status === 'open').length },
      { label: 'In Progress', value: tickets.filter((ticket) => ticket.status === 'in-progress').length },
      { label: 'Resolved', value: tickets.filter((ticket) => ticket.status === 'resolved' || ticket.status === 'closed').length },
    ],
    [tickets],
  );

  const selectedTicketRows = useMemo(() => {
    if (!selectedTicket) return [];
    return [
      { label: 'Created', value: formatDate(selectedTicket.createdAt) },
      { label: 'Last update', value: formatDate(selectedTicket.updatedAt) },
      { label: 'Messages', value: `${selectedTicket.messages.length} items` },
      { label: 'Last sender', value: latestMessage ? getMessageRoleLabel(latestMessage) : 'No messages' },
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
      setNotification({ type: 'error', message: 'Failed to load tickets.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTickets();
  }, [adminFilter, isAdmin, user?.id]);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 1024);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: prefersReducedMotion ? 'auto' : 'smooth' });
  }, [prefersReducedMotion, processingStep, selectedMessages, streamingAiResponse?.content]);

  const handleSelectTicket = (ticket: ITicket) => {
    setSelectedTicket(ticket);
    setIsCreating(false);
    setEditingIdx(null);
    if (isMobile) setShowDetailOnMobile(true);
  };

  const handleBackToList = () => {
    setShowDetailOnMobile(false);
    setIsCreating(false);
  };

  const handleStartCreate = () => {
    setSelectedTicket(null);
    setEditingIdx(null);
    setIsCreating(true);
    if (isMobile) setShowDetailOnMobile(true);
  };

  const handleAdminEdit = async (ticketId: string, idx: number) => {
    if (!editValue.trim()) return;
    setIsUpdating(true);
    try {
      const updated = await ticketApi.adminEditMessage(ticketId, idx, editValue);
      setSelectedTicket(updated);
      setTickets((prev) => prev.map((ticket) => (ticket._id === updated._id ? updated : ticket)));
      setEditingIdx(null);
      setNotification({ type: 'success', message: 'Message updated.' });
    } catch {
      setNotification({ type: 'error', message: 'Failed to update the message.' });
    } finally {
      setIsUpdating(false);
    }
  };

  const handleAdminDelete = async (ticketId: string, idx: number) => {
    if (!window.confirm('Delete this message? This action cannot be undone.')) return;
    try {
      const updated = await ticketApi.adminDeleteMessage(ticketId, idx);
      setSelectedTicket(updated);
      setTickets((prev) => prev.map((ticket) => (ticket._id === updated._id ? updated : ticket)));
      setNotification({ type: 'success', message: 'Message deleted.' });
    } catch {
      setNotification({ type: 'error', message: 'Failed to delete the message.' });
    }
  };

  const handleCreateTicket = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      const created = await ticketApi.createTicket(newTicket);
      setNotification({ type: 'success', message: 'Ticket submitted.' });
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
          title: data.error || 'Submit failed',
          message: data.punishment || 'The content did not pass the AI review.',
          details: data.details ? data.details.split('\n') : undefined,
          duration: 6000,
        });
      } else {
        setNotification({ type: 'error', message: 'Failed to submit the ticket.' });
      }
    }
  };

  const handleReply = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedTicket || !replyContent.trim()) return;
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
          title: data.error || 'Reply failed',
          message: data.punishment || 'The reply did not pass the AI review.',
          details: data.details ? data.details.split('\n') : undefined,
          duration: 6000,
        });
      } else {
        setNotification({ type: 'error', message: 'Failed to send the reply.' });
      }
    }
  };

  const handleUpdateStatus = async (ticketId: string, status: string) => {
    try {
      const updated = await ticketApi.updateStatus(ticketId, status);
      if (selectedTicket?._id === ticketId) setSelectedTicket(updated);
      setTickets((prev) => prev.map((ticket) => (ticket._id === updated._id ? updated : ticket)));
      setNotification({ type: 'success', message: 'Ticket status updated.' });
    } catch {
      setNotification({ type: 'error', message: 'Failed to update the ticket status.' });
    }
  };

  const guideItems = [
    'Write the background, repro steps, and expected result in the first ticket message.',
    'Admins can edit or delete a message directly from the conversation stream.',
    'The AI pipeline still runs review, draft, and save stages in real time.',
  ];

  return (
    <div className={studioPageClassName} style={{ fontFamily: studioPageFont }}>
      <div className="mx-auto max-w-7xl min-w-0">
        <motion.div className={cn('mb-5 sm:mb-8', studioHeroCardClassName)} initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45 }}>
          <div className="flex min-w-0 flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl min-w-0">
              <div className="mb-3 inline-flex max-w-full items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-sky-700 sm:px-3 sm:text-xs sm:tracking-[0.18em]">
                <FiMessageSquare />
                Ticket Support Studio
              </div>
              <h1 className="text-[2rem] font-semibold leading-[1.05] text-slate-900 sm:text-5xl sm:leading-tight" style={{ fontFamily: studioDisplayFont }}>
                Move the whole ticket flow into one studio surface
              </h1>
              <p className="mt-3 max-w-2xl text-[13px] leading-6 text-slate-600 sm:text-base sm:leading-7">
                The list, detail view, streaming AI updates, and admin actions now live in one DeepLX-style workspace while the ticket logic stays intact.
              </p>
            </div>
            <div className="w-full lg:w-auto">
              <div className="grid gap-2 sm:grid-cols-3 sm:gap-3">
                {statusCards.map((item) => (
                  <div key={item.label} className={cn('min-w-0 rounded-[22px] border px-3 py-2.5 sm:rounded-2xl sm:px-4 sm:py-3', studioMetricToneClassName(item.tone))}>
                    <div className="text-[10px] uppercase tracking-[0.24em] text-slate-400">{item.label}</div>
                    <div className="mt-2 break-words text-sm font-semibold text-slate-800">{item.value}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </motion.div>

        <div className="grid gap-4 sm:gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
          <motion.div className={studioMainSurfaceClassName} initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.05 }}>
            <div className="grid min-w-0 gap-2.5 sm:gap-3 lg:grid-cols-[320px_minmax(0,1fr)]">
              <AnimatePresence mode="wait">
                {(!isMobile || !showDetailOnMobile) && (
                  <motion.section key="ticket-list" className={cn(studioSubPanelClassName, 'flex min-h-[520px] flex-col lg:min-h-[640px]')} initial={isMobile ? { opacity: 0, x: -16 } : { opacity: 0, y: 8 }} animate={{ opacity: 1, x: 0, y: 0 }} exit={isMobile ? { opacity: 0, x: -16 } : { opacity: 0 }} transition={{ duration: 0.25 }}>
                    <div className="mb-4 flex items-start justify-between gap-3">
                      <div>
                        <div className="text-[10px] uppercase tracking-[0.24em] text-slate-400">Queue</div>
                        <div className="mt-1 text-lg font-semibold text-slate-900">{isAdmin ? 'Global tickets' : 'My tickets'}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button type="button" onClick={() => fetchTickets()} className={studioGhostButtonClassName} title="Refresh ticket list">
                          <FiRefreshCw className={loading ? 'animate-spin' : undefined} />
                          Refresh
                        </button>
                        {!isAdmin ? (
                          <motion.button type="button" onClick={handleStartCreate} className={cn(studioPrimaryButtonClassName, 'px-3 py-2 text-xs sm:px-4 sm:text-xs')} whileHover={hoverScale(1.02)} whileTap={tapScale(0.98)}>
                            <FiPlus />
                            New Ticket
                          </motion.button>
                        ) : null}
                      </div>
                    </div>

                    {isAdmin ? (
                      <div className="mb-4 grid gap-2 sm:grid-cols-2">
                        <select className={studioFieldClassName} value={adminFilter.status} onChange={(event) => setAdminFilter((prev) => ({ ...prev, status: event.target.value }))}>
                          <option value="">All status</option>
                          <option value="open">Open</option>
                          <option value="in-progress">In Progress</option>
                          <option value="resolved">Resolved</option>
                          <option value="closed">Closed</option>
                        </select>
                        <select className={studioFieldClassName} value={adminFilter.priority} onChange={(event) => setAdminFilter((prev) => ({ ...prev, priority: event.target.value }))}>
                          <option value="">All priority</option>
                          <option value="high">High</option>
                          <option value="medium">Medium</option>
                          <option value="low">Low</option>
                        </select>
                      </div>
                    ) : null}

                    <div className="flex-1 overflow-y-auto pr-1">
                      {loading ? (
                        <div className="flex h-full min-h-[280px] flex-col items-center justify-center gap-4 rounded-[22px] border border-dashed border-slate-200 bg-white/70 text-center">
                          <div className="h-9 w-9 animate-spin rounded-full border-2 border-slate-200 border-t-[#2541b2]" />
                          <p className="text-sm text-slate-400">Syncing ticket list...</p>
                        </div>
                      ) : tickets.length === 0 ? (
                        <div className="flex h-full min-h-[280px] flex-col items-center justify-center gap-4 rounded-[22px] border border-dashed border-slate-200 bg-white/70 px-6 text-center">
                          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-slate-300"><FiInfo size={28} /></div>
                          <div>
                            <div className="text-base font-semibold text-slate-500">Nothing to show yet</div>
                            <p className="mt-2 text-sm leading-6 text-slate-400">{isAdmin ? 'Try a different filter or wait for new tickets.' : 'Use the button above to create your first ticket.'}</p>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {tickets.map((ticket, index) => {
                            const statusMeta = getStatusMeta(ticket.status);
                            const priorityMeta = getPriorityMeta(ticket.priority);
                            const isSelected = selectedTicket?._id === ticket._id && !isCreating;
                            const preview = ticket.description || ticket.messages[ticket.messages.length - 1]?.content || 'No description';
