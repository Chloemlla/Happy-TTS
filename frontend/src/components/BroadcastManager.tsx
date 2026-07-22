import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNotification } from './Notification';
import { getApiBaseUrl } from '../api/api';
import { getAuthToken } from '../utils/authSession';
import {
  FaBullhorn, FaPaperPlane, FaUsers, FaHistory,
  FaUserSlash, FaClipboardList, FaSyncAlt, FaUserAlt,
  FaCrown, FaPlug, FaLock, FaLockOpen, FaUserCheck,
  FaUserSecret, FaHashtag,
} from 'react-icons/fa';

// ========== 类型 ==========

type BroadcastLevel = 'info' | 'warn' | 'error';
type BroadcastDisplay = 'toast' | 'modal';
type BroadcastFormat = 'text' | 'html' | 'markdown';
type BroadcastAudience = 'all' | 'authenticated' | 'admins' | 'anonymous' | 'channel';
type BroadcastLogAudience = BroadcastAudience | 'users';
type HistoryAudienceFilter = BroadcastLogAudience | 'any';
type TabKey = 'broadcast' | 'direct' | 'online' | 'history' | 'templates';

interface OnlineClient {
  userId: string | null;
  isAdmin: boolean;
  channels: string[];
  connectedSince: number;
  lastPing?: number;
}

interface OnlineStats {
  total: number;
  authenticated: number;
  anonymous: number;
  admins: number;
  channels: Array<{ channel: string; connections: number }>;
}

interface BroadcastLogItem {
  _id: string;
  message: string;
  level: string;
  title?: string;
  duration?: number;
  display?: BroadcastDisplay;
  format?: BroadcastFormat;
  audience?: BroadcastLogAudience;
  targetUserIds?: string[];
  targetChannel?: string;
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

const AUDIENCE_OPTIONS: { value: BroadcastAudience; label: string; description: string; icon: React.ReactNode }[] = [
  { value: 'all', label: '全体连接', description: '所有在线 WebSocket 连接', icon: <FaBullhorn /> },
  { value: 'authenticated', label: '已登录用户', description: '仅推送给带用户身份的连接', icon: <FaUserCheck /> },
  { value: 'admins', label: '管理员', description: '仅推送给管理员在线连接', icon: <FaCrown /> },
  { value: 'anonymous', label: '匿名连接', description: '仅推送给未登录连接', icon: <FaUserSecret /> },
  { value: 'channel', label: '指定频道', description: '推送给订阅该频道的连接', icon: <FaHashtag /> },
];

const HISTORY_FILTER_OPTIONS: { value: HistoryAudienceFilter; label: string }[] = [
  { value: 'any', label: '全部' },
  { value: 'all', label: '全体' },
  { value: 'authenticated', label: '已登录' },
  { value: 'admins', label: '管理员' },
  { value: 'anonymous', label: '匿名' },
  { value: 'users', label: '指定用户' },
  { value: 'channel', label: '频道' },
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
  Authorization: `Bearer ${getAuthToken()}`,
  'Content-Type': 'application/json',
});

const api = (path: string, opts?: RequestInit) =>
  fetch(`${getApiBaseUrl()}${path}`, { headers: authHeaders(), ...opts });

const parseUserIds = (value: string) =>
  Array.from(new Set(value.split(/[\s,;，；]+/).map(item => item.trim()).filter(Boolean))).slice(0, 100);

const getAudienceLabel = (audience?: BroadcastLogAudience) => {
  switch (audience) {
    case 'authenticated': return '已登录用户';
    case 'admins': return '管理员';
    case 'anonymous': return '匿名连接';
    case 'users': return '指定用户';
    case 'channel': return '指定频道';
    case 'all':
    default:
      return '全体连接';
  }
};

const getTargetSummary = (log: BroadcastLogItem) => {
  if (log.audience === 'users') {
    const count = log.targetUserIds?.length || 0;
    return count > 0 ? `${count} 个用户` : '指定用户';
  }
  if (log.audience === 'channel') return log.targetChannel || '指定频道';
  return getAudienceLabel(log.audience);
};

const formatDuration = (duration?: number) => {
  if (!duration) return '默认';
  return `${Math.round(duration / 1000)} 秒`;
};

const formatRelativeDuration = (timestamp?: number) => {
  if (!timestamp) return '未知';
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (seconds < 60) return `${seconds} 秒`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} 分钟`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时 ${minutes % 60} 分钟`;
  const days = Math.floor(hours / 24);
  return `${days} 天 ${hours % 24} 小时`;
};

// ========== 组件 ==========

const BroadcastManager: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabKey>('broadcast');
  const { setNotification } = useNotification();

  // --- 全体广播 ---
  const [message, setMessage] = useState('');
  const [level, setLevel] = useState<BroadcastLevel>('info');
  const [sending, setSending] = useState(false);
  const [lastResult, setLastResult] = useState<{ connections: number; time: string; audience: string } | null>(null);
  const [keepBroadcastInput, setKeepBroadcastInput] = useState(false);
  const [broadcastDuration, setBroadcastDuration] = useState(5);
  const [broadcastDisplay, setBroadcastDisplay] = useState<BroadcastDisplay>('toast');
  const [broadcastFormat, setBroadcastFormat] = useState<BroadcastFormat>('text');
  const [broadcastTitle, setBroadcastTitle] = useState('');
  const [broadcastAudience, setBroadcastAudience] = useState<BroadcastAudience>('all');
  const [broadcastChannel, setBroadcastChannel] = useState('');

  // --- 定向推送 ---
  const [directUserIds, setDirectUserIds] = useState('');
  const [directMessage, setDirectMessage] = useState('');
  const [directLevel, setDirectLevel] = useState<BroadcastLevel>('info');
  const [directSending, setDirectSending] = useState(false);
  const [keepDirectInput, setKeepDirectInput] = useState(false);
  const [directDuration, setDirectDuration] = useState(5);
  const [directDisplay, setDirectDisplay] = useState<BroadcastDisplay>('toast');
  const [directFormat, setDirectFormat] = useState<BroadcastFormat>('text');
  const [directTitle, setDirectTitle] = useState('');

  // --- 在线用户 ---
  const [clients, setClients] = useState<OnlineClient[]>([]);
  const [clientsTotal, setClientsTotal] = useState(0);
  const [clientStats, setClientStats] = useState<OnlineStats | null>(null);
  const [loadingClients, setLoadingClients] = useState(false);
  const [kickingUser, setKickingUser] = useState<string | null>(null);

  // --- 广播历史 ---
  const [history, setHistory] = useState<BroadcastLogItem[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historyAudienceFilter, setHistoryAudienceFilter] = useState<HistoryAudienceFilter>('any');

  const directTargetUserIds = useMemo(() => parseUserIds(directUserIds), [directUserIds]);
  const availableChannels = useMemo(() => {
    const channels = Array.isArray(clientStats?.channels) ? clientStats.channels : [];
    if (channels.length > 0) return channels;

    const channelMap = new Map<string, number>();
    clients.forEach(client => {
      client.channels.forEach(channel => {
        channelMap.set(channel, (channelMap.get(channel) || 0) + 1);
      });
    });
    return Array.from(channelMap.entries()).map(([channel, connections]) => ({ channel, connections }));
  }, [clientStats, clients]);

  // ========== API 调用 ==========

  const handleBroadcast = async () => {
    const trimmed = message.trim();
    if (!trimmed) { setNotification({ message: '请输入广播内容', type: 'warning' }); return; }
    const targetChannel = broadcastChannel.trim();
    if (broadcastAudience === 'channel' && !targetChannel) {
      setNotification({ message: '请输入频道名称', type: 'warning' });
      return;
    }
    setSending(true);
    try {
      const res = await api('/api/admin/broadcast', {
        method: 'POST',
        body: JSON.stringify({
          message: trimmed, level,
          duration: broadcastDuration * 1000,
          display: broadcastDisplay,
          format: broadcastFormat,
          title: broadcastTitle.trim() || undefined,
          audience: broadcastAudience,
          targetChannel: broadcastAudience === 'channel' ? targetChannel : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '广播失败');
      const connections = data.connections ?? 0;
      setLastResult({ connections, time: new Date().toLocaleTimeString(), audience: getAudienceLabel(broadcastAudience) });
      setNotification({ message: `广播已发送，送达 ${connections} 个连接`, type: 'success', duration: 5000 });
      if (!keepBroadcastInput) setMessage('');
    } catch (err) {
      setNotification({ message: err instanceof Error ? err.message : '广播失败', type: 'error' });
    } finally { setSending(false); }
  };

  const handleDirectPush = async () => {
    if (directTargetUserIds.length === 0 || !directMessage.trim()) {
      setNotification({ message: '请填写用户 ID 和消息内容', type: 'warning' }); return;
    }
    setDirectSending(true);
    try {
      const res = await api('/api/admin/broadcast/user', {
        method: 'POST',
        body: JSON.stringify({
          targetUserIds: directTargetUserIds, message: directMessage.trim(), level: directLevel,
          duration: directDuration * 1000,
          display: directDisplay,
          format: directFormat,
          title: directTitle.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '推送失败');
      setNotification({ message: `定向推送成功，送达 ${data.connections ?? 0} 个连接`, type: 'success' });
      if (!keepDirectInput) setDirectMessage('');
    } catch (err) {
      setNotification({ message: err instanceof Error ? err.message : '推送失败', type: 'error' });
    } finally { setDirectSending(false); }
  };

  const fetchClients = useCallback(async () => {
    setLoadingClients(true);
    try {
      const res = await api('/api/admin/ws/clients');
      const data = await res.json();
      if (data.success) {
        setClients(data.clients || []);
        setClientsTotal(data.total ?? 0);
        setClientStats(data.stats || null);
      }
    } catch { setNotification({ message: '获取在线用户失败', type: 'error' }); }
    finally { setLoadingClients(false); }
  }, [setNotification]);

  const handleKick = async (userId: string) => {
    if (!window.confirm(`确定断开用户 ${userId} 的全部在线连接？`)) return;
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
      const query = new URLSearchParams({ limit: '30' });
      if (historyAudienceFilter !== 'any') query.set('audience', historyAudienceFilter);
      const res = await api(`/api/admin/broadcast/history?${query.toString()}`);
      const data = await res.json();
      if (data.success) setHistory(data.logs || []);
    } catch { setNotification({ message: '获取广播历史失败', type: 'error' }); }
    finally { setLoadingHistory(false); }
  }, [historyAudienceFilter, setNotification]);

  // 切换 tab 时自动加载数据
  useEffect(() => {
    if (activeTab === 'online') fetchClients();
    if (activeTab === 'history') fetchHistory();
  }, [activeTab, fetchClients, fetchHistory]);

  const applyTemplate = (tpl: typeof QUICK_TEMPLATES[0]) => {
    setMessage(tpl.message);
    setLevel(tpl.level);
    setBroadcastDuration(tpl.level === 'error' ? 15 : tpl.level === 'warn' ? 10 : 5);
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

      {/* 推送范围 */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">推送范围</label>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {AUDIENCE_OPTIONS.map(opt => (
            <motion.button key={opt.value} onClick={() => setBroadcastAudience(opt.value)}
              className={`text-left px-4 py-3 rounded-lg border transition-all ${
                broadcastAudience === opt.value
                  ? 'bg-sky-50 text-sky-700 border-sky-300 shadow-sm'
                  : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
              }`} whileTap={{ scale: 0.97 }}>
              <div className="flex items-center gap-2 text-sm font-semibold">
                {opt.icon}
                <span>{opt.label}</span>
              </div>
              <div className="mt-1 text-xs opacity-75">{opt.description}</div>
            </motion.button>
          ))}
        </div>
        {broadcastAudience === 'channel' && (
          <div className="mt-3 space-y-2">
            <input value={broadcastChannel} onChange={e => setBroadcastChannel(e.target.value)}
              placeholder="例如 user:用户ID、admin:ops 或自定义频道"
              maxLength={120}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm" />
            {availableChannels.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {availableChannels.slice(0, 8).map(item => (
                  <button key={item.channel} onClick={() => setBroadcastChannel(item.channel)}
                    className="px-2.5 py-1 rounded-full bg-blue-50 text-blue-600 text-xs hover:bg-blue-100 transition">
                    {item.channel} · {item.connections}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 消息输入 */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="block text-sm font-medium text-gray-700">广播内容</label>
          <button onClick={() => setKeepBroadcastInput(!keepBroadcastInput)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
              keepBroadcastInput ? 'bg-amber-100 text-amber-700 hover:bg-amber-200' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
            }`}
            title={keepBroadcastInput ? '发送后保留输入内容（点击切换）' : '发送后清空输入内容（点击切换）'}>
            {keepBroadcastInput ? <FaLock className="w-3 h-3" /> : <FaLockOpen className="w-3 h-3" />}
            <span>{keepBroadcastInput ? '保留输入' : '自动清空'}</span>
          </button>
        </div>
        <textarea value={message} onChange={e => setMessage(e.target.value)}
          placeholder="输入要推送的消息..." rows={4} maxLength={1000}
          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none text-sm" />
        <div className="flex justify-between mt-1 text-xs text-gray-400">
          <span>{broadcastDisplay === 'modal' ? '弹窗可选择 Markdown / HTML' : '通知条按纯文本展示'}</span><span>{message.length}/1000</span>
        </div>
      </div>

      {/* 展示时长 */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">展示时长：{broadcastDuration} 秒</label>
        <input type="range" min={1} max={30} step={1} value={broadcastDuration}
          onChange={e => setBroadcastDuration(Number(e.target.value))}
          className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600" />
        <div className="flex justify-between mt-1 text-xs text-gray-400">
          <span>1秒</span><span>30秒</span>
        </div>
      </div>

      {/* 展示方式 */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">展示方式</label>
        <div className="flex gap-3">
          {(['toast', 'modal'] as const).map(d => (
            <motion.button key={d} onClick={() => setBroadcastDisplay(d)}
              className={`px-4 py-2 rounded-lg border text-sm font-medium transition-all ${
                broadcastDisplay === d ? 'bg-blue-100 text-blue-700 border-blue-300 shadow-sm' : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100'
              }`} whileTap={{ scale: 0.96 }}>
              {d === 'toast' ? '🔔 通知条' : '📋 弹窗'}
            </motion.button>
          ))}
        </div>
      </div>

      {/* 内容格式（弹窗模式下可选） */}
      {broadcastDisplay === 'modal' && (
        <>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">内容格式</label>
            <div className="flex gap-3">
              {([['text', '纯文本'], ['markdown', 'Markdown'], ['html', 'HTML']] as const).map(([f, label]) => (
                <motion.button key={f} onClick={() => setBroadcastFormat(f)}
                  className={`px-4 py-2 rounded-lg border text-sm font-medium transition-all ${
                    broadcastFormat === f ? 'bg-purple-100 text-purple-700 border-purple-300 shadow-sm' : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100'
                  }`} whileTap={{ scale: 0.96 }}>
                  {label}
                </motion.button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">弹窗标题（可选）</label>
            <input value={broadcastTitle} onChange={e => setBroadcastTitle(e.target.value)}
              placeholder="留空则使用默认标题" maxLength={200}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm" />
          </div>
        </>
      )}

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
          <span className="text-green-700">上次广播于 {lastResult.time}，范围 {lastResult.audience}，送达 {lastResult.connections} 个在线连接</span>
        </motion.div>
      )}
    </div>
  );

  const renderDirect = () => (
    <div className="space-y-5">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">目标用户 ID</label>
        <textarea value={directUserIds} onChange={e => setDirectUserIds(e.target.value)}
          placeholder="支持多个用户 ID，用逗号、空格或换行分隔"
          rows={2} maxLength={2000}
          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none text-sm" />
        <div className="flex justify-between mt-1 text-xs text-gray-400">
          <span>已识别 {directTargetUserIds.length} 个用户</span>
          <span>最多发送 100 个目标用户</span>
        </div>
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
        <div className="flex items-center justify-between mb-2">
          <label className="block text-sm font-medium text-gray-700">消息内容</label>
          <button onClick={() => setKeepDirectInput(!keepDirectInput)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
              keepDirectInput ? 'bg-amber-100 text-amber-700 hover:bg-amber-200' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
            }`}
            title={keepDirectInput ? '发送后保留输入内容（点击切换）' : '发送后清空输入内容（点击切换）'}>
            {keepDirectInput ? <FaLock className="w-3 h-3" /> : <FaLockOpen className="w-3 h-3" />}
            <span>{keepDirectInput ? '保留输入' : '自动清空'}</span>
          </button>
        </div>
        <textarea value={directMessage} onChange={e => setDirectMessage(e.target.value)}
          placeholder="输入要推送给目标用户的消息..." rows={3} maxLength={1000}
          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none text-sm" />
        <div className="flex justify-between mt-1 text-xs text-gray-400">
          <span>{directDisplay === 'modal' ? '弹窗可选择 Markdown / HTML' : '通知条按纯文本展示'}</span>
          <span>{directMessage.length}/1000</span>
        </div>
      </div>
      {/* 展示时长 */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">展示时长：{directDuration} 秒</label>
        <input type="range" min={1} max={30} step={1} value={directDuration}
          onChange={e => setDirectDuration(Number(e.target.value))}
          className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600" />
        <div className="flex justify-between mt-1 text-xs text-gray-400">
          <span>1秒</span><span>30秒</span>
        </div>
      </div>
      {/* 展示方式 */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">展示方式</label>
        <div className="flex gap-3">
          {(['toast', 'modal'] as const).map(d => (
            <motion.button key={d} onClick={() => setDirectDisplay(d)}
              className={`px-4 py-2 rounded-lg border text-sm font-medium transition-all ${
                directDisplay === d ? 'bg-blue-100 text-blue-700 border-blue-300 shadow-sm' : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100'
              }`} whileTap={{ scale: 0.96 }}>
              {d === 'toast' ? '🔔 通知条' : '📋 弹窗'}
            </motion.button>
          ))}
        </div>
      </div>
      {directDisplay === 'modal' && (
        <>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">内容格式</label>
            <div className="flex gap-3">
              {([['text', '纯文本'], ['markdown', 'Markdown'], ['html', 'HTML']] as const).map(([f, label]) => (
                <motion.button key={f} onClick={() => setDirectFormat(f)}
                  className={`px-4 py-2 rounded-lg border text-sm font-medium transition-all ${
                    directFormat === f ? 'bg-purple-100 text-purple-700 border-purple-300 shadow-sm' : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100'
                  }`} whileTap={{ scale: 0.96 }}>
                  {label}
                </motion.button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">弹窗标题（可选）</label>
            <input value={directTitle} onChange={e => setDirectTitle(e.target.value)}
              placeholder="留空则使用默认标题" maxLength={200}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm" />
          </div>
        </>
      )}
      <motion.button onClick={handleDirectPush} disabled={directSending || directTargetUserIds.length === 0 || !directMessage.trim()}
        className={`flex items-center justify-center gap-2 w-full px-6 py-3 rounded-lg font-semibold text-white transition-all ${
          directSending || directTargetUserIds.length === 0 || !directMessage.trim() ? 'bg-gray-300 cursor-not-allowed'
            : 'bg-gradient-to-r from-green-500 to-teal-500 hover:from-green-600 hover:to-teal-600 shadow-lg'
        }`} whileHover={!directSending && directTargetUserIds.length > 0 && directMessage.trim() ? { scale: 1.02 } : {}} whileTap={!directSending && directTargetUserIds.length > 0 && directMessage.trim() ? { scale: 0.98 } : {}}>
        {directSending ? (<><div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" /><span>推送中...</span></>)
          : (<><FaPaperPlane /><span>发送定向推送</span></>)}
      </motion.button>
    </div>
  );

  const renderOnline = () => {
    const stats = clientStats
      ? { ...clientStats, channels: Array.isArray(clientStats.channels) ? clientStats.channels : [] }
      : {
          total: clientsTotal,
          authenticated: clients.filter(client => !!client.userId).length,
          anonymous: clients.filter(client => !client.userId).length,
          admins: clients.filter(client => client.isAdmin).length,
          channels: availableChannels,
        };

    return (
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

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: '总连接', value: stats.total, tone: 'text-slate-700 bg-slate-50 border-slate-200' },
          { label: '已登录', value: stats.authenticated, tone: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
          { label: '管理员', value: stats.admins, tone: 'text-amber-700 bg-amber-50 border-amber-200' },
          { label: '匿名', value: stats.anonymous, tone: 'text-gray-600 bg-gray-50 border-gray-200' },
        ].map(item => (
          <div key={item.label} className={`px-4 py-3 rounded-lg border ${item.tone}`}>
            <div className="text-xs opacity-70">{item.label}</div>
            <div className="mt-1 text-xl font-semibold">{item.value}</div>
          </div>
        ))}
      </div>

      {stats.channels.length > 0 && (
        <div>
          <div className="text-sm font-medium text-gray-700 mb-2">频道分布</div>
          <div className="flex flex-wrap gap-2">
            {stats.channels.slice(0, 12).map(item => (
              <button key={item.channel}
                onClick={() => { setBroadcastAudience('channel'); setBroadcastChannel(item.channel); setActiveTab('broadcast'); }}
                className="px-2.5 py-1 rounded-full bg-blue-50 text-blue-600 text-xs hover:bg-blue-100 transition">
                {item.channel} · {item.connections}
              </button>
            ))}
          </div>
        </div>
      )}

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
                  <div className="mt-1 text-xs text-gray-400">
                    已连接 {formatRelativeDuration(c.connectedSince)}
                    {c.lastPing ? ` · 心跳 ${formatRelativeDuration(c.lastPing)} 前` : ''}
                  </div>
                </div>
              </div>
              {c.userId && (
                <div className="flex items-center gap-2">
                  <motion.button
                    onClick={() => { setDirectUserIds(c.userId!); setActiveTab('direct'); }}
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
  };

  const renderHistory = () => (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex gap-2 overflow-x-auto pb-1">
          {HISTORY_FILTER_OPTIONS.map(item => (
            <button key={item.value}
              onClick={() => setHistoryAudienceFilter(item.value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition ${
                historyAudienceFilter === item.value
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}>
              {item.label}
            </button>
          ))}
        </div>
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
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs bg-slate-100 text-slate-600">
                        {getAudienceLabel(log.audience)}
                      </span>
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs bg-gray-100 text-gray-500">
                        {log.display === 'modal' ? '弹窗' : '通知条'} · {formatDuration(log.duration)}
                      </span>
                      <span className="text-xs text-gray-400">by {log.admin}</span>
                    </div>
                    {log.title && <div className="text-sm font-medium text-gray-700 mb-1">{log.title}</div>}
                    <p className="text-sm text-gray-800 break-all">{log.message}</p>
                    <div className="mt-1 text-xs text-gray-400">
                      目标：{getTargetSummary(log)}
                      {log.format && log.display === 'modal' ? ` · ${log.format}` : ''}
                    </div>
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
