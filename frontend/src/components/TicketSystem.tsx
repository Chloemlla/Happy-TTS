import React, { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { useAuth } from "../hooks/useAuth";
import { ticketApi, ITicket } from "../api/ticketApi";
import { useNotification } from "./Notification";
import { useWebSocket, WsServerMessage } from "../hooks/useWebSocket";
import {
  FiSend, FiPlus, FiMessageSquare, FiClock,
  FiCheckCircle, FiAlertCircle, FiX, FiFilter,
  FiUser, FiChevronRight, FiSearch, FiInfo,
  FiCpu, FiCheck, FiTerminal, FiEdit2, FiTrash2,
  FiRefreshCw,
} from "react-icons/fi";
import MarkdownRenderer, { type MarkdownReaderControls } from './MarkdownRenderer';
import { AiErrorDetailsPanel } from './AiErrorDetailsPanel';
import { PenaltyAppealActions, SUPPORT_EMAIL } from './PenaltyAppealActions';
import { emitPenaltyAppealRequired } from '../utils/penaltyAppeal';
import { cn } from '../utils/cn';
import {
  studioAccentBlobBlueClassName,
  studioAccentBlobSkyClassName,
  studioBadgeClassName,
  studioDisplayFont,
  studioEyebrowAccentPillClassName,
  studioEyebrowClassName,
  studioFieldClassName,
  studioGhostButtonClassName,
  studioHeroCardClassName,
  studioMainSurfaceClassName,
  studioPageClassName,
  studioPageFont,
  studioPanelClassName,
  studioPrimaryButtonClassName,
  studioStrongBadgeClassName,
  studioTextareaClassName,
} from './studioTheme';

type TicketProcessStep = "audit_start" | "audit_passed" | "ai_start" | "ai_complete" | "saving" | "audit_failed" | "error";
type ApiErrorResponse = {
  status?: number;
  data?: {
    error?: string;
    punishment?: string;
    details?: string;
  };
};

const ROW_INITIAL = { opacity: 0, x: -16 } as const;
const ROW_ANIMATE = { opacity: 1, x: 0 } as const;
const CHAT_MARKDOWN_CONTROLS: MarkdownReaderControls = {
  showCopy: true,
  showSourceToggle: true,
  showExpandToggle: true,
  defaultExpanded: true,
  collapsedHeight: 420,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

function getApiErrorResponse(error: unknown): ApiErrorResponse | null {
  if (!isRecord(error) || !isRecord(error.response)) return null;
  const { response } = error;
  const data = isRecord(response.data) ? response.data : {};
  return {
    status: typeof response.status === 'number' ? response.status : undefined,
    data: {
      error: typeof data.error === 'string' ? data.error : undefined,
      punishment: typeof data.punishment === 'string' ? data.punishment : undefined,
      details: typeof data.details === 'string' ? data.details : undefined,
    },
  };
}

const TicketSystem: React.FC = () => {
  const { user } = useAuth();
  const isAdmin = user?.role?.toLowerCase().trim() === "admin";
  const { setNotification } = useNotification();
  const [tickets, setTickets] = useState<ITicket[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<ITicket | null>(null);
  const [loading, setLoading] = useState(true);
  const [replyContent, setReplyContent] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [newTicket, setNewTicket] = useState({ title: "", description: "", priority: "medium" });
  const [adminFilter, setAdminFilter] = useState({ status: "", priority: "" });
  const [isMobile, setIsMobile] = useState(false);
  const [showDetailOnMobile, setShowDetailOnMobile] = useState(false);

  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);

  const [processingStep, setProcessingStep] = useState<TicketProcessStep | null>(null);

  const [streamingAiResponse, setStreamingAiResponse] = useState<{ ticketId: string, content: string } | null>(null);
  const [penaltyAppeal, setPenaltyAppeal] = useState<{
    kind: "ticket_moderation" | "ticket_permission_ban";
    title: string;
    reason: string;
    details?: string;
  } | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const prefersReducedMotion = useReducedMotion();
  const notifyMarkdownCopy = useCallback((success: boolean, wholeMessage = false) => {
    setNotification({
      type: success ? 'success' : 'error',
      message: success ? (wholeMessage ? 'Markdown内容已复制到剪贴板' : '代码已复制') : '复制失败',
    });
  }, [setNotification]);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (processingStep) {
      const isEnding = ["ai_complete", "audit_failed", "error"].includes(processingStep);
      timer = setTimeout(() => {
        setProcessingStep(null);
      }, isEnding ? 3000 : 20000);
    }
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [processingStep]);

  const applyTicketUpdate = useCallback((updatedTicket: ITicket) => {
    setTickets(prev => {
      const index = prev.findIndex(ticket => ticket._id === updatedTicket._id);
      if (index !== -1) {
        const next = [...prev];
        next[index] = updatedTicket;
        return next;
      }
      return [updatedTicket, ...prev];
    });

    setSelectedTicket(prev => prev?._id === updatedTicket._id ? updatedTicket : prev);
  }, []);

  const onMessage = useCallback((msg: WsServerMessage) => {
    if (msg.type === "ticket:ai_response") {
      const { ticketId, content, isFinished } = msg.data;
      if (ticketId === selectedTicket?._id || (!selectedTicket && ticketId === "new")) {
        if (isFinished) {
          setStreamingAiResponse(null);
        } else {
          setStreamingAiResponse(prev => ({
            ticketId,
            content: (prev && prev.ticketId === ticketId ? prev.content : "") + content
          }));
        }
      }
    }

    if (msg.type === "ticket:update") {
      if (!isRecord(msg.data) || typeof msg.data._id !== "string") return;
      const updatedTicket = msg.data as unknown as ITicket;
      if (isAdmin) {
        void ticketApi.getTicket(updatedTicket._id)
          .then(applyTicketUpdate)
          .catch(() => applyTicketUpdate(updatedTicket));
      } else {
        applyTicketUpdate(updatedTicket);
      }

      setProcessingStep(null);
    }

    if (msg.type === "ticket:process") {
      const { ticketId, step } = msg.data;
      if (ticketId === "new" || ticketId === selectedTicket?._id) {
        setProcessingStep(step);
      }
    }
  }, [applyTicketUpdate, isAdmin, selectedTicket?._id]);

  useWebSocket({ onMessage });

  const handleAdminEdit = async (ticketId: string, idx: number) => {
    if (!editValue.trim()) return;
    setIsUpdating(true);
    try {
      const updated = await ticketApi.adminEditMessage(ticketId, idx, editValue);
      setSelectedTicket(updated);
      setTickets(prev => prev.map(t => t._id === updated._id ? updated : t));
      setEditingIdx(null);
      setNotification({ type: 'success', message: "消息已修改" });
    } catch (error) {
      setNotification({ type: 'error', message: "修改失败" });
    } finally {
      setIsUpdating(false);
    }
  };

  const handleAdminDelete = async (ticketId: string, idx: number) => {
    if (!window.confirm("确定要删除这条消息吗？此操作不可撤销。")) return;
    try {
      const updated = await ticketApi.adminDeleteMessage(ticketId, idx);
      setSelectedTicket(updated);
      setTickets(prev => prev.map(t => t._id === updated._id ? updated : t));
      setNotification({ type: 'success', message: "消息已删除" });
    } catch (error) {
      setNotification({ type: 'error', message: "删除失败" });
    }
  };

  useEffect(() => {
    const checkMobile = () => {
      // Align with app shell breakpoint (md: 768px), not lg:1024.
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  const hoverScale = useCallback((scale: number, enabled: boolean = true) => (
    enabled && !prefersReducedMotion ? { scale } : undefined
  ), [prefersReducedMotion]);

  const tapScale = useCallback((scale: number, enabled: boolean = true) => (
    enabled && !prefersReducedMotion ? { scale } : undefined
  ), [prefersReducedMotion]);

  const fetchTickets = async () => {
    try {
      setLoading(true);
      const data = isAdmin
        ? await ticketApi.getAllTickets(adminFilter)
        : await ticketApi.getMyTickets();
      setTickets(data);

      if (data.length > 0 && !selectedTicket && !isCreating && !isMobile) {
        setSelectedTicket(data[0]);
      }
    } catch (error) {
      setNotification({ type: 'error', message: "加载工单失败" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTickets();
  }, [isAdmin, adminFilter, user?.id]);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [selectedTicket?.messages]);

  const handleCreateTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const created = await ticketApi.createTicket(newTicket);
      setNotification({ type: 'success', message: "工单已提交" });
      setIsCreating(false);
      setShowDetailOnMobile(false);
      setNewTicket({ title: "", description: "", priority: "medium" });
      setSelectedTicket(created);
      fetchTickets();
    } catch (error: unknown) {
      const apiError = getApiErrorResponse(error);
      if (apiError?.status === 403) {
        const data = apiError.data || {};
        const title = data.error || "提交失败";
        const reason = data.punishment || "您的内容未能通过 AI 审核";
        const details = data.details;
        const isPermissionBan = title.includes("封禁") || reason.includes("封禁");
        setPenaltyAppeal({
          kind: isPermissionBan ? "ticket_permission_ban" : "ticket_moderation",
          title,
          reason,
          details,
        });
        emitPenaltyAppealRequired({
          kind: isPermissionBan ? "ticket_permission_ban" : "ticket_moderation",
          title,
          reason,
          details,
          ticketChannelEnabled: !isPermissionBan,
          supportEmail: SUPPORT_EMAIL,
          source: "ticket-system",
        });
        setNotification({
          type: 'error',
          title,
          message: reason,
          details: [
            ...(details ? details.split("\n") : []),
            `申诉邮箱: ${SUPPORT_EMAIL}`,
            "也可使用页面中的“提交工单申诉”按钮",
          ],
          duration: 6000
        });
      } else {
        setNotification({ type: 'error', message: "提交失败" });
      }
    }
  };

  const handleReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTicket || !replyContent.trim()) return;
    try {
      const updated = await ticketApi.replyTicket(selectedTicket._id, replyContent);
      setSelectedTicket(updated);
      setReplyContent("");
      setTickets(prev => prev.map(t => t._id === updated._id ? updated : t));
    } catch (error: unknown) {
      const apiError = getApiErrorResponse(error);
      if (apiError?.status === 403) {
        const data = apiError.data || {};
        const title = data.error || "发送失败";
        const reason = data.punishment || "您的回复未能通过 AI 审核";
        const details = data.details;
        const isPermissionBan = title.includes("封禁") || reason.includes("封禁");
        setPenaltyAppeal({
          kind: isPermissionBan ? "ticket_permission_ban" : "ticket_moderation",
          title,
          reason,
          details,
        });
        emitPenaltyAppealRequired({
          kind: isPermissionBan ? "ticket_permission_ban" : "ticket_moderation",
          title,
          reason,
          details,
          ticketChannelEnabled: !isPermissionBan,
          supportEmail: SUPPORT_EMAIL,
          source: "ticket-system",
        });
        setNotification({
          type: 'error',
          title,
          message: reason,
          details: [
            ...(details ? details.split("\n") : []),
            `申诉邮箱: ${SUPPORT_EMAIL}`,
            "也可使用页面中的“提交工单申诉”按钮",
          ],
          duration: 6000
        });
      } else {
        setNotification({ type: 'error', message: "发送失败" });
      }
    }
  };

  const handleUpdateStatus = async (id: string, status: string) => {
    try {
      const updated = await ticketApi.updateStatus(id, status);
      if (selectedTicket?._id === id) setSelectedTicket(updated);
      setTickets(prev => prev.map(t => t._id === updated._id ? updated : t));
      setNotification({ type: 'success', message: "工单状态已更新" });
    } catch (error) {
      setNotification({ type: 'error', message: "更新状态失败" });
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "open":
        return <span className={studioBadgeClassName('blue')}>待处理</span>;
      case "in-progress":
        return <span className={studioBadgeClassName('yellow')}>处理中</span>;
      case "resolved":
        return <span className={studioBadgeClassName('green')}>已解决</span>;
      case "closed":
        return <span className={studioBadgeClassName('slate')}>已关闭</span>;
      default: return null;
    }
  };

  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case "high": return <span className={studioBadgeClassName('rose')}>紧急</span>;
      case "medium": return <span className={studioBadgeClassName('yellow')}>一般</span>;
      case "low": return <span className={studioBadgeClassName('green')}>低</span>;
      default: return null;
    }
  };

  return (
    <div className={studioPageClassName} style={{ fontFamily: studioPageFont }}>
      <div className="mx-auto max-w-7xl min-w-0 space-y-5 sm:space-y-8">
        {/* Hero */}
        <AnimatePresence>
          {(!isMobile || !showDetailOnMobile) && (
            <motion.div
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.45 }}
              className={cn("relative overflow-hidden", studioHeroCardClassName)}
            >
              <div className={cn(studioAccentBlobBlueClassName, "-right-12 top-0")} aria-hidden />
              <div className={cn(studioAccentBlobSkyClassName, "-left-10 bottom-0")} aria-hidden />
              <div className="relative flex min-w-0 flex-col gap-5 md:flex-row md:items-end md:justify-between">
                <div className="max-w-2xl min-w-0">
                  <div className={studioEyebrowAccentPillClassName}>
                    <FiMessageSquare />
                    Synapse Support
                  </div>
                  <h1
                    className="mt-4 text-[2rem] font-semibold leading-[1.05] text-slate-900 sm:text-5xl sm:leading-tight"
                    style={{ fontFamily: studioDisplayFont }}
                  >
                    支持中心
                  </h1>
                  <p className="mt-3 max-w-xl text-[13px] leading-6 text-slate-600 sm:text-base sm:leading-7">
                    提交技术支持、功能反馈或投诉建议，所有工单都会经过 AI 审计并由人工跟进。
                  </p>
                  {penaltyAppeal && (
                    <div className="mt-4 max-w-xl">
                      <div className="mb-2 rounded-[18px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
                        <div className="font-semibold">{penaltyAppeal.title}</div>
                        <div className="mt-1 leading-6">{penaltyAppeal.reason}</div>
                        {penaltyAppeal.details && (
                          <div className="mt-2 whitespace-pre-line text-xs leading-5 text-rose-800/90">
                            {penaltyAppeal.details}
                          </div>
                        )}
                      </div>
                      <PenaltyAppealActions
                        kind={penaltyAppeal.kind}
                        reason={penaltyAppeal.reason}
                        details={penaltyAppeal.details}
                      />
                    </div>
                  )}
                </div>
                <div className="hidden w-full md:block md:w-auto md:max-w-sm">
                  <div className="rounded-[22px] border border-slate-200 bg-slate-50/80 p-4 sm:rounded-2xl">
                    <div className={cn(studioEyebrowClassName, "flex items-center gap-2")}>
                      <FiInfo className="text-slate-500" />
                      功能说明
                    </div>
                    <ul className="mt-3 space-y-2 text-[13px] leading-6 text-slate-600">
                      <li className="flex items-start gap-2">
                        <FiCheckCircle className="mt-1 shrink-0 text-emerald-500" />
                        <span>提交技术支持、功能反馈或投诉建议</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <FiCheckCircle className="mt-1 shrink-0 text-emerald-500" />
                        <span>实时查看客服回复并进行双向沟通</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <FiCheckCircle className="mt-1 shrink-0 text-emerald-500" />
                        <span>{isAdmin ? "管理全局工单，支持状态过滤与更新" : "管理个人工单历史，追踪处理进度"}</span>
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex min-h-[min(500px,calc(100dvh-14rem))] flex-col gap-4 md:h-[min(640px,calc(100dvh-12rem))] md:flex-row md:gap-6">
          {/* 左侧列表 */}
          <AnimatePresence mode="wait">
            {(!isMobile || !showDetailOnMobile) && (
              <motion.div
                key="list"
                className={cn("md:w-96 w-full h-full flex flex-col overflow-hidden", studioPanelClassName, "p-0 sm:p-0")}
                initial={isMobile ? { opacity: 0, x: -20 } : { opacity: 0 }}
                animate={{ opacity: 1, x: 0 }}
                exit={isMobile ? { opacity: 0, x: -20 } : undefined}
                transition={{ duration: 0.3 }}
              >
                <div className="flex items-center justify-between gap-2 border-b border-slate-200/80 p-4 shrink-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-slate-900 text-white shrink-0">
                      <FiFilter size={14} />
                    </div>
                    <div className="min-w-0">
                      <div className={studioEyebrowClassName}>
                        {isAdmin ? "Admin" : "History"}
                      </div>
                      <div className="text-sm font-semibold text-slate-900 truncate">
                        {isAdmin ? "工单广场" : "历史工单"}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => fetchTickets()}
                      className={cn(studioGhostButtonClassName, "h-9 w-9 px-0 py-0 sm:h-9 sm:w-9 sm:px-0 sm:py-0", loading && "text-slate-400")}
                      title="刷新列表"
                    >
                      <FiRefreshCw size={14} className={loading ? 'animate-spin' : undefined} />
                    </button>
                    {!isAdmin && (
                      <motion.button
                        onClick={() => {
                          setIsCreating(true);
                          if (isMobile) setShowDetailOnMobile(true);
                        }}
                        className={cn(studioPrimaryButtonClassName, "h-9 w-9 px-0 py-0 sm:h-9 sm:w-9 sm:px-0 sm:py-0")}
                        whileHover={hoverScale(1.04)}
                        whileTap={tapScale(0.96)}
                        title="发起新工单"
                      >
                        <FiPlus size={16} />
                      </motion.button>
                    )}
                  </div>
                </div>

                {isAdmin && (
                  <div className="grid grid-cols-2 gap-2 border-b border-slate-200/80 bg-slate-50/60 p-3 shrink-0">
                    <select
                      className={cn(studioFieldClassName, "py-2 text-xs")}
                      value={adminFilter.status}
                      onChange={e => setAdminFilter(prev => ({ ...prev, status: e.target.value }))}
                    >
                      <option value="">所有状态</option>
                      <option value="open">待处理</option>
                      <option value="in-progress">处理中</option>
                      <option value="resolved">已解决</option>
                      <option value="closed">已关闭</option>
                    </select>
                    <select
                      className={cn(studioFieldClassName, "py-2 text-xs")}
                      value={adminFilter.priority}
                      onChange={e => setAdminFilter(prev => ({ ...prev, priority: e.target.value }))}
                    >
                      <option value="">所有优先级</option>
                      <option value="high">高</option>
                      <option value="medium">中</option>
                      <option value="low">低</option>
                    </select>
                  </div>
                )}

                <div className="flex-1 overflow-y-auto hover-scrollbar">
                  {loading ? (
                    <div className="flex flex-col items-center justify-center p-12 space-y-3">
                      <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-slate-900" />
                      <span className="text-slate-400 text-sm">加载中...</span>
                    </div>
                  ) : tickets.length === 0 ? (
                    <div className="p-12 text-center">
                      <FiInfo className="mx-auto text-slate-200 mb-2" size={32} />
                      <p className="text-slate-400 text-sm">暂无工单数据</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-100">
                      {tickets.map((ticket, idx) => (
                        <motion.div
                          key={ticket._id}
                          onClick={() => {
                            setSelectedTicket(ticket);
                            setIsCreating(false);
                            if (isMobile) setShowDetailOnMobile(true);
                          }}
                          className={cn(
                            "cursor-pointer transition-all duration-200 px-4 py-3 sm:px-5 sm:py-4 border-l-2",
                            selectedTicket?._id === ticket._id
                              ? "bg-slate-50 border-slate-900"
                              : "border-transparent hover:bg-slate-50/60 active:bg-slate-100",
                          )}
                          initial={ROW_INITIAL}
                          animate={ROW_ANIMATE}
                          transition={{ duration: 0.2, delay: 0.03 * idx }}
                        >
                          <div className="flex justify-between items-start mb-1 sm:mb-2 gap-2">
                            <h4 className="font-semibold text-slate-900 text-xs sm:text-sm truncate flex-1 min-w-0">{ticket.title}</h4>
                            {getPriorityBadge(ticket.priority)}
                          </div>
                          <div className="flex items-center justify-between text-[10px] sm:text-[11px] text-slate-500">
                            <div className="flex items-center gap-1.5">
                              {getStatusBadge(ticket.status)}
                            </div>
                            <span className="font-mono text-slate-400">{new Date(ticket.updatedAt).toLocaleDateString()}</span>
                          </div>
                          {isAdmin && (
                            <div className="mt-2 text-[10px] text-slate-500 font-medium flex items-center gap-1">
                              <FiUser size={10} /> {ticket.username}
                            </div>
                          )}
                        </motion.div>
                      ))}
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* 右侧详情 */}
          <AnimatePresence mode="wait">
            {(!isMobile || showDetailOnMobile) && (
              <motion.div
                key="detail-container"
                className={cn("flex-1 w-full h-full flex flex-col overflow-hidden relative", studioMainSurfaceClassName, "p-0 sm:p-0")}
                initial={isMobile ? { opacity: 0, x: 20 } : { opacity: 0 }}
                animate={{ opacity: 1, x: 0 }}
                exit={isMobile ? { opacity: 0, x: 20 } : undefined}
                transition={{ duration: 0.3 }}
              >
                {isMobile && (showDetailOnMobile || isCreating) && (
                  <div className="flex items-center justify-between gap-2 border-b border-slate-200/80 bg-white/80 backdrop-blur-md p-3 sticky top-0 z-20 shrink-0">
                    <button
                      onClick={() => {
                        setShowDetailOnMobile(false);
                        setIsCreating(false);
                      }}
                      className={cn(studioGhostButtonClassName, "py-2")}
                    >
                      <FiChevronRight className="rotate-180" size={16} /> 返回
                    </button>
                    <div className="text-xs font-semibold text-slate-500 truncate max-w-[180px] px-2">
                      {isCreating ? "发起新工单" : selectedTicket?.title}
                    </div>
                  </div>
                )}

                <AnimatePresence mode="wait">
                  {isCreating ? (
                    <motion.div
                      key="create"
                      initial={{ opacity: 0, scale: 0.98 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.98 }}
                      className="h-full overflow-y-auto p-5 sm:p-8"
                    >
                      <div className="max-w-xl mx-auto">
                        <div className="mb-5 flex items-center gap-3">
                          <div className={studioStrongBadgeClassName}>
                            <FiPlus />
                          </div>
                          <div>
                            <div className={studioEyebrowClassName}>New Ticket</div>
                            <h3
                              className="text-xl font-semibold text-slate-900"
                              style={{ fontFamily: studioDisplayFont }}
                            >
                              发起新工单
                            </h3>
                          </div>
                        </div>
                        <form onSubmit={handleCreateTicket} className="space-y-4 sm:space-y-5">
                          <div>
                            <label className={cn(studioEyebrowClassName, "mb-2 block")}>工单标题</label>
                            <input
                              type="text"
                              required
                              placeholder="请输入简明扼要的标题"
                              className={studioFieldClassName}
                              value={newTicket.title}
                              onChange={e => setNewTicket(prev => ({ ...prev, title: e.target.value }))}
                            />
                          </div>
                          <div>
                            <label className={cn(studioEyebrowClassName, "mb-2 block")}>紧急程度</label>
                            <div className="flex gap-2 sm:gap-3">
                              {(['low', 'medium', 'high'] as const).map(p => {
                                const isActive = newTicket.priority === p;
                                const toneActiveClass =
                                  p === 'high' ? 'bg-rose-50 border-rose-300 text-rose-700' :
                                  p === 'medium' ? 'bg-amber-50 border-amber-300 text-amber-700' :
                                  'bg-emerald-50 border-emerald-300 text-emerald-700';
                                return (
                                  <label key={p} className="flex-1">
                                    <input
                                      type="radio"
                                      name="priority"
                                      value={p}
                                      checked={isActive}
                                      onChange={e => setNewTicket(prev => ({ ...prev, priority: e.target.value }))}
                                      className="hidden peer"
                                    />
                                    <div
                                      className={cn(
                                        "text-center py-2.5 rounded-[18px] border cursor-pointer transition-all text-xs sm:text-sm font-semibold sm:rounded-2xl",
                                        isActive ? toneActiveClass : "border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:text-slate-700",
                                      )}
                                    >
                                      {p === 'high' ? '紧急' : p === 'medium' ? '一般' : '低'}
                                    </div>
                                  </label>
                                );
                              })}
                            </div>
                          </div>
                          <div>
                            <label className={cn(studioEyebrowClassName, "mb-2 block")}>详细描述</label>
                            <textarea
                              required
                              rows={isMobile ? 6 : 8}
                              placeholder="请尽可能详细地说明您遇到的问题或建议，以便我们能更快为您处理..."
                              className={studioTextareaClassName}
                              value={newTicket.description}
                              onChange={e => setNewTicket(prev => ({ ...prev, description: e.target.value }))}
                            />
                          </div>
                          <div className="flex flex-col gap-2 pt-2 sm:flex-row">
                            <motion.button
                              type="submit"
                              className={cn(studioPrimaryButtonClassName, "flex-1")}
                              whileHover={hoverScale(1.01)}
                              whileTap={tapScale(0.99)}
                            >
                              <FiSend size={14} />
                              提交工单
                            </motion.button>
                            <motion.button
                              type="button"
                              onClick={() => {
                                setIsCreating(false);
                                if (isMobile) setShowDetailOnMobile(false);
                              }}
                              className={cn(studioGhostButtonClassName, "px-6 py-3")}
                              whileHover={hoverScale(1.01)}
                              whileTap={tapScale(0.99)}
                            >
                              取消
                            </motion.button>
                          </div>
                        </form>
                      </div>
                    </motion.div>
                  ) : selectedTicket ? (
                    <motion.div
                      key="detail"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="flex flex-col h-full"
                    >
                      {/* Detail header */}
                      <div className="flex flex-col gap-3 border-b border-slate-200/80 bg-slate-50/40 p-4 sm:p-5 sm:flex-row sm:items-center sm:justify-between">
                        <div className="space-y-2 min-w-0">
                          <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
                            <h3 className="font-semibold text-slate-900 text-sm sm:text-base truncate">{selectedTicket.title}</h3>
                            {getPriorityBadge(selectedTicket.priority)}
                          </div>
                          <div className="flex items-center gap-4 text-[10px] sm:text-[11px] text-slate-500 font-mono flex-wrap">
                            <span className="flex items-center gap-1"><FiUser className="text-slate-400" /> {selectedTicket.username}</span>
                            <span className="flex items-center gap-1"><FiClock className="text-slate-400" /> {new Date(selectedTicket.createdAt).toLocaleString()}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 w-full sm:w-auto">
                          {isAdmin ? (
                            <select
                              className={cn(studioFieldClassName, "py-2 text-xs sm:w-auto")}
                              value={selectedTicket.status}
                              onChange={e => handleUpdateStatus(selectedTicket._id, e.target.value)}
                            >
                              <option value="open">设为待处理</option>
                              <option value="in-progress">设为处理中</option>
                              <option value="resolved">标记已解决</option>
                              <option value="closed">关闭此工单</option>
                            </select>
                          ) : (
                            getStatusBadge(selectedTicket.status)
                          )}
                        </div>
                      </div>

                      {/* Messages */}
                      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 sm:space-y-6 bg-white hover-scrollbar">
                        {selectedTicket.messages.map((msg, idx) => {
                          const isAi = msg.senderRole === "ai" || msg.isAi;
                          const isMe = msg.senderId === user?.id;
                          const isAdminMsg = msg.senderRole === "admin";

                          return (
                            <motion.div
                              key={`${selectedTicket._id}-${idx}`}
                              className={`flex ${isMe ? 'justify-end' : 'justify-start'} group mb-4`}
                              initial={ROW_INITIAL}
                              animate={ROW_ANIMATE}
                              transition={{ duration: 0.3 }}
                            >
                              <div className={`max-w-[85%] sm:max-w-[78%] relative ${isMe ? 'order-1' : 'order-2'}`}>
                                <div className={`flex items-center gap-2 mb-1 text-[10px] text-slate-400 ${isMe ? 'justify-end' : 'justify-start'}`}>
                                  {!isMe && (
                                    <span className={cn(
                                      "font-semibold",
                                      isAdminMsg ? "text-slate-700" : "text-slate-500",
                                    )}>
                                      {isAi ? "🤖 智能助手" : isAdminMsg ? "Official Customer Service" : "👤 用户"}
                                    </span>
                                  )}
                                  <span>{new Date(msg.createdAt).toLocaleString()}</span>
                                </div>

                                <div className={cn(
                                  "relative rounded-[22px] p-3.5 sm:p-4 sm:rounded-[24px] transition-shadow",
                                  isMe
                                    ? "bg-slate-900 text-white rounded-tr-[10px] shadow-[0_10px_30px_rgba(15,23,42,0.18)]"
                                    : isAi
                                      ? "bg-white border border-slate-200 text-slate-900 rounded-tl-[10px] shadow-[0_6px_24px_rgba(15,23,42,0.06)]"
                                      : "bg-slate-50 border border-slate-200 text-slate-900 rounded-tl-[10px]",
                                )}>
                                  {isAdminMsg && (
                                    <div className={cn(studioEyebrowClassName, "mb-1 flex items-center gap-1 text-[10px] tracking-[0.22em]")}>
                                      <FiCheckCircle size={10} /> Official Reply
                                    </div>
                                  )}
                                  {editingIdx === idx ? (
                                    <div className="space-y-2">
                                      <textarea
                                        className="w-full bg-white/10 border border-white/30 rounded-[14px] p-2 text-sm focus:outline-none focus:ring-1 focus:ring-white/50 min-h-[100px] text-white placeholder:text-white/60"
                                        value={editValue}
                                        onChange={(e) => setEditValue(e.target.value)}
                                        autoFocus
                                      />
                                      <div className="flex gap-2 justify-end">
                                        <button
                                          onClick={() => handleAdminEdit(selectedTicket._id, idx)}
                                          disabled={isUpdating}
                                          className="px-3 py-1 bg-emerald-500 text-white text-xs rounded-full font-semibold flex items-center gap-1 hover:bg-emerald-600 transition"
                                        >
                                          {isUpdating ? <span className="animate-spin">⌛</span> : <FiCheck />} 保存
                                        </button>
                                        <button
                                          onClick={() => setEditingIdx(null)}
                                          className="px-3 py-1 bg-white/20 text-white text-xs rounded-full font-semibold hover:bg-white/30 transition"
                                        >
                                          取消
                                        </button>
                                      </div>
                                    </div>
                                  ) : (
                                    <MarkdownRenderer
                                      content={msg.content}
                                      isDark={isMe}
                                      density="compact"
                                      controls={CHAT_MARKDOWN_CONTROLS}
                                      onContentCopy={(success) => notifyMarkdownCopy(success, true)}
                                      onCodeCopy={(success) => notifyMarkdownCopy(success)}
                                      className={isMe ? 'prose-code:bg-white/10 prose-code:text-white/90 prose-a:text-sky-200' : ''}
                                    />
                                  )}

                                  {isAdmin && isAi && msg.aiErrorDetails && (
                                    <AiErrorDetailsPanel diagnostics={msg.aiErrorDetails} />
                                  )}

                                  {isAdmin && editingIdx !== idx && (
                                    <div className={`absolute -bottom-6 ${isMe ? 'left-0' : 'right-0'} opacity-0 group-hover:opacity-100 transition-opacity flex gap-2`}>
                                      <button
                                        onClick={() => {
                                          setEditingIdx(idx);
                                          setEditValue(msg.content);
                                        }}
                                        className="p-1 text-slate-400 hover:text-slate-700 transition-colors"
                                        title="编辑消息"
                                      >
                                        <FiEdit2 size={12} />
                                      </button>
                                      <button
                                        onClick={() => handleAdminDelete(selectedTicket._id, idx)}
                                        className="p-1 text-slate-400 hover:text-rose-500 transition-colors"
                                        title="删除消息"
                                      >
                                        <FiTrash2 size={12} />
                                      </button>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </motion.div>
                          );
                        })}

                        <AnimatePresence>
                          {streamingAiResponse && streamingAiResponse.ticketId === selectedTicket?._id && (
                            <motion.div
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0 }}
                              className="flex justify-start mb-4"
                            >
                              <div className="max-w-[85%] sm:max-w-[78%] relative order-2">
                                <div className="flex items-center gap-2 mb-1 text-[10px] text-slate-400 justify-start">
                                  <span className="font-semibold text-slate-500">🤖 智能助手 (正在输入...)</span>
                                </div>
                                <div className="relative rounded-[22px] p-3.5 sm:p-4 bg-white border border-slate-200 text-slate-900 rounded-tl-[10px] shadow-[0_6px_24px_rgba(15,23,42,0.06)] sm:rounded-[24px]">
                                  <MarkdownRenderer content={streamingAiResponse.content} density="compact" />
                                  <span className="inline-block w-1.5 h-4 ml-1 bg-slate-700 animate-pulse align-middle" />
                                </div>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>

                        <AnimatePresence>
                          {processingStep && (
                            <motion.div
                              initial={{ opacity: 0, y: 10, scale: 0.96 }}
                              animate={{ opacity: 1, y: 0, scale: 1 }}
                              exit={{ opacity: 0, scale: 0.96 }}
                              className="flex justify-start mb-4"
                            >
                              <div className="rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-3 shadow-[0_6px_24px_rgba(15,23,42,0.06)] flex items-center gap-3">
                                <div className="flex gap-1">
                                  <span className="w-1.5 h-1.5 bg-slate-500 rounded-full animate-bounce" />
                                  <span className="w-1.5 h-1.5 bg-slate-500 rounded-full animate-bounce delay-75" />
                                  <span className="w-1.5 h-1.5 bg-slate-500 rounded-full animate-bounce delay-150" />
                                </div>
                                <div className="text-xs sm:text-sm font-medium text-slate-700 flex items-center gap-2">
                                  {processingStep === "audit_start" && (
                                    <>🔍 AI 正在进行安全与合规性审查...</>
                                  )}
                                  {processingStep === "audit_passed" && (
                                    <>✅ 审查通过，正在准备数据...</>
                                  )}
                                  {processingStep === "ai_start" && (
                                    <>🧠 智能助手正在为您分析问题并生成方案...</>
                                  )}
                                  {processingStep === "ai_complete" && (
                                    <>✨ 方案生成完毕，正在最后同步...</>
                                  )}
                                  {processingStep === "saving" && (
                                    <>💾 正在同步至云端存储...</>
                                  )}
                                </div>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>

                        <div ref={messagesEndRef} />
                      </div>

                      {/* Reply form */}
                      {selectedTicket.status !== "closed" ? (
                        <div className="border-t border-slate-200/80 bg-slate-50/40 p-3 sm:p-4 shrink-0">
                          <form
                            onSubmit={handleReply}
                            className="flex items-center gap-2 rounded-[22px] border border-slate-200 bg-white p-1.5 shadow-[0_6px_18px_rgba(15,23,42,0.04)] focus-within:border-slate-300 transition sm:rounded-full"
                          >
                            <input
                              type="text"
                              placeholder={isAdmin ? "在此输入回复内容..." : "补充更多详情..."}
                              className="flex-1 px-3 sm:px-4 py-2 text-xs sm:text-sm outline-none bg-transparent placeholder:text-slate-400"
                              value={replyContent}
                              onChange={e => setReplyContent(e.target.value)}
                            />
                            <motion.button
                              type="submit"
                              disabled={!replyContent.trim()}
                              className={cn(studioPrimaryButtonClassName, "h-9 w-9 p-0 sm:h-10 sm:w-10 sm:p-0 disabled:opacity-50")}
                              whileHover={hoverScale(1.04)}
                              whileTap={tapScale(0.96)}
                            >
                              <FiSend size={14} />
                            </motion.button>
                          </form>
                        </div>
                      ) : (
                        <div className="border-t border-slate-200/80 bg-slate-50 p-4 sm:p-6 text-center shrink-0">
                          <p className="text-xs sm:text-sm text-slate-500 font-medium flex items-center justify-center gap-2">
                            <FiX /> 此工单已关闭，如需继续咨询请发起新工单
                          </p>
                        </div>
                      )}
                    </motion.div>
                  ) : (
                    <motion.div
                      key="empty"
                      className="flex flex-col items-center justify-center h-full text-slate-300 p-8 sm:p-12"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                    >
                      <div className="flex h-16 w-16 sm:h-20 sm:w-20 items-center justify-center rounded-[26px] border border-slate-200 bg-slate-50 text-slate-400 mb-4 shadow-inner sm:rounded-[30px]">
                        <FiMessageSquare size={isMobile ? 32 : 40} />
                      </div>
                      <h3 className="text-lg sm:text-xl font-semibold text-slate-700 mb-2 text-center" style={{ fontFamily: studioDisplayFont }}>选择一个工单</h3>
                      <p className="text-xs sm:text-sm text-slate-400 text-center max-w-xs leading-relaxed">
                        请从左侧列表选择已有工单查看详情，或点击上方按钮开启新的对话请求。
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* 全局浮窗：实时处理进度 */}
      <AnimatePresence>
        {processingStep && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.9, transition: { duration: 0.2 } }}
            className="fixed bottom-20 left-1/2 -translate-x-1/2 z-[60] w-[90%] max-w-md pointer-events-none"
          >
            <div className={cn(
              "pointer-events-auto rounded-[24px] border bg-white/95 backdrop-blur-md p-4 shadow-[0_24px_80px_rgba(15,23,42,0.18)] flex items-center gap-4 transition-colors",
              processingStep === 'audit_failed' || processingStep === 'error'
                ? 'border-rose-200'
                : 'border-slate-200',
            )}>
              <div className="flex gap-1 items-center">
                {processingStep === 'audit_failed' || processingStep === 'error' ? (
                  <FiAlertCircle className="text-rose-500 animate-pulse" size={18} />
                ) : (
                  <>
                    <span className="w-2 h-2 bg-slate-700 rounded-full animate-bounce" />
                    <span className="w-2 h-2 bg-slate-700 rounded-full animate-bounce delay-75" />
                    <span className="w-2 h-2 bg-slate-700 rounded-full animate-bounce delay-150" />
                  </>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className={cn(
                  studioEyebrowClassName,
                  "mb-0.5",
                  processingStep === 'audit_failed' || processingStep === 'error' ? 'text-rose-400' : 'text-slate-400',
                )}>
                  {processingStep === 'audit_failed' || processingStep === 'error' ? 'Failed' : 'Processing'}
                </div>
                <div className={cn(
                  "text-sm font-semibold flex items-center gap-2 truncate",
                  processingStep === 'audit_failed' || processingStep === 'error' ? 'text-rose-700' : 'text-slate-800',
                )}>
                  {processingStep === "audit_start" && (
                    <><FiSearch className="animate-pulse shrink-0" /> AI 正在进行安全与合规性审查...</>
                  )}
                  {processingStep === "audit_passed" && (
                    <><FiCheckCircle className="text-emerald-500 shrink-0" /> 审查通过，正在准备数据...</>
                  )}
                  {processingStep === "ai_start" && (
                    <><FiCpu className="animate-spin shrink-0" /> 智能助手正在为您分析并生成方案...</>
                  )}
                  {processingStep === "ai_complete" && (
                    <><FiCheckCircle className="text-emerald-500 shrink-0" /> 方案生成完毕，正在最后同步...</>
                  )}
                  {processingStep === "saving" && (
                    <><FiTerminal className="text-slate-500 shrink-0" /> 正在同步至云端存储...</>
                  )}
                  {processingStep === "audit_failed" && (
                    <><FiX className="text-rose-500 shrink-0" /> 内容未通过 AI 审查...</>
                  )}
                  {processingStep === "error" && (
                    <><FiAlertCircle className="text-rose-500 shrink-0" /> 处理过程中发生错误...</>
                  )}
                </div>
              </div>

              <button
                onClick={() => setProcessingStep(null)}
                className="h-8 w-8 rounded-full flex items-center justify-center transition-all border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-700 shrink-0"
                aria-label="关闭进度浮窗"
              >
                <FiX size={14} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default TicketSystem;
