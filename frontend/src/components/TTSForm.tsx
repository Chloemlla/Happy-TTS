import React, { useCallback, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { TtsRequest, TtsResponse } from "../types/tts";
import { getApiBaseUrl } from "../api/api";
import { useNotification } from "./Notification";
import { TurnstileWidget } from "./TurnstileWidget";
import { useTurnstileConfig } from "../hooks/useTurnstileConfig";
import {
  FaLock,
  FaMicrophone,
  FaRobot,
  FaCog,
  FaVolumeUp,
} from "react-icons/fa";
import { cn } from "../utils/cn";
import {
  studioEyebrowClassName,
  studioFieldClassName,
  studioPrimaryButtonClassName,
  studioTextareaClassName,
} from "./studioTheme";
import {
  FALLBACK_TTS_PROVIDER_CONFIG,
  getTtsOutputFormats,
  isTtsProviderConfigPayload,
  normalizeTtsProviderConfig,
  supportsTtsSpeed,
} from "../utils/ttsProviderConfig";

interface TtsFormProps {
  loading: boolean;
  error?: string | null;
  latestResult?: TtsResponse | null;
  onSubmit: (request: TtsRequest) => Promise<TtsResponse>;
  onSuccess?: (result: TtsResponse) => void;
}

export const TtsForm: React.FC<TtsFormProps> = ({
  loading,
  error,
  latestResult,
  onSubmit,
  onSuccess,
}) => {
  const [text, setText] = useState("");
  const [model, setModel] = useState(FALLBACK_TTS_PROVIDER_CONFIG.defaultModel);
  const [voice, setVoice] = useState(FALLBACK_TTS_PROVIDER_CONFIG.defaultVoice || "");
  const [outputFormat, setOutputFormat] = useState("mp3");
  const [speed, setSpeed] = useState(1.0);
  const [generationCode, setGenerationCode] = useState("");
  const [formError, setFormError] = useState("");
  const [cooldown, setCooldown] = useState(false);
  const [cooldownTime, setCooldownTime] = useState(0);
  const { setNotification } = useNotification();
  const [turnstileToken, setTurnstileToken] = useState("");
  const [turnstileVerified, setTurnstileVerified] = useState(false);
  const [turnstileError, setTurnstileError] = useState(false);
  const [providerConfig, setProviderConfig] = useState(FALLBACK_TTS_PROVIDER_CONFIG);
  const [providerConfigLoading, setProviderConfigLoading] = useState(true);
  const [usingProviderFallback, setUsingProviderFallback] = useState(false);

  const { config: turnstileConfig, loading: turnstileConfigLoading } = useTurnstileConfig();

  const voices = providerConfig.voices;
  const models = providerConfig.models;
  const usesSelectableVoice = providerConfig.voiceMode === "select";
  const supportsSpeedAdjustment = supportsTtsSpeed(providerConfig.provider);
  const providerLabel = usingProviderFallback
    ? "兼容模式"
    : providerConfig.provider === "fish"
      ? "Fish Audio"
      : "OpenAI";
  const outputFormats = getTtsOutputFormats(usingProviderFallback ? "fish" : providerConfig.provider);

  useEffect(() => {
    const controller = new AbortController();

    const loadProviderConfig = async () => {
      try {
        const response = await fetch(`${getApiBaseUrl()}/api/tts/provider-config`, {
          credentials: "include",
          headers: { Accept: "application/json" },
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("TTS provider config unavailable");

        const payload: unknown = await response.json();
        const nextConfig = normalizeTtsProviderConfig(payload);
        const hasValidPayload = isTtsProviderConfigPayload(payload);
        if (controller.signal.aborted) return;

        setProviderConfig(nextConfig);
        setModel(nextConfig.defaultModel);
        if (nextConfig.provider === "fish") {
          setOutputFormat("mp3");
          setSpeed(1);
        }
        if (nextConfig.voiceMode === "select") {
          const nextVoice =
            (nextConfig.defaultVoice && nextConfig.voices.some((option) => option.id === nextConfig.defaultVoice)
              ? nextConfig.defaultVoice
              : nextConfig.voices[0]?.id) || "";
          setVoice(nextVoice);
        } else {
          setVoice("");
        }
        setUsingProviderFallback(!hasValidPayload);
        if (!hasValidPayload) {
          setOutputFormat("mp3");
        }
      } catch {
        if (controller.signal.aborted) return;
        setProviderConfig(FALLBACK_TTS_PROVIDER_CONFIG);
        setModel(FALLBACK_TTS_PROVIDER_CONFIG.defaultModel);
        setVoice(FALLBACK_TTS_PROVIDER_CONFIG.defaultVoice || "nova");
        setOutputFormat("mp3");
        setUsingProviderFallback(true);
      } finally {
        if (!controller.signal.aborted) setProviderConfigLoading(false);
      }
    };

    void loadProviderConfig();
    return () => controller.abort();
  }, []);

  const MAX_TEXT_LENGTH = 4096;

  const textByteSize = useMemo(() => new Blob([text]).size, [text]);

  const formatBytes = useCallback((bytes: number) => {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / 1024 / 1024).toFixed(2)}MB`;
  }, []);

  const validateForm = useCallback(() => {
    if (providerConfigLoading) {
      return "正在加载语音提供商配置，请稍候";
    }
    if (cooldown) {
      return `请等待 ${cooldownTime} 秒后再试`;
    }
    if (!text.trim()) {
      return "请输入要转换的文本";
    }
    if (text.length > MAX_TEXT_LENGTH) {
      return `文本长度超出限制（${text.length}/${MAX_TEXT_LENGTH}）`;
    }
    if (!generationCode.trim()) {
      return "请输入生成码";
    }
    if (!model) {
      return "请选择语音模型";
    }
    if (usesSelectableVoice && !voice) {
      return "请选择声音";
    }
    if (turnstileConfig.enabled && (!turnstileVerified || !turnstileToken)) {
      return "请完成人机验证";
    }

    return null;
  }, [
    cooldown,
    cooldownTime,
    generationCode,
    model,
    providerConfigLoading,
    text,
    turnstileConfig.enabled,
    turnstileToken,
    turnstileVerified,
    usesSelectableVoice,
    voice,
  ]);

  const handleSubmit = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      setFormError("");

      const validationError = validateForm();
      if (validationError) {
        setFormError(validationError);
        return;
      }

      try {
        const result = await onSubmit({
          text,
          model,
          ...(usesSelectableVoice && voice ? { voice } : {}),
          outputFormat,
          speed: supportsSpeedAdjustment ? speed : 1,
          generationCode,
          ...(turnstileConfig.enabled && { cfToken: turnstileToken }),
        });

        setNotification({
          message: result.message || (result.isDuplicate ? "已返回历史音频" : "语音生成成功"),
          type: result.isDuplicate ? "warning" : "success",
        });

        onSuccess?.(result);
      } catch (submitError) {
        const message =
          submitError instanceof Error ? submitError.message : "生成失败，请稍后重试";
        setNotification({
          message,
          type: "error",
        });
      }
    },
    [
      generationCode,
      model,
      onSubmit,
      onSuccess,
      outputFormat,
      setNotification,
      speed,
      supportsSpeedAdjustment,
      text,
      turnstileConfig.enabled,
      turnstileToken,
      usesSelectableVoice,
      validateForm,
      voice,
    ],
  );

  const handleTurnstileVerify = (token: string) => {
    setTurnstileToken(token);
    setTurnstileVerified(true);
    setTurnstileError(false);
  };

  const handleTurnstileExpire = () => {
    setTurnstileToken("");
    setTurnstileVerified(false);
    setTurnstileError(false);
  };

  const handleTurnstileError = () => {
    setTurnstileToken("");
    setTurnstileVerified(false);
    setTurnstileError(true);
  };

  const displayError = formError || error;
  const latestNextAction = latestResult?.nextAction?.message;

  return (
    <div className="relative w-full">
      <motion.form
        onSubmit={handleSubmit}
        className="space-y-4 sm:space-y-6"
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4 }}
      >
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="space-y-3"
        >
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <motion.label
              className={cn(studioEyebrowClassName, "flex items-center gap-2")}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.4, delay: 0.4 }}
            >
              <FaMicrophone className="text-slate-400" />
              输入文本
            </motion.label>
            <div className="flex items-center gap-2 text-xs sm:text-sm">
              <span
                className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold ${
                  text.length > MAX_TEXT_LENGTH * 0.9
                    ? "border-red-200 bg-red-50/80 text-red-700"
                    : text.length > MAX_TEXT_LENGTH * 0.7
                      ? "border-amber-200 bg-amber-50/80 text-amber-700"
                      : "border-slate-200 bg-slate-50/80 text-slate-600"
                }`}
              >
                {text.length}/{MAX_TEXT_LENGTH}
              </span>
              <span className="text-slate-400 text-xs">{formatBytes(textByteSize)}</span>
            </div>
          </div>
          <motion.textarea
            value={text}
            onChange={(event) => {
              const nextText = event.target.value;
              if (nextText.length <= MAX_TEXT_LENGTH) {
                setText(nextText);
              }
            }}
            className={cn(
              studioTextareaClassName,
              text.length > MAX_TEXT_LENGTH * 0.9
                ? "border-red-300 bg-red-50/80 focus:ring-red-200"
                : text.length > MAX_TEXT_LENGTH * 0.7
                  ? "border-amber-300 bg-amber-50/80 focus:ring-amber-200"
                  : "hover:border-slate-300",
            )}
            rows={4}
            placeholder={`请输入要转换的文本...

💡 提示：
• 支持中英文混合
• 标点符号会影响语音节奏
• 建议使用完整句子获得更好效果`}
            whileFocus={{ scale: 1.005 }}
          />
          {text.length > MAX_TEXT_LENGTH * 0.8 && (
            <motion.div
              className={`flex items-center gap-2 rounded-2xl border px-4 py-3 text-sm ${
                text.length > MAX_TEXT_LENGTH * 0.9
                  ? "border-red-200 bg-red-50/80 text-red-700"
                  : "border-amber-200 bg-amber-50/80 text-amber-700"
              }`}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3 }}
            >
              <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 15.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
              {text.length > MAX_TEXT_LENGTH * 0.9
                ? "文本长度接近上限，请适当精简内容"
                : "文本较长，建议分段处理以获得更好效果"}
            </motion.div>
          )}
        </motion.div>

        <motion.div
          className="space-y-5 rounded-[22px] border border-slate-200 bg-slate-50/80 p-4 sm:p-6"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.4 }}
        >
          <div className={cn(studioEyebrowClassName, "flex items-center gap-2")}>
            <FaCog className="text-slate-400" />
            <span>语音设置</span>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground" role="status" aria-live="polite">
            <span className="rounded-full border border-border bg-background px-2.5 py-1 text-foreground">当前提供商：{providerLabel}</span>
            {providerConfigLoading ? <span>正在同步模型配置...</span> : null}
            {usingProviderFallback ? <span>配置暂不可用，已切换到 MP3 兼容选项</span> : null}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.4, delay: 0.5 }}
            >
              <motion.label
                className={cn(studioEyebrowClassName, "mb-3 block")}
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.6 }}
              >
                <div className="flex items-center gap-2 mb-2">
                  <FaRobot className="text-slate-400" />
                  模型选择
                </div>
              </motion.label>
              <div className="space-y-2">
                {models.map((modelOption) => (
                  <motion.label
                    key={modelOption.id}
                    className={`flex cursor-pointer items-center rounded-2xl border p-3 transition-all duration-200 ${
                      model === modelOption.id
                        ? "border-slate-900 bg-slate-900 text-white"
                        : "border-slate-200 bg-white/80 text-slate-700 hover:border-slate-300 hover:bg-white"
                    }`}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <input
                      type="radio"
                      name="model"
                      value={modelOption.id}
                      checked={model === modelOption.id}
                      onChange={(event) => setModel(event.target.value)}
                      disabled={providerConfigLoading}
                      className="sr-only"
                    />
                    <div
                      className={`w-4 h-4 rounded-full border-2 mr-3 flex items-center justify-center ${
                        model === modelOption.id ? "border-white" : "border-slate-200"
                      }`}
                    >
                      {model === modelOption.id && <div className="h-2 w-2 rounded-full bg-white" />}
                    </div>
                    <div className="flex-1">
                      <div className="font-semibold">{modelOption.name}</div>
                      <div className={cn("text-sm", model === modelOption.id ? "text-white/70" : "text-slate-500")}>{modelOption.description}</div>
                    </div>
                  </motion.label>
                ))}
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.4, delay: 0.6 }}
            >
              <motion.div
                className={cn(studioEyebrowClassName, "mb-3 block")}
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.7 }}
              >
                <div className="flex items-center gap-2 mb-2">
                  <FaVolumeUp className="text-slate-400" />
                  {usesSelectableVoice ? "声音选择" : "声音配置"}
                </div>
              </motion.div>
              {usesSelectableVoice ? (
                <div className="space-y-2">
                  {voices.map((voiceOption) => (
                  <motion.label
                    key={voiceOption.id}
                    className={`flex cursor-pointer items-center rounded-2xl border p-3 transition-all duration-200 ${
                      voice === voiceOption.id
                        ? "border-slate-900 bg-slate-900 text-white"
                        : "border-slate-200 bg-white/80 text-slate-700 hover:border-slate-300 hover:bg-white"
                    }`}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <input
                      type="radio"
                      name="voice"
                      value={voiceOption.id}
                      checked={voice === voiceOption.id}
                      onChange={(event) => setVoice(event.target.value)}
                      disabled={providerConfigLoading}
                      className="sr-only"
                    />
                    <div
                      className={`w-4 h-4 rounded-full border-2 mr-3 flex items-center justify-center ${
                        voice === voiceOption.id ? "border-white" : "border-slate-200"
                      }`}
                    >
                      {voice === voiceOption.id && <div className="h-2 w-2 rounded-full bg-white" />}
                    </div>
                    <div className="flex-1">
                      <div className="font-semibold">{voiceOption.name}</div>
                      <div className={cn("text-sm", voice === voiceOption.id ? "text-white/70" : "text-slate-500")}>{voiceOption.description}</div>
                    </div>
                  </motion.label>
                  ))}
                </div>
              ) : (
                <div className="rounded-md border border-border bg-muted/50 p-4 text-sm text-muted-foreground">
                  {providerConfig.voiceMode === "configured_reference"
                    ? "音色由管理员在 Fish Audio Reference ID 中统一配置，提交时不会发送 OpenAI voice 值。"
                    : "当前提供商使用服务端默认音色，无需在此选择。"}
                </div>
              )}
            </motion.div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.4, delay: 0.7 }}
            >
              <motion.label
                className={cn(studioEyebrowClassName, "mb-3 block")}
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.8 }}
              >
                输出格式
              </motion.label>
              <motion.select
                value={outputFormat}
                onChange={(event) => setOutputFormat(event.target.value)}
                disabled={providerConfigLoading || outputFormats.length === 1}
                className={cn(studioFieldClassName, "appearance-none bg-no-repeat bg-right pr-10")}
                style={{
                  backgroundImage:
                    'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' fill=\'none\' viewBox=\'0 0 24 24\' stroke=\'%236B7280\'%3E%3Cpath stroke-linecap=\'round\' stroke-linejoin=\'round\' stroke-width=\'2\' d=\'M19 9l-7 7-7-7\'%3E%3C/path%3E%3C/svg%3E")',
                  backgroundSize: "1.5em 1.5em",
                }}
                whileFocus={{ scale: 1.01 }}
              >
                {outputFormats.map((format) => (
                  <option key={format} value={format}>
                    {format === "opus" ? "Opus" : format.toUpperCase()}
                  </option>
                ))}
              </motion.select>
              {providerConfig.provider === "fish" ? (
                <p className="mt-2 text-xs text-muted-foreground">Fish Audio 当前仅支持 MP3 输出。</p>
              ) : null}
            </motion.div>

            {supportsSpeedAdjustment ? (
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.4, delay: 0.8 }}
              >
                <motion.label
                  className={cn(studioEyebrowClassName, "mb-3 block")}
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: 0.9 }}
                >
                  语速
                </motion.label>
                <motion.input
                  type="range"
                  min="0.25"
                  max="4.0"
                  step="0.25"
                  value={speed}
                  onChange={(event) => setSpeed(parseFloat(event.target.value))}
                  className="w-full"
                  whileHover={{ scale: 1.02 }}
                />
                <motion.div
                  className="mt-2 text-center text-muted-foreground"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.3, delay: 1.0 }}
                >
                  {speed}x
                </motion.div>
              </motion.div>
            ) : (
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.4, delay: 0.8 }}
              >
                <div className={cn(studioEyebrowClassName, "mb-3 block")}>语速</div>
                <div className="rounded-md border border-border bg-muted/50 p-4 text-sm text-muted-foreground" role="note">
                  Fish Audio 当前使用默认语速 1x，暂不支持调整。
                </div>
              </motion.div>
            )}

            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.4, delay: 0.9 }}
            >
              <motion.label
                className={cn(studioEyebrowClassName, "mb-3 block")}
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 1.0 }}
              >
                生成码
                <span className="text-red-500 ml-1">*</span>
              </motion.label>
              <motion.input
                type="password"
                value={generationCode}
                onChange={(event) => setGenerationCode(event.target.value)}
                className={studioFieldClassName}
                placeholder="请输入生成码..."
                required
                whileFocus={{ scale: 1.01 }}
              />
              <motion.p
                className="text-sm text-slate-400 mt-1"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.3, delay: 1.1 }}
              >
                生成码用于验证您的身份，请确保输入正确
              </motion.p>
            </motion.div>
          </div>
        </motion.div>

        {turnstileConfig.enabled && turnstileConfig.siteKey && !turnstileConfigLoading && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 1.0 }}
            className="space-y-3"
          >
            <motion.label
              className={cn(studioEyebrowClassName, "mb-3 block")}
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 1.1 }}
            >
              人机验证
              <span className="text-red-500 ml-1">*</span>
            </motion.label>

            <TurnstileWidget
              siteKey={turnstileConfig.siteKey}
              onVerify={handleTurnstileVerify}
              onExpire={handleTurnstileExpire}
              onError={handleTurnstileError}
              theme="light"
              size="normal"
            />

            {turnstileError && (
              <motion.div
                className="rounded-2xl border border-red-200 bg-red-50/80 px-4 py-3 text-sm text-red-700"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
              >
                验证失败，请重新验证
              </motion.div>
            )}

            <motion.div
              className="flex items-center space-x-2 text-sm text-slate-600"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3, delay: 1.3 }}
            >
              <FaLock className="w-4 h-4 text-slate-500" />
              <span>请完成人机验证以证明您是人类用户</span>
            </motion.div>
          </motion.div>
        )}

        <AnimatePresence>
          {displayError && (
            <motion.div
              className="rounded-2xl border border-red-200 bg-red-50/80 px-4 py-3 text-sm text-red-700"
              initial={{ opacity: 0, scale: 0.95, y: -10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -10 }}
              transition={{ duration: 0.3 }}
            >
              {displayError}
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {latestNextAction && !displayError && (
            <motion.div
              className="rounded-2xl border border-emerald-200 bg-emerald-50/80 px-4 py-3 text-sm text-emerald-700"
              initial={{ opacity: 0, scale: 0.95, y: -10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -10 }}
              transition={{ duration: 0.3 }}
            >
              {latestNextAction}
            </motion.div>
          )}
        </AnimatePresence>

        <motion.div
          className="flex flex-col sm:flex-row gap-3 sm:gap-4"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 1.0 }}
        >
          <motion.button
            type="submit"
            disabled={loading || cooldown || providerConfigLoading}
            className={cn(
              studioPrimaryButtonClassName,
              "flex-1 transition-all duration-200",
              loading || cooldown || providerConfigLoading
                ? "cursor-not-allowed bg-slate-400 text-white"
                : "",
            )}
            whileHover={{ scale: 1.02, y: -1 }}
            whileTap={{ scale: 0.98 }}
          >
            {providerConfigLoading ? (
              "正在加载语音配置..."
            ) : loading ? (
              <motion.div className="flex items-center justify-center">
                <motion.div
                  className="w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-2"
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                />
                生成中...
              </motion.div>
            ) : cooldown ? (
              `请等待 ${cooldownTime} 秒`
            ) : (
              "生成语音"
            )}
          </motion.button>
        </motion.div>
      </motion.form>
    </div>
  );
};

export default TtsForm;
