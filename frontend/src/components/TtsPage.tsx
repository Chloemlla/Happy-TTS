import React, { useCallback, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTts } from "../hooks/useTts";
import { TtsForm } from "./TTSForm";
import { useDomProtection } from "../hooks/useDomProtection";
import {
  FaVolumeUp,
  FaDownload,
  FaPlay,
  FaPause,
  FaInfoCircle,
  FaShieldAlt,
  FaCheckCircle,
  FaHistory,
  FaEnvelope,
  FaRedo,
  FaCommentDots,
  FaTools,
} from "react-icons/fa";
import { cn } from "../utils/cn";
import type { TtsHistoryRecord, TtsHistoryReviewStatus } from "../types/tts";
import {
  studioAccentBlobBlueClassName,
  studioAccentBlobSkyClassName,
  studioDisplayFont,
  studioEyebrowAccentPillClassName,
  studioEyebrowClassName,
  studioGhostButtonClassName,
  studioHeroCardClassName,
  studioMainSurfaceClassName,
  studioPageClassName,
  studioPageFont,
  studioPanelClassName,
  studioPrimaryButtonClassName,
  studioStrongBadgeClassName,
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

const buildDownloadUrl = (audioUrl: string) => {
  const downloadUrl = new URL(audioUrl, window.location.origin);
  downloadUrl.searchParams.set("download", "1");
  return downloadUrl.toString();
};

export const TtsPage: React.FC = () => {
  const {
    loading,
    error,
    audioUrl,
    result,
    history,
    historyLoading,
    historyError,
    generateSpeech,
    fetchHistory,
  } = useTts();
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(null);
  const [activeHistoryId, setActiveHistoryId] = useState<string | null>(null);
  const [historyAudioElement, setHistoryAudioElement] = useState<HTMLAudioElement | null>(null);

  const noticeRef = useDomProtection("legal-notice");

  useEffect(() => {
    void fetchHistory(20).catch(() => {});
  }, [fetchHistory]);

  useEffect(() => {
    return () => {
      audioElement?.pause();
      historyAudioElement?.pause();
    };
  }, [audioElement, historyAudioElement]);

  const handleSuccess = useCallback(() => {
    if (audioElement) {
      audioElement.pause();
      setIsPlaying(false);
    }
    if (historyAudioElement) {
      historyAudioElement.pause();
      setActiveHistoryId(null);
    }
  }, [audioElement, historyAudioElement]);

  const togglePlayPause = useCallback(() => {
    if (!audioUrl) return;

    if (historyAudioElement) {
      historyAudioElement.pause();
      setActiveHistoryId(null);
    }

    if (!audioElement) {
      const audio = new Audio(audioUrl);
      audio.onended = () => setIsPlaying(false);
      audio.onpause = () => setIsPlaying(false);
      audio.onplay = () => setIsPlaying(true);
      setAudioElement(audio);
      void audio.play();
      return;
    }

    if (isPlaying) {
      audioElement.pause();
    } else {
      void audioElement.play();
    }
  }, [audioElement, audioUrl, historyAudioElement, isPlaying]);

  const handleDownload = useCallback(() => {
    if (!audioUrl) return;

    const extension = result?.outputFormat || "mp3";
    const link = document.createElement("a");
    link.href = buildDownloadUrl(audioUrl);
    link.download = result?.fileName || `tts-${Date.now()}.${extension}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [audioUrl, result?.fileName, result?.outputFormat]);

  const toggleHistoryPlayback = useCallback(
    (record: TtsHistoryRecord) => {
      if (!record.audioUrl) return;

      if (audioElement) {
        audioElement.pause();
        setIsPlaying(false);
      }

      if (historyAudioElement && activeHistoryId === record.id) {
        historyAudioElement.pause();
        setActiveHistoryId(null);
        return;
      }

      if (historyAudioElement) {
        historyAudioElement.pause();
      }

      const audio = new Audio(record.audioUrl);
      audio.onended = () => setActiveHistoryId(null);
      audio.onpause = () => setActiveHistoryId((current) => (current === record.id ? null : current));
      audio.onplay = () => setActiveHistoryId(record.id);
      setHistoryAudioElement(audio);
      void audio.play().catch(() => setActiveHistoryId(null));
    },
    [activeHistoryId, audioElement, historyAudioElement],
  );

  const handleHistoryDownload = useCallback((record: TtsHistoryRecord) => {
    if (!record.audioUrl) return;

    const link = document.createElement("a");
    link.href = buildDownloadUrl(record.audioUrl);
    link.download = record.fileName || `tts-history-${Date.now()}.${record.outputFormat || "mp3"}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, []);

  const usageSummary = useMemo(() => {
    if (!result?.usage) return null;
    if (result.usage.isAdmin) {
      return "管理员账号，不受每日额度限制";
    }
    if (result.usage.remainingToday === null || result.usage.dailyLimit === null) {
      return "当前请求未返回额度信息";
    }

    return `今日剩余 ${result.usage.remainingToday}/${result.usage.dailyLimit} 次`;
  }, [result]);

  const statusTitle = result?.status === "reused" ? "已返回历史音频" : "语音已生成";
  const statusIcon =
    result?.status === "reused" ? (
      <FaHistory className="text-amber-500" />
    ) : (
      <FaCheckCircle className="text-emerald-500" />
    );

  return (
    <div className={studioPageClassName} style={{ fontFamily: studioPageFont }}>
      <div className="mx-auto max-w-7xl min-w-0 space-y-5 sm:space-y-8">
        {/* Hero */}
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45 }}
          className={cn("relative overflow-hidden", studioHeroCardClassName)}
        >
          <div className={cn(studioAccentBlobBlueClassName, "-right-12 top-0")} aria-hidden />
          <div className={cn(studioAccentBlobSkyClassName, "-left-10 bottom-0")} aria-hidden />
          <div className="relative flex min-w-0 flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl min-w-0">
              <div className={studioEyebrowAccentPillClassName}>
                <FaVolumeUp />
                Synapse Text-to-Speech
              </div>
              <h1
                className="mt-4 text-[2rem] font-semibold leading-[1.05] text-slate-900 sm:text-5xl sm:leading-tight"
                style={{ fontFamily: studioDisplayFont }}
              >
                文本转语音
              </h1>
              <p className="mt-3 max-w-xl text-[13px] leading-6 text-slate-600 sm:text-base sm:leading-7">
                将文本转换为自然流畅的语音。支持多种音色与导出格式，所有合成请求都会经过安全审计。
              </p>
            </div>

            <div className="w-full lg:w-auto lg:max-w-sm">
              <div
                ref={noticeRef as React.RefObject<HTMLDivElement | null>}
                className="rounded-[22px] border border-slate-200 bg-slate-50/80 p-4 sm:rounded-2xl"
              >
                <div className={cn(studioEyebrowClassName, "flex items-center gap-2")}>
                  <FaInfoCircle className="text-slate-500" />
                  使用须知与联系方式
                </div>
                <ul className="mt-3 space-y-2 text-[13px] leading-6 text-slate-600">
                  <li className="flex items-start gap-2">
                    <FaShieldAlt className="mt-1 shrink-0 text-slate-400" />
                    <span>禁止生成政治敏感、色情暴力、虚假误导或侵权类内容，违规会立即停服并保留追责权利。</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <FaEnvelope className="mt-1 shrink-0 text-slate-400" />
                    <span>
                      问题反馈：
                      <a
                        href="mailto:admin@chloemlla.com"
                        className="ml-1 font-semibold text-slate-900 underline decoration-slate-300 underline-offset-2 transition hover:text-slate-700"
                      >
                        admin@chloemlla.com
                      </a>
                    </span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </motion.div>

        <div className="grid gap-4 sm:gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          {/* Form */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.05 }}
            className={studioMainSurfaceClassName}
          >
            <div className="rounded-[22px] border border-slate-200 bg-white/80 p-4 sm:p-6">
              <TtsForm
                loading={loading}
                error={error}
                latestResult={result}
                onSubmit={generateSpeech}
                onSuccess={handleSuccess}
              />
            </div>
          </motion.div>

          {/* Result */}
          <AnimatePresence>
            {result && audioUrl && (
              <motion.div
                initial={{ opacity: 0, y: 24, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 12, scale: 0.98 }}
                transition={{ duration: 0.45 }}
                className={cn(studioPanelClassName, "xl:sticky xl:top-6")}
              >
                <div className="mb-4 flex items-center gap-3">
                  <div className={studioStrongBadgeClassName}>
                    {statusIcon}
                  </div>
                  <div>
                    <div className={studioEyebrowClassName}>Synapse Output</div>
                    <div className="mt-1 text-lg font-semibold text-slate-900">{statusTitle}</div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="rounded-[20px] border border-emerald-100 bg-emerald-50/70 p-4 sm:rounded-2xl">
                    <p className="text-sm font-medium leading-6 text-emerald-900">{result.message}</p>
                    {usageSummary && (
                      <p className="mt-2 text-xs leading-5 text-emerald-700">{usageSummary}</p>
                    )}
                    {result.nextAction?.message && (
                      <p className="mt-2 text-xs leading-5 text-emerald-700">
                        下一步：{result.nextAction.message}
                      </p>
                    )}
                  </div>

                  <div className="rounded-[20px] border border-slate-200 bg-white p-4 text-xs leading-5 text-slate-600 sm:rounded-2xl">
                    <div className={studioEyebrowClassName}>Generated Text</div>
                    <p className="mt-2 break-words text-sm leading-6 text-slate-800">
                      {result.text || "未返回生成文本"}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 font-semibold text-slate-600">
                        {result.audioStorage === "mongo" ? "MongoDB 音频" : "文件缓存"}
                      </span>
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 font-semibold text-slate-600">
                        {result.audioMimeType || getAudioMimeType(result.outputFormat)}
                      </span>
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 font-semibold text-slate-600">
                        {formatAudioSize(result.audioSize)}
                      </span>
                      {result.audioFileId && (
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 font-semibold text-slate-600">
                          Mongo ID: {result.audioFileId}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="rounded-[20px] border border-slate-200 bg-slate-50 p-3 sm:rounded-2xl">
                    <audio
                      controls
                      className="w-full"
                      onPlay={() => setIsPlaying(true)}
                      onPause={() => setIsPlaying(false)}
                      onEnded={() => setIsPlaying(false)}
                    >
                      <source src={audioUrl} type={result.audioMimeType || getAudioMimeType(result.outputFormat)} />
                      您的浏览器不支持音频播放
                    </audio>
                  </div>

                  <div className="flex flex-col gap-2 sm:flex-row">
                    <motion.button
                      type="button"
                      onClick={togglePlayPause}
                      className={cn(studioPrimaryButtonClassName, "w-full")}
                      whileHover={{ scale: 1.01 }}
                      whileTap={{ scale: 0.99 }}
                    >
                      {isPlaying ? <FaPause /> : <FaPlay />}
                      {isPlaying ? "暂停播放" : "立即播放"}
                    </motion.button>
                    <motion.button
                      type="button"
                      onClick={handleDownload}
                      className={cn(studioGhostButtonClassName, "w-full sm:w-auto")}
                      whileHover={{ scale: 1.01 }}
                      whileTap={{ scale: 0.99 }}
                    >
                      <FaDownload />
                      下载音频
                    </motion.button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

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
                onClick={() => void fetchHistory(20).catch(() => {})}
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
                            className="w-full"
                            onPlay={() => {
                              audioElement?.pause();
                              historyAudioElement?.pause();
                              setActiveHistoryId(null);
                            }}
                          >
                            <source src={record.audioUrl} type={record.audioMimeType || getAudioMimeType(record.outputFormat)} />
                            您的浏览器不支持音频播放
                          </audio>
                        </div>
                      )}

                      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                        <button
                          type="button"
                          onClick={() => toggleHistoryPlayback(record)}
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
                          onClick={() => handleHistoryDownload(record)}
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
      </div>
    </div>
  );
};
