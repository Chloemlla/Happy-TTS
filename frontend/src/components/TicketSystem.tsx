import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { useAuth } from "../hooks/useAuth";
import { ticketApi, ITicket, ITicketMessage } from "../api/ticketApi";
import { useNotification } from "./Notification";
import { 
  FiSend, FiPlus, FiMessageSquare, FiClock, 
  FiCheckCircle, FiAlertCircle, FiX, FiFilter,
  FiUser, FiTag, FiChevronRight, FiSearch, FiInfo,
  FiCpu, FiCheck, FiTerminal, FiEdit2, FiTrash2
} from "react-icons/fi";
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import hljs from 'highlight.js';
import 'highlight.js/styles/github-dark.css';

// 工单处理细分状态类型
type TicketProcessStep = "audit_start" | "audit_passed" | "ai_start" | "ai_complete" | "saving";

// 配置 marked
marked.use({
  async: true,
  pedantic: false,
  gfm: true,
  renderer: {
    code({ text, lang }: { text: string; lang?: string }) {
      const language = lang && hljs.getLanguage(lang) ? lang : 'plaintext';
      const highlighted = hljs.highlight(text, { language }).value;
      return `<pre class="bg-gray-900 text-gray-100 rounded-lg p-3 my-2 overflow-x-auto"><code class="hljs language-${language}">${highlighted}</code></pre>`;
    }
  }
});

const ROW_INITIAL = { opacity: 0, x: -20 } as const;
const ROW_ANIMATE = { opacity: 1, x: 0 } as const;

// Markdown 消息渲染组件
const MarkdownMessage: React.FC<{ content: string, isDark?: boolean }> = ({ content, isDark }) => {
  const [html, setHtml] = useState("");

  useEffect(() => {
    const renderMarkdown = async () => {
      const parsed = await marked.parse(content);
      setHtml(DOMPurify.sanitize(parsed));
    };
    renderMarkdown();
  }, [content]);

  return (
    <div 
      className={`prose prose-sm max-w-none break-words ${isDark ? 'prose-invert text-white' : 'text-gray-800'} 
        prose-pre:bg-gray-900 prose-pre:p-0 prose-code:bg-gray-100 prose-code:text-pink-600 
        prose-code:px-1 prose-code:rounded prose-headings:text-inherit prose-strong:text-inherit`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
};

const TicketSystem: React.FC = () => {
  const { user } = useAuth();
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
  
  // 管理员编辑状态
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);

  // 实时处理状态
  const [processingStep, setProcessingStep] = useState<TicketProcessStep | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const prefersReducedMotion = useReducedMotion();

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

  // 监听屏幕尺寸
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 1024);
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // 确保 isAdmin 判定准确，增加对大小写和空格的容错
  const isAdmin = user?.role?.toLowerCase().trim() === "admin";

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
      
      // 桌面端自动选中第一个，移动端不自动进入详情
      if (data.length > 0 && !selectedTicket && !isCreating && !isMobile) {
        setSelectedTicket(data[0]);
      }
    } catch (error) {
      setNotification({ type: 'error', message: "加载工单失败" });
    } finally {
      setLoading(false);
    }
  };

  // WebSocket 实时监听
  useEffect(() => {
    // 监听全局 WebSocket 事件 (假设 wsService 已在全局或通过 hook 暴露)
    // 这里的实现取决于项目的 WS 架构，通常是通过 window.addEventListener 或专门的消息总线
    const handleWsMessage = (event: any) => {
      try {
        const msg = JSON.parse(event.data);
        
        // 处理工单更新
        if (msg.type === "ticket:update") {
          const updatedTicket = msg.data;
          setTickets(prev => prev.map(t => t._id === updatedTicket._id ? updatedTicket : t));
          setSelectedTicket(prev => prev?._id === updatedTicket._id ? updatedTicket : prev);
          
          // 收到正式更新，清除处理状态
          setProcessingStep(null);
        }
        
        // 处理实时进度
        if (msg.type === "ticket:process") {
          const { ticketId, step } = msg.data;
          // 如果是当前工单或正在创建的新工单
          if (ticketId === "new" || ticketId === selectedTicket?._id) {
            setProcessingStep(step);
          }
        }
      } catch (err) {
        // 忽略
      }
    };

    // 如果 WebSocket 实例暴露在 window 或特定的 service 上
    // 这里的实现假设 wsService 已经初始化并正在运行
    // 由于后端在 wsService.ts 中定义了 WS 服务，前端通常会有一个配套的 ws 监听逻辑
    // 暂且使用这种通用的监听方式，实际项目中可能需要注入特定的 WS 实例
    const ws = (window as any).ws;
    if (ws && ws.addEventListener) {
      ws.addEventListener("message", handleWsMessage);
      return () => ws.removeEventListener("message", handleWsMessage);
    }
  }, [selectedTicket?._id]);

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
      await ticketApi.createTicket(newTicket);
      setNotification({ type: 'success', message: "工单已提交" });
      setIsCreating(false);
      setShowDetailOnMobile(false);
      setNewTicket({ title: "", description: "", priority: "medium" });
      fetchTickets();
    } catch (error: any) {
      if (error.response?.status === 403) {
        const data = error.response.data;
        setNotification({ 
          type: 'error', 
          message: `${data.error}: ${data.details || ''} ${data.punishment || ''}`.trim() 
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
    } catch (error: any) {
      if (error.response?.status === 403) {
        const data = error.response.data;
        setNotification({ 
          type: 'error', 
          message: `${data.error}: ${data.details || ''} ${data.punishment || ''}`.trim() 
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
        return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-100 text-blue-800">待处理</span>;
      case "in-progress": 
        return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-yellow-100 text-yellow-800">处理中</span>;
      case "resolved": 
        return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-green-100 text-green-800">已解决</span>;
      case "closed": 
        return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-gray-100 text-gray-800">已关闭</span>;
      default: return null;
    }
  };

  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case "high": return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-red-100 text-red-800">紧急</span>;
      case "medium": return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-orange-100 text-orange-800">一般</span>;
      case "low": return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-green-100 text-green-800">低</span>;
      default: return null;
    }
  };

  return (
    <motion.div
      className="space-y-4 sm:space-y-6"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6 }}
    >
      {/* 标题和说明卡片 */}
      <motion.div
        className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-4 sm:p-6 border border-blue-100 shadow-sm"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
      >
        <h2 className="text-xl sm:text-2xl font-bold text-blue-700 mb-2 sm:mb-3 flex items-center gap-2">
          <FiMessageSquare className="text-blue-600" />
          支持中心
        </h2>
        <div className="text-gray-600 space-y-2 text-sm sm:text-base">
          <p>欢迎使用工单支持系统，我们为您提供专业的问题咨询与反馈服务。</p>
          <div className="hidden sm:flex items-start gap-2 text-sm">
            <div>
              <p className="font-semibold text-blue-700">功能说明：</p>
              <ul className="list-disc list-inside space-y-1 mt-1">
                <li>提交技术支持、功能反馈或投诉建议</li>
                <li>实时查看客服回复并进行双向沟通</li>
                <li>{isAdmin ? "管理全局工单，支持状态过滤与更新" : "管理个人工单历史，追踪处理进度"}</li>
              </ul>
            </div>
          </div>
        </div>
      </motion.div>

      <div className="flex flex-col lg:flex-row gap-4 lg:gap-6 h-[calc(100vh-250px)] min-h-[500px] sm:min-h-[600px]">
        {/* 左侧列表卡片 */}
        <motion.div
          className={`${(isMobile && showDetailOnMobile) ? 'hidden' : 'flex'} lg:w-96 bg-white rounded-xl shadow-sm border border-gray-200 flex-col overflow-hidden w-full`}
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
        >
          <div className="p-4 border-b border-gray-100 bg-gray-50/50 flex justify-between items-center">
            <h3 className="font-semibold text-gray-800 flex items-center gap-2">
              <FiFilter className="text-blue-500" />
              {isAdmin ? "工单广场" : "历史工单"}
            </h3>
            {!isAdmin && (
              <motion.button
                onClick={() => {
                  setIsCreating(true);
                  if (isMobile) setShowDetailOnMobile(true);
                }}
                className="p-2 bg-blue-500 text-white rounded-lg shadow-md"
                whileHover={hoverScale(1.05)}
                whileTap={tapScale(0.95)}
              >
                <FiPlus />
              </motion.button>
            )}
          </div>

          {isAdmin && (
            <div className="p-3 bg-white border-b border-gray-100 grid grid-cols-2 gap-2">
              <select 
                className="text-[10px] sm:text-xs p-2 rounded-lg border-2 border-gray-100 bg-white outline-none focus:ring-2 focus:ring-blue-400 transition-all appearance-none"
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
                className="text-[10px] sm:text-xs p-2 rounded-lg border-2 border-gray-100 bg-white outline-none focus:ring-2 focus:ring-blue-400 transition-all appearance-none"
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

          <div className="flex-1 overflow-y-auto custom-scrollbar">
            {loading ? (
              <div className="flex flex-col items-center justify-center p-12 space-y-4">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
                <span className="text-gray-400 text-sm">加载中...</span>
              </div>
            ) : tickets.length === 0 ? (
              <div className="p-12 text-center">
                <FiInfo className="mx-auto text-gray-200 mb-2" size={32} />
                <p className="text-gray-400 text-sm">暂无工单数据</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-50">
                {tickets.map((ticket, idx) => (
                  <motion.div
                    key={ticket._id}
                    onClick={() => {
                      setSelectedTicket(ticket);
                      setIsCreating(false);
                      if (isMobile) setShowDetailOnMobile(true);
                    }}
                    className={`p-4 cursor-pointer transition-all duration-200 ${
                      selectedTicket?._id === ticket._id 
                        ? "bg-blue-50/50 border-l-4 border-blue-500" 
                        : "hover:bg-gray-50 border-l-4 border-transparent"
                    }`}
                    initial={ROW_INITIAL}
                    animate={ROW_ANIMATE}
                    transition={{ duration: 0.3, delay: 0.05 * idx }}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <h4 className="font-semibold text-gray-800 text-sm truncate max-w-[140px] sm:max-w-[180px]">{ticket.title}</h4>
                      {getPriorityBadge(ticket.priority)}
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-gray-500">
                      <div className="flex items-center gap-1.5">
                        {getStatusBadge(ticket.status)}
                      </div>
                      <span className="font-mono">{new Date(ticket.updatedAt).toLocaleDateString()}</span>
                    </div>
                    {isAdmin && (
                      <div className="mt-2 text-[10px] text-indigo-500 font-medium flex items-center gap-1">
                        <FiUser size={10} /> {ticket.username}
                      </div>
                    )}
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        </motion.div>

        {/* 右侧内容卡片 */}
        <motion.div
          className={`${(isMobile && !showDetailOnMobile) ? 'hidden' : 'flex'} flex-1 bg-white rounded-xl shadow-sm border border-gray-200 flex-col overflow-hidden relative w-full`}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
        >
          {isMobile && showDetailOnMobile && (
            <div className="p-2 border-b border-gray-100 bg-white">
              <button 
                onClick={() => setShowDetailOnMobile(false)}
                className="flex items-center gap-1 text-sm text-blue-600 font-bold px-3 py-1.5 rounded-lg hover:bg-blue-50 transition-all"
              >
                <FiChevronRight className="rotate-180" /> 返回工单列表
              </button>
            </div>
          )}

          <AnimatePresence mode="wait">
            {isCreating ? (
              <motion.div
                key="create"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="p-4 sm:p-8 h-full overflow-y-auto"
              >
                <div className="max-w-xl mx-auto">
                  <h3 className="text-lg sm:text-xl font-bold text-gray-800 mb-4 sm:6 flex items-center gap-2">
                    <FiPlus className="text-blue-500" /> 发起新工单
                  </h3>
                  <form onSubmit={handleCreateTicket} className="space-y-4 sm:space-y-5">
                    <div>
                      <label className="block text-xs sm:text-sm font-semibold text-gray-700 mb-2">工单标题</label>
                      <input
                        type="text"
                        required
                        placeholder="请输入简明扼要的标题"
                        className="w-full px-4 py-2.5 border-2 border-gray-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400 transition-all text-sm"
                        value={newTicket.title}
                        onChange={e => setNewTicket(prev => ({ ...prev, title: e.target.value }))}
                      />
                    </div>
                    <div>
                      <label className="block text-xs sm:text-sm font-semibold text-gray-700 mb-2">紧急程度</label>
                      <div className="flex gap-2 sm:gap-3">
                        {['low', 'medium', 'high'].map(p => (
                          <label key={p} className="flex-1">
                            <input
                              type="radio"
                              name="priority"
                              value={p}
                              checked={newTicket.priority === p}
                              onChange={e => setNewTicket(prev => ({ ...prev, priority: e.target.value }))}
                              className="hidden peer"
                            />
                            <div className={`text-center py-2 rounded-lg border-2 cursor-pointer transition-all text-xs sm:text-sm font-medium
                              ${p === 'high' ? 'peer-checked:bg-red-50 peer-checked:border-red-500 peer-checked:text-red-700 border-gray-100 text-gray-400' :
                                p === 'medium' ? 'peer-checked:bg-orange-50 peer-checked:border-orange-500 peer-checked:text-orange-700 border-gray-100 text-gray-400' :
                                'peer-checked:bg-green-50 peer-checked:border-green-500 peer-checked:text-green-700 border-gray-100 text-gray-400'}`}
                            >
                              {p === 'high' ? '紧急' : p === 'medium' ? '一般' : '低'}
                            </div>
                          </label>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs sm:text-sm font-semibold text-gray-700 mb-2">详细描述</label>
                      <textarea
                        required
                        rows={isMobile ? 6 : 8}
                        placeholder="请尽可能详细地说明您遇到的问题或建议，以便我们能更快为您处理..."
                        className="w-full px-4 py-3 border-2 border-gray-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400 transition-all text-sm resize-none"
                        value={newTicket.description}
                        onChange={e => setNewTicket(prev => ({ ...prev, description: e.target.value }))}
                      />
                    </div>
                    <div className="flex gap-3 pt-2 sm:pt-4">
                      <motion.button
                        type="submit"
                        className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-bold shadow-lg shadow-blue-100 text-sm"
                        whileHover={hoverScale(1.02)}
                        whileTap={tapScale(0.98)}
                      >
                        提交工单
                      </motion.button>
                      <motion.button
                        type="button"
                        onClick={() => {
                          setIsCreating(false);
                          if (isMobile) setShowDetailOnMobile(false);
                        }}
                        className="px-6 sm:px-8 py-3 bg-gray-100 text-gray-600 rounded-xl font-bold text-sm"
                        whileHover={hoverScale(1.02)}
                        whileTap={tapScale(0.98)}
                      >
                        返回
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
                {/* 详情头部 */}
                <div className="p-4 sm:p-5 border-b border-gray-100 bg-gray-50/30 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 sm:gap-3">
                      <h3 className="font-bold text-gray-800 text-sm sm:text-base">{selectedTicket.title}</h3>
                      {getPriorityBadge(selectedTicket.priority)}
                    </div>
                    <div className="flex items-center gap-4 text-[10px] sm:text-[11px] text-gray-400 font-mono">
                      <span className="flex items-center gap-1"><FiUser className="text-blue-400"/> {selectedTicket.username}</span>
                      <span className="flex items-center gap-1"><FiClock className="text-orange-400"/> {new Date(selectedTicket.createdAt).toLocaleString()}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 w-full sm:w-auto">
                    {isAdmin ? (
                      <select
                        className="text-[10px] sm:text-xs font-bold p-2 rounded-lg border-2 border-blue-100 bg-white text-blue-700 outline-none focus:ring-2 focus:ring-blue-400 w-full sm:w-auto"
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

                {/* 消息区域 */}
                <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 sm:space-y-6 bg-white custom-scrollbar">
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
                        <div className={`max-w-[85%] sm:max-w-[75%] relative ${isMe ? 'order-1' : 'order-2'}`}>
                          {/* 消息元信息 */}
                          <div className={`flex items-center gap-2 mb-1 text-[10px] text-gray-400 ${isMe ? 'justify-end' : 'justify-start'}`}>
                            {!isMe && (
                              <span className="font-bold text-gray-500">
                                {isAi ? "🤖 智能助手" : isAdminMsg ? "🛡️ 客服人员" : "👤 用户"}
                              </span>
                            )}
                            <span>{new Date(msg.createdAt).toLocaleString()}</span>
                          </div>

                          {/* 消息气泡 */}
                          <div className={`relative p-3 sm:p-4 rounded-2xl shadow-sm border ${
                            isAi ? 'bg-indigo-600 border-indigo-500 text-white rounded-tl-none' :
                            isAdminMsg ? 'bg-blue-50 border-blue-100 text-blue-900 rounded-tl-none' :
                            isMe ? 'bg-blue-600 border-blue-500 text-white rounded-tr-none' :
                            'bg-gray-50 border-gray-100 text-gray-800 rounded-tl-none'
                          }`}>
                            {editingIdx === idx ? (
                              <div className="space-y-2">
                                <textarea
                                  className="w-full bg-white/10 border border-white/20 rounded-lg p-2 text-sm focus:outline-none focus:ring-1 focus:ring-white/50 min-h-[100px]"
                                  value={editValue}
                                  onChange={(e) => setEditValue(e.target.value)}
                                  autoFocus
                                />
                                <div className="flex gap-2 justify-end">
                                  <button
                                    onClick={() => handleAdminEdit(selectedTicket._id, idx)}
                                    disabled={isUpdating}
                                    className="px-3 py-1 bg-green-500 text-white text-xs rounded-md font-bold flex items-center gap-1"
                                  >
                                    {isUpdating ? <span className="animate-spin">⌛</span> : <FiCheck />} 保存
                                  </button>
                                  <button
                                    onClick={() => setEditingIdx(null)}
                                    className="px-3 py-1 bg-white/20 text-white text-xs rounded-md font-bold"
                                  >
                                    取消
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <MarkdownMessage content={msg.content} isDark={isMe || isAi} />
                            )}

                            {/* 管理员操作按钮 (仅限管理员，且非编辑模式) */}
                            {isAdmin && editingIdx !== idx && (
                              <div className={`absolute -bottom-6 ${isMe ? 'left-0' : 'right-0'} opacity-0 group-hover:opacity-100 transition-opacity flex gap-2`}>
                                <button
                                  onClick={() => {
                                    setEditingIdx(idx);
                                    setEditValue(msg.content);
                                  }}
                                  className="p-1 text-gray-400 hover:text-blue-500 transition-colors"
                                  title="编辑消息"
                                >
                                  <FiEdit2 size={12} />
                                </button>
                                <button
                                  onClick={() => handleAdminDelete(selectedTicket._id, idx)}
                                  className="p-1 text-gray-400 hover:text-red-500 transition-colors"
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

                  {/* 实时处理进度指示器 */}
                  <AnimatePresence>
                    {processingStep && (
                      <motion.div
                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="flex justify-start mb-4"
                      >
                        <div className="bg-indigo-50 border border-indigo-100 rounded-2xl px-4 py-3 shadow-sm flex items-center gap-3">
                          <div className="flex gap-1">
                            <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce"></span>
                            <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce delay-75"></span>
                            <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce delay-150"></span>
                          </div>
                          <div className="text-xs sm:text-sm font-medium text-indigo-600 flex items-center gap-2">
                            {processingStep === "audit_start" && (
                              <><span className="text-lg">🔍</span> AI 正在进行安全与合规性审查...</>
                            )}
                            {processingStep === "audit_passed" && (
                              <><span className="text-lg">✅</span> 审查通过，正在准备数据...</>
                            )}
                            {processingStep === "ai_start" && (
                              <><span className="text-lg">🧠</span> 智能助手正在为您分析问题并生成方案...</>
                            )}
                            {processingStep === "ai_complete" && (
                              <><span className="text-lg">✨</span> 方案生成完毕，正在最后同步...</>
                            )}
                            {processingStep === "saving" && (
                              <><span className="text-lg">💾</span> 正在同步至云端存储...</>
                            )}
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <div ref={messagesEndRef} />
                </div>

                {/* 底部输入框 */}
                {selectedTicket.status !== "closed" ? (
                  <div className="p-3 sm:p-4 bg-gray-50/50 border-t border-gray-100">
                    <form onSubmit={handleReply} className="flex gap-2 bg-white p-1 rounded-2xl border-2 border-gray-100 shadow-sm focus-within:border-blue-300 transition-all">
                      <input
                        type="text"
                        placeholder={isAdmin ? "在此输入回复内容..." : "补充更多详情..."}
                        className="flex-1 px-3 sm:px-4 py-2 text-xs sm:text-sm outline-none bg-transparent"
                        value={replyContent}
                        onChange={e => setReplyContent(e.target.value)}
                      />
                      <motion.button
                        type="submit"
                        disabled={!replyContent.trim()}
                        className="p-2.5 sm:p-3 bg-blue-600 text-white rounded-xl disabled:opacity-50 shadow-lg shadow-blue-100"
                        whileHover={hoverScale(1.05)}
                        whileTap={tapScale(0.95)}
                      >
                        <FiSend />
                      </motion.button>
                    </form>
                  </div>
                ) : (
                  <div className="p-4 sm:p-6 bg-gray-100/50 text-center border-t border-gray-100">
                    <p className="text-xs sm:text-sm text-gray-500 font-medium flex items-center justify-center gap-2">
                      <FiX /> 此工单已关闭，如需继续咨询请发起新工单
                    </p>
                  </div>
                )}
              </motion.div>
            ) : (
              <motion.div
                key="empty"
                className="flex flex-col items-center justify-center h-full text-gray-300 p-8 sm:p-12"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
              >
                <div className="w-16 h-16 sm:w-20 sm:h-20 bg-blue-50 rounded-full flex items-center justify-center mb-4 sm:6 text-blue-200 shadow-inner">
                  <FiMessageSquare size={isMobile ? 32 : 40} />
                </div>
                <h3 className="text-lg sm:text-xl font-bold text-gray-500 mb-2 text-center">选择一个工单</h3>
                <p className="text-xs sm:text-sm text-gray-400 text-center max-w-xs leading-relaxed">
                  请从左侧列表选择已有工单查看详情，或点击上方按钮开启新的对话请求。
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
    </motion.div>
  );
};

export default TicketSystem;
