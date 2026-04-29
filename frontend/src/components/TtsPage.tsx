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
} from "react-icons/fa";

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
    <div className="min-h-screen bg-gradient-to-br from-[#8ECAE6]/20 via-white to-[#219EBC]/10 py-8 rounded-3xl">
      <div className="max-w-7xl mx-auto px-4 space-y-8">
        <motion.div
          className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl border border-[#8ECAE6]/30 overflow-hidden"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <div className="bg-[#023047] text-white p-6">
            <div className="text-center">
              <motion.div
                className="flex items-center justify-center gap-3 mb-4"
                initial={{ scale: 0.9 }}
                animate={{ scale: 1 }}
                transition={{ duration: 0.5, delay: 0.2 }}
              >
                <FaVolumeUp className="text-4xl" />
                <h1 className="text-4xl font-bold">文本转语音</h1>
              </motion.div>
              <motion.p
                className="text-[#8ECAE6] text-lg"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.5, delay: 0.4 }}
              >
                将您的文本转换为自然流畅的语音
              </motion.p>
            </div>
          </div>

          <div className="p-6">
            <div className="flex items-center gap-2 mb-4 p-3 bg-[#8ECAE6]/10 rounded-lg">
              <FaInfoCircle className="text-[#219EBC]" />
              <span className="font-semibold text-[#023047]">使用须知与联系方式</span>
            </div>

            <div
              ref={noticeRef as React.RefObject<HTMLDivElement | null>}
              className="space-y-4"
            >
              <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <FaShieldAlt className="text-red-600" />
                  <h3 className="text-red-700 font-semibold">使用须知</h3>
                </div>
                <div className="space-y-3 text-sm text-red-700">
                  <div>
                    <p className="font-medium mb-2">1. 禁止生成违法违规内容：</p>
                    <ul className="list-disc list-inside ml-4 space-y-1">
                      <li>政治敏感、民族歧视内容</li>
                      <li>色情、暴力、恐怖主义内容</li>
                      <li>侵犯知识产权内容</li>
                      <li>虚假信息或误导性内容</li>
                    </ul>
                  </div>
                  <div>
                    <p className="font-medium mb-2">2. 违规处理措施：</p>
                    <ul className="list-disc list-inside ml-4 space-y-1">
                      <li>立即停止服务并封禁账号</li>
                      <li>配合执法部门调查</li>
                      <li>提供使用记录和生成内容</li>
                      <li>保留追究法律责任权利</li>
                    </ul>
                  </div>
                </div>
              </div>
              <div className="bg-[#8ECAE6]/10 border border-[#8ECAE6]/30 rounded-xl p-4">
                <h3 className="text-[#219EBC] font-semibold mb-2 flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 4.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  联系我们
                </h3>
                <p className="text-[#219EBC] text-sm">
                  如有任何问题或建议，请联系开发者：
                  <a
                    href="mailto:admin@chloemlla.com"
                    className="font-medium hover:text-[#023047] transition-colors duration-200 ml-1 underline"
                  >
                    admin@chloemlla.com
                  </a>
                </p>
              </div>
            </div>
          </div>
        </motion.div>

        <div className="flex flex-col xl:flex-row gap-8">
          <motion.div
            className="flex-1"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
          >
            <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl border border-[#8ECAE6]/30 p-6 relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-1 bg-[#219EBC]" />
              <TtsForm
                loading={loading}
                error={error}
                latestResult={result}
                onSubmit={generateSpeech}
                onSuccess={handleSuccess}
              />
            </div>
          </motion.div>

          <AnimatePresence>
            {result && audioUrl && (
              <motion.div
                className="flex-1 xl:max-w-md"
                initial={{ opacity: 0, x: 20, scale: 0.95 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: 20, scale: 0.95 }}
                transition={{ duration: 0.5 }}
              >
                <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl border border-[#8ECAE6]/30 p-6 sticky top-8">
                  <div className="absolute top-0 left-0 w-full h-1 bg-[#219EBC]" />
                  <div className="flex items-center gap-2 text-lg font-semibold text-[#023047] mb-4">
                    {statusIcon}
                    <span>{statusTitle}</span>
                  </div>

                  <div className="space-y-4">
                    <div className="rounded-xl border border-emerald-100 bg-emerald-50/70 p-4">
                      <p className="text-sm font-medium text-emerald-900">{result.message}</p>
                      {usageSummary && (
                        <p className="mt-2 text-xs text-emerald-700">{usageSummary}</p>
                      )}
                      {result.nextAction?.message && (
                        <p className="mt-2 text-xs text-emerald-700">
                          下一步：{result.nextAction.message}
                        </p>
                      )}
                    </div>

                    <div className="bg-[#8ECAE6]/10 rounded-xl p-4">
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

                    <div className="flex gap-3">
                      <motion.button
                        onClick={togglePlayPause}
                        className="flex-1 bg-green-500 text-white py-3 px-4 rounded-xl hover:bg-green-600 transition-all duration-200 flex items-center justify-center gap-2 font-medium"
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                      >
                        {isPlaying ? <FaPause /> : <FaPlay />}
                        {isPlaying ? "暂停" : "播放"}
                      </motion.button>
                      <motion.button
                        onClick={handleDownload}
                        className="flex-1 bg-[#FFB703] text-[#023047] py-3 px-4 rounded-xl hover:bg-[#FB8500] transition-all duration-200 flex items-center justify-center gap-2 font-medium"
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                      >
                        <FaDownload />
                        下载
                      </motion.button>
                    </div>
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
