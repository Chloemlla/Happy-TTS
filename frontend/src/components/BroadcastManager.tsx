import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNotification } from './Notification';
import { getApiBaseUrl } from '../api/api';
import {
  FaBullhorn, FaPaperPlane, FaUsers, FaHistory,
  FaUserSlash, FaClipboardList, FaSyncAlt, FaUserAlt,
  FaCrown, FaPlug, FaTimes,
} from 'react-icons/fa';

// ========== 类型 ==========

type BroadcastLevel = 'info' | 'warn' | 'error';
type TabKey = 'broadcast' | 'direct' | 'online' | 'history' | 'templates';

interface OnlineClient {
  userId: string | null;
  isAdmin: boolean;
  channels: string[];
  connectedSince: number;
}

interface BroadcastLogItem {
  _id: string;
  message: string;
  level: string;
  admin: string;
  connections: number;
  createdAt: string;
}

// ========== 常量 ==========

const LEVEL_OPTIONS: { value: BroadcastLevel; label: string; color: string; emoji: string }[] = [
  { value: 'info', label: '通知', color: 'bg-blue-100 text-blue-700 border-blue-300', emoji: 'ℹ️' },
  { value: 'warn', label: '警告', color: 'bg-yellow-100 text-yellow-700 border-yellow-300', emoji: '⚠️' },
  { value: 'error', label: '紧急', color: 'bg-red-100 text-red-700 border-red-300', emoji: '🚨' },
];

const QUICK_TEMPLATES = [
  { label: '系统维护', message: '系统即将进行维护，请保存您的工作。', level: 'warn' as BroadcastLevel },
  { label: '版本更新', message: '系统已更新至最新版本，请刷新页面体验新功能。', level: 'info' as BroadcastLevel },
  { label: '服务恢复', message: '系统维护已完成，所有服务已恢复正常。', level: 'info' as BroadcastLevel },
  { label: '紧急通知', message: '检测到异常活动，请立即检查您的账户安全。', level: 'error' as BroadcastLevel },
  { label: '功能上线', message: '新功能已上线，欢迎前往体验！', level: 'info' as BroadcastLevel },
  { label: '服务降级', message: '部分服务暂时不可用，我们正在紧急修复中。', level: 'warn' as BroadcastLevel },
];

const SUB_TABS: { key: TabKey; label: string; icon: React.ReactNode }[] = [
  { key: 'broadcast', label: '全体广播', icon: <FaBullhorn /> },
  { key: 'direct', label: '定向推送', icon: <FaUserAlt /> },
  { key: 'online', label: '在线用户', icon: <FaUsers /> },
  { key: 'history', label: '广播历史', icon: <FaHistory /> },
  { key: 'templates', label: '快捷模板', icon: <FaClipboardList /> },
];

// ========== 工具函数 ==========

const authHeaders = () => ({
  Authorization: `Bearer ${localStorage.getItem('token')}`,
  'Content-Type': 'application/json',
});

const api = (path: string, opts?: RequestInit) =>
  fetch(`${getApiBaseUrl()}${path}`, { headers: authHeaders(), ...opts });

// ========== 组件 ==========

const BroadcastManager: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabKey>('broadcast');
  const { setNotification } = useNotification();

  // --- 全体广播 ---
  const [message, setMessage] = useState('');
  const [level, setLevel] = useState<BroadcastLevel>('info');
  const [sending, setSending] = useState(false);
  const [lastResult, setLastResult] = useState<{ connections: number; time: string } | null>(null);

  // --- 定向推送 ---
  const [directUserId, setDirectUserId] = useState('');
  const [directMessage, setDirectMessage] = useState('');
  const [directLevel, setDirectLevel] = useState<BroadcastLevel>('info');
  const [directSending, setDirectSending] = useState(false);

  // --- 在线用户 ---
  const [clients, setClients] = useState<OnlineClient[]>([]);
  const [clientsTotal, setClientsTotal] = useState(0);
  const [loadingClients, setLoadingClients] = useState(false);
  const [kickingUser, setKickingUser] = useState<string | null>(null);

  // --- 广播历史 ---
  const [history, setHistory] = useState<BroadcastLogItem[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // ========== API 调用 ==========

  const handleBroadcast = async () => {
    const trimmed = message.trim();
    if (!trimmed) { setNotification({ message: '请输入广播内容', type: 'warning' }); return; }
    setSending(true);
    try {
      const res = await api('/api/admin/broadcast', {
        method: 'POST',
        body: JSON.stringify({ message: trimmed, level }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '广播失败');
      setLastResult({ connections: data.connections ?? 0, time: new Date().toLocaleTimeString() });
      setNotification({ message: `广播已发送，${data.connections} 个在线连接`, type: 'success' });
      setMessage('');
    } catch (err) {
      setNotification({ message: err instanceof Error ? err.message : '广播失败', type: 'error' });
    } finally { setSending(false); }
  };

  const handleDirectPush = async () => {
    if (!directUserId.trim() || !directMessage.trim()) {
      setNotification({ message: '请填写用户ID和消息内容', type: 'warning' }); return;
    }
    setDirectSending(true);
    try {
      const res = await api('/api/admin/broadcast/user', {
        method: 'POST',
        body: JSON.stringify({ userId: directUserId.trim(), message: directMessage.trim(), level: directLevel }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '推送失败');
      setNotification({ message: '定向推送成功', type: 'success' });
      setDirectMessage('');
    } catch (err) {
      setNotification({ message: err instanceof Error ? err.message : '推送失败', type: 'error' });
    } finally { setDirectSending(false); }
  };

  const fetchClients = useCallback(async () => {
    setLoadingClients(true);
    try {
      const res = await api('/api/admin/ws/clients');
      const data = await res.json();
      if (data.success) { setClients(data.clients || []); setClientsTotal(data.total ?? 0); }
    } catch { setNotification({ message: '获取在线用户失败', type: 'error' }); }
    finally { setLoadingClients(false); }
  }, [setNotification]);

  const handleKick = async (userId: string) => {
    setKickingUser(userId);
    try {
      const res = await api('/api/admin/ws/kick', {
        method: 'POST',
        body: JSON.stringify({ userId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '操作失败');
      setNotification({ message: `已断开 ${data.kicked} 个连接`, type: 'success' });
      fetchClients();
    } catch (err) {
      setNotification({ message: err instanceof Error ? err.message : '操作失败', type: 'error' });
    } finally { setKickingUser(null); }
  };

  const fetchHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const res = await api('/api/admin/broadcast/history?limit=30');
      const data = await res.json();
      if (data.success) setHistory(data.logs || []);
    } catch { setNotification({ message: '获取广播历史失败', type: 'error' }); }
    finally { setLoadingHistory(false); }
  }, [setNotification]);

  // 切换 tab 时自动加载数据
  useEffect(() => {
    if (activeTab === 'online') fetchClients();
    if (activeTab === 'history') fetchHistory();
  }, [activeTab, fetchClients, fetchHistory]);

  const applyTemplate = (tpl: typeof QUICK_TEMPLATES[0]) => {
    setMessage(tpl.message);
    setLevel(tpl.level);
    setActiveTab('broadcast');
    setNotification({ message: `已填充模板「${tpl.label}」`, type: 'success' });
  };

  const selectedLevel = LEVEL_OPTIONS.find(l => l.value === level)!;

  // ========== 渲染子面板 ==========

  const renderBroadcast = () => (
    <div className="space-y-5">
      {/* 消息级别 */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">消息级别</label>
        <div className="flex gap-3">
          {LEVEL_OPTIONS.map(opt => (
            <motion.button key={opt.value} onClick={() => setLevel(opt.value)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-all ${
                level === opt.value ? `${opt.color} border-current shadow-sm` : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100'
              }`} whileTap={{ scale: 0.96 }}>
              <span>{opt.emoji}</span><span>{opt.label}</span>
            </motion.button>
          ))}
        </div>
      </div>

      {/* 消息输入 */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">广播内容</label>
        <textarea value={message} onChange={e => setMessage(e.target.value)}
          placeholder="输入要广播给所有在线用户的消息..." rows={4} maxLength={500}
          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none text-sm" />
        <div className="flex justify-between mt-1 text-xs text-gray-400">
          <span>支持纯文本消息</span><span>{message.length}/500</span>
        </div>
      </div>

      {/* 预览 */}
      {message.trim() && (
        <div className={`p-4 rounded-lg border ${selectedLevel.color}`}>
          <div className="text-xs font-medium mb-1 opacity-70">预览</div>
          <div className="text-sm">{selectedLevel.emoji} {message.trim()}</div>
        </div>
      )}

      {/* 发送 */}
      <motion.button onClick={handleBroadcast} disabled={sending || !message.trim()}
        className={`flex items-center justify-center gap-2 w-full px-6 py-3 rounded-lg font-semibold text-white transition-all ${
          sending || !message.trim() ? 'bg-gray-300 cursor-not-allowed'
            : 'bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 shadow-lg hover:shadow-xl'
        }`} whileHover={!sending && message.trim() ? { scale: 1.02 } : {}} whileTap={!sending && message.trim() ? { scale: 0.98 } : {}}>
        {sending ? (<><div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" /><span>发送中...</span></>)
          : (<><FaPaperPlane /><span>发送广播</span></>)}
      </motion.button>

      {lastResult && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-3 p-4 bg-green-50 border border-green-200 rounded-lg text-sm">
          <FaUsers className="text-green-600" />
          <span className="text-green-700">上次广播于 {lastResult.time}，送达 {lastResult.connections} 个在线连接</span>
        </motion.div>
      )}
    </div>
  );

  const renderDirect = () => (
    <div className="space-y-5">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">目标用户 ID</label>
        <input value={directUserId} onChange={e => setDirectUserId(e.target.value)}
          placeholder="输入要推送的用户ID..."
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm" />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">消息级别</label>
        <div className="flex gap-3">
          {LEVEL_OPTIONS.map(opt => (
            <motion.button key={opt.value} onClick={() => setDirectLevel(opt.value)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-all ${
                directLevel === opt.value ? `${opt.color} border-current shadow-sm` : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100'
              }`} whileTap={{ scale: 0.96 }}>
              <span>{opt.emoji}</span><span>{opt.label}</span>
            </motion.button>
          ))}
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">消息内容</label>
        <textarea value={directMessage} onChange={e => setDirectMessage(e.target.value)}
          placeholder="输入要推送给该用户的消息..." rows={3} maxLength={500}
          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none text-sm" />
      </div>
      <motion.button onClick={handleDirectPush} disabled={directSending || !directUserId.trim() || !directMessage.trim()}
        className={`flex items-center justify-center gap-2 w-full px-6 py-3 rounded-lg font-semibold text-white transition-all ${
          directSending || !directUserId.trim() || !directMessage.trim() ? 'bg-gray-300 cursor-not-allowed'
            : 'bg-gradient-to-r from-green-500 to-teal-500 hover:from-green-600 hover:to-teal-600 shadow-lg'
        }`} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
        {directSending ? (<><div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" /><span>推送中...</span></>)
          : (<><FaPaperPlane /><span>发送定向推送</span></>)}
      </motion.button>
    </div>
  );

  const renderOnline = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <FaPlug className="text-green-500" />
          <span>当前在线 <span className="font-bold text-gray-800">{clientsTotal}</span> 个连接</span>
        </div>
        <motion.button onClick={fetchClients} disabled={loadingClients}
          className="flex items-center gap-1 px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg transition"
          whileTap={{ scale: 0.95 }}>
          <FaSyncAlt className={loadingClients ? 'animate-spin' : ''} /><span>刷新</span>
        </motion.button>
      </div>

      {loadingClients && clients.length === 0 ? (
        <div className="text-center py-10 text-gray-400">加载中...</div>
      ) : clients.length === 0 ? (
        <div className="text-center py-10 text-gray-400">暂无在线用户</div>
      ) : (
        <div className="divide-y divide-gray-100 border border-gray-200 rounded-lg overflow-hidden">
          {clients.map((c, i) => (
            <div key={i} className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition">
              <div className="flex items-center gap-3">
                <div className={`w-2 h-2 rounded-full ${c.userId ? 'bg-green-500' : 'bg-gray-400'}`} />
                <div>
                  <div className="flex items-center gap-2 text-sm font-medium text-gray-800">
                    <span>{c.userId || '匿名用户'}</span>
                    {c.isAdmin && (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded text-xs">
                        <FaCrown className="text-[10px]" /> 管理员
                      </span>
                    )}
                  </div>
                  {c.channels.length > 0 && (
                    <div className="flex gap-1 mt-1 flex-wrap">
                      {c.channels.map(ch => (
                        <span key={ch} className="px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded text-xs">{ch}</span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              {c.userId && (
                <div className="flex items-center gap-2">
                  <motion.button
                    onClick={() => { setDirectUserId(c.userId!); setActiveTab('direct'); }}
                    className="px-2 py-1 text-xs bg-blue-50 text-blue-600 hover:bg-blue-100 rounded transition"
                    whileTap={{ scale: 0.95 }} title="定向推送">
                    <FaPaperPlane />
                  </motion.button>
                  <motion.button onClick={() => handleKick(c.userId!)}
                    disabled={kickingUser === c.userId}
                    className="px-2 py-1 text-xs bg-red-50 text-red-600 hover:bg-red-100 rounded transition disabled:opacity-50"
                    whileTap={{ scale: 0.95 }} title="强制下线">
                    {kickingUser === c.userId ? <div className="animate-spin rounded-full h-3 w-3 border border-red-600 border-t-transparent" /> : <FaUserSlash />}
                  </motion.button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const renderHistory = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        <motion.button onClick={fetchHistory} disabled={loadingHistory}
          className="flex items-center gap-1 px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg transition"
          whileTap={{ scale: 0.95 }}>
          <FaSyncAlt className={loadingHistory ? 'animate-spin' : ''} /><span>刷新</span>
        </motion.button>
      </div>

      {loadingHistory && history.length === 0 ? (
        <div className="text-center py-10 text-gray-400">加载中...</div>
      ) : history.length === 0 ? (
        <div className="text-center py-10 text-gray-400">暂无广播记录</div>
      ) : (
        <div className="divide-y divide-gray-100 border border-gray-200 rounded-lg overflow-hidden">
          {history.map(log => {
            const lvl = LEVEL_OPTIONS.find(l => l.value === log.level) || LEVEL_OPTIONS[0];
            return (
              <div key={log._id} className="px-4 py-3 hover:bg-gray-50 transition">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs ${lvl.color}`}>
                        {lvl.emoji} {lvl.label}
                      </span>
                      <span className="text-xs text-gray-400">by {log.admin}</span>
                    </div>
                    <p className="text-sm text-gray-800 break-all">{log.message}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-xs text-gray-400">{new Date(log.createdAt).toLocaleString()}</div>
                    <div className="text-xs text-gray-400 mt-0.5">{log.connections} 连接</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  const renderTemplates = () => (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {QUICK_TEMPLATES.map((tpl, i) => {
        const lvl = LEVEL_OPTIONS.find(l => l.value === tpl.level) || LEVEL_OPTIONS[0];
        return (
          <motion.button key={i} onClick={() => applyTemplate(tpl)}
            className="text-left p-4 border border-gray-200 rounded-lg hover:border-blue-300 hover:shadow-md transition group"
            whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
            <div className="flex items-center gap-2 mb-2">
              <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs ${lvl.color}`}>
                {lvl.emoji} {lvl.label}
              </span>
              <span className="text-sm font-medium text-gray-700 group-hover:text-blue-600 transition">{tpl.label}</span>
            </div>
            <p className="text-xs text-gray-500 line-clamp-2">{tpl.message}</p>
          </motion.button>
        );
      })}
    </div>
  );

  // ========== 主渲染 ==========

  return (
    <div className="space-y-6">
      {/* 标题 */}
      <div className="flex items-center gap-3">
        <FaBullhorn className="text-2xl text-blue-600" />
        <h2 className="text-xl font-bold text-gray-800">WebSocket 广播管理</h2>
      </div>
      <p className="text-sm text-gray-500">管理 WebSocket 广播推送、在线用户、定向消息和历史记录。</p>

      {/* 子 Tab */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {SUB_TABS.map(t => (
          <motion.button key={t.key} onClick={() => setActiveTab(t.key)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${
              activeTab === t.key
                ? 'bg-blue-600 text-white shadow-md'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`} whileTap={{ scale: 0.96 }}>
            {t.icon}<span>{t.label}</span>
          </motion.button>
        ))}
      </div>

      {/* 内容区 */}
      <AnimatePresence mode="wait">
        <motion.div key={activeTab}
          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}
          transition={{ duration: 0.2 }}>
          {activeTab === 'broadcast' && renderBroadcast()}
          {activeTab === 'direct' && renderDirect()}
          {activeTab === 'online' && renderOnline()}
          {activeTab === 'history' && renderHistory()}
          {activeTab === 'templates' && renderTemplates()}
        </motion.div>
      </AnimatePresence>
    </div>
  );
};

export default BroadcastManager;
