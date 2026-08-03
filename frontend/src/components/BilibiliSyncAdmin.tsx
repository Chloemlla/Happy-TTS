import React, { useCallback, useEffect, useState } from 'react';
import { FaDatabase, FaSearch, FaSync, FaTrash, FaUser } from 'react-icons/fa';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';

interface BilibiliSyncRecord {
  _id: string;
  userId: string;
  bilibiliUid?: string;
  uidBoundAt?: string;
  settings: Record<string, unknown>;
  settingsVersion: number;
  settingsUpdatedAt?: string;
  searchRecords: Array<{
    id: string;
    keyword: string;
    createdAt: string;
  }>;
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

/**
 * Admin page for viewing PiliPlus/Bilibili Sync data — the settings,
 * search records, and credentials that PiliPlus uploads via OAuth.
 */
const BilibiliSyncAdmin: React.FC = () => {
  const { user } = useAuth();
  const [records, setRecords] = useState<BilibiliSyncRecord[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

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
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRecords(1, '');
  }, [fetchRecords]);

  const handleSearch = () => fetchRecords(1, search);
  const handlePageChange = (page: number) => fetchRecords(page, search);

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '-';
    try {
      return new Date(dateStr).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
    } catch {
      return dateStr;
    }
  };

  const truncate = (val: string, max = 60) => (val.length > max ? `${val.slice(0, max)}…` : val);

  const isAdmin = user?.role === 'admin';

  return (
    <div className='space-y-4 p-2 sm:p-4'>
      {!isAdmin && (
        <div className='rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700'>
          需要管理员权限才能查看此页面。
        </div>
      )}

      {/* Header */}
      <div className='flex items-center gap-3'>
        <div className='flex size-10 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-600'>
          <FaDatabase className='size-4' />
        </div>
        <div className='flex-1'>
          <h2 className='text-lg font-semibold text-slate-900'>PiliPlus 设置同步</h2>
          <p className='text-sm text-slate-500'>
            Bilibili 同步数据 — 配置、搜索记录和凭据状态
          </p>
        </div>
        <button
          onClick={() => fetchRecords(pagination.page, search)}
          disabled={loading}
          className='flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50'
        >
          <FaSync className={cn('size-3', loading && 'animate-spin')} />
          刷新
        </button>
      </div>

      {/* Search */}
      <div className='flex gap-2'>
        <div className='relative flex-1'>
          <FaSearch className='pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-slate-400' />
          <input
            type='text'
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            placeholder='搜索 userId 或 Bilibili UID…'
            className='w-full rounded-2xl border border-slate-200 bg-white py-2 pl-9 pr-4 text-sm outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100'
          />
        </div>
        <button
          onClick={handleSearch}
          disabled={loading}
          className='rounded-2xl bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50'
        >
          搜索
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className='rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700'>{error}</div>
      )}

      {/* Loading */}
      {loading && (
        <div className='flex items-center justify-center py-12 text-sm text-slate-400'>
          <FaSync className='mr-2 size-4 animate-spin' />
          加载中…
        </div>
      )}

      {/* Records */}
      {!loading && records.length === 0 && (
        <div className='rounded-2xl border border-slate-200 bg-white/70 px-6 py-12 text-center text-sm text-slate-400'>
          {search ? '未找到匹配的记录' : '暂无 Bilibili 同步数据'}
        </div>
      )}

      {!loading && records.length > 0 && (
        <div className='space-y-2.5'>
          {records.map((record) => (
            <div
              key={record._id}
              className='overflow-hidden rounded-2xl border border-slate-200 bg-white/90 shadow-sm'
            >
              {/* Summary row */}
              <button
                onClick={() => setExpandedId(expandedId === record._id ? null : record._id)}
                className='flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50'
              >
                <FaUser className='size-3.5 shrink-0 text-slate-400' />
                <div className='min-w-0 flex-1'>
                  <div className='flex items-center gap-2'>
                    <span className='text-sm font-semibold text-slate-800'>
                      {record.userId.slice(0, 12)}…
                    </span>
                    {record.bilibiliUid && (
                      <span className='rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-medium text-sky-700'>
                        UID: {record.bilibiliUid}
                      </span>
                    )}
                    <span
                      className={cn(
                        'rounded-full px-2 py-0.5 text-[11px] font-medium',
                        record.credentialStatus === 'active'
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-amber-100 text-amber-700',
                      )}
                    >
                      {record.credentialStatus === 'active' ? '凭据有效' : '凭据无效'}
                    </span>
                  </div>
                  <div className='mt-0.5 text-xs text-slate-400'>
                    settings v{record.settingsVersion} · 搜索记录 {record.searchRecords.length} 条 · 更新于{' '}
                    {formatDate(record.updatedAt)}
                  </div>
                </div>
                <span className='text-xs text-slate-400'>
                  {expandedId === record._id ? '收起' : '展开'}
                </span>
              </button>

              {/* Expanded detail */}
              {expandedId === record._id && (
                <div className='border-t border-slate-100 px-4 py-3 space-y-3 text-sm'>
                  {/* Info */}
                  <div className='grid grid-cols-2 gap-2 text-xs text-slate-600'>
                    <div>
                      <span className='font-medium text-slate-500'>User ID:</span>{' '}
                      <span className='font-mono'>{record.userId}</span>
                    </div>
                    <div>
                      <span className='font-medium text-slate-500'>Bilibili UID:</span>{' '}
                      {record.bilibiliUid || '-'}
                    </div>
                    <div>
                      <span className='font-medium text-slate-500'>UID 绑定时间:</span>{' '}
                      {formatDate(record.uidBoundAt)}
                    </div>
                    <div>
                      <span className='font-medium text-slate-500'>凭据状态:</span>{' '}
                      {record.credentialStatus}
                    </div>
                    <div>
                      <span className='font-medium text-slate-500'>设置版本:</span>{' '}
                      {record.settingsVersion}
                    </div>
                    <div>
                      <span className='font-medium text-slate-500'>设置更新:</span>{' '}
                      {formatDate(record.settingsUpdatedAt)}
                    </div>
                    <div>
                      <span className='font-medium text-slate-500'>创建时间:</span>{' '}
                      {formatDate(record.createdAt)}
                    </div>
                    <div>
                      <span className='font-medium text-slate-500'>更新时间:</span>{' '}
                      {formatDate(record.updatedAt)}
                    </div>
                  </div>

                  {/* Settings */}
                  {record.settings && Object.keys(record.settings).length > 0 && (
                    <div>
                      <h4 className='mb-1 text-xs font-semibold text-slate-500 uppercase tracking-wider'>
                        配置数据
                      </h4>
                      <pre className='max-h-48 overflow-auto rounded-xl bg-slate-50 p-3 text-[11px] leading-relaxed text-slate-600'>
                        {JSON.stringify(record.settings, null, 2)}
                      </pre>
                    </div>
                  )}

                  {/* Search Records */}
                  {record.searchRecords.length > 0 && (
                    <div>
                      <h4 className='mb-1 text-xs font-semibold text-slate-500 uppercase tracking-wider'>
                        搜索记录（最近 {Math.min(record.searchRecords.length, 10)} 条）
                      </h4>
                      <div className='max-h-40 space-y-1 overflow-auto'>
                        {record.searchRecords.slice(0, 10).map((sr) => (
                          <div
                            key={sr.id}
                            className='flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-1.5 text-xs text-slate-600'
                          >
                            <FaSearch className='size-2.5 shrink-0 text-slate-400' />
                            <span className='font-medium'>{truncate(sr.keyword, 40)}</span>
                            {sr.createdAt && (
                              <span className='ml-auto shrink-0 text-slate-400'>
                                {formatDate(sr.createdAt)}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className='flex items-center justify-center gap-2'>
          <button
            onClick={() => handlePageChange(pagination.page - 1)}
            disabled={pagination.page <= 1 || loading}
            className='rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40'
          >
            上一页
          </button>
          <span className='text-xs text-slate-400'>
            {pagination.page} / {pagination.totalPages}（共 {pagination.total} 条）
          </span>
          <button
            onClick={() => handlePageChange(pagination.page + 1)}
            disabled={pagination.page >= pagination.totalPages || loading}
            className='rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40'
          >
            下一页
          </button>
        </div>
      )}
    </div>
  );
};

export default BilibiliSyncAdmin;