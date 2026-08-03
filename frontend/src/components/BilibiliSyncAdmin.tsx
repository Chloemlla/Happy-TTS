import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FaDatabase, FaSearch, FaSyncAlt, FaUser, FaList, FaKey, FaCheck, FaTimes, FaClock } from 'react-icons/fa';
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
const ROW_INITIAL = { opacity: 0, x: -10 };
const ROW_ANIMATE = { opacity: 1, x: 0 };

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

  const fetchRecords = useCallback(async (page: number, searchTerm: string, append = false) => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (searchTerm) params.set('search', searchTerm);
      const res = await fetch(`/api/admin/bilibili-sync?${params}`, { credentials: 'include' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error || '请求失败');
      setRecords(append ? [...records, ...json.data] : json.data);
      setPagination(json.pagination);
    } catch (e) {
      setError(getErrorMessage(e, '加载失败'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchRecords(1, ''); }, [fetchRecords]);

  const handleSearch = () => fetchRecords(1, keyword);
  const handlePageChange = (page: number) => fetchRecords(page, keyword);

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

  return (
    <motion.div
      className="space-y-6"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={MOTION_CONFIG}
    >
      {/* 标题和说明 */}
      <motion.div
        className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-6 border border-blue-100"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={MOTION_CONFIG}
      >
        <h2 className="text-2xl font-bold text-blue-700 mb-3 flex items-center gap-2">
          <FaDatabase className="text-blue-600" />
          PiliPlus 设置同步
        </h2>
        <div className="text-gray-600 space-y-2">
          <p>查看 PiliPlus 通过 Bilibili Sync OAuth 上传的配置数据、搜索记录和凭据信息。</p>
          <div className="flex items-start gap-2 text-sm">
            <div>
              <p className="font-semibold text-blue-700">功能说明：</p>
              <ul className="list-disc list-inside space-y-1 mt-1">
                <li>按 userId 或 Bilibili UID 搜索同步记录</li>
                <li>展开查看 settings 配置 JSON 和搜索记录详情</li>
                <li>凭据状态、绑定状态一目了然</li>
              </ul>
            </div>
          </div>
        </div>
      </motion.div>

      {!isAdmin && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm">
          需要管理员权限才能查看此页面。
        </div>
      )}

      {/* 统计卡片 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: '总记录', value: stats.total, tone: 'bg-blue-50 text-blue-700 border-blue-200' },
          { label: '凭据有效', value: stats.active, tone: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
          { label: '已绑定 UID', value: stats.bound, tone: 'bg-sky-50 text-sky-700 border-sky-200' },
          { label: '有搜索记录', value: stats.withRecords, tone: 'bg-amber-50 text-amber-700 border-amber-200' },
        ].map(item => (
          <div key={item.label} className={`rounded-lg border px-4 py-3 ${item.tone}`}>
            <div className="text-xs font-semibold text-current/70">{item.label}</div>
            <div className="mt-1 text-2xl font-bold">{item.value}</div>
          </div>
        ))}
      </div>

      {/* 错误提示 */}
      <AnimatePresence>
        {error && (
          <motion.div
            className="bg-red-50 border border-red-200 rounded-xl p-4"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
          >
            <div className="flex items-center gap-2 text-red-700">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="font-medium">{error}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 列表 */}
      <motion.div
        className="bg-white rounded-xl p-6 shadow-sm border border-gray-200"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={MOTION_CONFIG}
      >
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
            <FaList className="text-lg text-blue-500" />
            同步记录
            <span className="text-sm font-normal text-gray-500">
              {rangeStart}-{rangeEnd} / {pagination.total}
            </span>
          </h3>
          <div className="flex flex-wrap gap-2">
            <motion.button
              onClick={() => fetchRecords(pagination.page, keyword)}
              disabled={loading}
              className="px-3 py-2 bg-white text-gray-700 rounded-lg hover:bg-gray-50 transition font-medium flex items-center gap-2 border border-gray-200 disabled:opacity-50"
              whileHover={hoverScale()}
              whileTap={tapScale()}
            >
              <FaSyncAlt className="text-xs" />
              刷新
            </motion.button>
          </div>
        </div>

        {/* 搜索栏 */}
        <div className="mb-4 space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="relative flex-1 max-w-md">
              <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs" />
              <input
                value={keyword}
                onChange={e => setKeyword(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleSearch(); }}
                placeholder="搜索 userId 或 Bilibili UID…"
                className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 text-sm bg-white"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <motion.button
                type="button"
                onClick={handleSearch}
                disabled={loading}
                className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition text-sm font-medium disabled:opacity-50"
                whileHover={hoverScale()}
                whileTap={tapScale()}
              >
                <FaSearch className="inline mr-1 text-xs" />
                搜索
              </motion.button>
              {keyword && (
                <motion.button
                  type="button"
                  onClick={() => { setKeyword(''); fetchRecords(1, ''); }}
                  className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition text-sm font-medium"
                  whileHover={hoverScale()}
                  whileTap={tapScale()}
                >
                  清除
                </motion.button>
              )}
            </div>
          </div>
        </div>

        {/* 加载中 */}
        {loading && (
          <div className="text-center py-8 text-gray-500">
            <svg className="animate-spin h-8 w-8 mx-auto mb-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            加载中...
          </div>
        )}

        {/* 空状态 */}
        {!loading && records.length === 0 && (
          <div className="text-center py-12 text-gray-400">
            <FaDatabase className="mx-auto text-3xl mb-3 opacity-50" />
            <p>{keyword ? '未找到匹配的记录' : '暂无 Bilibili 同步数据'}</p>
          </div>
        )}

        {/* 表格 */}
        {!loading && records.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full border border-gray-200 rounded-lg overflow-hidden text-sm">
              <thead>
                <tr className="bg-gray-50 text-gray-700">
                  <th className="px-4 py-3 text-left font-semibold whitespace-nowrap">用户 ID</th>
                  <th className="px-4 py-3 text-left font-semibold whitespace-nowrap">Bilibili UID</th>
                  <th className="px-4 py-3 text-left font-semibold whitespace-nowrap">凭据状态</th>
                  <th className="px-4 py-3 text-left font-semibold whitespace-nowrap">设置版本</th>
                  <th className="px-4 py-3 text-left font-semibold whitespace-nowrap">搜索记录</th>
                  <th className="px-4 py-3 text-left font-semibold whitespace-nowrap">更新时间</th>
                  <th className="px-4 py-3 text-left font-semibold whitespace-nowrap">操作</th>
                </tr>
              </thead>
              <tbody>
                {records.map((r, idx) => (
                  <motion.tr
                    key={r._id}
                    className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}
                    initial={ROW_INITIAL}
                    animate={ROW_ANIMATE}
                    transition={{ duration: 0.3, delay: 0.03 * idx }}
                    whileHover={{ backgroundColor: '#f0f9ff' }}
                  >
                    <td className="px-4 py-3 font-mono text-xs text-gray-700 max-w-[120px] truncate" title={r.userId}>
                      {r.userId.slice(0, 16)}…
                    </td>
                    <td className="px-4 py-3">
                      {r.bilibiliUid ? (
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-sky-100 text-sky-700">
                          <FaUser className="mr-1 text-[9px]" />
                          {r.bilibiliUid}
                        </span>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {r.credentialStatus === 'active' ? (
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">
                          <FaCheck className="mr-1 text-[9px]" />
                          有效
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-200 text-gray-600">
                          <FaTimes className="mr-1 text-[9px]" />
                          无效
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600">v{r.settingsVersion}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
                        {r.searchRecords.length} 条
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600 text-xs">{formatDate(r.updatedAt)}</td>
                    <td className="px-4 py-3">
                      <motion.button
                        onClick={() => setExpandedRow(expandedRow === r._id ? null : r._id)}
                        className="text-blue-600 hover:underline text-xs font-medium"
                        whileHover={hoverScale()}
                        whileTap={tapScale()}
                      >
                        {expandedRow === r._id ? '收起' : '详情'}
                      </motion.button>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* 展开详情 */}
        {expandedRow && (() => {
          const record = records.find(r => r._id === expandedRow);
          if (!record) return null;
          return (
            <motion.div
              className="mt-4 bg-gray-50 p-4 rounded-lg border border-gray-200 space-y-3"
              initial={{ opacity: 0, height: 0, scale: 0.95 }}
              animate={{ opacity: 1, height: 'auto', scale: 1 }}
              exit={{ opacity: 0, height: 0, scale: 0.95 }}
              transition={{ duration: 0.3 }}
            >
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <div>
                  <span className="text-xs font-medium text-gray-500 block">User ID</span>
                  <span className="font-mono text-xs text-gray-800 break-all">{record.userId}</span>
                </div>
                <div>
                  <span className="text-xs font-medium text-gray-500 block">Bilibili UID</span>
                  <span className="text-gray-800">{record.bilibiliUid || '-'}</span>
                </div>
                <div>
                  <span className="text-xs font-medium text-gray-500 block">UID 绑定时间</span>
                  <span className="text-gray-800">{formatDate(record.uidBoundAt)}</span>
                </div>
                <div>
                  <span className="text-xs font-medium text-gray-500 block">凭据状态</span>
                  <span className="text-gray-800">{record.credentialStatus}</span>
                </div>
                <div>
                  <span className="text-xs font-medium text-gray-500 block">设置版本</span>
                  <span className="text-gray-800">{record.settingsVersion}</span>
                </div>
                <div>
                  <span className="text-xs font-medium text-gray-500 block">设置更新</span>
                  <span className="text-gray-800">{formatDate(record.settingsUpdatedAt)}</span>
                </div>
                <div>
                  <span className="text-xs font-medium text-gray-500 block">创建时间</span>
                  <span className="text-gray-800">{formatDate(record.createdAt)}</span>
                </div>
                <div>
                  <span className="text-xs font-medium text-gray-500 block">更新时间</span>
                  <span className="text-gray-800">{formatDate(record.updatedAt)}</span>
                </div>
              </div>

              {record.settings && Object.keys(record.settings).length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">配置数据</h4>
                  <pre className="max-h-48 overflow-auto rounded-lg bg-white border border-gray-200 p-3 text-xs leading-relaxed text-gray-600">
                    {JSON.stringify(record.settings, null, 2)}
                  </pre>
                </div>
              )}

              {record.searchRecords.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                    搜索记录（最近 {Math.min(record.searchRecords.length, 10)} 条）
                  </h4>
                  <div className="max-h-40 space-y-1 overflow-auto">
                    {record.searchRecords.slice(0, 10).map(sr => (
                      <div key={sr.id} className="flex items-center gap-2 rounded-lg bg-white border border-gray-200 px-3 py-1.5 text-xs text-gray-600">
                        <FaSearch className="size-2.5 shrink-0 text-gray-400" />
                        <span className="font-medium">{sr.keyword.length > 60 ? sr.keyword.slice(0, 60) + '…' : sr.keyword}</span>
                        {sr.createdAt && (
                          <span className="ml-auto shrink-0 text-gray-400 flex items-center gap-1">
                            <FaClock className="text-[9px]" />
                            {formatDate(sr.createdAt)}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
          );
        })()}

        {/* 分页 */}
        {pagination.totalPages > 1 && (
          <div className="flex items-center justify-center gap-3 mt-6">
            <motion.button
              onClick={() => handlePageChange(pagination.page - 1)}
              disabled={pagination.page <= 1 || loading}
              className="px-4 py-2 bg-white text-gray-700 rounded-lg hover:bg-gray-50 transition font-medium text-sm border border-gray-200 disabled:opacity-40"
              whileHover={hoverScale()}
              whileTap={tapScale()}
            >
              上一页
            </motion.button>
            <span className="text-sm text-gray-500">
              {pagination.page} / {pagination.totalPages}（共 {pagination.total} 条）
            </span>
            <motion.button
              onClick={() => handlePageChange(pagination.page + 1)}
              disabled={pagination.page >= pagination.totalPages || loading}
              className="px-4 py-2 bg-white text-gray-700 rounded-lg hover:bg-gray-50 transition font-medium text-sm border border-gray-200 disabled:opacity-40"
              whileHover={hoverScale()}
              whileTap={tapScale()}
            >
              下一页
            </motion.button>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
};

export default BilibiliSyncAdmin;