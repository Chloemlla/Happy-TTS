import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  FaChevronLeft,
  FaChevronRight,
  FaCopy,
  FaDownload,
  FaFilter,
  FaSearch,
  FaSync,
  FaTimes,
} from 'react-icons/fa';
import { useNotification } from './Notification';
import {
  auditLogApi,
  type AuditLogEntry,
  type AuditLogMeta,
  type AuditLogQuery,
  type AuditLogStats,
} from '../api/auditLog';

const MODULE_LABELS: Record<string, string> = {
  admin: '管理后台',
  announcement: '公告',
  api: 'API',
  auth: '认证',
  cdk: 'CDK',
  config: '配置',
  debug: '调试',
  email: '邮件',
  env: '环境变量',
  ipban: 'IP封禁',
  ipfs: 'IPFS',
  life: '生活服务',
  lottery: '抽奖',
  media: '媒体',
  network: '网络',
  oauth: 'OAuth',
  other: '其他',
  policy: '策略',
  recommendation: '推荐',
  resource: '资源',
  security: '安全',
  shorturl: '短链',
  social: '社交',
  system: '系统',
  tts: 'TTS',
  user: '用户管理',
  workspace: '工作区',
};

const RESULT_LABELS: Record<string, string> = {
  success: '成功',
  failure: '失败',
};

const DEFAULT_FILTERS: AuditLogQuery = {
  module: '',
  result: '',
  keyword: '',
  requestId: '',
  action: '',
  userId: '',
  username: '',
  role: '',
  method: '',
  path: '',
  ip: '',
  targetId: '',
  targetName: '',
  statusCode: '',
  minDurationMs: '',
  maxDurationMs: '',
  startDate: '',
  endDate: '',
};

const PAGE_SIZE_OPTIONS = [20, 50, 100];
const FALLBACK_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];

const AuditLogViewer: React.FC = () => {
  const { setNotification } = useNotification();
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [stats, setStats] = useState<AuditLogStats | null>(null);
  const [meta, setMeta] = useState<AuditLogMeta | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filters, setFilters] = useState<AuditLogQuery>(DEFAULT_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<AuditLogQuery>(DEFAULT_FILTERS);
  const [queryVersion, setQueryVersion] = useState(0);

  const fetchLogs = useCallback(async (query: AuditLogQuery, nextPage: number, nextPageSize: number) => {
    setLoading(true);
    try {
      const response = await auditLogApi.query({ ...query, page: nextPage, pageSize: nextPageSize });
      setLogs(response.logs);
      setTotal(response.total);
      setPage(response.page);
      setExpandedId((current) => (response.logs.some((log) => log._id === current) ? current : null));
    } catch (error) {
      setNotification({
        message: error instanceof Error ? error.message : '获取审计日志失败',
        type: 'error',
      });
    } finally {
      setLoading(false);
    }
  }, [setNotification]);

  const fetchStats = useCallback(async (query: AuditLogQuery) => {
    try {
      const response = await auditLogApi.getStats(query);
      setStats(response);
    } catch (error) {
      setNotification({
        message: error instanceof Error ? error.message : '获取审计统计失败',
        type: 'error',
      });
    }
  }, [setNotification]);

  useEffect(() => {
    void auditLogApi.getMeta().then(setMeta).catch(() => undefined);
  }, []);

  useEffect(() => {
    void fetchLogs(appliedFilters, page, pageSize);
  }, [appliedFilters, fetchLogs, page, pageSize, queryVersion]);

  useEffect(() => {
    void fetchStats(appliedFilters);
  }, [appliedFilters, fetchStats, queryVersion]);

  const moduleOptions = useMemo(() => {
    const modules = meta?.modules?.length ? meta.modules : Object.keys(MODULE_LABELS).sort();
    return [
      { value: '', label: '全部模块' },
      ...modules.map((module) => ({
        value: module,
        label: MODULE_LABELS[module] || module,
      })),
    ];
  }, [meta]);

  const methodOptions = useMemo(() => {
    const methods = meta?.methods?.length ? meta.methods : FALLBACK_METHODS;
    return [{ value: '', label: '全部方法' }, ...methods.map((method) => ({ value: method, label: method }))];
  }, [meta]);

  const successCount = stats?.byResult.find((item) => item.result === 'success')?.count || 0;
  const failureCount = stats?.byResult.find((item) => item.result === 'failure')?.count || 0;
  const failureRate = stats?.total ? `${((failureCount / stats.total) * 100).toFixed(1)}%` : '0%';
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const activeFilters = useMemo(() => {
    const labels: Partial<Record<keyof AuditLogQuery, string>> = {
      keyword: '关键词',
      requestId: '请求ID',
      module: '模块',
      result: '结果',
      action: '操作',
      userId: '用户ID',
      username: '用户名',
      role: '角色',
      method: '方法',
      path: '路径',
      ip: 'IP',
      targetId: '目标ID',
      targetName: '目标名称',
      statusCode: '状态码',
      minDurationMs: '最小耗时',
      maxDurationMs: '最大耗时',
      startDate: '开始日期',
      endDate: '结束日期',
    };

    return Object.entries(appliedFilters)
      .filter(([, value]) => value !== undefined && value !== '')
      .map(([key, value]) => {
        const typedKey = key as keyof AuditLogQuery;
        const rawValue = String(value);
        const displayValue =
          typedKey === 'module'
            ? MODULE_LABELS[rawValue] || rawValue
            : typedKey === 'result'
              ? RESULT_LABELS[rawValue] || rawValue
              : rawValue;
        return { key: typedKey, label: labels[typedKey] || key, value: displayValue };
      });
  }, [appliedFilters]);

  const updateFilter = (key: keyof AuditLogQuery, value: string) => {
    setFilters((current) => ({ ...current, [key]: value }));
  };

  const applySearch = () => {
    setAppliedFilters({ ...filters });
    setPage(1);
    setQueryVersion((value) => value + 1);
  };

  const resetFilters = () => {
    setFilters(DEFAULT_FILTERS);
    setAppliedFilters(DEFAULT_FILTERS);
    setPage(1);
    setQueryVersion((value) => value + 1);
  };

  const removeFilter = (key: keyof AuditLogQuery) => {
    setFilters((current) => ({ ...current, [key]: '' }));
    setAppliedFilters((current) => ({ ...current, [key]: '' }));
    setPage(1);
    setQueryVersion((value) => value + 1);
  };

  const refresh = () => {
    setQueryVersion((value) => value + 1);
  };

  const exportCsv = async () => {
    setExporting(true);
    try {
      const count = await auditLogApi.exportCsv(appliedFilters);
      setNotification({
        message: count === null ? '审计日志导出已开始' : `已导出 ${count.toLocaleString()} 条审计日志`,
        type: 'success',
      });
    } catch (error) {
      setNotification({
        message: error instanceof Error ? error.message : '导出审计日志失败',
        type: 'error',
      });
    } finally {
      setExporting(false);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter') {
      applySearch();
    }
  };

  const copyText = async (value?: string) => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setNotification({ message: '已复制', type: 'success' });
    } catch {
      setNotification({ message: '复制失败', type: 'error' });
    }
  };

  return (
    <div className="space-y-4">
      {stats ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
          <StatCard label="匹配记录" value={stats.total} />
          <StatCard label="近24小时" value={stats.last24h} />
          <StatCard label="成功" value={successCount} color="text-green-600" />
          <StatCard label="失败" value={failureCount} color="text-red-500" />
          <StatCard label="失败率" value={failureRate} color={failureCount > 0 ? 'text-amber-600' : 'text-gray-800'} />
          <StatCard label="平均耗时" value={formatDuration(stats.averageDurationMs)} />
        </div>
      ) : null}

      {stats ? (
        <div className="grid gap-3 lg:grid-cols-2">
          <DistributionPanel
            title="模块分布"
            items={stats.byModule.slice(0, 8).map((item) => ({
              label: moduleLabel(item.module),
              count: item.count,
            }))}
          />
          <DistributionPanel
            title="高频操作"
            items={stats.topActions.slice(0, 8).map((item) => ({
              label: item.action,
              count: item.count,
            }))}
            emptyText="暂无操作统计"
          />
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="搜索请求ID、用户、操作、目标或IP"
            className="w-full rounded-lg border px-9 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-300"
            value={filters.keyword}
            onChange={(event) => updateFilter('keyword', event.target.value)}
            onKeyDown={handleKeyDown}
          />
        </div>
        <button
          type="button"
          onClick={() => setShowFilters((value) => !value)}
          className={`rounded-lg px-3 py-2 text-sm transition ${
            showFilters ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          <span className="inline-flex items-center gap-1"><FaFilter />筛选</span>
        </button>
        <button
          type="button"
          onClick={applySearch}
          className="rounded-lg bg-blue-500 px-4 py-2 text-sm text-white transition hover:bg-blue-600"
        >
          搜索
        </button>
        <button
          type="button"
          onClick={() => void exportCsv()}
          disabled={exporting || total === 0}
          className="rounded-lg bg-gray-900 px-3 py-2 text-sm text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
          title={meta ? `最多导出 ${meta.maxExportRows.toLocaleString()} 条` : '导出CSV'}
        >
          <FaDownload className={exporting ? 'animate-pulse' : ''} />
        </button>
        <button
          type="button"
          onClick={refresh}
          className="rounded-lg bg-gray-100 px-3 py-2 text-sm text-gray-600 transition hover:bg-gray-200"
          title="刷新"
        >
          <FaSync className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {showFilters ? (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          className="grid gap-3 rounded-lg bg-gray-50 p-3 sm:grid-cols-2 xl:grid-cols-4"
        >
          <select
            className="rounded-lg border px-3 py-2 text-sm"
            value={filters.module}
            onChange={(event) => updateFilter('module', event.target.value)}
          >
            {moduleOptions.map((module) => (
              <option key={module.value} value={module.value}>{module.label}</option>
            ))}
          </select>
          <select
            className="rounded-lg border px-3 py-2 text-sm"
            value={filters.result}
            onChange={(event) => updateFilter('result', event.target.value)}
          >
            <option value="">全部结果</option>
            <option value="success">成功</option>
            <option value="failure">失败</option>
          </select>
          <select
            className="rounded-lg border px-3 py-2 text-sm"
            value={filters.method}
            onChange={(event) => updateFilter('method', event.target.value)}
          >
            {methodOptions.map((method) => (
              <option key={method.value} value={method.value}>{method.label}</option>
            ))}
          </select>
          <input
            value={filters.statusCode}
            onChange={(event) => updateFilter('statusCode', event.target.value)}
            onKeyDown={handleKeyDown}
            inputMode="numeric"
            placeholder="状态码"
            className="rounded-lg border px-3 py-2 text-sm"
          />
          <input
            value={filters.requestId}
            onChange={(event) => updateFilter('requestId', event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="请求ID"
            className="rounded-lg border px-3 py-2 text-sm"
          />
          <input
            value={filters.action}
            onChange={(event) => updateFilter('action', event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="操作"
            className="rounded-lg border px-3 py-2 text-sm"
          />
          <input
            value={filters.userId}
            onChange={(event) => updateFilter('userId', event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="用户ID"
            className="rounded-lg border px-3 py-2 text-sm"
          />
          <input
            value={filters.username}
            onChange={(event) => updateFilter('username', event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="用户名"
            className="rounded-lg border px-3 py-2 text-sm"
          />
          <input
            value={filters.role}
            onChange={(event) => updateFilter('role', event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="角色"
            className="rounded-lg border px-3 py-2 text-sm"
          />
          <input
            value={filters.ip}
            onChange={(event) => updateFilter('ip', event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="IP"
            className="rounded-lg border px-3 py-2 text-sm"
          />
          <input
            value={filters.path}
            onChange={(event) => updateFilter('path', event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="请求路径"
            className="rounded-lg border px-3 py-2 text-sm"
          />
          <input
            value={filters.targetId}
            onChange={(event) => updateFilter('targetId', event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="目标ID"
            className="rounded-lg border px-3 py-2 text-sm"
          />
          <input
            value={filters.targetName}
            onChange={(event) => updateFilter('targetName', event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="目标名称"
            className="rounded-lg border px-3 py-2 text-sm"
          />
          <input
            value={filters.minDurationMs}
            onChange={(event) => updateFilter('minDurationMs', event.target.value)}
            onKeyDown={handleKeyDown}
            inputMode="numeric"
            placeholder="最小耗时 ms"
            className="rounded-lg border px-3 py-2 text-sm"
          />
          <input
            value={filters.maxDurationMs}
            onChange={(event) => updateFilter('maxDurationMs', event.target.value)}
            onKeyDown={handleKeyDown}
            inputMode="numeric"
            placeholder="最大耗时 ms"
            className="rounded-lg border px-3 py-2 text-sm"
          />
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 sm:col-span-2">
            <input
              type="date"
              className="rounded-lg border px-3 py-2 text-sm"
              value={filters.startDate}
              onChange={(event) => updateFilter('startDate', event.target.value)}
            />
            <span className="text-xs text-gray-400">至</span>
            <input
              type="date"
              className="rounded-lg border px-3 py-2 text-sm"
              value={filters.endDate}
              onChange={(event) => updateFilter('endDate', event.target.value)}
            />
          </div>
          <div className="flex items-center justify-end gap-2 sm:col-span-2 xl:col-span-4">
            <button
              type="button"
              onClick={resetFilters}
              className="rounded-lg px-3 py-2 text-sm text-gray-500 transition hover:bg-white hover:text-gray-700"
            >
              重置
            </button>
            <button
              type="button"
              onClick={applySearch}
              className="rounded-lg bg-blue-500 px-4 py-2 text-sm text-white transition hover:bg-blue-600"
            >
              应用筛选
            </button>
          </div>
        </motion.div>
      ) : null}

      {activeFilters.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          {activeFilters.map((filter) => (
            <button
              type="button"
              key={String(filter.key)}
              onClick={() => removeFilter(filter.key)}
              className="inline-flex max-w-full items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 text-xs text-blue-700 transition hover:bg-blue-100"
            >
              <span className="truncate">{filter.label}: {filter.value}</span>
              <FaTimes className="h-3 w-3 flex-shrink-0" />
            </button>
          ))}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-lg border bg-white">
        {loading && logs.length === 0 ? (
          <div className="p-8 text-center text-gray-400">加载中...</div>
        ) : logs.length === 0 ? (
          <div className="p-8 text-center text-gray-400">暂无审计日志</div>
        ) : (
          <div className="divide-y">
            {logs.map((log) => {
              const statusCode = getStatusCode(log);
              const durationMs = getDurationMs(log);
              const expanded = expandedId === log._id;
              const detailRest = getDetailWithoutBodies(log.detail);

              return (
                <div key={log._id} className="transition hover:bg-gray-50">
                  <button
                    type="button"
                    onClick={() => setExpandedId(expanded ? null : log._id)}
                    className="w-full px-3 py-3 text-left sm:px-4"
                  >
                    <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                          <span
                            className={`h-2 w-2 flex-shrink-0 rounded-full ${
                              log.result === 'success' ? 'bg-green-400' : 'bg-red-400'
                            }`}
                          />
                          <span className="rounded bg-blue-50 px-1.5 py-0.5 text-xs text-blue-600">
                            {moduleLabel(log.module)}
                          </span>
                          <span className={`rounded px-1.5 py-0.5 text-xs ${resultTone(log.result)}`}>
                            {RESULT_LABELS[log.result] || log.result}
                          </span>
                          {log.method ? <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600">{log.method}</span> : null}
                          {statusCode ? <span className={`rounded px-1.5 py-0.5 text-xs ${statusTone(statusCode)}`}>{statusCode}</span> : null}
                          {durationMs !== undefined ? (
                            <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600">
                              {formatDuration(durationMs)}
                            </span>
                          ) : null}
                          <span className="min-w-0 flex-1 truncate text-sm font-medium text-gray-800">{log.action}</span>
                        </div>
                        <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-400">
                          <span className="truncate">by {log.username || 'unknown'}</span>
                          <span className="truncate">{log.ip}</span>
                          {log.path ? <span className="max-w-full truncate">{log.path}</span> : null}
                        </div>
                      </div>
                      <div className="flex flex-shrink-0 items-center gap-3 text-xs text-gray-400">
                        {log.requestId ? <span className="hidden max-w-[160px] truncate xl:inline">{log.requestId}</span> : null}
                        <span>{formatTime(log.createdAt)}</span>
                      </div>
                    </div>
                  </button>

                  {expanded ? (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      className="mx-3 mb-3 rounded-lg bg-gray-50 p-3 text-xs sm:mx-4"
                    >
                      <div className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2 xl:grid-cols-3">
                        <DetailField label="请求ID" value={log.requestId} onCopy={() => void copyText(log.requestId)} />
                        <DetailField label="操作者ID" value={log.userId} onCopy={() => void copyText(log.userId)} />
                        <DetailField label="角色" value={log.role} />
                        <DetailField label="请求" value={`${log.method || '-'} ${log.path || '-'}`} className="xl:col-span-2" />
                        <DetailField label="IP" value={log.ip} onCopy={() => void copyText(log.ip)} />
                        <DetailField label="目标ID" value={log.targetId} onCopy={() => void copyText(log.targetId)} />
                        <DetailField label="目标名称" value={log.targetName} />
                        <DetailField label="状态码" value={statusCode} />
                        <DetailField label="耗时" value={durationMs !== undefined ? formatDuration(durationMs) : undefined} />
                        {log.errorMessage ? (
                          <DetailField label="错误" value={log.errorMessage} className="text-red-500 sm:col-span-2 xl:col-span-3" />
                        ) : null}
                      </div>

                      {log.detail?.reqBody !== undefined ? (
                        <JsonBlock label="前端请求" value={log.detail.reqBody} />
                      ) : null}
                      {log.detail?.resBody !== undefined ? (
                        <JsonBlock label="后端响应" value={log.detail.resBody} />
                      ) : null}
                      {detailRest ? <JsonBlock label="详情" value={detailRest} /> : null}
                      {log.userAgent ? (
                        <div className="mt-2 break-all text-gray-600">
                          <span className="text-gray-500">UA：</span>{log.userAgent}
                        </div>
                      ) : null}
                    </motion.div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2 text-xs text-gray-500 sm:flex-row sm:items-center sm:justify-between sm:text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span>共 {total.toLocaleString()} 条，{page}/{totalPages} 页</span>
          {meta ? <span>保留 {meta.retentionDays} 天</span> : null}
          <select
            value={pageSize}
            onChange={(event) => {
              setPageSize(Number(event.target.value));
              setPage(1);
            }}
            className="rounded border px-2 py-1 text-xs"
          >
            {PAGE_SIZE_OPTIONS.map((size) => (
              <option key={size} value={size}>每页 {size}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
            className="rounded border px-2 py-1 transition hover:bg-gray-100 disabled:opacity-40"
          >
            <FaChevronLeft />
          </button>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
            className="rounded border px-2 py-1 transition hover:bg-gray-100 disabled:opacity-40"
          >
            <FaChevronRight />
          </button>
        </div>
      </div>
    </div>
  );
};

const moduleLabel = (module: string) => MODULE_LABELS[module] || module;

const formatTime = (iso: string) => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return date.toLocaleString('zh-CN', { hour12: false });
};

const formatDuration = (value: number | string) => {
  const ms = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(ms)) {
    return '-';
  }
  if (ms >= 1000) {
    return `${(ms / 1000).toFixed(2)}s`;
  }
  return `${Math.round(ms)}ms`;
};

const formatJson = (value: unknown) => {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
};

const getDetailWithoutBodies = (detail?: Record<string, unknown>) => {
  if (!detail) return null;
  const { reqBody, resBody, ...rest } = detail;
  const cleaned = Object.fromEntries(Object.entries(rest).filter(([, value]) => value !== undefined));
  return Object.keys(cleaned).length > 0 ? cleaned : null;
};

const getStatusCode = (log: AuditLogEntry) => {
  const value = log.detail?.statusCode;
  return typeof value === 'number' || typeof value === 'string' ? value : undefined;
};

const getDurationMs = (log: AuditLogEntry) => {
  const value = log.detail?.durationMs;
  return typeof value === 'number' ? value : undefined;
};

const resultTone = (result: string) => (
  result === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'
);

const statusTone = (statusCode: number | string) => {
  const code = Number(statusCode);
  if (code >= 500) return 'bg-red-50 text-red-600';
  if (code >= 400) return 'bg-amber-50 text-amber-700';
  if (code >= 300) return 'bg-sky-50 text-sky-700';
  return 'bg-green-50 text-green-700';
};

const StatCard: React.FC<{ label: string; value: number | string; color?: string }> = ({
  label,
  value,
  color = 'text-gray-800',
}) => (
  <div className="rounded-lg border bg-white p-3 text-center">
    <div className={`text-xl font-bold ${color}`}>
      {typeof value === 'number' ? value.toLocaleString() : value}
    </div>
    <div className="mt-0.5 text-xs text-gray-500">{label}</div>
  </div>
);

const DistributionPanel: React.FC<{
  title: string;
  items: Array<{ label: string; count: number }>;
  emptyText?: string;
}> = ({ title, items, emptyText = '暂无统计' }) => {
  const maxCount = items.reduce((max, item) => Math.max(max, item.count), 0);

  return (
    <div className="rounded-lg border bg-white p-3">
      <div className="mb-2 text-sm font-medium text-gray-800">{title}</div>
      {items.length === 0 ? (
        <div className="py-4 text-center text-xs text-gray-400">{emptyText}</div>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <div key={item.label} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 text-xs">
              <div className="min-w-0">
                <div className="truncate text-gray-600">{item.label || 'unknown'}</div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-gray-100">
                  <div
                    className="h-full rounded-full bg-blue-500"
                    style={{ width: maxCount > 0 ? `${Math.max(6, (item.count / maxCount) * 100)}%` : '0%' }}
                  />
                </div>
              </div>
              <div className="font-medium text-gray-700">{item.count.toLocaleString()}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const DetailField: React.FC<{
  label: string;
  value?: React.ReactNode;
  className?: string;
  onCopy?: () => void;
}> = ({ label, value, className = '', onCopy }) => {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  return (
    <div className={`min-w-0 ${className}`}>
      <span className="text-gray-500">{label}：</span>
      <span className="break-all text-gray-700">{value}</span>
      {onCopy ? (
        <button
          type="button"
          onClick={onCopy}
          className="ml-1 inline-flex text-gray-400 transition hover:text-gray-700"
          title="复制"
        >
          <FaCopy />
        </button>
      ) : null}
    </div>
  );
};

const JsonBlock: React.FC<{ label: string; value: unknown }> = ({ label, value }) => (
  <div className="mt-2">
    <span className="text-gray-500">{label}：</span>
    <pre className="mt-1 max-h-48 overflow-x-auto whitespace-pre-wrap break-all rounded border bg-white p-2 text-xs">
      {formatJson(value)}
    </pre>
  </div>
);

export default AuditLogViewer;
