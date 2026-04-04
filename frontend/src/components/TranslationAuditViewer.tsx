import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FaBan,
  FaChevronLeft,
  FaChevronRight,
  FaFilter,
  FaGavel,
  FaSearch,
  FaShieldAlt,
  FaSync,
  FaTrash,
  FaUserSlash,
} from 'react-icons/fa';
import { useNotification } from './Notification';
import {
  translationAuditApi,
  type TranslationLogEntry,
  type TranslationLogQuery,
  type TranslationLogStats,
  type TranslationTraceUser,
  type TranslationPenaltyAction,
} from '../api/translationAudit';

const PAGE_SIZE = 20;

const TranslationAuditViewer: React.FC = () => {
  const { setNotification } = useNotification();
  const [logs, setLogs] = useState<TranslationLogEntry[]>([]);
  const [stats, setStats] = useState<TranslationLogStats | null>(null);
  const [filters, setFilters] = useState<TranslationLogQuery>({
    keyword: '',
    userId: '',
    startDate: '',
    endDate: '',
  });
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [showFilters, setShowFilters] = useState(false);
  const [selectedLogId, setSelectedLogId] = useState<string | null>(null);
  const [selectedUser, setSelectedUser] = useState<TranslationTraceUser | null>(null);
  const [userLoading, setUserLoading] = useState(false);
  const [penaltyLoading, setPenaltyLoading] = useState(false);

  const selectedLog = useMemo(
    () => logs.find((item) => item._id === selectedLogId) || null,
    [logs, selectedLogId],
  );

  const fetchLogs = useCallback(async (nextPage = page) => {
    setLoading(true);
    try {
      const response = await translationAuditApi.query({
        ...filters,
        page: nextPage,
        pageSize: PAGE_SIZE,
      });
      setLogs(response.logs);
      setPage(response.page);
      setTotal(response.total);
    } catch (error) {
      setNotification({
        message: error instanceof Error ? error.message : '获取翻译日志失败',
        type: 'error',
      });
    } finally {
      setLoading(false);
    }
  }, [filters, page, setNotification]);

  const fetchStats = useCallback(async () => {
    try {
      const response = await translationAuditApi.getStats();
      setStats(response);
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    void fetchLogs(1);
    void fetchStats();
  }, []);

  useEffect(() => {
    void fetchLogs(page);
  }, [page]);

  const openTrace = useCallback(async (log: TranslationLogEntry) => {
    setSelectedLogId(log._id);
    setUserLoading(true);
    try {
      const user = await translationAuditApi.getUser(log.userId);
      setSelectedUser(user);
    } catch (error) {
      setSelectedUser(null);
      setNotification({
        message: error instanceof Error ? error.message : '获取用户信息失败',
        type: 'error',
      });
    } finally {
      setUserLoading(false);
    }
  }, [setNotification]);

  const applyPenalty = useCallback(async (action: TranslationPenaltyAction) => {
    if (!selectedUser) {
      return;
    }

    let until: string | undefined;
    if (action === 'LIMIT_TRANSLATION') {
      const hoursText = window.prompt('限制翻译权限多少小时？', '24');
      if (!hoursText) {
        return;
      }
      const hours = Number(hoursText);
      if (!Number.isFinite(hours) || hours <= 0) {
        setNotification({ message: '请输入有效小时数', type: 'error' });
        return;
      }
      until = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
    }

    if (action === 'DELETE_USER' && !window.confirm('确定要删除该用户吗？此操作不可恢复。')) {
      return;
    }

    setPenaltyLoading(true);
    try {
      const response = await translationAuditApi.applyPenalty(selectedUser.id, action, until);
      setNotification({ message: response.message, type: 'success' });
      if (action === 'DELETE_USER') {
        setSelectedUser(null);
      } else if (selectedLog) {
        const refreshed = await translationAuditApi.getUser(selectedLog.userId);
        setSelectedUser(refreshed);
      }
    } catch (error) {
      setNotification({
        message: error instanceof Error ? error.message : '执行惩戒失败',
        type: 'error',
      });
    } finally {
      setPenaltyLoading(false);
    }
  }, [selectedLog, selectedUser, setNotification]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-4">
      {stats ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="总翻译数" value={stats.total} />
          <StatCard label="近24小时" value={stats.last24h} />
          <StatCard
            label="高频用户"
            value={stats.topUsers[0]?.count || 0}
            caption={stats.topUsers[0]?.userId || '暂无'}
          />
          <StatCard
            label="列表页数"
            value={totalPages}
            caption={`${page}/${totalPages}`}
          />
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={filters.keyword}
            onChange={(event) => setFilters((prev) => ({ ...prev, keyword: event.target.value }))}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                setPage(1);
                void fetchLogs(1);
              }
            }}
            placeholder="搜索原文、译文或用户 ID"
            className="w-full rounded-lg border px-9 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-300"
          />
        </div>
        <button
          onClick={() => setShowFilters((prev) => !prev)}
          className={`rounded-lg px-3 py-2 text-sm transition ${showFilters ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
        >
          <span className="inline-flex items-center gap-1"><FaFilter />筛选</span>
        </button>
        <button
          onClick={() => {
            setPage(1);
            void fetchLogs(1);
            void fetchStats();
          }}
          className="rounded-lg bg-blue-500 px-4 py-2 text-sm text-white transition hover:bg-blue-600"
        >
          搜索
        </button>
        <button
          onClick={() => {
            void fetchLogs(page);
            void fetchStats();
          }}
          className="rounded-lg bg-gray-100 px-3 py-2 text-sm text-gray-600 transition hover:bg-gray-200"
        >
          <FaSync className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {showFilters ? (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          className="grid gap-3 rounded-lg bg-gray-50 p-3 sm:grid-cols-3"
        >
          <input
            value={filters.userId}
            onChange={(event) => setFilters((prev) => ({ ...prev, userId: event.target.value }))}
            placeholder="按 userId 精确筛选"
            className="rounded-lg border px-3 py-2 text-sm"
          />
          <input
            type="date"
            value={filters.startDate}
            onChange={(event) => setFilters((prev) => ({ ...prev, startDate: event.target.value }))}
            className="rounded-lg border px-3 py-2 text-sm"
          />
          <input
            type="date"
            value={filters.endDate}
            onChange={(event) => setFilters((prev) => ({ ...prev, endDate: event.target.value }))}
            className="rounded-lg border px-3 py-2 text-sm"
          />
        </motion.div>
      ) : null}

      <div className="overflow-hidden rounded-lg border bg-white">
        {loading && logs.length === 0 ? (
          <div className="p-8 text-center text-gray-400">加载中...</div>
        ) : logs.length === 0 ? (
          <div className="p-8 text-center text-gray-400">暂无翻译日志</div>
        ) : (
          <div className="divide-y">
            {logs.map((log) => (
              <button
                key={log._id}
                type="button"
                onClick={() => void openTrace(log)}
                className="w-full px-4 py-3 text-left transition hover:bg-gray-50"
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-gray-900">
                      {log.input_text}
                    </div>
                    <div className="mt-1 truncate text-sm text-gray-500">
                      {log.output_text || '无译文输出'}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-gray-400">
                    <span>{log.userId}</span>
                    <span>{log.ip_address}</span>
                    <span>{new Date(log.timestamp).toLocaleString()}</span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between text-sm">
        <span className="text-gray-500">共 {total} 条记录</span>
        <div className="flex items-center gap-2">
          <button
            disabled={page <= 1}
            onClick={() => setPage((prev) => prev - 1)}
            className="rounded border px-2 py-1 disabled:opacity-40"
          >
            <FaChevronLeft />
          </button>
          <span className="text-gray-500">{page} / {totalPages}</span>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage((prev) => prev + 1)}
            className="rounded border px-2 py-1 disabled:opacity-40"
          >
            <FaChevronRight />
          </button>
        </div>
      </div>

      <AnimatePresence>
        {selectedLog ? (
          <motion.div
            className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => {
              setSelectedLogId(null);
              setSelectedUser(null);
            }}
          >
            <motion.div
              className="max-h-[90vh] w-full max-w-3xl overflow-auto rounded-2xl bg-white p-6 shadow-2xl"
              initial={{ opacity: 0, y: 20, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.98 }}
              onClick={(event) => event.stopPropagation()}
            >
              <div className="mb-4 flex items-start justify-between gap-4">
                <div>
                  <div className="text-xs uppercase tracking-[0.18em] text-gray-400">Translation Trace</div>
                  <h3 className="mt-2 text-xl font-semibold text-gray-900">翻译日志溯源</h3>
                </div>
                <button
                  onClick={() => {
                    setSelectedLogId(null);
                    setSelectedUser(null);
                  }}
                  className="rounded-full bg-gray-100 px-3 py-1 text-sm text-gray-500"
                >
                  关闭
                </button>
              </div>

              <div className="grid gap-4 lg:grid-cols-[1.2fr,0.8fr]">
                <div className="space-y-4">
                  <DetailCard title="原文" value={selectedLog.input_text} />
                  <DetailCard title="译文" value={selectedLog.output_text || '无'} />
                  <DetailCard
                    title="请求元信息"
                    value={JSON.stringify(selectedLog.request_meta || {}, null, 2)}
                    code
                  />
                </div>

                <div className="space-y-4">
                  <div className="rounded-xl border bg-gray-50 p-4">
                    <div className="text-sm font-semibold text-gray-900">关联用户</div>
                    {userLoading ? (
                      <div className="mt-3 text-sm text-gray-400">正在获取用户信息...</div>
                    ) : selectedUser ? (
                      <div className="mt-3 space-y-2 text-sm text-gray-600">
                        <div><span className="text-gray-400">ID:</span> {selectedUser.id}</div>
                        <div><span className="text-gray-400">用户名:</span> {selectedUser.username}</div>
                        <div><span className="text-gray-400">邮箱:</span> {selectedUser.email}</div>
                        <div><span className="text-gray-400">角色:</span> {selectedUser.role}</div>
                        <div><span className="text-gray-400">账户状态:</span> {selectedUser.accountStatus || 'active'}</div>
                        <div><span className="text-gray-400">页面访问:</span> {selectedUser.isTranslationEnabled === false ? '已停用' : '正常'}</div>
                        <div>
                          <span className="text-gray-400">翻译限制至:</span>{' '}
                          {selectedUser.translationAccessUntil || '-'}
                        </div>
                      </div>
                    ) : (
                      <div className="mt-3 text-sm text-gray-400">未获取到用户信息</div>
                    )}
                  </div>

                  <div className="rounded-xl border bg-white p-4">
                    <div className="mb-3 text-sm font-semibold text-gray-900">惩戒操作</div>
                    <div className="grid gap-2">
                      <PenaltyButton
                        icon={<FaBan />}
                        label="等级 1：限制翻译"
                        onClick={() => void applyPenalty('LIMIT_TRANSLATION')}
                        disabled={!selectedUser || penaltyLoading}
                      />
                      <PenaltyButton
                        icon={<FaShieldAlt />}
                        label="等级 2：停用页面"
                        onClick={() => void applyPenalty('REVOKE_PAGE_ACCESS')}
                        disabled={!selectedUser || penaltyLoading}
                      />
                      <PenaltyButton
                        icon={<FaUserSlash />}
                        label="等级 3：封停账户"
                        onClick={() => void applyPenalty('SUSPEND_ACCOUNT')}
                        disabled={!selectedUser || penaltyLoading}
                      />
                      <PenaltyButton
                        icon={<FaTrash />}
                        label="等级 4：删除用户"
                        danger
                        onClick={() => void applyPenalty('DELETE_USER')}
                        disabled={!selectedUser || penaltyLoading}
                      />
                      <PenaltyButton
                        icon={<FaGavel />}
                        label="清除翻译限制"
                        onClick={() => void applyPenalty('CLEAR_TRANSLATION_RESTRICTIONS')}
                        disabled={!selectedUser || penaltyLoading}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
};

const StatCard: React.FC<{ label: string; value: number; caption?: string }> = ({ label, value, caption }) => (
  <div className="rounded-xl border bg-white p-3 text-center">
    <div className="text-xl font-bold text-gray-900">{value.toLocaleString()}</div>
    <div className="mt-1 text-xs text-gray-500">{label}</div>
    {caption ? <div className="mt-1 truncate text-[11px] text-gray-400">{caption}</div> : null}
  </div>
);

const DetailCard: React.FC<{ title: string; value: string; code?: boolean }> = ({ title, value, code }) => (
  <div className="rounded-xl border bg-gray-50 p-4">
    <div className="mb-2 text-sm font-semibold text-gray-900">{title}</div>
    <pre className={`${code ? 'font-mono text-xs' : 'text-sm'} whitespace-pre-wrap break-all text-gray-600`}>
      {value}
    </pre>
  </div>
);

const PenaltyButton: React.FC<{
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}> = ({ icon, label, onClick, disabled, danger = false }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition ${
      danger
        ? 'bg-rose-50 text-rose-700 hover:bg-rose-100'
        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
    } disabled:cursor-not-allowed disabled:opacity-50`}
  >
    {icon}
    {label}
  </button>
);

export default TranslationAuditViewer;
