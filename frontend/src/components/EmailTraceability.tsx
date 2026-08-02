import React, { useEffect, useState, useCallback } from "react";
import { api } from "@/api";
import { FaSearch, FaRedo, FaEnvelope, FaDatabase, FaGlobe } from "react-icons/fa";

interface EmailRecord {
  to: string;
  subject: string;
  content: string;
  sentAt: string;
  ip: string;
}

interface RecordsResponse {
  success: boolean;
  records: EmailRecord[];
  total: number;
  page: number;
  pageSize: number;
}

interface QuotaInfo {
  used: number;
  total: number;
  resetAt: string;
}

interface ServiceStatus {
  available: boolean;
  error?: string;
  domain?: string;
  authConfigured?: boolean;
}

const PAGE_SIZE = 20;

function formatDateTime(value?: string) {
  if (!value) return "-";
  try {
    const d = new Date(value);
    return d.toLocaleString("zh-CN", { hour12: false });
  } catch {
    return value;
  }
}

const EmailTraceability: React.FC = () => {
  const [records, setRecords] = useState<EmailRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [searchTo, setSearchTo] = useState("");
  const [searchSubject, setSearchSubject] = useState("");
  const [status, setStatus] = useState<ServiceStatus | null>(null);
  const [quota, setQuota] = useState<QuotaInfo>({ used: 0, total: 0, resetAt: "" });

  const fetchRecords = useCallback(async (p: number) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(p));
      params.set("pageSize", String(PAGE_SIZE));
      if (searchTo.trim()) params.set("to", searchTo.trim());
      if (searchSubject.trim()) params.set("subject", searchSubject.trim());

      const res = await api.get(`/api/outemail/records?${params.toString()}`);
      const data = res.data as RecordsResponse;
      if (data.success) {
        setRecords(data.records);
        setTotal(data.total);
        setPage(data.page);
      }
    } catch (e) {
      console.error("获取邮件记录失败", e);
    } finally {
      setLoading(false);
    }
  }, [searchTo, searchSubject]);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await api.get("/api/outemail/status");
      setStatus(res.data);
    } catch {
      // ignore
    }
  }, []);

  const fetchQuota = useCallback(async () => {
    try {
      const res = await api.get("/api/outemail/quota");
      if (res.data?.success) {
        setQuota({ used: res.data.used, total: res.data.total, resetAt: res.data.resetAt });
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    fetchRecords(1);
    fetchStatus();
    fetchQuota();
  }, [fetchRecords, fetchStatus, fetchQuota]);

  const handleSearch = () => fetchRecords(1);
  const handleRefresh = () => {
    fetchStatus();
    fetchQuota();
    fetchRecords(page);
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const quotaPercent = quota.total > 0 ? Math.min((quota.used / quota.total) * 100, 100) : 0;

  return (
    <div className="space-y-6">
      {/* 标题 */}
      <div className="flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
          <FaDatabase className="size-4" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-slate-900">邮件发信溯源日志</h2>
          <p className="text-sm text-slate-500">对外邮件发送记录查询与追踪</p>
        </div>
      </div>

      {/* 状态卡片 */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200/90 bg-white/90 p-4 shadow-sm">
          <div className="flex items-center gap-2">
            <FaGlobe className="size-4 text-slate-400" />
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">服务状态</span>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <span className={`size-2.5 rounded-full ${status?.available ? "bg-emerald-500" : "bg-rose-500"}`} />
            <span className="text-sm font-semibold text-slate-700">
              {status?.available ? "正常" : status?.error || "异常"}
            </span>
          </div>
          <div className="mt-1 text-xs text-slate-400">
            {status?.domain || "未配置域名"}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200/90 bg-white/90 p-4 shadow-sm">
          <div className="flex items-center gap-2">
            <FaEnvelope className="size-4 text-slate-400" />
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">今日配额</span>
          </div>
          <div className="mt-2 text-sm font-semibold text-slate-700">
            {quota.used} / {quota.total}
          </div>
          <div className="mt-1.5 h-1.5 rounded-full bg-slate-100">
            <div
              className="h-1.5 rounded-full bg-indigo-500 transition-all"
              style={{ width: `${quotaPercent}%` }}
            />
          </div>
          <div className="mt-1 text-xs text-slate-400">
            重置时间：{formatDateTime(quota.resetAt)}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200/90 bg-white/90 p-4 shadow-sm">
          <div className="flex items-center gap-2">
            <FaDatabase className="size-4 text-slate-400" />
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">记录总数</span>
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-900">{total}</div>
          <div className="mt-1 text-xs text-slate-400">
            当前第 {page} / {totalPages || 1} 页
          </div>
        </div>
      </div>

      {/* 搜索栏 */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <FaSearch className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="搜索收件人邮箱..."
            value={searchTo}
            onChange={(e) => setSearchTo(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            className="w-full rounded-xl border border-slate-200/90 bg-white/90 py-2 pl-9 pr-3 text-sm text-slate-700 placeholder-slate-400 outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
          />
        </div>
        <div className="relative flex-1 min-w-[200px]">
          <FaSearch className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="搜索邮件主题..."
            value={searchSubject}
            onChange={(e) => setSearchSubject(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            className="w-full rounded-xl border border-slate-200/90 bg-white/90 py-2 pl-9 pr-3 text-sm text-slate-700 placeholder-slate-400 outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
          />
        </div>
        <button
          onClick={handleSearch}
          className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
        >
          <FaSearch className="size-3.5" />
          查询
        </button>
        <button
          onClick={handleRefresh}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200/90 bg-white/90 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
        >
          <FaRedo className="size-3.5" />
          刷新
        </button>
      </div>

      {/* 记录列表 */}
      <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white/90 shadow-sm">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="size-8 animate-spin rounded-full border-4 border-slate-200 border-t-indigo-500" />
          </div>
        ) : records.length === 0 ? (
          <div className="py-16 text-center text-sm text-slate-400">暂无邮件发送记录</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/50">
                  <th className="px-4 py-3 font-semibold text-slate-500">发送时间</th>
                  <th className="px-4 py-3 font-semibold text-slate-500">收件人</th>
                  <th className="px-4 py-3 font-semibold text-slate-500">主题</th>
                  <th className="px-4 py-3 font-semibold text-slate-500">内容摘要</th>
                  <th className="px-4 py-3 font-semibold text-slate-500">来源 IP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {records.map((rec, i) => (
                  <tr key={i} className="hover:bg-slate-50/50">
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                      {formatDateTime(rec.sentAt)}
                    </td>
                    <td className="max-w-[200px] truncate px-4 py-3 font-medium text-slate-800">
                      {rec.to}
                    </td>
                    <td className="max-w-[200px] truncate px-4 py-3 text-slate-600">
                      {rec.subject}
                    </td>
                    <td className="max-w-[250px] truncate px-4 py-3 text-slate-500">
                      {rec.content}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-slate-400">
                      {rec.ip || "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* 分页 */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3">
            <span className="text-xs text-slate-400">
              共 {total} 条记录
            </span>
            <div className="flex items-center gap-1">
              <button
                disabled={page <= 1}
                onClick={() => fetchRecords(page - 1)}
                className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-30"
              >
                上一页
              </button>
              {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                const start = Math.max(1, Math.min(page - 2, totalPages - 4));
                const p = start + i;
                if (p > totalPages) return null;
                return (
                  <button
                    key={p}
                    onClick={() => fetchRecords(p)}
                    className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                      p === page
                        ? "bg-indigo-600 text-white"
                        : "text-slate-600 hover:bg-slate-100"
                    }`}
                  >
                    {p}
                  </button>
                );
              })}
              <button
                disabled={page >= totalPages}
                onClick={() => fetchRecords(page + 1)}
                className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-30"
              >
                下一页
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default EmailTraceability;