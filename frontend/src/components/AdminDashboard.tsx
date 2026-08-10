import React, { useEffect, useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { FaEnvelope, FaDatabase, FaGlobe, FaShieldAlt } from 'react-icons/fa';
import { api } from '@/api';

import { ADMIN_TAB_TO_PATH } from '@/navigation/navConfig';

import { AdminHub } from './admin/AdminHub';

interface ServiceStatus {
  available: boolean;
  error?: string;
  domain?: string;
  authConfigured?: boolean;
}

interface QuotaInfo {
  used: number;
  total: number;
  resetAt: string;
}

interface RecordCount {
  total: number;
}

/**
 * Compatibility entry for the legacy `/admin` + `?tab=` deep links.
 *
 * - `/admin?tab=users` → redirect to `/admin/users`
 * - `/admin` (no tab) → render the new AdminHub overview with traceability dashboard
 */
const AdminDashboard: React.FC = () => {
  const [searchParams] = useSearchParams();
  const tab = searchParams.get('tab');

  const [status, setStatus] = useState<ServiceStatus | null>(null);
  const [quota, setQuota] = useState<QuotaInfo>({ used: 0, total: 0, resetAt: '' });
  const [recordCount, setRecordCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const [statusRes, quotaRes, recordsRes] = await Promise.allSettled([
          api.get('/api/outemail/status'),
          api.get('/api/outemail/quota'),
          api.get('/api/outemail/records?pageSize=1'),
        ]);

        if (statusRes.status === 'fulfilled') setStatus(statusRes.value.data);
        if (quotaRes.status === 'fulfilled' && quotaRes.value.data?.success) {
          setQuota({ used: quotaRes.value.data.used, total: quotaRes.value.data.total, resetAt: quotaRes.value.data.resetAt });
        }
        if (recordsRes.status === 'fulfilled' && recordsRes.value.data?.success) {
          setRecordCount(recordsRes.value.data.total);
        }
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  if (tab) {
    const mapped = ADMIN_TAB_TO_PATH[tab];
    return <Navigate to={mapped || '/admin'} replace />;
  }

  const quotaPercent = quota.total > 0 ? Math.min((quota.used / quota.total) * 100, 100) : 0;

  return (
    <div className="space-y-6">
      {/* 原有 AdminHub 内容 */}
      <AdminHub />

      {/* 邮件溯源看板 */}
      <div className="rounded-2xl border border-slate-200/90 bg-white/90 p-4 sm:p-5 shadow-sm">
        <div className="mb-4 flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
            <FaDatabase className="size-4" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900">邮件发信溯源日志</h3>
            <p className="text-xs text-slate-500">对外邮件服务状态与发送记录概览</p>
          </div>
          <Link
            to="/admin/email-traceability"
            className="ml-auto inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-indigo-700"
          >
            <FaDatabase className="size-3.5" />
            查看完整溯源
          </Link>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="size-6 animate-spin rounded-full border-4 border-slate-200 border-t-indigo-500" />
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-3">
            {/* 服务状态 */}
            <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-3.5">
              <div className="flex items-center gap-2">
                <FaGlobe className="size-3.5 text-slate-400" />
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">服务状态</span>
              </div>
              <div className="mt-1.5 flex items-center gap-2">
                <span className={`size-2.5 rounded-full ${status?.available ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                <span className="text-sm font-semibold text-slate-700">
                  {status?.available ? '正常' : status?.error || '异常'}
                </span>
              </div>
              <div className="mt-0.5 text-xs text-slate-400">{status?.domain || '未配置域名'}</div>
            </div>

            {/* 今日配额 */}
            <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-3.5">
              <div className="flex items-center gap-2">
                <FaEnvelope className="size-3.5 text-slate-400" />
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">今日配额</span>
              </div>
              <div className="mt-1.5 text-sm font-semibold text-slate-700">
                {quota.used} / {quota.total}
              </div>
              <div className="mt-1.5 h-1.5 rounded-full bg-slate-100">
                <div className="h-1.5 rounded-full bg-indigo-500 transition-all" style={{ width: `${quotaPercent}%` }} />
              </div>
              <div className="mt-0.5 text-xs text-slate-400">重置时间：{quota.resetAt ? new Date(quota.resetAt).toLocaleString('zh-CN', { hour12: false }) : '-'}</div>
            </div>

            {/* 记录总数 */}
            <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-3.5">
              <div className="flex items-center gap-2">
                <FaShieldAlt className="size-3.5 text-slate-400" />
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">发送记录</span>
              </div>
              <div className="mt-1.5 text-2xl font-bold text-slate-900">{recordCount}</div>
              <div className="mt-0.5 text-xs text-slate-400">累计对外邮件发送</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminDashboard;
