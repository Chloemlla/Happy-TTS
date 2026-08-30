import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  FaCheckCircle,
  FaCoins,
  FaExclamationTriangle,
  FaRedo,
  FaSearch,
  FaTimesCircle,
} from "react-icons/fa";
import { coinFlipApi } from "../../api/coinFlip";
import type { CoinFlipRecord, CoinFlipStatistics } from "../../api/coinFlip";
import { cn } from "../../utils/cn";
import { SimpleLoadingSpinner } from "../LoadingSpinner";
import {
  InfoMetricCard,
  InfoSectionTitle,
  logSharePanelClass,
  logSharePrimaryButtonClass,
  logShareSecondaryButtonClass,
} from "../LogShareStyleScaffold";

const PAGE_SIZE = 20;

const formatDateTime = (value?: string) => {
  if (!value) return "未知时间";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
};

const CoinFlipAdmin: React.FC = () => {
  const [records, setRecords] = useState<CoinFlipRecord[]>([]);
  const [stats, setStats] = useState<CoinFlipStatistics | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [searchId, setSearchId] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResult, setSearchResult] = useState<CoinFlipRecord | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / PAGE_SIZE)), [total]);

  const loadData = useCallback(
    async (targetPage: number) => {
      setLoading(true);
      setError(null);
      try {
        const [list, stat] = await Promise.all([
          coinFlipApi.listResults(targetPage, PAGE_SIZE),
          coinFlipApi.getStatistics(),
        ]);
        setRecords(list.items);
        setTotal(list.total);
        setStats(stat);
      } catch (err) {
        setError("加载硬币翻转记录失败，请稍后重试");
        console.error("加载硬币翻转记录失败:", err);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    loadData(page);
  }, [page, loadData]);

  const refresh = () => loadData(page);

  const goToPage = (nextPage: number) => {
    if (nextPage < 1 || nextPage > totalPages) return;
    setPage(nextPage);
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const id = searchId.trim();
    if (!id) {
      setSearchError("请输入结果 ID");
      return;
    }
    setSearching(true);
    setSearchError(null);
    setSearchResult(null);
    try {
      const record = await coinFlipApi.getResult(id);
      setSearchResult(record);
    } catch (err) {
      setSearchError("未找到该 ID，请检查输入");
      console.error("查询硬币翻转结果失败:", err);
    } finally {
      setSearching(false);
    }
  };

  const clearSearch = () => {
    setSearchId("");
    setSearchResult(null);
    setSearchError(null);
  };

  const renderResultRow = (record: CoinFlipRecord) => (
    <tr key={record.resultId} className="border-b border-slate-100 hover:bg-slate-50/60">
      <td className="px-4 py-3 font-mono text-xs text-slate-600">{record.resultId}</td>
      <td className="px-4 py-3">
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold",
            record.result === "heads"
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-sky-200 bg-sky-50 text-sky-700",
          )}
        >
          {record.result === "heads" ? <FaCheckCircle /> : <FaTimesCircle />}
          {record.result === "heads" ? "正面" : "反面"}
        </span>
      </td>
      <td className="px-4 py-3 text-slate-600">{record.username || record.userId || "游客"}</td>
      <td className="px-4 py-3 text-slate-500">{formatDateTime(record.createdAt)}</td>
    </tr>
  );

  return (
    <div className="space-y-6">
      <div className={logSharePanelClass}>
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <InfoSectionTitle
            title="硬币翻转记录"
            description="查看所有用户抛硬币的唯一结果 ID、结果与时间，也可按结果 ID 精确查找。"
            icon={FaCoins}
            tone="amber"
          />
          <button
            onClick={refresh}
            disabled={loading}
            className={logShareSecondaryButtonClass}
          >
            <FaRedo className="text-sm" />
            刷新
          </button>
        </div>

        {/* 按唯一结果 ID 精确查找 */}
        <form
          onSubmit={handleSearch}
          className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center"
        >
          <input
            type="text"
            value={searchId}
            onChange={(e) => setSearchId(e.target.value)}
            placeholder="输入唯一结果 ID 查找（如 flip-xxxxxxxxxxxxxxxx）"
            className="flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-800 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
          />
          <button
            type="submit"
            disabled={searching}
            className={logSharePrimaryButtonClass}
          >
            <FaSearch className="text-sm" />
            {searching ? "查询中..." : "查找"}
          </button>
        </form>

        {searchError && (
          <div className="mb-4 flex items-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            <FaExclamationTriangle className="text-rose-500" />
            {searchError}
          </div>
        )}

        {/* 统计卡片 */}
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <InfoMetricCard label="总次数" value={stats?.total ?? 0} icon={FaCoins} tone="violet" />
          <InfoMetricCard label="正面" value={stats?.heads ?? 0} icon={FaCheckCircle} tone="emerald" />
          <InfoMetricCard label="反面" value={stats?.tails ?? 0} icon={FaTimesCircle} tone="sky" />
          <InfoMetricCard
            label="正面占比"
            value={stats && stats.total > 0 ? `${(stats.headsRatio * 100).toFixed(1)}%` : "-"}
            icon={FaCheckCircle}
            tone="amber"
          />
        </div>

        {error && (
          <div className="mb-4 flex items-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            <FaExclamationTriangle className="text-rose-500" />
            {error}
          </div>
        )}

        {searchResult ? (
          <div>
            <div className="mb-3 flex items-center justify-between">
              <span className="text-xs text-slate-500">查找结果（按结果 ID）</span>
              <button
                onClick={clearSearch}
                className={logShareSecondaryButtonClass}
              >
                <FaRedo className="text-sm" />
                返回列表
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-4 py-3">结果 ID</th>
                    <th className="px-4 py-3">结果</th>
                    <th className="px-4 py-3">用户</th>
                    <th className="px-4 py-3">时间</th>
                  </tr>
                </thead>
                <tbody>{renderResultRow(searchResult)}</tbody>
              </table>
            </div>
          </div>
        ) : (
          <>
            {/* 结果表格 */}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-4 py-3">结果 ID</th>
                    <th className="px-4 py-3">结果</th>
                    <th className="px-4 py-3">用户</th>
                    <th className="px-4 py-3">时间</th>
                  </tr>
                </thead>
                <tbody>
                  {records.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-10 text-center text-slate-500">
                        {loading ? "加载中..." : "暂无抛硬币记录"}
                      </td>
                    </tr>
                  ) : (
                    records.map(renderResultRow)
                  )}
                </tbody>
              </table>
            </div>

            {/* 分页 */}
            <div className="mt-4 flex items-center justify-between">
              <span className="text-xs text-slate-500">
                共 {total} 条记录 · 第 {page}/{totalPages} 页
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => goToPage(page - 1)}
                  disabled={page <= 1 || loading}
                  className={logShareSecondaryButtonClass}
                >
                  上一页
                </button>
                <button
                  onClick={() => goToPage(page + 1)}
                  disabled={page >= totalPages || loading}
                  className={logSharePrimaryButtonClass}
                >
                  下一页
                </button>
              </div>
            </div>

            {loading && (
              <div className="mt-4 flex justify-center">
                <SimpleLoadingSpinner size={1} />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default CoinFlipAdmin;
