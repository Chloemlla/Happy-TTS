import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  FaCheckCircle,
  FaCommentDots,
  FaDownload,
  FaPause,
  FaPlay,
  FaRedo,
  FaSave,
  FaSearch,
  FaTools,
  FaVolumeUp,
} from "react-icons/fa";
import api from "../api/api";
import type {
  TtsAdminHistoryResponse,
  TtsAdminReviewUpdateResponse,
  TtsHistoryRecord,
  TtsHistoryReviewStatus,
} from "../types/tts";
import { cn } from "../utils/cn";
import { SimpleLoadingSpinner } from "./LoadingSpinner";
import { InfoSectionTitle } from "./LogShareStyleScaffold";

type ReviewFilter = TtsHistoryReviewStatus | "all";
type ScopeFilter = "all" | "user" | "anonymous";

interface ReviewDraft {
  adminNote: string;
  adminSuggestion: string;
  reviewStatus: TtsHistoryReviewStatus;
}

const REVIEW_STATUS_OPTIONS: Array<{ value: ReviewFilter; label: string }> = [
  { value: "all", label: "全部状态" },
  { value: "none", label: "未标记" },
  { value: "needs_review", label: "待人工审核" },
  { value: "in_review", label: "审核中" },
  { value: "fixed", label: "已修复" },
  { value: "dismissed", label: "已关闭" },
];

const REVIEW_STATUS_LABELS: Record<TtsHistoryReviewStatus, string> = {
  none: "未标记",
  needs_review: "待人工审核",
  in_review: "审核中",
  fixed: "已修复",
  dismissed: "已关闭",
};

const REVIEW_STATUS_CLASS_NAMES: Record<TtsHistoryReviewStatus, string> = {
  none: "border-slate-200 bg-slate-50 text-slate-600",
  needs_review: "border-amber-200 bg-amber-50 text-amber-700",
  in_review: "border-sky-200 bg-sky-50 text-sky-700",
  fixed: "border-emerald-200 bg-emerald-50 text-emerald-700",
  dismissed: "border-slate-200 bg-white text-slate-500",
};

const buttonClassName =
  "inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60";
const primaryButtonClassName = `${buttonClassName} bg-slate-900 text-white hover:bg-slate-800`;
const secondaryButtonClassName = `${buttonClassName} border border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:text-slate-900`;
const fieldClassName =
  "w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200";

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
  }).format(date);
};

const formatAudioSize = (value?: number) => {
  if (!value || value <= 0) return "未知大小";
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(2)} MB`;
};

const normalizeReviewStatus = (value?: string): TtsHistoryReviewStatus => {
  if (value === "needs_review" || value === "in_review" || value === "fixed" || value === "dismissed") {
    return value;
  }
  return "none";
};

const buildDraft = (record: TtsHistoryRecord): ReviewDraft => ({
  adminNote: record.adminNote || "",
  adminSuggestion: record.adminSuggestion || "",
  reviewStatus: normalizeReviewStatus(record.reviewStatus),
});

const buildDownloadUrl = (audioUrl: string) => {
  const downloadUrl = new URL(audioUrl, window.location.origin);
  downloadUrl.searchParams.set("download", "1");
  return downloadUrl.toString();
};

const TtsGenerationManager: React.FC = () => {
  const [records, setRecords] = useState<TtsHistoryRecord[]>([]);
  const [drafts, setDrafts] = useState<Record<string, ReviewDraft>>({});
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [total, setTotal] = useState(0);
  const [draftQuery, setDraftQuery] = useState("");
  const [draftUserId, setDraftUserId] = useState("");
  const [query, setQuery] = useState("");
  const [userId, setUserId] = useState("");
  const [reviewStatus, setReviewStatus] = useState<ReviewFilter>("all");
  const [scope, setScope] = useState<ScopeFilter>("all");
  const [activeAudioId, setActiveAudioId] = useState<string | null>(null);
  const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(null);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / limit)), [limit, total]);

  const mergeDrafts = useCallback((nextRecords: TtsHistoryRecord[]) => {
    setDrafts((current) => {
      const next = { ...current };
      nextRecords.forEach((record) => {
        next[record.id] = next[record.id] || buildDraft(record);
      });
      return next;
    });
  }, []);

  const fetchRecords = useCallback(
    async (nextPage: number) => {
      try {
        setLoading(true);
        setError(null);
        const response = await api.get<TtsAdminHistoryResponse>("/api/tts/admin/history", {
          params: {
            page: nextPage,
            limit,
            ...(query.trim() ? { q: query.trim() } : {}),
            ...(userId.trim() ? { userId: userId.trim() } : {}),
            ...(reviewStatus !== "all" ? { reviewStatus } : {}),
            ...(scope !== "all" ? { scope } : {}),
          },
        });

        setRecords(response.data.records || []);
        setTotal(response.data.total || 0);
        setPage(response.data.page || nextPage);
        mergeDrafts(response.data.records || []);
      } catch (requestError: any) {
        setError(requestError?.response?.data?.error || requestError?.message || "获取 TTS 生成记录失败");
      } finally {
        setLoading(false);
      }
    },
    [limit, mergeDrafts, query, reviewStatus, scope, userId],
  );

  useEffect(() => {
    void fetchRecords(page);
  }, [fetchRecords, page]);

  useEffect(() => {
    return () => {
      audioElement?.pause();
    };
  }, [audioElement]);

  const updateDraft = useCallback((recordId: string, patch: Partial<ReviewDraft>) => {
    setDrafts((current) => ({
      ...current,
      [recordId]: {
        ...(current[recordId] || { adminNote: "", adminSuggestion: "", reviewStatus: "none" }),
        ...patch,
      },
    }));
  }, []);

  const applyFilters = useCallback(
    (event: React.FormEvent) => {
      event.preventDefault();
      setQuery(draftQuery);
      setUserId(draftUserId);
      setPage(1);
    },
    [draftQuery, draftUserId],
  );

  const saveReview = useCallback(
    async (record: TtsHistoryRecord, override?: Partial<ReviewDraft>) => {
      const draft = {
        ...(drafts[record.id] || buildDraft(record)),
        ...(override || {}),
      };

      try {
        setSavingId(record.id);
        setError(null);
        const response = await api.patch<TtsAdminReviewUpdateResponse>(
          `/api/tts/admin/history/${encodeURIComponent(record.id)}/review`,
          draft,
        );

        const updated = response.data.record;
        setRecords((current) => current.map((item) => (item.id === updated.id ? updated : item)));
        setDrafts((current) => ({
          ...current,
          [updated.id]: buildDraft(updated),
        }));
      } catch (requestError: any) {
        setError(requestError?.response?.data?.error || requestError?.message || "保存审核信息失败");
      } finally {
        setSavingId(null);
      }
    },
    [drafts],
  );

  const togglePlayback = useCallback(
    (record: TtsHistoryRecord) => {
      if (!record.audioUrl) return;

      if (audioElement && activeAudioId === record.id) {
        audioElement.pause();
        setActiveAudioId(null);
        return;
      }

      audioElement?.pause();
      const audio = new Audio(record.audioUrl);
      audio.onended = () => setActiveAudioId(null);
      audio.onpause = () => setActiveAudioId((current) => (current === record.id ? null : current));
      audio.onplay = () => setActiveAudioId(record.id);
      setAudioElement(audio);
      void audio.play().catch(() => setActiveAudioId(null));
    },
    [activeAudioId, audioElement],
  );

  const downloadRecord = useCallback((record: TtsHistoryRecord) => {
    if (!record.audioUrl) return;

    const link = document.createElement("a");
    link.href = buildDownloadUrl(record.audioUrl);
    link.download = record.fileName || `tts-${Date.now()}.${record.outputFormat || "mp3"}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, []);

  const goToPage = useCallback(
    (nextPage: number) => {
      setPage(Math.max(1, Math.min(totalPages, nextPage)));
    },
    [totalPages],
  );

  return (
    <div className="space-y-5">
      <div className="rounded-[24px] border border-slate-200 bg-white p-4 sm:p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <InfoSectionTitle title="TTS 生成记录" icon={FaVolumeUp} eyebrow="Generation Audit" />
          <button
            type="button"
            onClick={() => void fetchRecords(page)}
            disabled={loading}
            className={secondaryButtonClassName}
          >
            <FaRedo className={loading ? "animate-spin" : ""} />
            刷新
          </button>
        </div>

        <form onSubmit={applyFilters} className="mt-5 grid gap-3 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_170px_150px_auto]">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Search</span>
            <div className="relative">
              <FaSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400" />
              <input
                value={draftQuery}
                onChange={(event) => setDraftQuery(event.target.value)}
                className={cn(fieldClassName, "pl-9")}
                placeholder="文本、文件名、Mongo ID、哈希、音色、模型"
              />
            </div>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">User ID</span>
            <input
              value={draftUserId}
              onChange={(event) => setDraftUserId(event.target.value)}
              className={fieldClassName}
              placeholder="用户 ID"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Status</span>
            <select
              value={reviewStatus}
              onChange={(event) => {
                setReviewStatus(event.target.value as ReviewFilter);
                setPage(1);
              }}
              className={fieldClassName}
            >
              {REVIEW_STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Scope</span>
            <select
              value={scope}
              onChange={(event) => {
                setScope(event.target.value as ScopeFilter);
                setPage(1);
              }}
              className={fieldClassName}
            >
              <option value="all">全部</option>
              <option value="user">用户</option>
              <option value="anonymous">匿名</option>
            </select>
          </label>
          <div className="flex items-end">
            <button type="submit" className={primaryButtonClassName}>
              <FaSearch />
              查询
            </button>
          </div>
        </form>
      </div>

      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      <div className="rounded-[24px] border border-slate-200 bg-white p-4 sm:p-5">
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm font-semibold text-slate-900">
            共 {total} 条记录，第 {page}/{totalPages} 页
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => goToPage(page - 1)} disabled={page <= 1 || loading} className={secondaryButtonClassName}>
              上一页
            </button>
            <button type="button" onClick={() => goToPage(page + 1)} disabled={page >= totalPages || loading} className={secondaryButtonClassName}>
              下一页
            </button>
          </div>
        </div>

        {loading && !records.length ? (
          <div className="flex min-h-[260px] items-center justify-center text-slate-500">
            <SimpleLoadingSpinner size={0.75} />
          </div>
        ) : records.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
            暂无 TTS 生成记录
          </div>
        ) : (
          <div className="space-y-4">
            {records.map((record) => {
              const draft = drafts[record.id] || buildDraft(record);
              const status = normalizeReviewStatus(draft.reviewStatus);
              const isPlaying = activeAudioId === record.id;
              const isSaving = savingId === record.id;

              return (
                <article key={record.id} className="rounded-[22px] border border-slate-200 bg-slate-50/70 p-4">
                  <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                    <div className="min-w-0 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={cn(
                            "rounded-full border px-2.5 py-1 text-[11px] font-semibold",
                            REVIEW_STATUS_CLASS_NAMES[status],
                          )}
                        >
                          {REVIEW_STATUS_LABELS[status]}
                        </span>
                        <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600">
                          {record.scope === "anonymous" ? "匿名" : "用户"}
                        </span>
                        <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600">
                          {record.outputFormat?.toUpperCase() || "AUDIO"}
                        </span>
                        <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600">
                          {record.provider}
                        </span>
                      </div>
                      <h3 className="break-all text-base font-semibold text-slate-900">{record.fileName}</h3>
                      <div className="grid gap-2 text-xs leading-5 text-slate-500 md:grid-cols-2 xl:grid-cols-4">
                        <div>用户：{record.userId || "-"}</div>
                        <div>生成：{formatDateTime(record.createdAt)}</div>
                        <div>模型：{record.model}</div>
                        <div>音色：{record.voice} / {record.speed}x</div>
                        <div>存储：{record.audioStorage === "mongo" ? "MongoDB" : "文件缓存"}</div>
                        <div>类型：{record.audioMimeType || "-"}</div>
                        <div>大小：{formatAudioSize(record.audioSize)}</div>
                        <div className="break-all">音频ID：{record.audioFileId || "-"}</div>
                      </div>
                      <div className="break-words rounded-2xl border border-slate-200 bg-white/80 px-3 py-2 text-xs leading-5 text-slate-500">
                        {record.text || "[redacted]"}
                      </div>
                    </div>

                    <div className="flex flex-col gap-2 sm:flex-row xl:flex-col">
                      <button
                        type="button"
                        onClick={() => togglePlayback(record)}
                        disabled={!record.audioUrl}
                        className={primaryButtonClassName}
                      >
                        {isPlaying ? <FaPause /> : <FaPlay />}
                        {isPlaying ? "暂停" : "播放"}
                      </button>
                      <button
                        type="button"
                        onClick={() => downloadRecord(record)}
                        disabled={!record.audioUrl || record.permissions?.canDownload === false}
                        className={secondaryButtonClassName}
                      >
                        <FaDownload />
                        下载
                      </button>
                    </div>
                  </div>

                  {record.audioUrl && (
                    <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-3">
                      <audio controls preload="none" className="w-full">
                        <source src={record.audioUrl} type={record.audioMimeType} />
                        您的浏览器不支持音频播放
                      </audio>
                    </div>
                  )}

                  <div className="mt-4 grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_220px]">
                    <label className="block">
                      <span className="mb-1 flex items-center gap-2 text-xs font-semibold text-slate-500">
                        <FaCommentDots className="text-slate-400" />
                        管理员留言
                      </span>
                      <textarea
                        value={draft.adminNote}
                        onChange={(event) => updateDraft(record.id, { adminNote: event.target.value })}
                        rows={3}
                        className={cn(fieldClassName, "min-h-[92px] resize-y")}
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1 flex items-center gap-2 text-xs font-semibold text-slate-500">
                        <FaTools className="text-slate-400" />
                        修复建议
                      </span>
                      <textarea
                        value={draft.adminSuggestion}
                        onChange={(event) => updateDraft(record.id, { adminSuggestion: event.target.value })}
                        rows={3}
                        className={cn(fieldClassName, "min-h-[92px] resize-y")}
                      />
                    </label>
                    <div className="space-y-2">
                      <label className="block">
                        <span className="mb-1 block text-xs font-semibold text-slate-500">人工审核</span>
                        <select
                          value={draft.reviewStatus}
                          onChange={(event) => updateDraft(record.id, { reviewStatus: event.target.value as TtsHistoryReviewStatus })}
                          className={fieldClassName}
                        >
                          {REVIEW_STATUS_OPTIONS.filter((option) => option.value !== "all").map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <button
                        type="button"
                        onClick={() => void saveReview(record)}
                        disabled={isSaving}
                        className={primaryButtonClassName}
                      >
                        {isSaving ? <SimpleLoadingSpinner size={0.45} /> : <FaSave />}
                        保存
                      </button>
                      <button
                        type="button"
                        onClick={() => void saveReview(record, { reviewStatus: "fixed" })}
                        disabled={isSaving}
                        className={secondaryButtonClassName}
                      >
                        <FaCheckCircle />
                        修复完成
                      </button>
                      {(record.reviewedBy || record.reviewedAt || record.fixedAt) && (
                        <div className="text-xs leading-5 text-slate-500">
                          {record.reviewedBy ? `处理人：${record.reviewedBy}` : ""}
                          {record.reviewedAt ? ` · ${formatDateTime(record.reviewedAt)}` : ""}
                          {record.fixedAt ? ` · 修复：${formatDateTime(record.fixedAt)}` : ""}
                        </div>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default TtsGenerationManager;
