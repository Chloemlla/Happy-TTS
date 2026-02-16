import React, { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { FaSearch, FaSync, FaChevronLeft, FaChevronRight, FaFilter, FaInfoCircle } from 'react-icons/fa';
import { useNotification } from './Notification';
import { auditLogApi, AuditLogEntry, AuditLogQuery, AuditLogStats } from '../api/auditLog';

const MODULES = [
  { value: '', label: '全部模块' },
  { value: 'user', label: '用户管理' },
  { value: 'cdk', label: 'CDK' },
  { value: 'shorturl', label: '短链' },
  { value: 'ipban', label: 'IP封禁' },
  { value: 'env', label: '环境变量' },
  { value: 'announcement', label: '公告' },
  { value: 'system', label: '系统' },
  { value: 'auth', label: '认证' },
  { value: 'other', label: '其他' },
];

const RESULTS = [
  { value: '', label: '全部结果' },
  { value: 'success', label: '成功' },
  { value: 'failure', label: '失败' },
];

const PAGE_SIZE = 20;

const AuditLogViewer: React.FC = () => {
  const { setNotification } = useNotification();
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<AuditLogStats | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // 筛选条件
  const [filters, setFilters] = useState<AuditLogQuery>({
    module: '',
    result: '',
    keyword: '',
    startDate: '',
    endDate: '',
  });

  const fetchLogs = useCallback(async (p = page) => {
    setLoading(true);
    try {
      const res = await auditLogApi.query({ ...filters, page: p, pageSize: PAGE_SIZE });
      setLogs(res.logs);
      setTotal(res.total);
      setPage(res.page);
    } catch {
      setNotification({ message: '获取审计日志失败', type: 'error' });
    } finally {
      setLoading(false);
    }
  }, [filters, page, setNotification]);

  const fetchStats = useCallback(async () => {
    try {
      const s = await auditLogApi.getStats();
      setStats(s);
    } catch { /* silent */ }
  }, []);

  useEffect(() => { fetchLogs(1); fetchStats(); }, []);
  useEffect(() => { fetchLogs(); }, [page]);

  const handleSearch = () => { setPage(1); fetchLogs(1); };
  const handleKeyDown = (e: React.KeyboardEvent) => { if (e.key === 'Enter') handleSearch(); };

  const totalPages = Math.ceil(total / PAGE_SIZE);

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleString('zh-CN', { hour12: false });
  };

  const moduleLabel = (m: string) => MODULES.find(x => x.value === m)?.label || m;

  return (
    <div className="space-y-4">
      {/* 统计卡片 */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label="总记录" value={stats.total} />
          <StatCard label="近24小时" value={stats.last24h} />
          <StatCard label="成功" value={stats.byResult.find(r => r.result === 'success')?.count || 0} color="text-green-600" />
          <StatCard label="失败" value={stats.byResult.find(r => r.result === 'failure')?.count || 0} color="text-red-500" />
        </div>
      )}

      {/* 搜索栏 */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex-1 min-w-[200px] relative">
          <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="搜索用户名、操作、IP..."
            className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-300 outline-none"
            value={filters.keyword}
            onChange={e => setFilters(f => ({ ...f, keyword: e.target.value }))}
            onKeyDown={handleKeyDown}
          />
        </div>
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`px-3 py-2 rounded-lg text-sm flex items-center gap-1 transition ${showFilters ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
        >
          <FaFilter /> 筛选
        </button>
        <button onClick={handleSearch} className="px-4 py-2 bg-blue-500 text-white rounded-lg text-sm hover:bg-blue-600 transition">
          搜索
        </button>
        <button onClick={() => { fetchLogs(page); fetchStats(); }} className="px-3 py-2 bg-gray-100 text-gray-600 rounded-lg text-sm hover:bg-gray-200 transition">
          <FaSync className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* 筛选面板 */}
      {showFilters && (
        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="flex flex-wrap gap-3 p-3 bg-gray-50 rounded-lg">
          <select
            className="px-3 py-1.5 border rounded text-sm"
            value={filters.module}
            onChange={e => setFilters(f => ({ ...f, module: e.target.value }))}
          >
            {MODULES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
          <select
            className="px-3 py-1.5 border rounded text-sm"
            value={filters.result}
            onChange={e => setFilters(f => ({ ...f, result: e.target.value }))}
          >
            {RESULTS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
          <input
            type="date"
            className="px-3 py-1.5 border rounded text-sm"
            value={filters.startDate}
            onChange={e => setFilters(f => ({ ...f, startDate: e.target.value }))}
          />
          <span className="self-center text-gray-400">至</span>
          <input
            type="date"
            className="px-3 py-1.5 border rounded text-sm"
            value={filters.endDate}
            onChange={e => setFilters(f => ({ ...f, endDate: e.target.value }))}
          />
          <button
            onClick={() => { setFilters({ module: '', result: '', keyword: '', startDate: '', endDate: '' }); }}
            className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700"
          >
            重置
          </button>
        </motion.div>
      )}

      {/* 日志列表 */}
      <div className="border rounded-lg overflow-hidden">
        {loading && logs.length === 0 ? (
          <div className="p-8 text-center text-gray-400">加载中...</div>
        ) : logs.length === 0 ? (
          <div className="p-8 text-center text-gray-400">暂无审计日志</div>
        ) : (
          <div className="divide-y">
            {logs.map(log => (
              <div
                key={log._id}
                className="px-4 py-3 hover:bg-gray-50 cursor-pointer transition"
                onClick={() => setExpandedId(expandedId === log._id ? null : log._id)}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${log.result === 'success' ? 'bg-green-400' : 'bg-red-400'}`} />
                    <span className="text-xs px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 flex-shrink-0">{moduleLabel(log.module)}</span>
                    <span className="text-sm font-medium text-gray-800 truncate">{log.action}</span>
                    <span className="text-xs text-gray-400 flex-shrink-0">by {log.username}</span>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <span className="text-xs text-gray-400 hidden sm:inline">{log.ip}</span>
                    <span className="text-xs text-gray-400">{formatTime(log.createdAt)}</span>
                  </div>
                </div>

                {/* 展开详情 */}
                {expandedId === log._id && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="mt-2 p-3 bg-gray-50 rounded text-xs space-y-1"
                  >
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                      <div><span className="text-gray-500">操作者ID：</span>{log.userId}</div>
                      <div><span className="text-gray-500">角色：</span>{log.role}</div>
                      <div><span className="text-gray-500">请求路径：</span>{log.method} {log.path}</div>
                      <div><span className="text-gray-500">IP：</span>{log.ip}</div>
                      {log.targetId && <div><span className="text-gray-500">目标ID：</span>{log.targetId}</div>}
                      {log.targetName && <div><span className="text-gray-500">目标名称：</span>{log.targetName}</div>}
                      {log.errorMessage && <div className="col-span-2 text-red-500"><span className="text-gray-500">错误：</span>{log.errorMessage}</div>}
                    </div>
                    {log.detail && (
                      <div className="mt-1">
                        <span className="text-gray-500">详情：</span>
                        <pre className="mt-1 p-2 bg-white rounded border text-xs overflow-x-auto max-h-40">{JSON.stringify(log.detail, null, 2)}</pre>
                      </div>
                    )}
                    {log.userAgent && (
                      <div className="truncate"><span className="text-gray-500">UA：</span>{log.userAgent}</div>
                    )}
                  </motion.div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 分页 */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-500">共 {total} 条，第 {page}/{totalPages} 页</span>
          <div className="flex items-center gap-1">
            <button
              disabled={page <= 1}
              onClick={() => setPage(p => p - 1)}
              className="px-2 py-1 rounded border disabled:opacity-40 hover:bg-gray-100 transition"
            >
              <FaChevronLeft />
            </button>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage(p => p + 1)}
              className="px-2 py-1 rounded border disabled:opacity-40 hover:bg-gray-100 transition"
            >
              <FaChevronRight />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

const StatCard: React.FC<{ label: string; value: number; color?: string }> = ({ label, value, color = 'text-gray-800' }) => (
  <div className="bg-white border rounded-lg p-3 text-center">
    <div className={`text-xl font-bold ${color}`}>{value.toLocaleString()}</div>
    <div className="text-xs text-gray-500 mt-0.5">{label}</div>
  </div>
);

export default AuditLogViewer;
