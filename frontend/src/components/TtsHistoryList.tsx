import React, { useCallback } from "react";
import { motion } from "framer-motion";
import {
  FaHistory,
  FaRedo,
  FaPlay,
  FaPause,
  FaDownload,
  FaCommentDots,
  FaTools,
} from "react-icons/fa";
import { cn } from "../utils/cn";
import type { TtsHistoryRecord, TtsHistoryReviewStatus } from "../types/tts";
import {
  studioEyebrowClassName,
  studioStrongBadgeClassName,
  studioGhostButtonClassName,
  studioPrimaryButtonClassName,
  studioMainSurfaceClassName,
} from "./studioTheme";

const getAudioMimeType = (outputFormat?: string) => {
  switch (outputFormat) {
    case "aac":
      return "audio/aac";
    case "flac":
      return "audio/flac";
    case "opus":
      return "audio/ogg; codecs=opus";
    case "mp3":
    default:
      return "audio/mpeg";
  }
};

const reviewStatusLabels: Record<TtsHistoryReviewStatus, string> = {
  none: "未标记",
  needs_review: "待人工审核",
  in_review: "审核中",
  fixed: "已修复",
  dismissed: "已关闭",
};

const reviewStatusClassNames: Record<TtsHistoryReviewStatus, string> = {
  none: "border-slate-200 bg-slate-50 text-slate-600",
  needs_review: "border-amber-200 bg-amber-50 text-amber-700",
  in_review: "border-sky-200 bg-sky-50 text-sky-700",
  fixed: "border-emerald-200 bg-emerald-50 text-emerald-700",
  dismissed: "border-slate-200 bg-white text-slate-500",
};

const formatHistoryTime = (value?: string) => {
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

interface TtsHistoryListProps {
  history: TtsHistoryRecord[];
  historyLoading: boolean;
  historyError: string | null;
  activeHistoryId: string | null;
  audioElement: HTMLAudioElement | null;
  historyAudioElement: HTMLAudioElement | null;
  onRefresh: () => void;
  onTogglePlayback: (record: TtsHistoryRecord) => void;
  onDownload: (record: TtsHistoryRecord) => void;
  onHistoryPlay: () => void;
  setActiveHistoryId: (id: string | null) => void;
}

const TtsHistoryListInner: React.FC<TtsHistoryListProps> = ({
  history,
  historyLoading,
  historyError,
  activeHistoryId,
  audioElement,
  historyAudioElement,
  onRefresh,
  onTogglePlayback,
  onDownload,
  onHistoryPlay,
  setActiveHistoryId,
}) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.1 }}
      className={studioMainSurfaceClassName}
    >
      <div className="rounded-[22px] border border-slate-200 bg-white/82 p-4 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className={studioStrongBadgeClassName}>
              <FaHistory className="text-slate-600" />
            </div>
            <div>
              <div className={studioEyebrowClassName}>Generation History</div>
              <h2 className="mt-1 text-xl font-semibold text-slate-900">我的生成记录</h2>
            </div>
          </div>
          <button
            type="button"
            onClick={onRefresh}
            disabled={historyLoading}
            className={cn(
              studioGhostButtonClassName,
              historyLoading ? "cursor-not-allowed opacity-60" : "",
            )}
          >
            <FaRedo className={historyLoading ? "animate-spin" : ""} />
            刷新
          </button>
        </div>

        {historyError && (
          <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-800">
            {historyError}
          </div>
        )}

        {historyLoading && !history.length ? (
          <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
            正在加载历史记录...
          </div>
        ) : history.length === 0 ? (
          <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
            暂无生成记录
          </div>
        ) : (
          <div className="mt-5 grid gap-3 lg:grid-cols-2">
            {history.map((record) => {
              const reviewStatus = (record.reviewStatus || "none") as TtsHistoryReviewStatus;
              const isHistoryPlaying = activeHistoryId === record.id;

              return (
                <div
                  key={record.id}
                  className="min-w-0 rounded-[20px] border border-slate-200 bg-slate-50/70 p-4 sm:rounded-2xl"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600">
                          {record.voice}
                        </span>
                        <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600">
                          {record.model}
                        </span>
                        <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600">
                          {record.outputFormat?.toUpperCase() || "AUDIO"}
                        </span>
                        <span
                          className={cn(
                            "rounded-full border px-2.5 py-1 text-[11px] font-semibold",
                            reviewStatusClassNames[reviewStatus],
                          )}
                        >
                          {reviewStatusLabels[reviewStatus]}
                        </span>
                      </div>
                      <div className="mt-3 text-sm font-semibold text-slate-900">
                        {record.fileName || "语音文件"}
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        {formatHistoryTime(record.createdAt)} · {record.speed}x · {record.provider}
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        {record.audioStorage === "mongo" ? "MongoDB 音频" : "文件缓存"} ·{" "}
                        {record.audioMimeType || getAudioMimeType(record.outputFormat)} ·{" "}
                        {formatAudioSize(record.audioSize)}
                        {record.audioFileId ? ` · ${record.audioFileId}` : ""}
                      </div>
                      <div className="mt-2 break-words rounded-xl border border-slate-200 bg-white/70 px-3 py-2 text-xs leading-5 text-slate-500">
                        {record.text || "[redacted]"}
                      </div>
                    </div>
                  </div>

                  {record.audioUrl && (
                    <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-3">
                      <audio
                        controls
                        preload="none"
                        className="w-full"
                        onPlay={onHistoryPlay}
                      >
                        <source src={record.audioUrl} type={record.audioMimeType || getAudioMimeType(record.outputFormat)} />
                        您的浏览器不支持音频播放
                      </audio>
                    </div>
                  )}

                  <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                    <button
                      type="button"
                      onClick={() => onTogglePlayback(record)}
                      disabled={!record.audioUrl}
                      className={cn(
                        studioPrimaryButtonClassName,
                        "w-full sm:w-auto",
                        !record.audioUrl ? "cursor-not-allowed opacity-60" : "",
                      )}
                    >
                      {isHistoryPlaying ? <FaPause /> : <FaPlay />}
                      {isHistoryPlaying ? "暂停" : "播放"}
                    </button>
                    <button
                      type="button"
                      onClick={() => onDownload(record)}
                      disabled={!record.audioUrl || record.permissions?.canDownload === false}
                      className={cn(
                        studioGhostButtonClassName,
                        "w-full sm:w-auto",
                        !record.audioUrl || record.permissions?.canDownload === false
                          ? "cursor-not-allowed opacity-60"
                          : "",
                      )}
                    >
                      <FaDownload />
                      下载
                    </button>
                  </div>

                  {(record.adminNote || record.adminSuggestion || reviewStatus !== "none") && (
                    <div className="mt-4 space-y-2 rounded-2xl border border-slate-200 bg-white/80 p-3">
                      {record.adminNote && (
                        <div className="flex gap-2 text-xs leading-5 text-slate-600">
                          <FaCommentDots className="mt-0.5 shrink-0 text-slate-400" />
                          <span>
                            <span className="font-semibold text-slate-800">管理员留言：</span>
                            {record.adminNote}
                          </span>
                        </div>
                      )}
                      {record.adminSuggestion && (
                        <div className="flex gap-2 text-xs leading-5 text-slate-600">
                          <FaTools className="mt-0.5 shrink-0 text-slate-400" />
                          <span>
                            <span className="font-semibold text-slate-800">调整建议：</span>
                            {record.adminSuggestion}
                          </span>
                        </div>
                      )}
                      {reviewStatus !== "none" && (
                        <div className="text-xs leading-5 text-slate-500">
                          人工审核：{reviewStatusLabels[reviewStatus]}
                          {record.reviewedAt ? ` · ${formatHistoryTime(record.reviewedAt)}` : ""}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </motion.div>
  );
};

export const TtsHistoryList = React.memo(TtsHistoryListInner);