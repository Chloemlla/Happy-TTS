import React, { useState, useEffect, useRef } from "react";
import { m, AnimatePresence } from "framer-motion";
import { useAuth } from "../hooks/useAuth";
import { ticketApi, ITicket, ITicketMessage } from "../api/ticketApi";
import { toast } from "react-toastify";
import { 
  FiSend, FiPlus, FiMessageSquare, FiClock, 
  FiCheckCircle, FiAlertCircle, FiX, FiFilter,
  FiUser, FiTag, FiChevronRight
} from "react-icons/fi";

const TicketSystem: React.FC = () => {
  const { user } = useAuth();
  const [tickets, setTickets] = useState<ITicket[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<ITicket | null>(null);
  const [loading, setLoading] = useState(true);
  const [replyContent, setReplyContent] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [newTicket, setNewTicket] = useState({ title: "", description: "", priority: "medium" });
  const [adminFilter, setAdminFilter] = useState({ status: "", priority: "" });
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const isAdmin = user?.role === "admin";

  const fetchTickets = async () => {
    try {
      setLoading(true);
      const data = isAdmin 
        ? await ticketApi.getAllTickets(adminFilter)
        : await ticketApi.getMyTickets();
      setTickets(data);
    } catch (error) {
      toast.error("加载工单失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTickets();
  }, [isAdmin, adminFilter]);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [selectedTicket?.messages]);

  const handleCreateTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await ticketApi.createTicket(newTicket);
      toast.success("工单已提交");
      setIsCreating(false);
      setNewTicket({ title: "", description: "", priority: "medium" });
      fetchTickets();
    } catch (error) {
      toast.error("提交失败");
    }
  };

  const handleReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTicket || !replyContent.trim()) return;
    try {
      const updated = await ticketApi.replyTicket(selectedTicket._id, replyContent);
      setSelectedTicket(updated);
      setReplyContent("");
      // 更新列表中的状态
      setTickets(prev => prev.map(t => t._id === updated._id ? updated : t));
    } catch (error) {
      toast.error("发送失败");
    }
  };

  const handleUpdateStatus = async (id: string, status: string) => {
    try {
      const updated = await ticketApi.updateStatus(id, status);
      if (selectedTicket?._id === id) setSelectedTicket(updated);
      setTickets(prev => prev.map(t => t._id === updated._id ? updated : t));
      toast.success("状态已更新");
    } catch (error) {
      toast.error("更新失败");
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "open": return <FiAlertCircle className="text-blue-500" />;
      case "in-progress": return <FiClock className="text-yellow-500" />;
      case "resolved": return <FiCheckCircle className="text-green-500" />;
      case "closed": return <FiX className="text-gray-500" />;
      default: return null;
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "high": return "bg-red-100 text-red-600";
      case "medium": return "bg-yellow-100 text-yellow-600";
      case "low": return "bg-green-100 text-green-600";
      default: return "bg-gray-100 text-gray-600";
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-120px)] bg-white/50 backdrop-blur-md rounded-2xl border border-white/20 overflow-hidden shadow-xl">
      <div className="flex h-full">
        {/* Sidebar */}
        <div className="w-80 border-r border-gray-200 flex flex-col bg-gray-50/50">
          <div className="p-4 border-b border-gray-200 flex justify-between items-center bg-white/80">
            <h2 className="text-lg font-bold flex items-center gap-2">
              <FiMessageSquare /> {isAdmin ? "所有工单" : "我的工单"}
            </h2>
            {!isAdmin && (
              <button
                onClick={() => setIsCreating(true)}
                className="p-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
              >
                <FiPlus />
              </button>
            )}
          </div>

          {isAdmin && (
            <div className="p-3 bg-white/40 border-b border-gray-200 flex gap-2">
              <select 
                className="text-xs p-1 rounded border bg-white/50 outline-none"
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
                className="text-xs p-1 rounded border bg-white/50 outline-none"
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

          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex justify-center p-8 text-gray-400">加载中...</div>
            ) : tickets.length === 0 ? (
              <div className="p-8 text-center text-gray-400">暂无工单</div>
            ) : (
              tickets.map(ticket => (
                <div
                  key={ticket._id}
                  onClick={() => {
                    setSelectedTicket(ticket);
                    setIsCreating(false);
                  }}
                  className={`p-4 border-b border-gray-100 cursor-pointer hover:bg-white/80 transition-all ${
                    selectedTicket?._id === ticket._id ? "bg-white shadow-sm ring-1 ring-black/5" : ""
                  }`}
                >
                  <div className="flex justify-between items-start mb-1">
                    <h3 className="font-medium text-sm truncate pr-2">{ticket.title}</h3>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${getPriorityColor(ticket.priority)}`}>
                      {ticket.priority === 'high' ? '紧急' : ticket.priority === 'medium' ? '一般' : '低'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-gray-500">
                    <div className="flex items-center gap-1">
                      {getStatusIcon(ticket.status)}
                      <span>{
                        ticket.status === 'open' ? '待处理' : 
                        ticket.status === 'in-progress' ? '处理中' : 
                        ticket.status === 'resolved' ? '已解决' : '已关闭'
                      }</span>
                    </div>
                    <span>{new Date(ticket.updatedAt).toLocaleDateString()}</span>
                  </div>
                  {isAdmin && (
                    <div className="mt-2 text-[10px] flex items-center gap-1 text-indigo-500">
                      <FiUser size={10} /> {ticket.username}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex flex-col bg-white/30">
          <AnimatePresence mode="wait">
            {isCreating ? (
              <m.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="p-8 max-w-2xl mx-auto w-full"
              >
                <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
                  <FiPlus className="text-indigo-600" /> 提交新工单
                </h2>
                <form onSubmit={handleCreateTicket} className="space-y-4 bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">标题</label>
                    <input
                      type="text"
                      required
                      placeholder="简要描述您的问题"
                      className="w-full p-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                      value={newTicket.title}
                      onChange={e => setNewTicket(prev => ({ ...prev, title: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">优先级</label>
                    <div className="flex gap-4">
                      {['low', 'medium', 'high'].map(p => (
                        <label key={p} className="flex items-center gap-1 cursor-pointer">
                          <input
                            type="radio"
                            name="priority"
                            value={p}
                            checked={newTicket.priority === p}
                            onChange={e => setNewTicket(prev => ({ ...prev, priority: e.target.value }))}
                            className="text-indigo-600"
                          />
                          <span className="text-sm capitalize">{p === 'high' ? '紧急' : p === 'medium' ? '一般' : '低'}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">详细说明</label>
                    <textarea
                      required
                      rows={6}
                      placeholder="请详细描述您遇到的问题..."
                      className="w-full p-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none resize-none"
                      value={newTicket.description}
                      onChange={e => setNewTicket(prev => ({ ...prev, description: e.target.value }))}
                    />
                  </div>
                  <div className="flex justify-end gap-3 pt-4">
                    <button
                      type="button"
                      onClick={() => setIsCreating(false)}
                      className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                      取消
                    </button>
                    <button
                      type="submit"
                      className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 shadow-md transition-all active:scale-95"
                    >
                      提交工单
                    </button>
                  </div>
                </form>
              </m.div>
            ) : selectedTicket ? (
              <m.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                key={selectedTicket._id}
                className="flex flex-col h-full"
              >
                {/* Ticket Header */}
                <div className="p-4 bg-white/80 border-b border-gray-200 flex justify-between items-center shadow-sm">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${getPriorityColor(selectedTicket.priority)}`}>
                        {selectedTicket.priority === 'high' ? '紧急' : selectedTicket.priority === 'medium' ? '一般' : '低'}
                      </span>
                      <h2 className="font-bold text-gray-800">{selectedTicket.title}</h2>
                    </div>
                    <div className="text-xs text-gray-500 flex items-center gap-3">
                      <span className="flex items-center gap-1"><FiUser size={12}/> {selectedTicket.username}</span>
                      <span className="flex items-center gap-1"><FiClock size={12}/> {new Date(selectedTicket.createdAt).toLocaleString()}</span>
                    </div>
                  </div>
                  {isAdmin ? (
                    <div className="flex gap-2">
                      <select
                        className="text-sm p-1.5 rounded-lg border bg-white outline-none focus:ring-2 focus:ring-indigo-500"
                        value={selectedTicket.status}
                        onChange={e => handleUpdateStatus(selectedTicket._id, e.target.value)}
                      >
                        <option value="open">待处理</option>
                        <option value="in-progress">处理中</option>
                        <option value="resolved">标记为已解决</option>
                        <option value="closed">关闭工单</option>
                      </select>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 px-3 py-1 bg-gray-100 rounded-full text-xs font-medium text-gray-600">
                      {getStatusIcon(selectedTicket.status)}
                      {selectedTicket.status === 'open' ? '待处理' : 
                       selectedTicket.status === 'in-progress' ? '处理中' : 
                       selectedTicket.status === 'resolved' ? '已解决' : '已关闭'}
                    </div>
                  )}
                </div>

                {/* Messages Area */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-gray-50/30">
                  {selectedTicket.messages.map((msg, idx) => (
                    <div
                      key={idx}
                      className={`flex ${msg.senderRole === "admin" ? "justify-start" : "justify-end"}`}
                    >
                      <div className={`max-w-[80%] rounded-2xl p-4 shadow-sm relative ${
                        msg.senderRole === "admin" 
                          ? "bg-white border border-indigo-100 rounded-tl-none" 
                          : "bg-indigo-600 text-white rounded-tr-none"
                      }`}>
                        {msg.senderRole === "admin" && (
                          <div className="text-[10px] text-indigo-500 font-bold mb-1 uppercase tracking-wider">客服回复</div>
                        )}
                        <p className="text-sm whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                        <div className={`text-[10px] mt-2 opacity-60 ${msg.senderRole === "admin" ? "text-gray-500" : "text-white"}`}>
                          {new Date(msg.createdAt).toLocaleString()}
                        </div>
                      </div>
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </div>

                {/* Reply Box */}
                {selectedTicket.status !== "closed" && (
                  <div className="p-4 bg-white border-t border-gray-200">
                    <form onSubmit={handleReply} className="flex gap-2">
                      <input
                        type="text"
                        placeholder={isAdmin ? "回复用户..." : "向客服提问..."}
                        className="flex-1 p-2 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                        value={replyContent}
                        onChange={e => setReplyContent(e.target.value)}
                      />
                      <button
                        type="submit"
                        disabled={!replyContent.trim()}
                        className="p-3 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-all disabled:opacity-50 active:scale-95 shadow-lg shadow-indigo-200"
                      >
                        <FiSend />
                      </button>
                    </form>
                  </div>
                )}
              </m.div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-gray-400 p-8">
                <m.div
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="flex flex-col items-center"
                >
                  <div className="w-24 h-24 bg-indigo-50 rounded-full flex items-center justify-center mb-4 text-indigo-200">
                    <FiMessageSquare size={48} />
                  </div>
                  <h3 className="text-xl font-medium text-gray-600 mb-2">欢迎使用支持中心</h3>
                  <p className="text-sm text-center max-w-xs">
                    {isAdmin 
                      ? "选择左侧列表中的工单开始处理用户的反馈" 
                      : "选择左侧工单查看详情，或点击右上角 '+' 提交新问题"}
                  </p>
                </m.div>
              </div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
};

export default TicketSystem;
