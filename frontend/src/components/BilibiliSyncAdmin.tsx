import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FaDatabase,
  FaSearch,
  FaSyncAlt,
  FaUser,
  FaList,
  FaCheck,
  FaTimes,
  FaClock,
  FaBilibili,
  FaClipboard,
  FaChevronDown,
  FaChevronUp,
  FaCog,
  FaHistory,
  FaIdCard,
  FaShieldAlt,
  FaExclamationTriangle,
  FaAngleLeft,
  FaAngleRight,
} from 'react-icons/fa';
import { useAuth } from '@/hooks/useAuth';

interface BilibiliSyncRecord {
  _id: string;
  userId: string;
  bilibiliUid?: string;
  uidBoundAt?: string;
  settings: Record<string, unknown>;
  settingsVersion: number;
  settingsUpdatedAt?: string;
  searchRecords: Array<{ id: string; keyword: string; createdAt: string }>;
  credentialStatus: string;
  createdAt: string;
  updatedAt: string;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

const MOTION_CONFIG = { duration: 0.6 };
const COPY_FEEDBACK_DURATION = 1500;

const hoverScale = (s = 1.02) => ({ scale: s });
const tapScale = (s = 0.95) => ({ scale: s });

const formatDate = (dateStr?: string) => {
  if (!dateStr) return '-';
  try {
    return new Date(dateStr).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
  } catch {
    return dateStr;
  }
};

const formatRelativeDate = (dateStr?: string): string => {
  if (!dateStr) return '';
  try {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return '刚刚';
    if (mins < 60) return `${mins} 分钟前`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours} 小时前`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days} 天前`;
    return formatDate(dateStr);
  } catch {
    return dateStr || '';
  }
};

const getErrorMessage = (error: unknown, fallback: string): string => {
  if (typeof error === 'object' && error !== null) {
    const maybe = error as { response?: { data?: { error?: string } }; message?: string };
    return maybe.response?.data?.error || maybe.message || fallback;
  }
  return fallback;
};

const BilibiliSyncAdmin: React.FC = () => {
  const { user } = useAuth();
  const [records, setRecords] = useState<BilibiliSyncRecord[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [keyword, setKeyword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const detailRef = useRef<HTMLDivElement>(null);

  const fetchRecords = useCallback(async (page: number, searchTerm: string) => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (searchTerm) params.set('search', searchTerm);
      const res = await fetch(`/api/admin/bilibili-sync?${params}`, { credentials: 'include' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error || '请求失败');
      setRecords(json.data);
      setPagination(json.pagination);
      setExpandedRow(null);
    } catch (e) {
      setError(getErrorMessage(e, '加载失败'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchRecords(1, ''); }, [fetchRecords]);

  const handleSearch = () => fetchRecords(1, keyword);
  const handlePageChange = (page: number) => fetchRecords(page, keyword);

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(text.slice(0, 12));
      setTimeout(() => setCopiedId(null), COPY_FEEDBACK_DURATION);
    } catch { /* ignore */ }
  };

  const stats = useMemo(() => {
    const total = pagination.total;
    const active = records.filter(r => r.credentialStatus === 'active').length;
    const bound = records.filter(r => r.bilibiliUid).length;
    const withRecords = records.filter(r => r.searchRecords.length > 0).length;
    return { total, active, bound, withRecords };
  }, [records, pagination.total]);

  const rangeStart = pagination.total === 0 ? 0 : (pagination.page - 1) * pagination.limit + 1;
  const rangeEnd = Math.min(pagination.page * pagination.limit, pagination.total);

  const isAdmin = user?.role === 'admin';

  const STAT_CARDS = [
    {
      label: '总记录',
      value: stats.total,
      icon: FaDatabase,
      bg: 'from-blue-500/10 to-blue-600/5',
      border: 'border-blue-200/60',
      text: 'text-blue-700',
      iconBg: 'bg-blue-100 text-blue-600',
    },
    {
      label: '凭据有效',
      value: stats.active,
      icon: FaShieldAlt,
      bg: 'from-emerald-500/10 to-emerald-600/5',
      border: 'border-emerald-200/60',
      text: 'text-emerald-700',
      iconBg: 'bg-emerald-100 text-emerald-600',
    },
    {
      label: '已绑定 UID',
      value: stats.bound,
      icon: FaBilibili,
      bg: 'from-sky-500/10 to-sky-600/5',
      border: 'border-sky-200/60',
      text: 'text-sky-700',
      iconBg: 'bg-sky-100 text-sky-600',
    },
    {
      label: '有搜索记录',
      value: stats.withRecords,
      icon: FaHistory,
      bg: 'from-amber-500/10 to-amber-600/5',
      border: 'border-amber-200/60',
      text: 'text-amber-700',
      iconBg: 'bg-amber-100 text-amber-600',
    },
  ];

  const TABLE_COLUMNS = [
    { key: 'userId', label: '用户 ID', icon: FaIdCard },
    { key: 'bilibiliUid', label: 'Bilibili UID', icon: FaBilibili },
    { key: 'credentialStatus', label: '凭据状态', icon: FaShieldAlt },
    { key: 'settingsVersion', label: '设置版本', icon: FaCog },
    { key: 'searchRecords', label: '搜索记录', icon: FaHistory },
    { key: 'updatedAt', label: '更新时间', icon: FaClock },
    { key: 'actions', label: '操作', icon: null },
  ];

  return (
    <motion.div
      className="space-y-6"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={MOTION_CONFIG}
    >
      {/* ===== 标题区域 ===== */}
      <motion.div
        className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-600 via-indigo-700 to-purple-800 p-7 shadow-xl shadow-indigo-200/40"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={MOTION_CONFIG}
      >
        {/* 装饰背景 */}
        <div className="pointer-events-none absolute -right-12 -top-12 opacity-10">
          <FaDatabase className="size-48 text-white" />
        </div>
        <div className="pointer-events-none absolute -bottom-8 -left-8 opacity-5">
          <FaBilibili className="size-36 text-white" />
        </div>

        <div className="relative z-10">
          <div className="flex items-center gap-3">
            <div className="flex size-14 items-center justify-center rounded-2xl bg-white/20 shadow-lg backdrop-blur-sm">
              <FaDatabase className="size-6 text-white" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-white tracking-tight">PiliPlus 设置同步</h2>
              <p className="mt-1 text-sm text-indigo-200/90">
                查看 PiliPlus 通过 Bilibili Sync OAuth 上传的配置数据、搜索记录和凭据信息
              </p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-[11px] font-medium text-indigo-100 backdrop-blur-sm">
              <FaDatabase className="size-2.5" />
              bilibili_sync 集合
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-[11px] font-medium text-indigo-100 backdrop-blur-sm">
              <FaShieldAlt className="size-2.5" />
              管理员专属
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-[11px] font-medium text-indigo-100 backdrop-blur-sm">
              <FaBilibili className="size-2.5" />
              PiliPlus OAuth
            </span>
          </div>
        </div>
      </motion.div>

      {!isAdmin && (
        <motion.div
          className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          <FaExclamationTriangle className="size-4 shrink-0" />
          <span>需要管理员权限才能查看此页面。</span>
        </motion.div>
      )}

      {/* ===== 统计卡片 ===== */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {STAT_CARDS.map((item) => {
          const Icon = item.icon;
          return (
            <motion.div
              key={item.label}
              className={`relative overflow-hidden rounded-xl border ${item.border} bg-gradient-to-br ${item.bg} p-4 shadow-sm`}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              whileHover={{ y: -2, transition: { duration: 0.2 } }}
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-xs font-medium tracking-wide text-gray-500/80">{item.label}</div>
                  <div className={`mt-1.5 text-3xl font-bold ${item.text}`}>{item.value}</div>
                </div>
                <div className={`flex size-9 items-center justify-center rounded-xl ${item.iconBg} shadow-sm`}>
                  <Icon className="size-4" />
                </div>
              </div>
              {/* 装饰条 */}
              <div className={`absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r ${item.bg}`} />
            </motion.div>
          );
        })}
      </div>

      {/* ===== 错误提示 ===== */}
      <AnimatePresence>
        {error && (
          <motion.div
            className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 shadow-sm"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
          >
            <FaExclamationTriangle className="size-4 shrink-0" />
            <span className="font-medium">{error}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ===== 主列表卡片 ===== */}
      <motion.div
        className="overflow-hidden rounded-2xl border border-gray-200/80 bg-white shadow-sm"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={MOTION_CONFIG}
      >
        {/* 列表头部 */}
        <div className="flex flex-col gap-3 border-b border-gray-100 bg-white px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-sm">
              <FaList className="size-4" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-gray-800">同步记录</h3>
              <p className="text-xs text-gray-400">
                显示第 {rangeStart}-{rangeEnd} 条，共 {pagination.total} 条
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <motion.button
              onClick={() => fetchRecords(pagination.page, keyword)}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-600 shadow-sm transition hover:border-gray-300 hover:bg-gray-50 hover:text-gray-800 disabled:opacity-50"
              whileHover={hoverScale()}
              whileTap={tapScale()}
            >
              <FaSyncAlt className={`size-3.5 ${loading ? 'animate-spin' : ''}`} />
              刷新
            </motion.button>
          </div>
        </div>

        {/* 搜索栏 */}
        <div className="border-b border-gray-100 bg-gray-50/80 px-6 py-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative flex-1 max-w-md">
              <FaSearch className="pointer-events-none absolute left-3.5 top-1/2 size-3.5 -translate-y-1/2 text-gray-400" />
              <input
                value={keyword}
                onChange={e => setKeyword(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleSearch(); }}
                placeholder="搜索 userId 或 Bilibili UID…"
                className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-10 pr-4 text-sm outline-none transition focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <motion.button
                type="button"
                onClick={handleSearch}
                disabled={loading}
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-700 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:from-indigo-700 hover:to-indigo-800 disabled:opacity-50"
                whileHover={hoverScale()}
                whileTap={tapScale()}
              >
                <FaSearch className="size-3.5" />
                搜索
              </motion.button>
              {keyword && (
                <motion.button
                  type="button"
                  onClick={() => { setKeyword(''); fetchRecords(1, ''); }}
                  className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-600 shadow-sm transition hover:bg-gray-100"
                  whileHover={hoverScale()}
                  whileTap={tapScale()}
                >
                  清除筛选
                </motion.button>
              )}
            </div>
          </div>
        </div>

        {/* 加载中 */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <div className="relative mb-4">
              <svg className="size-10 animate-spin text-indigo-500" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            </div>
            <p className="text-sm font-medium text-gray-500">正在加载同步记录…</p>
          </div>
        )}

        {/* 空状态 */}
        {!loading && records.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <div className="mb-4 flex size-16 items-center justify-center rounded-2xl bg-gray-100">
              <FaDatabase className="size-6 text-gray-300" />
            </div>
            <p className="text-sm font-medium text-gray-500">
              {keyword ? '未找到匹配的记录，请尝试其他搜索词' : '暂无 Bilibili 同步数据'}
            </p>
            {keyword && (
              <motion.button
                onClick={() => { setKeyword(''); fetchRecords(1, ''); }}
                className="mt-4 inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-600 shadow-sm transition hover:bg-gray-100"
                whileHover={hoverScale()}
                whileTap={tapScale()}
              >
                清除搜索
              </motion.button>
            )}
          </div>
        )}

        {/* 表格 */}
        {!loading && records.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/50">
                  {TABLE_COLUMNS.map((col) => {
                    const Icon = col.icon;
                    return (
                      <th
                        key={col.key}
                        className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-500"
                      >
                        <span className="inline-flex items-center gap-1.5">
                          {Icon && <Icon className="size-3 text-gray-400" />}
                          {col.label}
                        </span>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {records.map((r, idx) => {
                  const isExpanded = expandedRow === r._id;
                  return (
                    <React.Fragment key={r._id}>
                      <motion.tr
                        className={`cursor-pointer transition-colors ${
                          idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'
                        } ${isExpanded ? 'bg-indigo-50/50 shadow-sm' : ''}`}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.25, delay: 0.02 * idx }}
                        whileHover={{ backgroundColor: '#f0f9ff' }}
                        onClick={() => setExpandedRow(isExpanded ? null : r._id)}
                      >
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-2">
                            <span className="max-w-[120px] truncate font-mono text-xs text-gray-700" title={r.userId}>
                              {r.userId.slice(0, 14)}…
                            </span>
                            <button
                              onClick={(e) => { e.stopPropagation(); copyToClipboard(r.userId); }}
                              className="shrink-0 rounded-md p-1 text-gray-300 transition hover:bg-gray-100 hover:text-gray-500"
                              title="复制 User ID"
                            >
                              {copiedId === r.userId.slice(0, 12) ? (
                                <FaCheck className="size-2.5 text-emerald-500" />
                              ) : (
                                <FaClipboard className="size-2.5" />
                              )}
                            </button>
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          {r.bilibiliUid ? (
                            <span className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-sky-50 to-sky-100 px-2.5 py-1 text-xs font-semibold text-sky-700 shadow-sm">
                              <FaBilibili className="size-2.5" />
                              {r.bilibiliUid}
                            </span>
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </td>
                        <td className="px-5 py-4">
                          {r.credentialStatus === 'active' ? (
                            <span className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-emerald-50 to-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700 shadow-sm">
                              <FaCheck className="size-2.5" />
                              有效
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-gray-100 to-gray-200 px-2.5 py-1 text-xs font-semibold text-gray-600 shadow-sm">
                              <FaTimes className="size-2.5" />
                              无效
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-4">
                          <span className="font-mono text-xs font-semibold text-gray-600">
                            v{r.settingsVersion}
                          </span>
                        </td>
                        <td className="px-5 py-4">
                          {r.searchRecords.length > 0 ? (
                            <span className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-amber-50 to-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700 shadow-sm">
                              <FaHistory className="size-2.5" />
                              {r.searchRecords.length} 条
                            </span>
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex flex-col">
                            <span className="text-xs text-gray-600">{formatDate(r.updatedAt)}</span>
                            <span className="text-[10px] text-gray-400">{formatRelativeDate(r.updatedAt)}</span>
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          <motion.button
                            className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${
                              isExpanded
                                ? 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200'
                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                            }`}
                            whileHover={hoverScale()}
                            whileTap={tapScale()}
                          >
                            {isExpanded ? (
                              <><FaChevronUp className="size-2.5" /> 收起</>
                            ) : (
                              <><FaChevronDown className="size-2.5" /> 详情</>
                            )}
                          </motion.button>
                        </td>
                      </motion.tr>

                      {/* 展开详情行 */}
                      <AnimatePresence>
                        {isExpanded && (
                          <motion.tr
                            key={`${r._id}-detail`}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.2 }}
                          >
                            <td colSpan={TABLE_COLUMNS.length} className="bg-gray-50/70 px-0">
                              <motion.div
                                ref={detailRef}
                                className="overflow-hidden border-t border-gray-100"
                                initial={{ height: 0 }}
                                animate={{ height: 'auto' }}
                                exit={{ height: 0 }}
                                transition={{ duration: 0.3, ease: 'easeInOut' }}
                              >
                                <div className="space-y-5 p-6">
                                  {/* 信息网格 */}
                                  <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                                    {[
                                      { label: 'User ID', value: r.userId, mono: true, copy: true },
                                      { label: 'Bilibili UID', value: r.bilibiliUid || '—' },
                                      { label: 'UID 绑定时间', value: formatDate(r.uidBoundAt) },
                                      { label: '凭据状态', value: r.credentialStatus === 'active' ? '有效' : '无效', badge: true, active: r.credentialStatus === 'active' },
                                      { label: '设置版本', value: `v${r.settingsVersion}` },
                                      { label: '设置更新', value: formatDate(r.settingsUpdatedAt) },
                                      { label: '创建时间', value: formatDate(r.createdAt) },
                                      { label: '更新时间', value: formatDate(r.updatedAt) },
                                    ].map(({ label, value, mono, copy, badge, active }) => (
                                      <div key={label} className="rounded-xl bg-white p-3 shadow-sm border border-gray-100">
                                        <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                                          {label}
                                        </span>
                                        <div className="mt-1 flex items-center gap-1.5">
                                          {badge ? (
                                            <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold ${
                                              active
                                                ? 'bg-emerald-50 text-emerald-700'
                                                : 'bg-gray-100 text-gray-600'
                                            }`}>
                                              {active ? <FaCheck className="size-2" /> : <FaTimes className="size-2" />}
                                              {value}
                                            </span>
                                          ) : (
                                            <span className={`text-xs ${mono ? 'font-mono' : 'font-medium'} text-gray-800 break-all`}>
                                              {value}
                                            </span>
                                          )}
                                          {copy && (
                                            <button
                                              onClick={() => copyToClipboard(r.userId)}
                                              className="shrink-0 rounded p-0.5 text-gray-300 hover:text-gray-500"
                                            >
                                              {copiedId === r.userId.slice(0, 12) ? (
                                                <FaCheck className="size-2.5 text-emerald-500" />
                                              ) : (
                                                <FaClipboard className="size-2.5" />
                                              )}
                                            </button>
                                          )}
                                        </div>
                                      </div>
                                    ))}
                                  </div>

                                  {/* 配置数据 */}
                                  {r.settings && Object.keys(r.settings).length > 0 && (
                                    <div className="rounded-xl bg-white p-4 shadow-sm border border-gray-100">
                                      <div className="mb-2 flex items-center gap-2">
                                        <FaCog className="size-3.5 text-gray-400" />
                                        <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                                          配置数据
                                        </h4>
                                        <span className="text-[10px] text-gray-400">
                                          {Object.keys(r.settings).length} 个字段
                                        </span>
                                      </div>
                                      <pre className="max-h-52 overflow-auto rounded-lg bg-gray-50 p-4 text-[11px] leading-relaxed text-gray-700 ring-1 ring-gray-100">
                                        {JSON.stringify(r.settings, null, 2)}
                                      </pre>
                                    </div>
                                  )}

                                  {/* 搜索记录 */}
                                  {r.searchRecords.length > 0 && (
                                    <div className="rounded-xl bg-white p-4 shadow-sm border border-gray-100">
                                      <div className="mb-2 flex items-center gap-2">
                                        <FaHistory className="size-3.5 text-gray-400" />
                                        <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                                          搜索记录
                                        </h4>
                                        <span className="text-[10px] text-gray-400">
                                          共 {r.searchRecords.length} 条，显示最近 {Math.min(r.searchRecords.length, 10)} 条
                                        </span>
                                      </div>
                                      <div className="max-h-44 space-y-1 overflow-auto rounded-lg">
                                        {r.searchRecords.slice(0, 10).map((sr) => (
                                          <div
                                            key={sr.id}
                                            className="flex items-center gap-3 rounded-lg border border-gray-100 bg-gray-50/50 px-3.5 py-2 text-xs text-gray-600 transition hover:bg-gray-100"
                                          >
                                            <FaSearch className="size-2.5 shrink-0 text-gray-400" />
                                            <span className="font-medium flex-1 truncate">
                                              {sr.keyword.length > 80 ? sr.keyword.slice(0, 80) + '…' : sr.keyword}
                                            </span>
                                            {sr.createdAt && (
                                              <span className="shrink-0 text-gray-400 flex items-center gap-1.5">
                                                <FaClock className="size-2.5" />
                                                {formatDate(sr.createdAt)}
                                              </span>
                                            )}
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </motion.div>
                            </td>
                          </motion.tr>
                        )}
                      </AnimatePresence>
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* 分页 */}
        {pagination.totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-gray-100 bg-gray-50/50 px-6 py-4">
            <div className="text-xs text-gray-400">
              共 {pagination.total} 条记录，{pagination.totalPages} 页
            </div>
            <div className="flex items-center gap-2">
              <motion.button
                onClick={() => handlePageChange(pagination.page - 1)}
                disabled={pagination.page <= 1 || loading}
                className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3.5 py-2 text-xs font-medium text-gray-600 shadow-sm transition hover:border-gray-300 hover:bg-gray-50 disabled:opacity-40"
                whileHover={hoverScale()}
                whileTap={tapScale()}
              >
                <FaAngleLeft className="size-3" />
                上一页
              </motion.button>
              <div className="flex items-center gap-1">
                {Array.from({ length: Math.min(pagination.totalPages, 5) }, (_, i) => {
                  const pageNum = (() => {
                    const total = pagination.totalPages;
                    const current = pagination.page;
                    if (total <= 5) return i + 1;
                    if (current <= 3) return i + 1;
                    if (current >= total - 2) return total - 4 + i;
                    return current - 2 + i;
                  })();
                  const isActive = pageNum === pagination.page;
                  return (
                    <motion.button
                      key={pageNum}
                      onClick={() => handlePageChange(pageNum)}
                      disabled={loading}
                      className={`inline-flex size-8 items-center justify-center rounded-lg text-xs font-medium transition ${
                        isActive
                          ? 'bg-indigo-600 text-white shadow-sm'
                          : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
                      }`}
                      whileHover={!isActive ? hoverScale() : undefined}
                      whileTap={!isActive ? tapScale() : undefined}
                    >
                      {pageNum}
                    </motion.button>
                  );
                })}
              </div>
              <motion.button
                onClick={() => handlePageChange(pagination.page + 1)}
                disabled={pagination.page >= pagination.totalPages || loading}
                className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3.5 py-2 text-xs font-medium text-gray-600 shadow-sm transition hover:border-gray-300 hover:bg-gray-50 disabled:opacity-40"
                whileHover={hoverScale()}
                whileTap={tapScale()}
              >
                下一页
                <FaAngleRight className="size-3" />
              </motion.button>
            </div>
          </div>
        )}

        {/* 底部统计 */}
        {!loading && records.length > 0 && (
          <div className="flex items-center gap-4 border-t border-gray-100 bg-white px-6 py-3 text-[11px] text-gray-400">
            <span className="flex items-center gap-1">
              <FaDatabase className="size-2.5" />
              当前页 {records.length} 条
            </span>
            <span className="flex items-center gap-1">
              <FaShieldAlt className="size-2.5" />
              凭据有效 {stats.active}/{stats.total}
            </span>
            <span className="flex items-center gap-1">
              <FaBilibili className="size-2.5" />
              已绑定 {stats.bound}/{stats.total}
            </span>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
};

export default BilibiliSyncAdmin;