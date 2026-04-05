import React, { useCallback, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { TtsRequest, TtsResponse } from "../types/tts";
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
  const [model, setModel] = useState("tts-1-hd");
  const [voice, setVoice] = useState("nova");
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

  const { config: turnstileConfig, loading: turnstileConfigLoading } = useTurnstileConfig();

  const voices = useMemo(
    () => [
      { id: "alloy", name: "Alloy", description: "中性、平衡的声音" },
      { id: "echo", name: "Echo", description: "男性、深沉的声音" },
      { id: "fable", name: "Fable", description: "英式口音、优雅" },
      { id: "onyx", name: "Onyx", description: "男性、深沉、戏剧性" },
      { id: "nova", name: "Nova", description: "女性、年轻、活泼" },
      { id: "shimmer", name: "Shimmer", description: "女性、温柔、轻柔" },
    ],
    [],
  );

  const models = useMemo(
    () => [
      { id: "tts-1", name: "TTS-1", description: "标准质量，速度快" },
      { id: "tts-1-hd", name: "TTS-1-HD", description: "高清质量，更自然" },
    ],
    [],
  );

  const MAX_TEXT_LENGTH = 4096;

  const textByteSize = useMemo(() => new Blob([text]).size, [text]);

  const formatBytes = useCallback((bytes: number) => {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / 1024 / 1024).toFixed(2)}MB`;
  }, []);

  const validateForm = useCallback(() => {
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
    if (turnstileConfig.enabled && (!turnstileVerified || !turnstileToken)) {
      return "请完成人机验证";
    }

    return null;
  }, [
    cooldown,
    cooldownTime,
    generationCode,
    text,
    turnstileConfig.enabled,
    turnstileToken,
    turnstileVerified,
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
          voice,
          outputFormat,
          speed,
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
      text,
      turnstileConfig.enabled,
      turnstileToken,
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
    <div className="relative w-full max-w-4xl mx-auto">
      <motion.form
        onSubmit={handleSubmit}
        className="space-y-4 sm:space-y-6 p-4 sm:p-6 lg:p-8"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.6, type: "spring", stiffness: 100 }}
      >
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="space-y-3"
        >
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-0">
            <motion.label
              className="flex items-center gap-2 text-[#023047] text-base sm:text-lg font-semibold"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.4, delay: 0.4 }}
            >
              <FaMicrophone className="text-[#219EBC] text-sm sm:text-base" />
              输入文本
            </motion.label>
            <div className="flex items-center gap-2 text-xs sm:text-sm">
              <span
                className={`px-2 py-1 rounded-full text-xs ${
                  text.length > MAX_TEXT_LENGTH * 0.9
                    ? "bg-red-100 text-red-700"
                    : text.length > MAX_TEXT_LENGTH * 0.7
                      ? "bg-yellow-100 text-yellow-700"
                      : "bg-green-100 text-green-700"
                }`}
              >
                {text.length}/{MAX_TEXT_LENGTH}
              </span>
              <span className="text-[#023047]/50 text-xs">{formatBytes(textByteSize)}</span>
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
            className={`w-full px-3 sm:px-4 py-2 sm:py-3 border-2 rounded-lg sm:rounded-xl focus:outline-none focus:ring-2 transition-all duration-200 bg-white resize-none text-sm sm:text-base ${
              text.length > MAX_TEXT_LENGTH * 0.9
                ? "border-red-300 focus:ring-red-400 bg-red-50"
                : text.length > MAX_TEXT_LENGTH * 0.7
                  ? "border-yellow-300 focus:ring-yellow-400 bg-yellow-50"
                  : "border-[#8ECAE6]/30 focus:ring-[#219EBC] focus:border-[#219EBC] hover:border-[#8ECAE6]/50"
            }`}
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
              className={`text-sm p-2 rounded-lg flex items-center gap-2 ${
                text.length > MAX_TEXT_LENGTH * 0.9
                  ? "bg-red-50 text-red-700 border border-red-200"
                  : "bg-yellow-50 text-yellow-700 border border-yellow-200"
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
          className="bg-[#8ECAE6]/10 rounded-lg sm:rounded-xl p-4 sm:p-6 space-y-4 sm:space-y-6"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.4 }}
        >
          <div className="flex items-center gap-2 text-[#023047] text-sm sm:text-base font-semibold">
            <FaCog className="text-[#219EBC] text-sm sm:text-base" />
            <span>语音设置</span>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.4, delay: 0.5 }}
            >
              <motion.label
                className="block text-[#023047] font-medium mb-3"
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.6 }}
              >
                <div className="flex items-center gap-2 mb-2">
                  <FaRobot className="text-[#FFB703]" />
                  模型选择
                </div>
              </motion.label>
              <div className="space-y-2">
                {models.map((modelOption) => (
                  <motion.label
                    key={modelOption.id}
                    className={`flex items-center p-3 border-2 rounded-lg cursor-pointer transition-all duration-200 ${
                      model === modelOption.id
                        ? "border-[#219EBC] bg-[#8ECAE6]/10"
                        : "border-[#8ECAE6]/30 hover:border-[#8ECAE6]/50 bg-white"
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
                      className="sr-only"
                    />
                    <div
                      className={`w-4 h-4 rounded-full border-2 mr-3 flex items-center justify-center ${
                        model === modelOption.id ? "border-[#219EBC]" : "border-[#8ECAE6]/30"
                      }`}
                    >
                      {model === modelOption.id && <div className="w-2 h-2 bg-[#219EBC] rounded-full" />}
                    </div>
                    <div className="flex-1">
                      <div className="font-medium text-[#023047]">{modelOption.name}</div>
                      <div className="text-sm text-[#023047]/70">{modelOption.description}</div>
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
              <motion.label
                className="block text-[#023047] font-medium mb-3"
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.7 }}
              >
                <div className="flex items-center gap-2 mb-2">
                  <FaVolumeUp className="text-green-600" />
                  声音选择
                </div>
              </motion.label>
              <div className="space-y-2">
                {voices.map((voiceOption) => (
                  <motion.label
                    key={voiceOption.id}
                    className={`flex items-center p-3 border-2 rounded-lg cursor-pointer transition-all duration-200 ${
                      voice === voiceOption.id
                        ? "border-green-500 bg-green-50"
                        : "border-[#8ECAE6]/30 hover:border-[#8ECAE6]/50 bg-white"
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
                      className="sr-only"
                    />
                    <div
                      className={`w-4 h-4 rounded-full border-2 mr-3 flex items-center justify-center ${
                        voice === voiceOption.id ? "border-green-500" : "border-[#8ECAE6]/30"
                      }`}
                    >
                      {voice === voiceOption.id && <div className="w-2 h-2 bg-green-500 rounded-full" />}
                    </div>
                    <div className="flex-1">
                      <div className="font-medium text-[#023047]">{voiceOption.name}</div>
                      <div className="text-sm text-[#023047]/70">{voiceOption.description}</div>
                    </div>
                  </motion.label>
                ))}
              </div>
            </motion.div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.4, delay: 0.7 }}
            >
              <motion.label
                className="block text-[#023047] text-lg font-semibold mb-3"
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.8 }}
              >
                输出格式
              </motion.label>
              <motion.select
                value={outputFormat}
                onChange={(event) => setOutputFormat(event.target.value)}
                className="w-full px-4 py-3 border-2 border-[#8ECAE6]/30 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#219EBC] focus:border-[#219EBC] transition-all duration-200 hover:border-[#8ECAE6]/50 appearance-none bg-white bg-no-repeat bg-right pr-10"
                style={{
                  backgroundImage:
                    'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' fill=\'none\' viewBox=\'0 0 24 24\' stroke=\'%236B7280\'%3E%3Cpath stroke-linecap=\'round\' stroke-linejoin=\'round\' stroke-width=\'2\' d=\'M19 9l-7 7-7-7\'%3E%3C/path%3E%3C/svg%3E")',
                  backgroundSize: "1.5em 1.5em",
                }}
                whileFocus={{ scale: 1.01 }}
              >
                <option value="mp3">MP3</option>
                <option value="opus">Opus</option>
                <option value="aac">AAC</option>
                <option value="flac">FLAC</option>
              </motion.select>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.4, delay: 0.8 }}
            >
              <motion.label
                className="block text-[#023047] text-lg font-semibold mb-3"
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
                className="text-center text-[#023047]/70 mt-2"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.3, delay: 1.0 }}
              >
                {speed}x
              </motion.div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.4, delay: 0.9 }}
            >
              <motion.label
                className="block text-[#023047] text-lg font-semibold mb-3"
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
                className="w-full px-4 py-3 border-2 border-[#8ECAE6]/30 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#219EBC] focus:border-[#219EBC] transition-all duration-200 hover:border-[#8ECAE6]/50"
                placeholder="请输入生成码..."
                required
                whileFocus={{ scale: 1.01 }}
              />
              <motion.p
                className="text-sm text-[#023047]/50 mt-1"
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
              className="block text-[#023047] text-lg font-semibold mb-3"
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
                className="text-red-500 text-sm bg-red-50 border border-red-200 rounded-lg p-3"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
              >
                验证失败，请重新验证
              </motion.div>
            )}

            <motion.div
              className="flex items-center space-x-2 text-sm text-[#023047]/70"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3, delay: 1.3 }}
            >
              <FaLock className="w-4 h-4 text-[#219EBC]" />
              <span>请完成人机验证以证明您是人类用户</span>
            </motion.div>
          </motion.div>
        )}

        <AnimatePresence>
          {displayError && (
            <motion.div
              className="text-red-500 text-sm bg-red-50 border border-red-200 rounded-lg p-3"
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
              className="text-sm bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-lg p-3"
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
            disabled={loading || cooldown}
            className={`flex-1 py-3 px-4 sm:px-6 rounded-lg sm:rounded-xl text-sm sm:text-base font-semibold transition-all duration-200 ${
              loading || cooldown
                ? "bg-gray-400 cursor-not-allowed text-white"
                : "bg-[#FFB703] hover:bg-[#FB8500] text-[#023047] shadow-lg hover:shadow-xl"
            }`}
            whileHover={{ scale: 1.02, y: -1 }}
            whileTap={{ scale: 0.98 }}
          >
            {loading ? (
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
