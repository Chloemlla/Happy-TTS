import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FaCoins,
  FaBullseye,
  FaChartBar,
  FaLightbulb,
  FaDice,
  FaVolumeUp,
  FaVolumeMute,
  FaDownload,
  FaUpload,
  FaRedo,
  FaEye,
  FaEyeSlash,
  FaCode,
  FaCopy,
  FaShieldAlt,
  FaRandom,
  FaClock,
  FaInfoCircle,
  FaCheckCircle,
  FaTimesCircle,
  FaPlay,
  FaPause,
  FaCog
} from 'react-icons/fa';
import {
  InfoBadge,
  InfoMetricCard,
  InfoQueryHero,
  InfoQueryShell,
  InfoSectionTitle,
  logSharePanelClass,
  logSharePrimaryButtonClass,
  logShareSecondaryButtonClass,
  logShareTileClass
} from './LogShareStyleScaffold';
import { coinFlipApi } from '../api/coinFlip';

const coinPanelClass = logSharePanelClass;
const coinTileClass = logShareTileClass;
const coinButtonClass = logSharePrimaryButtonClass;
const coinGhostButtonClass = logShareSecondaryButtonClass;

interface CoinFlipStats {
  heads: number;
  tails: number;
  total: number;
}

// 记录本次结果的真实来源，供"查看算法"展示；服务端生成时前端拿不到随机值
interface RandomTrace {
  source: 'server' | 'crypto' | 'fallback';
  method: string;
  finalResult: number | null;
  result: 'heads' | 'tails';
  resultId?: string | null;
}

const STATS_STORAGE_KEY = 'coin-flip-stats';
const SKIP_ANIMATION_STORAGE_KEY = 'coin-flip-skip-animation';

const parseStats = (raw: unknown): CoinFlipStats | null => {
  if (!raw || typeof raw !== 'object') return null;
  const { heads, tails } = raw as Record<string, unknown>;
  const valid = [heads, tails].every((value) => typeof value === 'number' && Number.isFinite(value) && value >= 0);
  if (!valid) return null;
  const nextHeads = Math.floor(heads as number);
  const nextTails = Math.floor(tails as number);
  return { heads: nextHeads, tails: nextTails, total: nextHeads + nextTails };
};

const CoinFlip: React.FC = () => {
  const [isFlipping, setIsFlipping] = useState(false);
  const [result, setResult] = useState<'heads' | 'tails' | null>(null);
  const [stats, setStats] = useState<CoinFlipStats>({ heads: 0, tails: 0, total: 0 });
  const [showStats, setShowStats] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [audioContext, setAudioContext] = useState<AudioContext | null>(null);
  const [showRandomAlgorithm, setShowRandomAlgorithm] = useState(false);
  const [lastRandomData, setLastRandomData] = useState<RandomTrace | null>(null);
  const [skipAnimation, setSkipAnimation] = useState(false);
  const [resultId, setResultId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const animationTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const shakeIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const statsRef = useRef<CoinFlipStats>({ heads: 0, tails: 0, total: 0 });
  // 结果请求一旦发出就置位，避免连点"跳过动画"重复抛出并重复计数
  const settlingRef = useRef(false);

  const savePreference = (key: string, value: string) => {
    try {
      localStorage.setItem(key, value);
    } catch (error) {
      console.error('保存抛硬币偏好失败:', error);
    }
  };

  const applyStats = (next: CoinFlipStats) => {
    statsRef.current = next;
    setStats(next);
    savePreference(STATS_STORAGE_KEY, JSON.stringify(next));
  };

  const clearFlipTimers = () => {
    if (animationTimeoutRef.current) {
      clearTimeout(animationTimeoutRef.current);
      animationTimeoutRef.current = null;
    }
    if (shakeIntervalRef.current) {
      clearInterval(shakeIntervalRef.current);
      shakeIntervalRef.current = null;
    }
  };

  // 从localStorage加载统计数据与快速模式偏好
  useEffect(() => {
    try {
      const savedStats = localStorage.getItem(STATS_STORAGE_KEY);
      const parsedStats = savedStats ? parseStats(JSON.parse(savedStats)) : null;
      if (parsedStats) {
        statsRef.current = parsedStats;
        setStats(parsedStats);
      }
      setSkipAnimation(localStorage.getItem(SKIP_ANIMATION_STORAGE_KEY) === '1');
    } catch (error) {
      console.error('加载统计数据失败:', error);
    }
  }, []);

  // 卸载时清理动画定时器
  useEffect(() => clearFlipTimers, []);

  // 初始化音频上下文
  const initAudioContext = () => {
    if (!audioContext) {
      try {
        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        setAudioContext(ctx);
        return ctx;
      } catch (error) {
        console.log('音频上下文初始化失败');
        return null;
      }
    }
    return audioContext;
  };

  // 播放音效
  const playSound = (type: 'flip' | 'result' | 'shake') => {
    if (!audioEnabled) return;

    try {
      // 初始化音频上下文
      const ctx = initAudioContext();
      if (!ctx) {
        // 如果无法创建音频上下文，使用备用方案
        playFallbackSound(type);
        return;
      }

      // 如果音频上下文被暂停，恢复它
      if (ctx.state === 'suspended') {
        ctx.resume();
      }

      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);

      if (type === 'flip') {
        // 抛硬币音效 - 快速上升的音调
        oscillator.frequency.setValueAtTime(200, ctx.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(800, ctx.currentTime + 0.1);
        oscillator.type = 'sine';
        gainNode.gain.setValueAtTime(0.1, ctx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
        oscillator.start(ctx.currentTime);
        oscillator.stop(ctx.currentTime + 0.1);
      } else if (type === 'shake') {
        // 摇动音效 - 连续的震动声
        oscillator.frequency.setValueAtTime(150, ctx.currentTime);
        oscillator.frequency.setValueAtTime(300, ctx.currentTime + 0.05);
        oscillator.frequency.setValueAtTime(150, ctx.currentTime + 0.1);
        oscillator.frequency.setValueAtTime(300, ctx.currentTime + 0.15);
        oscillator.frequency.setValueAtTime(150, ctx.currentTime + 0.2);
        oscillator.type = 'sine';
        gainNode.gain.setValueAtTime(0.08, ctx.currentTime);
        gainNode.gain.setValueAtTime(0.12, ctx.currentTime + 0.05);
        gainNode.gain.setValueAtTime(0.08, ctx.currentTime + 0.1);
        gainNode.gain.setValueAtTime(0.12, ctx.currentTime + 0.15);
        gainNode.gain.setValueAtTime(0.08, ctx.currentTime + 0.2);
        gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.25);
        oscillator.start(ctx.currentTime);
        oscillator.stop(ctx.currentTime + 0.25);
      } else {
        // 结果音效 - 清脆的叮声
        oscillator.frequency.setValueAtTime(800, ctx.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(400, ctx.currentTime + 0.2);
        oscillator.type = 'sine';
        gainNode.gain.setValueAtTime(0.15, ctx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);
        oscillator.start(ctx.currentTime);
        oscillator.stop(ctx.currentTime + 0.2);
      }
    } catch (error) {
      console.log('Web Audio API播放失败，使用备用方案');
      playFallbackSound(type);
    }
  };

  // 备用音效播放方案
  const playFallbackSound = (type: 'flip' | 'result' | 'shake') => {
    try {
      // 使用更简单的音效方案
      if (type === 'flip') {
        // 抛硬币音效 - 使用系统提示音
        const flipSound = new Audio();
        // 创建一个简单的提示音
        flipSound.src = 'data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBSuBzvLZiTYIG2m98OScTgwOUarm7blmGgU7k9n1unEiBC13yO/eizEIHWq+8+OWT';
        flipSound.volume = 0.2;
        flipSound.play().catch(() => {
          // 如果播放失败，尝试使用系统提示音
          try {
            // 尝试播放一个更简单的音效
            const simpleSound = new Audio();
            simpleSound.src = 'data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBSuBzvLZiTYIG2m98OScTgwOUarm7blmGgU7k9n1unEiBC13yO/eizEIHWq+8+OWT';
            simpleSound.volume = 0.1;
            simpleSound.play().catch(() => {
              // 最终失败，静默处理
            });
          } catch (e) {
            // 静默处理
          }
        });
      } else if (type === 'shake') {
        // 摇动音效 - 使用震动提示音
        const shakeSound = new Audio();
        shakeSound.src = 'data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBSuBzvLZiTYIG2m98OScTgwOUarm7blmGgU7k9n1unEiBC13yO/eizEIHWq+8+OWT';
        shakeSound.volume = 0.15;
        shakeSound.play().catch(() => {
          // 如果播放失败，尝试使用系统提示音
          try {
            const simpleSound = new Audio();
            simpleSound.src = 'data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBSuBzvLZiTYIG2m98OScTgwOUarm7blmGgU7k9n1unEiBC13yO/eizEIHWq+8+OWT';
            simpleSound.volume = 0.08;
            simpleSound.play().catch(() => {
              // 最终失败，静默处理
            });
          } catch (e) {
            // 静默处理
          }
        });
      } else {
        // 结果音效 - 使用不同的提示音
        const resultSound = new Audio();
        resultSound.src = 'data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBSuBzvLZiTYIG2m98OScTgwOUarm7blmGgU7k9n1unEiBC13yO/eizEIHWq+8+OWT';
        resultSound.volume = 0.2;
        resultSound.play().catch(() => {
          // 如果播放失败，尝试使用系统提示音
          try {
            const simpleSound = new Audio();
            simpleSound.src = 'data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBSuBzvLZiTYIG2m98OScTgwOUarm7blmGgU7k9n1unEiBC13yO/eizEIHWq+8+OWT';
            simpleSound.volume = 0.1;
            simpleSound.play().catch(() => {
              // 最终失败，静默处理
            });
          } catch (e) {
            // 静默处理
          }
        });
      }
    } catch (fallbackError) {
      console.log('备用音效播放也失败，已忽略');
    }
  };

  // 本地兜底随机：优先浏览器加密安全随机数，缺失时才退回 Math.random
  const generateLocalResult = (): 'heads' | 'tails' => {
    if (window.crypto?.getRandomValues) {
      const array = new Uint32Array(1);
      window.crypto.getRandomValues(array);
      const value = array[0] / 0x100000000;
      const localResult = value < 0.5 ? 'heads' : 'tails';
      setLastRandomData({
        source: 'crypto',
        method: '浏览器加密安全随机数 (Web Crypto API)',
        finalResult: value,
        result: localResult
      });
      return localResult;
    }

    const value = Math.random();
    const localResult = value < 0.5 ? 'heads' : 'tails';
    setLastRandomData({
      source: 'fallback',
      method: '降级伪随机数 (Math.random，非加密安全)',
      finalResult: value,
      result: localResult
    });
    return localResult;
  };

  // 抛硬币并获取唯一结果 ID：优先后端生成，失败时回退本地随机
  const doBackendFlip = async (): Promise<{ result: 'heads' | 'tails'; resultId: string | null }> => {
    try {
      const record = await coinFlipApi.flip();
      setLastRandomData({
        source: 'server',
        method: '服务端加密安全随机数 (Node crypto.randomInt)',
        finalResult: null,
        result: record.result,
        resultId: record.resultId
      });
      return { result: record.result, resultId: record.resultId };
    } catch (error) {
      console.log('后端抛硬币失败，回退本地随机:', error);
      return { result: generateLocalResult(), resultId: null };
    }
  };

  // 完成一次抛硬币：统一更新结果、唯一 ID、音效与本地统计
  const completeFlip = (flipResult: 'heads' | 'tails', newResultId: string | null) => {
    setResult(flipResult);
    setResultId(newResultId);
    setIsFlipping(false);
    settlingRef.current = false;
    playSound('result');

    const previous = statsRef.current;
    applyStats({
      ...previous,
      [flipResult]: previous[flipResult] + 1,
      total: previous.total + 1
    });
  };

  // 跳过动画
  const skipAnimationHandler = async () => {
    if (!isFlipping || settlingRef.current) return;

    settlingRef.current = true;
    clearFlipTimers();

    // 立即生成结果（优先后端，失败回退本地）
    const record = await doBackendFlip();
    completeFlip(record.result, record.resultId);
  };

  // 抛硬币
  const flipCoin = () => {
    if (isFlipping || settlingRef.current) return;

    // 确保音频上下文在用户交互时初始化
    if (audioEnabled && !audioContext) {
      initAudioContext();
    }

    clearFlipTimers();
    setIsFlipping(true);
    setResult(null);
    setResultId(null);
    setCopied(false);
    playSound('flip');

    // 在动画过程中播放摇动音效，定时器随动画结束一起清理
    shakeIntervalRef.current = setInterval(() => playSound('shake'), 400);

    // 动画结束后生成结果（优先后端，失败回退本地）
    animationTimeoutRef.current = setTimeout(async () => {
      settlingRef.current = true;
      clearFlipTimers();
      const record = await doBackendFlip();
      completeFlip(record.result, record.resultId);
    }, skipAnimation ? 100 : 2000); // 如果跳过动画，只等待100ms
  };

  // 重置统计数据
  const resetStats = () => {
    setImportError(null);
    applyStats({ heads: 0, tails: 0, total: 0 });
  };

  // 导出统计数据
  const exportStats = () => {
    try {
      const dataStr = JSON.stringify(stats, null, 2);
      const dataBlob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(dataBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `coin-flip-stats-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('导出统计数据失败:', error);
    }
  };

  // 导入统计数据
  const importStats = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // 清空 input，保证同一个文件可以再次选择触发 onChange
    event.target.value = '';
    if (!file) return;

    setImportError(null);
    const reader = new FileReader();
    reader.onerror = () => setImportError('读取文件失败，导入已取消。');
    reader.onload = (e) => {
      try {
        const importedStats = parseStats(JSON.parse(String(e.target?.result ?? '')));
        if (!importedStats) {
          setImportError('文件内容不符合要求：需要包含 heads 与 tails 两个非负数字。');
          return;
        }
        applyStats(importedStats);
      } catch (error) {
        console.error('导入统计数据失败:', error);
        setImportError('文件不是有效的 JSON，导入已取消。');
      }
    };
    reader.readAsText(file);
  };

  // 复制唯一结果 ID
  const copyResultId = async () => {
    if (!resultId) return;
    try {
      await navigator.clipboard.writeText(resultId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.log('复制结果 ID 失败:', error);
    }
  };

  return (
    <InfoQueryShell>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="space-y-6"
        >
          <InfoQueryHero
            eyebrow="Entertainment"
            title="抛硬币工具"
            description="简单、快速、无需下载的随机决策工具，保留动画、音效、统计和随机算法查看功能。"
            icon={FaCoins}
            tone="amber"
            meta={
              <>
                <InfoBadge tone="amber">随机决策</InfoBadge>
                <InfoBadge tone="emerald">本地统计</InfoBadge>
                <InfoBadge tone="sky">算法透明</InfoBadge>
              </>
            }
          />

          {/* 主要抛硬币区域 */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.3 }}
            className={`${coinPanelClass} p-5 sm:p-6`}
          >
            <InfoSectionTitle
              title="抛硬币"
              description="点击后生成正面或反面结果，动画过程中可直接跳过。"
              icon={FaBullseye}
              tone="amber"
            />

            {/* 硬币显示区域 */}
            <div className="mb-8 flex justify-center">
              <motion.div
                className="relative flex h-36 w-36 items-center justify-center rounded-full border-4 border-amber-200 bg-gradient-to-br from-amber-300 via-yellow-400 to-amber-600 shadow-[0_18px_50px_rgba(245,158,11,0.28)]"
                animate={isFlipping ? {
                  rotateX: [0, 360, 720, 1080, 1440],
                  rotateY: [0, 180, 360, 540, 720],
                  scale: [1, 1.1, 0.9, 1.1, 1],
                  x: [-5, 5, -5, 5, 0],
                  y: [-3, 3, -3, 3, 0]
                } : {
                  rotateX: 0,
                  rotateY: 0,
                  scale: 1,
                  x: 0,
                  y: 0
                }}
                transition={isFlipping ? {
                  duration: 2,
                  ease: "easeInOut",
                  times: [0, 0.2, 0.4, 0.6, 0.8, 1]
                } : {
                  duration: 0.3,
                  ease: "easeOut"
                }}
              >
                <motion.div
                  key={result || 'default'}
                  initial={{ opacity: 0, scale: 0.5 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.5 }}
                  transition={{ duration: 0.3 }}
                  className="text-6xl font-bold text-white drop-shadow"
                >
                  <FaCoins className="text-6xl" />
                </motion.div>
              </motion.div>
            </div>

            {/* 结果显示 */}
            <AnimatePresence mode="wait">
              {result && !isFlipping && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className="mb-6 text-center"
                >
                  <div className={`inline-flex items-center gap-2 rounded-2xl border px-6 py-3 text-lg font-semibold ${result === 'heads'
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                      : 'border-sky-200 bg-sky-50 text-sky-800'
                    }`}>
                    {result === 'heads' ? (
                      <FaCheckCircle className="text-green-600" />
                    ) : (
                      <FaTimesCircle className="text-blue-600" />
                    )}
                    结果: {result === 'heads' ? '正面' : '反面'}
                  </div>
                  {resultId && (
                    <button
                      onClick={copyResultId}
                      title="点击复制结果 ID"
                      className="mt-3 inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 font-mono text-xs text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
                    >
                      <FaCopy className="text-slate-400" />
                      ID: {resultId}
                      {copied ? (
                        <FaCheckCircle className="text-emerald-500" />
                      ) : (
                        <FaInfoCircle className="text-slate-400" />
                      )}
                    </button>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            {/* 控制按钮 */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <motion.button
                onClick={flipCoin}
                disabled={isFlipping}
                className={coinButtonClass}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <FaDice className="text-xl" />
                {isFlipping ? '抛硬币中...' : '抛硬币'}
              </motion.button>

              {isFlipping && (
                <motion.button
                  onClick={skipAnimationHandler}
                  className={coinButtonClass}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                >
                  <FaRedo className="text-lg" />
                  跳过动画
                </motion.button>
              )}

              <motion.button
                onClick={() => setAudioEnabled(!audioEnabled)}
                className={coinGhostButtonClass}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                {audioEnabled ? <FaVolumeUp className="text-lg" /> : <FaVolumeMute className="text-lg" />}
                {audioEnabled ? '关闭音效' : '开启音效'}
              </motion.button>
            </div>

            {/* 动画设置 */}
            <div className="flex justify-center mt-4">
              <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
                <input
                  type="checkbox"
                  checked={skipAnimation}
                  onChange={(e) => {
                    setSkipAnimation(e.target.checked);
                    savePreference(SKIP_ANIMATION_STORAGE_KEY, e.target.checked ? '1' : '0');
                  }}
                  className="rounded border-slate-300 text-slate-900 focus:ring-slate-400"
                />
                <span>默认跳过动画（快速模式）</span>
              </label>
            </div>
          </motion.div>

          {/* 统计信息 */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className={`${coinPanelClass} p-5 sm:p-6`}
          >
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <InfoSectionTitle
                title="统计信息"
                description="统计数据保存在本地，可导入导出。"
                icon={FaChartBar}
                tone="sky"
              />
              <div className="flex flex-wrap gap-2">
                {lastRandomData && (
                  <motion.button
                    onClick={() => setShowRandomAlgorithm(!showRandomAlgorithm)}
                    className={coinGhostButtonClass}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                  >
                    <FaCode className="text-sm" />
                    {showRandomAlgorithm ? '隐藏算法' : '查看算法'}
                  </motion.button>
                )}
                <motion.button
                  onClick={() => setShowStats(!showStats)}
                  className={coinGhostButtonClass}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  {showStats ? <FaEyeSlash className="text-sm" /> : <FaEye className="text-sm" />}
                  {showStats ? '隐藏详情' : '显示详情'}
                </motion.button>
              </div>
            </div>

            <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
              <InfoMetricCard label="正面" value={stats.heads} icon={FaCheckCircle} tone="sky" />
              <InfoMetricCard label="反面" value={stats.tails} icon={FaTimesCircle} tone="emerald" />
              <InfoMetricCard label="总计" value={stats.total} icon={FaCoins} tone="violet" />
            </div>

            {showRandomAlgorithm && lastRandomData && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="space-y-4 mb-4"
              >
                <div className={`${coinTileClass} p-4`}>
                  <h4 className="mb-3 flex items-center gap-2 font-semibold text-emerald-900">
                    <FaCode className="text-lg" />
                    随机算法详情
                  </h4>
                  <div className="space-y-3 text-sm">
                    <div className="flex justify-between gap-3">
                      <span className="text-slate-600">使用算法:</span>
                      <span className="font-mono text-right text-emerald-800">{lastRandomData.method}</span>
                    </div>
                    <div className="flex justify-between gap-3">
                      <span className="text-slate-600">结果来源:</span>
                      <span className="font-mono text-right text-emerald-800">
                        {lastRandomData.source === 'server' ? '服务端生成并已入库' : '浏览器本地生成（服务端不可用）'}
                      </span>
                    </div>
                    {lastRandomData.finalResult === null ? (
                      <div className="flex justify-between gap-3">
                        <span className="text-slate-600">结果 ID:</span>
                        <span className="font-mono text-right text-emerald-800">{lastRandomData.resultId ?? '—'}</span>
                      </div>
                    ) : (
                      <>
                        <div className="flex justify-between gap-3">
                          <span className="text-slate-600">最终随机值:</span>
                          <span className="font-mono text-emerald-800">{lastRandomData.finalResult.toFixed(6)}</span>
                        </div>
                        <div className="flex justify-between gap-3">
                          <span className="text-slate-600">判定规则:</span>
                          <span className="font-mono text-emerald-800">
                            {lastRandomData.finalResult < 0.5 ? '正面 (< 0.5)' : '反面 (≥ 0.5)'}
                          </span>
                        </div>
                      </>
                    )}
                    <div className="flex justify-between gap-3">
                      <span className="text-slate-600">本次结果:</span>
                      <span className="font-mono text-emerald-800">
                        {lastRandomData.result === 'heads' ? '正面' : '反面'}
                      </span>
                    </div>
                    {lastRandomData.source === 'fallback' && (
                      <p className="rounded-2xl border border-amber-100 bg-amber-50/80 p-3 text-xs text-amber-800">
                        当前浏览器不支持 Web Crypto API，本次结果由 Math.random() 兜底生成，不具备加密安全性。
                      </p>
                    )}
                  </div>
                </div>

                {/* 算法代码示例 */}
                <div className={`${coinTileClass} p-4`}>
                  <h4 className="mb-3 flex items-center gap-2 font-semibold text-sky-900">
                    <FaCode className="text-lg" />
                    算法实现代码
                  </h4>
                  <div className="space-y-3">
                    <div>
                      <h5 className="mb-2 font-medium text-sky-800">服务端算法（默认路径）:</h5>
                      <pre className="overflow-x-auto rounded-2xl border border-sky-100 bg-sky-50/80 p-3 font-mono text-xs text-sky-900">
                        {`// Node.js crypto，结果与唯一 ID 都在服务端生成后入库
const result = crypto.randomInt(0, 2) === 0 ? 'heads' : 'tails';
const resultId = \`flip-\${crypto.randomBytes(8).toString('hex')}\`;`}
                      </pre>
                    </div>
                    <div>
                      <h5 className="mb-2 font-medium text-sky-800">前端兜底算法（服务端不可用时）:</h5>
                      <pre className="overflow-x-auto rounded-2xl border border-sky-100 bg-sky-50/80 p-3 font-mono text-xs text-sky-900">
                        {`// 浏览器加密安全随机数
if (window.crypto?.getRandomValues) {
  const array = new Uint32Array(1);
  window.crypto.getRandomValues(array);
  const value = array[0] / 0x100000000;
  return value < 0.5 ? 'heads' : 'tails';
}

// 无 Web Crypto API 的旧浏览器：退回伪随机数
return Math.random() < 0.5 ? 'heads' : 'tails';`}
                      </pre>
                    </div>
                  </div>
                </div>

                {/* 算法原理说明 */}
                <div className={`${coinTileClass} p-4`}>
                  <h4 className="mb-3 flex items-center gap-2 font-semibold text-violet-900">
                    <FaCode className="text-lg" />
                    算法原理说明
                  </h4>
                  <div className="space-y-2 text-sm text-slate-700">
                    <div>
                      <h5 className="font-medium mb-1 flex items-center gap-2">
                        <FaShieldAlt className="text-blue-600" />
                        加密安全随机数:
                      </h5>
                      <ul className="list-disc list-inside space-y-1 text-xs">
                        <li className="flex items-center gap-1">
                          <FaCog className="text-blue-500" />
                          服务端 crypto.randomInt(0, 2) 直接取整数，无取模偏差
                        </li>
                        <li className="flex items-center gap-1">
                          <FaShieldAlt className="text-blue-500" />
                          前端兜底走 Web Crypto API，同为密码学安全随机源
                        </li>
                        <li className="flex items-center gap-1">
                          <FaRandom className="text-blue-500" />
                          熵来自操作系统随机源，不可预测、不可复现
                        </li>
                        <li className="flex items-center gap-1">
                          <FaCheckCircle className="text-blue-500" />
                          每次结果连同唯一 ID 一起落库，可事后核对
                        </li>
                      </ul>
                    </div>
                    <div>
                      <h5 className="font-medium mb-1 flex items-center gap-2">
                        <FaRandom className="text-purple-600" />
                        兜底与降级:
                      </h5>
                      <ul className="list-disc list-inside space-y-1 text-xs">
                        <li className="flex items-center gap-1">
                          <FaCog className="text-purple-500" />
                          服务端不可达时，结果改由浏览器生成，不会入库
                        </li>
                        <li className="flex items-center gap-1">
                          <FaClock className="text-purple-500" />
                          此时结果没有唯一 ID，界面也不会显示可复制的 ID
                        </li>
                        <li className="flex items-center gap-1">
                          <FaInfoCircle className="text-purple-500" />
                          仅当浏览器缺少 Web Crypto API 时才退回 Math.random()
                        </li>
                        <li className="flex items-center gap-1">
                          <FaRandom className="text-purple-500" />
                          发生降级时，上方"随机算法详情"会标注真实来源
                        </li>
                      </ul>
                    </div>
                    <div>
                      <h5 className="font-medium mb-1 flex items-center gap-2">
                        <FaCheckCircle className="text-green-600" />
                        公平性保证:
                      </h5>
                      <ul className="list-disc list-inside space-y-1 text-xs">
                        <li className="flex items-center gap-1">
                          <FaCog className="text-green-500" />
                          服务端按 0 / 1 等概率取值
                        </li>
                        <li className="flex items-center gap-1">
                          <FaBullseye className="text-green-500" />
                          前端兜底以 0.5 为界：小于 0.5 判正面
                        </li>
                        <li className="flex items-center gap-1">
                          <FaChartBar className="text-green-500" />
                          理论上正反面概率各为 50%
                        </li>
                        <li className="flex items-center gap-1">
                          <FaEye className="text-green-500" />
                          算法完全透明，可验证公平性
                        </li>
                      </ul>
                    </div>
                  </div>
                </div>

                <div className={`${coinTileClass} p-4`}>
                  <div className="flex items-start gap-2 text-xs text-slate-600">
                    <FaInfoCircle className="text-blue-500 mt-0.5 flex-shrink-0" />
                    <p><strong>注意:</strong> 上方展示的就是本次结果的真实来源。前端兜底路径可在浏览器开发者工具中复核；服务端路径可用结果 ID 在记录中核对。</p>
                  </div>
                </div>
              </motion.div>
            )}

            {showStats && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="space-y-4"
              >
                {stats.total > 0 && (
                  <div className={`${coinTileClass} p-4`}>
                    <h4 className="mb-2 font-semibold text-slate-900">概率分析</h4>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span>正面概率:</span>
                        <span className="font-medium">{(stats.heads / stats.total * 100).toFixed(1)}%</span>
                      </div>
                      <div className="flex justify-between">
                        <span>反面概率:</span>
                        <span className="font-medium">{(stats.tails / stats.total * 100).toFixed(1)}%</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* 数据管理 */}
                <div className="flex flex-col sm:flex-row gap-3">
                  <motion.button
                    onClick={exportStats}
                    className={coinGhostButtonClass}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    <FaDownload />
                    导出数据
                  </motion.button>

                  <label className={`${coinGhostButtonClass} cursor-pointer`}>
                    <FaUpload />
                    导入数据
                    <input
                      type="file"
                      accept=".json"
                      onChange={importStats}
                      className="hidden"
                    />
                  </label>

                  <motion.button
                    onClick={resetStats}
                    className="inline-flex items-center justify-center gap-2 rounded-2xl border border-rose-200 bg-rose-50/80 px-4 py-2.5 text-sm font-semibold text-rose-700 transition hover:border-rose-300 hover:bg-rose-100"
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    <FaRedo />
                    重置统计
                  </motion.button>
                </div>

                {importError && (
                  <p className="rounded-2xl border border-rose-200 bg-rose-50/80 p-3 text-xs text-rose-700">
                    {importError}
                  </p>
                )}
              </motion.div>
            )}
          </motion.div>

          {/* 使用说明 */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className={`${coinPanelClass} p-5 sm:p-6`}
          >
            <InfoSectionTitle
              title="使用说明"
              description="常用操作入口保留在主面板内，这里只列出关键行为。"
              icon={FaLightbulb}
              tone="amber"
            />
            <div className="grid gap-3 text-sm text-slate-600 md:grid-cols-2">
              <div className="flex items-start gap-3">
                <FaPlay className="text-blue-500 mt-0.5 flex-shrink-0" />
                <span>点击"抛硬币"按钮开始随机抛硬币</span>
              </div>
              <div className="flex items-start gap-3">
                <FaClock className="text-blue-500 mt-0.5 flex-shrink-0" />
                <span>等待动画完成后查看结果</span>
              </div>
              <div className="flex items-start gap-3">
                <FaChartBar className="text-blue-500 mt-0.5 flex-shrink-0" />
                <span>系统会自动记录每次抛硬币的结果</span>
              </div>
              <div className="flex items-start gap-3">
                <FaDownload className="text-blue-500 mt-0.5 flex-shrink-0" />
                <span>可以导出或导入统计数据</span>
              </div>
              <div className="flex items-start gap-3">
                <FaCode className="text-blue-500 mt-0.5 flex-shrink-0" />
                <span>点击"查看算法"可以查看随机数生成过程</span>
              </div>
              <div className="flex items-start gap-3">
                <FaShieldAlt className="text-blue-500 mt-0.5 flex-shrink-0" />
                <span>使用加密安全随机数确保结果完全随机</span>
              </div>
              <div className="flex items-start gap-3">
                <FaPause className="text-blue-500 mt-0.5 flex-shrink-0" />
                <span>动画过程中可以点击"跳过动画"立即查看结果</span>
              </div>
              <div className="flex items-start gap-3">
                <FaCog className="text-blue-500 mt-0.5 flex-shrink-0" />
                <span>勾选"快速模式"可以默认跳过动画</span>
              </div>
            </div>
          </motion.div>
        </motion.div>
    </InfoQueryShell>
  );
};

export default CoinFlip;
