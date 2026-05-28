import React, { useCallback, useMemo, useState } from "react";
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
} from "react-icons/fa";
import { cn } from "../utils/cn";
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

export const TtsPage: React.FC = () => {
  const { loading, error, audioUrl, result, generateSpeech } = useTts();
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(null);

  const noticeRef = useDomProtection("legal-notice");

  const handleSuccess = useCallback(() => {
    if (audioElement) {
      audioElement.pause();
      setIsPlaying(false);
    }
  }, [audioElement]);

  const togglePlayPause = useCallback(() => {
    if (!audioUrl) return;

    if (!audioElement) {
      const audio = new Audio(audioUrl);
      audio.onended = () => setIsPlaying(false);
      audio.onpause = () => setIsPlaying(false);
      audio.onplay = () => setIsPlaying(true);
      setAudioElement(audio);
      audio.play();
      return;
    }

    if (isPlaying) {
      audioElement.pause();
    } else {
      audioElement.play();
    }
  }, [audioElement, audioUrl, isPlaying]);

  const handleDownload = useCallback(() => {
    if (!audioUrl) return;

    const extension = result?.outputFormat || "mp3";
    const link = document.createElement("a");
    link.href = audioUrl;
    link.download = result?.fileName || `tts-${Date.now()}.${extension}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [audioUrl, result?.fileName, result?.outputFormat]);

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
            <div className="rounded-[24px] border border-slate-200 bg-white p-4 sm:rounded-[28px] sm:p-6">
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

                  <div className="rounded-[20px] border border-slate-200 bg-slate-50 p-3 sm:rounded-2xl">
                    <audio
                      controls
                      className="w-full"
                      onPlay={() => setIsPlaying(true)}
                      onPause={() => setIsPlaying(false)}
                      onEnded={() => setIsPlaying(false)}
                    >
                      <source src={audioUrl} type={getAudioMimeType(result.outputFormat)} />
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
      </div>
    </div>
  );
};
