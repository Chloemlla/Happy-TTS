import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FaAngleLeft,
  FaAngleRight,
  FaCheck,
  FaChevronDown,
  FaChevronUp,
  FaClipboard,
  FaClock,
  FaCog,
  FaDatabase,
  FaExclamationTriangle,
  FaHistory,
  FaRedo,
  FaSearch,
  FaShieldAlt,
  FaTimes,
  FaUser,
  FaUserTag,
} from 'react-icons/fa';
import { useAuth } from '@/hooks/useAuth';
import { isAdminRole } from '@/utils/rbac';
import {
  InfoBadge,
  InfoMetricCard,
  InfoPanel,
  InfoQueryHero,
  InfoSectionTitle,
  logShareDangerButtonClass,
  logShareInputClass,
  logShareSecondaryButtonClass,
  logShareTileClass,
} from './LogShareStyleScaffold';

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

const COPY_FEEDBACK_DURATION = 1500;

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

const inputClass = `${logShareInputClass} py-2.5`;

const BilibiliSyncAdmin: React.FC = () => {
  const { user } = useAuth();
  const [records, setRecords] = useState<BilibiliSyncRecord[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [keyword, setKeyword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [showAllSearch, setShowAllSearch] = useState<Record<string, boolean>>({});
  const [searchRecordData, setSearchRecordData] = useState<Record<string, { data: BilibiliSyncRecord['searchRecords']; total: number; page: number; totalPages: number }>>({});
  const [searchRecordLoading, setSearchRecordLoading] = useState<string | null>(null);
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
      setShowAllSearch({});
      setSearchRecordData({});
    } catch (e) {
      setError(getErrorMessage(e, '加载失败'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchRecords(1, ''); }, [fetchRecords]);

  const handleSearch = () => fetchRecords(1, keyword);
  const handlePageChange = (page: number) => fetchRecords(page, keyword);

  const fetchSearchRecords = useCallback(async (userId: string, page: number) => {
    setSearchRecordLoading(userId);
    try {
      const res = await fetch(`/api/admin/bilibili-sync/${encodeURIComponent(userId)}/search-records?page=${page}&limit=50`, { credentials: 'include' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error || '请求失败');
      setSearchRecordData(prev => ({
        ...prev,
        [userId]: { data: json.data, total: json.pagination.total, page: json.pagination.page, totalPages: json.pagination.totalPages },
      }));
    } catch {
      setSearchRecordData(prev => ({
        ...prev,
        [userId]: { data: [], total: 0, page: 1, totalPages: 0 },
      }));
    } finally {
      setSearchRecordLoading(prev => prev === userId ? null : prev);
    }
  }, []);

  const handleShowAllSearch = (record: BilibiliSyncRecord) => {
    const isOpen = showAllSearch[record._id];
    if (!isOpen) {
      fetchSearchRecords(record.userId, 1);
    }
    setShowAllSearch(prev => ({ ...prev, [record._id]: !isOpen }));
  };

  const handleSearchRecordPage = (userId: string, page: number) => {
    fetchSearchRecords(userId, page);
  };

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

  const isAdmin = isAdminRole(user?.role);

  return (
    <div className="space-y-6">
      {/* 标题 */}
      <InfoQueryHero
        eyebrow="PiliPlus"
        title="Bilibili 设置同步"
        description="查看 PiliPlus 通过 Synapse OAuth（bilibili:sync scope）上传的配置数据、搜索记录和凭据信息。"
        icon={FaDatabase}
        tone="violet"
        meta={
          <>
            <InfoBadge tone="violet">bilibili_sync 集合</InfoBadge>
            <InfoBadge tone="slate">管理员专属</InfoBadge>
            <InfoBadge tone="slate">
              {pagination.total} 条记录
            </InfoBadge>
          </>
        }
        actions={
          <button
            type="button"
            className={logShareSecondaryButtonClass}
            onClick={() => fetchRecords(pagination.page, keyword)}
            disabled={loading}
          >
            <FaRedo className={loading ? 'animate-spin' : ''} />
            刷新
          </button>
        }
      />

      {!isAdmin && (
        <InfoPanel>
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-red-100 text-red-700">
              <FaExclamationTriangle />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-900">权限不足</h2>
              <p className="mt-1 text-sm leading-6 text-slate-600">需要管理员权限才能查看此页面。</p>
            </div>
          </div>
        </InfoPanel>
      )}

      {isAdmin && (
        <>
          {/* 统计卡片 */}
          <div className="grid gap-4 md:grid-cols-4">
            <InfoMetricCard
              label="总记录"
              value={stats.total}
              detail="数据库全部记录"
              icon={FaDatabase}
            />
            <InfoMetricCard
              label="凭据有效"
              value={stats.active}
              detail={`${stats.total > 0 ? ((stats.active / stats.total) * 100).toFixed(0) : 0}% 有效率`}
              icon={FaShieldAlt}
            />
            <InfoMetricCard
              label="已绑定 UID"
              value={stats.bound}
              detail={`${stats.total > 0 ? ((stats.bound / stats.total) * 100).toFixed(0) : 0}% 绑定率`}
              icon={FaUserTag}
            />
            <InfoMetricCard
              label="有搜索记录"
              value={stats.withRecords}
              detail={`${stats.total > 0 ? ((stats.withRecords / stats.total) * 100).toFixed(0) : 0}% 有活跃数据`}
              icon={FaHistory}
            />
          </div>

          {/* 错误提示 */}
          <AnimatePresence>
            {error && (
              <InfoPanel>
                <div className="flex items-center gap-3 text-red-700">
                  <FaExclamationTriangle className="size-4 shrink-0" />
                  <span className="font-medium">{error}</span>
                </div>
              </InfoPanel>
            )}
          </AnimatePresence>

          {/* 同步记录列表 */}
          <InfoPanel>
            <InfoSectionTitle
              title="同步记录"
              description={`显示第 ${rangeStart}-${rangeEnd} 条，共 ${pagination.total} 条`}
              icon={FaDatabase}
            />

            {/* 搜索栏 */}
            <div className="mb-5 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50/80 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="relative flex-1 max-w-md">
                <FaSearch className="pointer-events-none absolute left-3.5 top-1/2 size-3.5 -translate-y-1/2 text-slate-400" />
                <input
                  value={keyword}
                  onChange={e => setKeyword(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleSearch(); }}
                  placeholder="搜索 userId 或 Bilibili UID…"
                  className={inputClass + ' pl-10'}
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleSearch}
                  disabled={loading}
                  className={`${logShareSecondaryButtonClass} disabled:opacity-50`}
                >
                  <FaSearch />
                  搜索
                </button>
                {keyword && (
                  <button
                    type="button"
                    onClick={() => { setKeyword(''); fetchRecords(1, ''); }}
                    className={logShareSecondaryButtonClass}
                  >
                    <FaTimes />
                    清除
                  </button>
                )}
              </div>
            </div>

            {/* 加载中 */}
            {loading && (
              <div className="flex flex-col items-center justify-center py-16 text-slate-400">
                <div className="mb-4">
                  <FaRedo className="size-8 animate-spin text-indigo-500" />
                </div>
                <p className="text-sm font-medium text-slate-500">正在加载同步记录…</p>
              </div>
            )}

            {/* 空状态 */}
            {!loading && records.length === 0 && (
              <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 py-16 text-slate-400">
                <FaDatabase className="mb-3 size-8 text-slate-300" />
                <p className="text-sm font-medium text-slate-500">
                  {keyword ? '未找到匹配的记录，请尝试其他搜索词' : '暂无 Bilibili 同步数据'}
                </p>
                {keyword && (
                  <button
                    type="button"
                    onClick={() => { setKeyword(''); fetchRecords(1, ''); }}
                    className={`${logShareSecondaryButtonClass} mt-4`}
                  >
                    <FaTimes />
                    清除搜索
                  </button>
                )}
              </div>
            )}

            {/* 表格 */}
            {!loading && records.length > 0 && (
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="text-xs uppercase tracking-[0.16em] text-slate-500">
                    <tr>
                      <th className="px-4 py-3">用户 ID</th>
                      <th className="px-4 py-3">Bilibili UID</th>
                      <th className="px-4 py-3">凭据状态</th>
                      <th className="px-4 py-3">设置版本</th>
                      <th className="px-4 py-3">搜索记录</th>
                      <th className="px-4 py-3">更新时间</th>
                      <th className="px-4 py-3">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {records.map((r, idx) => {
                      const isExpanded = expandedRow === r._id;
                      return (
                        <React.Fragment key={r._id}>
                          <tr
                            className={`cursor-pointer transition-colors ${
                              idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/30'
                            } ${isExpanded ? 'bg-indigo-50/50' : ''} hover:bg-sky-50/50`}
                            onClick={() => setExpandedRow(isExpanded ? null : r._id)}
                          >
                            <td className="px-4 py-3.5">
                              <div className="flex items-center gap-2">
                                <span className="max-w-[120px] truncate font-mono text-xs text-slate-700" title={r.userId}>
                                  {r.userId.slice(0, 14)}…
                                </span>
                                <button
                                  onClick={(e) => { e.stopPropagation(); copyToClipboard(r.userId); }}
                                  className="shrink-0 rounded-md p-1 text-slate-300 transition hover:bg-slate-100 hover:text-slate-500"
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
                            <td className="px-4 py-3.5">
                              {r.bilibiliUid ? (
                                <InfoBadge tone="sky">{r.bilibiliUid}</InfoBadge>
                              ) : (
                                <span className="text-slate-300">—</span>
                              )}
                            </td>
                            <td className="px-4 py-3.5">
                              <InfoBadge tone={r.credentialStatus === 'active' ? 'emerald' : 'slate'}>
                                {r.credentialStatus === 'active' ? (
                                  <><FaCheck className="mr-1 inline size-2.5" /> 有效</>
                                ) : (
                                  <><FaTimes className="mr-1 inline size-2.5" /> 无效</>
                                )}
                              </InfoBadge>
                            </td>
                            <td className="px-4 py-3.5 font-mono text-xs text-slate-600">v{r.settingsVersion}</td>
                            <td className="px-4 py-3.5">
                              {r.searchRecords.length > 0 ? (
                                <InfoBadge tone="amber">{r.searchRecords.length} 条</InfoBadge>
                              ) : (
                                <span className="text-slate-300">—</span>
                              )}
                            </td>
                            <td className="px-4 py-3.5">
                              <div className="flex flex-col">
                                <span className="text-xs text-slate-600">{formatDate(r.updatedAt)}</span>
                                <span className="text-[10px] text-slate-400">{formatRelativeDate(r.updatedAt)}</span>
                              </div>
                            </td>
                            <td className="px-4 py-3.5">
                              <button
                                type="button"
                                className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium transition ${
                                  isExpanded
                                    ? 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200'
                                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                }`}
                                onClick={(e) => { e.stopPropagation(); setExpandedRow(isExpanded ? null : r._id); }}
                              >
                                {isExpanded ? (
                                  <><FaChevronUp className="size-2.5" /> 收起</>
                                ) : (
                                  <><FaChevronDown className="size-2.5" /> 详情</>
                                )}
                              </button>
                            </td>
                          </tr>

                          {/* 展开详情行 */}
                          <AnimatePresence>
                            {isExpanded && (
                              <tr>
                                <td colSpan={7} className="bg-slate-50/70 px-0">
                                  <motion.div
                                    ref={detailRef}
                                    className="overflow-hidden border-t border-slate-100"
                                    initial={{ height: 0 }}
                                    animate={{ height: 'auto' }}
                                    exit={{ height: 0 }}
                                    transition={{ duration: 0.3, ease: 'easeInOut' }}
                                  >
                                    <div className="space-y-5 p-6">
                                      {/* 信息网格 */}
                                      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                                        {[
                                          { label: 'User ID', value: r.userId },
                                          { label: 'Bilibili UID', value: r.bilibiliUid || '—' },
                                          { label: 'UID 绑定时间', value: formatDate(r.uidBoundAt) },
                                          {
                                            label: '凭据状态',
                                            value: r.credentialStatus === 'active' ? '有效' : '无效',
                                            badge: true,
                                            tone: r.credentialStatus === 'active' ? 'emerald' as const : 'slate' as const,
                                          },
                                          { label: '设置版本', value: `v${r.settingsVersion}` },
                                          { label: '设置更新', value: formatDate(r.settingsUpdatedAt) },
                                          { label: '创建时间', value: formatDate(r.createdAt) },
                                          { label: '更新时间', value: formatDate(r.updatedAt) },
                                        ].map(({ label, value, badge, tone }) => (
                                          <div key={label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                                            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                                              {label}
                                            </span>
                                            <div className="mt-1">
                                              {badge ? (
                                                <InfoBadge tone={tone || 'slate'}>{value}</InfoBadge>
                                              ) : (
                                                <span className="text-xs font-medium text-slate-800 break-all">{value}</span>
                                              )}
                                            </div>
                                          </div>
                                        ))}
                                      </div>

                                      {/* 配置数据 */}
                                      {r.settings && Object.keys(r.settings).length > 0 && (
                                        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                                          <div className="mb-2 flex items-center gap-2">
                                            <FaCog className="size-3.5 text-slate-400" />
                                            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                                              配置数据
                                            </h4>
                                            <InfoBadge tone="slate">{Object.keys(r.settings).length} 个字段</InfoBadge>
                                          </div>
                                          <pre className="max-h-52 overflow-auto rounded-2xl bg-slate-50 p-4 text-[11px] leading-relaxed text-slate-700 ring-1 ring-slate-100">
                                            {JSON.stringify(r.settings, null, 2)}
                                          </pre>
                                        </div>
                                      )}

                                      {/* 搜索记录 */}
                                      {r.searchRecords.length > 0 && (
                                        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                                          <div className="mb-2 flex items-center gap-2">
                                            <FaHistory className="size-3.5 text-slate-400" />
                                            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                                              搜索记录
                                            </h4>
                                            <InfoBadge tone="slate">
                                              共 {r.searchRecords.length} 条
                                              {!showAllSearch[r._id] && `，显示最近 10 条`}
                                            </InfoBadge>
                                            {r.searchRecords.length > 10 && (
                                              <button
                                                type="button"
                                                onClick={(e) => { e.stopPropagation(); handleShowAllSearch(r); }}
                                                className="ml-auto inline-flex items-center gap-1 rounded-xl px-2.5 py-1 text-[11px] font-medium text-indigo-600 transition hover:bg-indigo-50"
                                              >
                                                {searchRecordLoading === r.userId ? (
                                                  <FaRedo className="size-2.5 animate-spin" />
                                                ) : showAllSearch[r._id] ? (
                                                  <><FaChevronUp className="size-2.5" /> 收起</>
                                                ) : (
                                                  <><FaChevronDown className="size-2.5" /> 查看全部</>
                                                )}
                                              </button>
                                            )}
                                          </div>
                                          {showAllSearch[r._id] && searchRecordData[r.userId] ? (
                                            <>
                                              <div className="max-h-[600px] space-y-1.5 overflow-auto">
                                                {searchRecordData[r.userId].data.map((sr) => (
                                                  <div
                                                    key={sr.id}
                                                    className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50/50 px-4 py-2.5 text-xs text-slate-600 transition hover:bg-slate-100"
                                                  >
                                                    <FaSearch className="size-2.5 shrink-0 text-slate-400" />
                                                    <span className="flex-1 truncate font-medium">
                                                      {sr.keyword.length > 80 ? sr.keyword.slice(0, 80) + '…' : sr.keyword}
                                                    </span>
                                                    {sr.createdAt && (
                                                      <span className="shrink-0 text-slate-400 flex items-center gap-1.5">
                                                        <FaClock className="size-2.5" />
                                                        {formatDate(sr.createdAt)}
                                                      </span>
                                                    )}
                                                  </div>
                                                ))}
                                              </div>
                                              {searchRecordData[r.userId].totalPages > 1 && (
                                                <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2.5">
                                                  <span className="text-[11px] text-slate-400">
                                                    共 {searchRecordData[r.userId].total} 条，{searchRecordData[r.userId].totalPages} 页
                                                  </span>
                                                  <div className="flex items-center gap-1.5">
                                                    <button
                                                      type="button"
                                                      onClick={() => handleSearchRecordPage(r.userId, searchRecordData[r.userId].page - 1)}
                                                      disabled={searchRecordData[r.userId].page <= 1}
                                                      className="inline-flex size-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-[11px] text-slate-500 transition hover:bg-slate-50 disabled:opacity-30"
                                                    >
                                                      <FaAngleLeft />
                                                    </button>
                                                    <span className="text-[11px] font-medium text-slate-600 min-w-[4rem] text-center">
                                                      {searchRecordData[r.userId].page}/{searchRecordData[r.userId].totalPages}
                                                    </span>
                                                    <button
                                                      type="button"
                                                      onClick={() => handleSearchRecordPage(r.userId, searchRecordData[r.userId].page + 1)}
                                                      disabled={searchRecordData[r.userId].page >= searchRecordData[r.userId].totalPages}
                                                      className="inline-flex size-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-[11px] text-slate-500 transition hover:bg-slate-50 disabled:opacity-30"
                                                    >
                                                      <FaAngleRight />
                                                    </button>
                                                  </div>
                                                </div>
                                              )}
                                            </>
                                          ) : (
                                            <div className={`space-y-1.5 overflow-auto ${showAllSearch[r._id] ? 'max-h-[600px]' : 'max-h-44'}`}>
                                              {(showAllSearch[r._id] ? r.searchRecords : r.searchRecords.slice(0, 10)).map((sr) => (
                                                <div
                                                  key={sr.id}
                                                  className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50/50 px-4 py-2.5 text-xs text-slate-600 transition hover:bg-slate-100"
                                                >
                                                  <FaSearch className="size-2.5 shrink-0 text-slate-400" />
                                                  <span className="flex-1 truncate font-medium">
                                                    {sr.keyword.length > 80 ? sr.keyword.slice(0, 80) + '…' : sr.keyword}
                                                  </span>
                                                  {sr.createdAt && (
                                                    <span className="shrink-0 text-slate-400 flex items-center gap-1.5">
                                                      <FaClock className="size-2.5" />
                                                      {formatDate(sr.createdAt)}
                                                    </span>
                                                  )}
                                                </div>
                                              ))}
                                            </div>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  </motion.div>
                                </td>
                              </tr>
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
              <div className="mt-5 flex items-center justify-between border-t border-slate-200 pt-4">
                <div className="text-xs text-slate-400">
                  共 {pagination.total} 条记录，{pagination.totalPages} 页
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handlePageChange(pagination.page - 1)}
                    disabled={pagination.page <= 1 || loading}
                    className={logShareSecondaryButtonClass + ' disabled:opacity-40'}
                  >
                    <FaAngleLeft />
                    上一页
                  </button>
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
                        <button
                          key={pageNum}
                          type="button"
                          onClick={() => handlePageChange(pageNum)}
                          disabled={loading}
                          className={`inline-flex size-8 items-center justify-center rounded-xl text-xs font-medium transition ${
                            isActive
                              ? 'bg-indigo-600 text-white shadow-sm'
                              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                          }`}
                        >
                          {pageNum}
                        </button>
                      );
                    })}
                  </div>
                  <button
                    type="button"
                    onClick={() => handlePageChange(pagination.page + 1)}
                    disabled={pagination.page >= pagination.totalPages || loading}
                    className={logShareSecondaryButtonClass + ' disabled:opacity-40'}
                  >
                    下一页
                    <FaAngleRight />
                  </button>
                </div>
              </div>
            )}

            {/* 底部统计条 */}
            {!loading && records.length > 0 && (
              <div className="mt-4 flex items-center gap-4 border-t border-slate-100 pt-3 text-[11px] text-slate-400">
                <span className="flex items-center gap-1">
                  <FaDatabase className="size-2.5" />
                  当前页 {records.length} 条
                </span>
                <span className="flex items-center gap-1">
                  <FaShieldAlt className="size-2.5" />
                  凭据有效 {stats.active}/{stats.total}
                </span>
                <span className="flex items-center gap-1">
                  <FaUserTag className="size-2.5" />
                  已绑定 {stats.bound}/{stats.total}
                </span>
              </div>
            )}
          </InfoPanel>
        </>
      )}
    </div>
  );
};

export default BilibiliSyncAdmin;