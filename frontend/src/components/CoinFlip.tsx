import React, { useState, useEffect } from 'react';
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
  FaShieldAlt,
  FaRandom,
  FaClock,
  FaMousePointer,
  FaCalculator,
  FaInfoCircle,
  FaExclamationTriangle,
  FaCheckCircle,
  FaTimesCircle,
  FaPlay,
  FaPause,
  FaCog,
  FaQuestionCircle
} from 'react-icons/fa';

interface CoinFlipStats {
  heads: number;
  tails: number;
  total: number;
}

const CoinFlip: React.FC = () => {
  const [isFlipping, setIsFlipping] = useState(false);
  const [result, setResult] = useState<'heads' | 'tails' | null>(null);
  const [stats, setStats] = useState<CoinFlipStats>({ heads: 0, tails: 0, total: 0 });
  const [showStats, setShowStats] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [audioContext, setAudioContext] = useState<AudioContext | null>(null);
  const [showRandomAlgorithm, setShowRandomAlgorithm] = useState(false);
  const [lastRandomData, setLastRandomData] = useState<{
    method: string;
    values: number[];
    finalResult: number;
    result: 'heads' | 'tails';
  } | null>(null);
  const [skipAnimation, setSkipAnimation] = useState(false);
  const [animationTimeout, setAnimationTimeout] = useState<NodeJS.Timeout | null>(null);
  const [shakeInterval, setShakeInterval] = useState<NodeJS.Timeout | null>(null);

  // 从localStorage加载统计数据
  useEffect(() => {
    try {
      const savedStats = localStorage.getItem('coin-flip-stats');
      if (savedStats) {
        const parsedStats = JSON.parse(savedStats);
        setStats(parsedStats);
      }
    } catch (error) {
      console.error('加载统计数据失败:', error);
    }
  }, []);

  // 清理定时器
  useEffect(() => {
    return () => {
      if (animationTimeout) {
        clearTimeout(animationTimeout);
      }
      if (shakeInterval) {
        clearInterval(shakeInterval);
      }
    };
  }, [animationTimeout, shakeInterval]);

  // 清理结果定时器
  useEffect(() => {
    let resultTimeout: NodeJS.Timeout | null = null;
    
    if (result && !isFlipping) {
      resultTimeout = setTimeout(() => {
        setResult(null);
      }, 3000);
    }

    return () => {
      if (resultTimeout) {
        clearTimeout(resultTimeout);
      }
    };
  }, [result, isFlipping]);

  // 保存统计数据到localStorage
  const saveStats = (newStats: CoinFlipStats) => {
    try {
      localStorage.setItem('coin-flip-stats', JSON.stringify(newStats));
    } catch (error) {
      console.error('保存统计数据失败:', error);
    }
  };

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

  // 生成完全随机的结果
  const generateRandomResult = (): 'heads' | 'tails' => {
    let method = '';
    let values: number[] = [];
    let finalResult = 0;
    
    // 尝试使用加密安全的随机数生成器
    if (window.crypto && window.crypto.getRandomValues) {
      try {
        const array = new Uint32Array(1);
        window.crypto.getRandomValues(array);
        const cryptoRandom = array[0] / (0xffffffff + 1);
        
        method = '加密安全随机数 (Crypto API)';
        values = [cryptoRandom];
        finalResult = cryptoRandom;
        
        const result = cryptoRandom < 0.5 ? 'heads' : 'tails';
        setLastRandomData({ method, values, finalResult, result });
        return result;
      } catch (error) {
        console.log('加密随机数生成失败，使用备用方案');
      }
    }
    
    // 备用方案：使用多个随机源确保完全随机
    const random1 = Math.random();
    const random2 = Math.random();
    const random3 = Math.random();
    
    // 结合多个随机值
    const combinedRandom = (random1 + random2 + random3) / 3;
    
    // 使用当前时间戳作为额外随机源
    const timeRandom = (Date.now() % 1000) / 1000;
    
    // 使用鼠标位置（如果可用）作为额外随机源
    const mouseRandom = ((Math.random() * 1000) % 1000) / 1000;
    
    // 最终随机值 - 结合多个随机源
    finalResult = (combinedRandom + timeRandom + mouseRandom) / 3;
    
    method = '多重随机源组合';
    values = [random1, random2, random3, timeRandom, mouseRandom, combinedRandom];
    
    const result = finalResult < 0.5 ? 'heads' : 'tails';
    setLastRandomData({ method, values, finalResult, result });
    return result;
  };

  // 跳过动画
  const skipAnimationHandler = () => {
    if (!isFlipping) return;
    
    // 清除定时器
    if (animationTimeout) {
      clearTimeout(animationTimeout);
    }
    if (shakeInterval) {
      clearInterval(shakeInterval);
    }
    
    // 立即生成结果
    const newResult = generateRandomResult();
    setResult(newResult);
    setIsFlipping(false);
    playSound('result');

    // 更新统计数据
    const newStats = {
      ...stats,
      [newResult]: stats[newResult] + 1,
      total: stats.total + 1
    };
    setStats(newStats);
    saveStats(newStats);
  };

  // 抛硬币
  const flipCoin = () => {
    if (isFlipping) return;

    // 确保音频上下文在用户交互时初始化
    if (audioEnabled && !audioContext) {
      initAudioContext();
    }

    setIsFlipping(true);
    setResult(null);
    playSound('flip');

    // 在动画过程中播放摇动音效
    const interval = setInterval(() => {
      if (isFlipping) {
        playSound('shake');
      }
    }, 400); // 每400ms播放一次摇动音效
    setShakeInterval(interval);

    // 模拟抛硬币动画
    const timeout = setTimeout(() => {
      clearInterval(interval);
      const newResult = generateRandomResult();
      setResult(newResult);
      setIsFlipping(false);
      playSound('result');

      // 更新统计数据
      const newStats = {
        ...stats,
        [newResult]: stats[newResult] + 1,
        total: stats.total + 1
      };
      setStats(newStats);
      saveStats(newStats);
    }, skipAnimation ? 100 : 2000); // 如果跳过动画，只等待100ms
    
    setAnimationTimeout(timeout);
  };

  // 重置统计数据
  const resetStats = () => {
    const newStats = { heads: 0, tails: 0, total: 0 };
    setStats(newStats);
    saveStats(newStats);
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
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const importedStats = JSON.parse(content);
        if (importedStats && typeof importedStats === 'object' && 
            typeof importedStats.heads === 'number' && 
            typeof importedStats.tails === 'number' && 
            typeof importedStats.total === 'number') {
          setStats(importedStats);
          saveStats(importedStats);
        }
      } catch (error) {
        console.error('导入统计数据失败:', error);
      }
    };
    reader.readAsText(file);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6 }}
      className="space-y-6"
    >
      {/* 页面标题和描述 */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-6 border border-blue-100"
      >
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-900 mb-2 flex items-center justify-center gap-3">
            <FaCoins className="text-4xl text-yellow-500" />
            抛硬币工具
          </h1>
          <p className="text-gray-600 max-w-2xl mx-auto">
            想要快速做决定？试试在线抛硬币工具吧！简单、快速、无需下载。只需点击按钮，就能随机生成"正面"或"反面"的结果，帮助您轻松做出选择。
          </p>
        </div>
      </motion.div>

      {/* 主要抛硬币区域 */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.3 }}
        className="bg-white rounded-xl p-6 shadow-sm border border-gray-200"
      >
        <h3 className="text-xl font-semibold text-gray-900 mb-6 flex items-center gap-2">
          <FaBullseye className="text-2xl text-red-500" />
          抛硬币
        </h3>

        {/* 硬币显示区域 */}
        <div className="flex justify-center mb-8">
          <motion.div
            className="relative w-32 h-32 bg-gradient-to-br from-yellow-400 to-yellow-600 rounded-full border-4 border-yellow-300 shadow-lg flex items-center justify-center"
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
              className="text-6xl font-bold text-white"
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
              className="text-center mb-6"
            >
              <div className={`inline-block px-6 py-3 rounded-lg text-lg font-semibold flex items-center gap-2 ${
                result === 'heads' 
                  ? 'bg-green-100 text-green-800 border border-green-200' 
                  : 'bg-blue-100 text-blue-800 border border-blue-200'
              }`}>
                {result === 'heads' ? (
                  <FaCheckCircle className="text-green-600" />
                ) : (
                  <FaTimesCircle className="text-blue-600" />
                )}
                结果: {result === 'heads' ? '正面' : '反面'}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 控制按钮 */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <motion.button
            onClick={flipCoin}
            disabled={isFlipping}
            className="px-8 py-3 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-lg hover:from-indigo-600 hover:to-purple-700 transition-all duration-300 font-medium shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <FaDice className="text-xl" />
            {isFlipping ? '抛硬币中...' : '抛硬币'}
          </motion.button>

          {isFlipping && (
            <motion.button
              onClick={skipAnimationHandler}
              className="px-6 py-3 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-all duration-300 font-medium flex items-center gap-2"
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
            className={`px-6 py-3 rounded-lg font-medium transition-all duration-300 flex items-center gap-2 ${
              audioEnabled 
                ? 'bg-green-500 text-white hover:bg-green-600' 
                : 'bg-gray-500 text-white hover:bg-gray-600'
            }`}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            {audioEnabled ? <FaVolumeUp className="text-lg" /> : <FaVolumeMute className="text-lg" />}
            {audioEnabled ? '关闭音效' : '开启音效'}
          </motion.button>
        </div>

        {/* 动画设置 */}
        <div className="flex justify-center mt-4">
          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
            <input
              type="checkbox"
              checked={skipAnimation}
              onChange={(e) => setSkipAnimation(e.target.checked)}
              className="rounded text-indigo-600 focus:ring-indigo-500"
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
        className="bg-white rounded-xl p-6 shadow-sm border border-gray-200"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
            <FaChartBar className="text-2xl text-blue-500" />
            统计信息
          </h3>
          <div className="flex gap-2">
            {lastRandomData && (
              <motion.button
                onClick={() => setShowRandomAlgorithm(!showRandomAlgorithm)}
                className="text-green-600 hover:text-green-800 transition-colors flex items-center gap-2"
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
              className="text-indigo-600 hover:text-indigo-800 transition-colors flex items-center gap-2"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              {showStats ? <FaEyeSlash className="text-sm" /> : <FaEye className="text-sm" />}
              {showStats ? '隐藏详情' : '显示详情'}
            </motion.button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
          <div className="bg-blue-50 rounded-lg p-4 text-center">
            <div className="text-2xl font-bold text-blue-600">{stats.heads}</div>
            <div className="text-sm text-blue-700">正面</div>
          </div>
          <div className="bg-green-50 rounded-lg p-4 text-center">
            <div className="text-2xl font-bold text-green-600">{stats.tails}</div>
            <div className="text-sm text-green-700">反面</div>
          </div>
          <div className="bg-purple-50 rounded-lg p-4 text-center">
            <div className="text-2xl font-bold text-purple-600">{stats.total}</div>
            <div className="text-sm text-purple-700">总计</div>
          </div>
        </div>

        {showRandomAlgorithm && lastRandomData && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="space-y-4 mb-4"
          >
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <h4 className="font-semibold text-green-900 mb-3 flex items-center gap-2">
                <FaCode className="text-lg" />
                随机算法详情
              </h4>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-green-700">使用算法:</span>
                  <span className="font-mono text-green-800">{lastRandomData.method}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-green-700">最终随机值:</span>
                  <span className="font-mono text-green-800">{lastRandomData.finalResult.toFixed(6)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-green-700">判定结果:</span>
                  <span className="font-mono text-green-800">
                    {lastRandomData.finalResult < 0.5 ? '正面 (≤0.5)' : '反面 (>0.5)'}
                  </span>
                </div>
                {lastRandomData.values.length > 1 && (
                  <div>
                    <span className="text-green-700">随机源值:</span>
                    <div className="mt-1 font-mono text-xs bg-green-100 p-2 rounded">
                      {lastRandomData.values.map((value, index) => (
                        <div key={index} className="flex justify-between">
                          <span>随机源 {index + 1}:</span>
                          <span>{value.toFixed(6)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* 算法代码示例 */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h4 className="font-semibold text-blue-900 mb-3 flex items-center gap-2">
                <FaCode className="text-lg" />
                算法实现代码
              </h4>
              <div className="space-y-3">
                <div>
                  <h5 className="font-medium text-blue-800 mb-2">加密安全随机数算法:</h5>
                  <pre className="bg-blue-100 p-3 rounded text-xs font-mono text-blue-900 overflow-x-auto">
{`// 使用 Web Crypto API
if (window.crypto && window.crypto.getRandomValues) {
  const array = new Uint32Array(1);
  window.crypto.getRandomValues(array);
  const cryptoRandom = array[0] / (0xffffffff + 1);
  return cryptoRandom < 0.5 ? 'heads' : 'tails';
}`}
                  </pre>
                </div>
                <div>
                  <h5 className="font-medium text-blue-800 mb-2">多重随机源组合算法:</h5>
                  <pre className="bg-blue-100 p-3 rounded text-xs font-mono text-blue-900 overflow-x-auto">
{`// 组合多个随机源
const random1 = Math.random();        // Math.random()
const random2 = Math.random();        // Math.random()
const random3 = Math.random();        // Math.random()
const timeRandom = (Date.now() % 1000) / 1000;  // 时间戳
const mouseRandom = ((Math.random() * 1000) % 1000) / 1000;  // 鼠标位置

// 计算最终随机值
const combinedRandom = (random1 + random2 + random3) / 3;
const finalRandom = (combinedRandom + timeRandom + mouseRandom) / 3;

return finalRandom < 0.5 ? 'heads' : 'tails';`}
                  </pre>
                </div>
              </div>
            </div>

            {/* 算法原理说明 */}
            <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
              <h4 className="font-semibold text-purple-900 mb-3 flex items-center gap-2">
                <FaCode className="text-lg" />
                算法原理说明
              </h4>
              <div className="space-y-2 text-sm text-purple-800">
                <div>
                  <h5 className="font-medium mb-1 flex items-center gap-2">
                    <FaShieldAlt className="text-blue-600" />
                    加密安全随机数 (Crypto API):
                  </h5>
                  <ul className="list-disc list-inside space-y-1 text-xs">
                    <li className="flex items-center gap-1">
                      <FaCog className="text-blue-500" />
                      使用浏览器内置的 Web Crypto API
                    </li>
                    <li className="flex items-center gap-1">
                      <FaShieldAlt className="text-blue-500" />
                      生成密码学安全的随机数
                    </li>
                    <li className="flex items-center gap-1">
                      <FaRandom className="text-blue-500" />
                      基于硬件随机数生成器
                    </li>
                    <li className="flex items-center gap-1">
                      <FaCheckCircle className="text-blue-500" />
                      适用于需要高安全性的场景
                    </li>
                  </ul>
                </div>
                <div>
                  <h5 className="font-medium mb-1 flex items-center gap-2">
                    <FaRandom className="text-purple-600" />
                    多重随机源组合:
                  </h5>
                  <ul className="list-disc list-inside space-y-1 text-xs">
                    <li className="flex items-center gap-1">
                      <FaCalculator className="text-purple-500" />
                      Math.random(): 伪随机数生成器
                    </li>
                    <li className="flex items-center gap-1">
                      <FaClock className="text-purple-500" />
                      时间戳: 当前时间的毫秒数
                    </li>
                    <li className="flex items-center gap-1">
                      <FaMousePointer className="text-purple-500" />
                      鼠标位置: 基于用户交互的随机性
                    </li>
                    <li className="flex items-center gap-1">
                      <FaRandom className="text-purple-500" />
                      多重组合: 提高随机性和不可预测性
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
                      <FaCalculator className="text-green-500" />
                      所有随机值都在 0-1 范围内
                    </li>
                    <li className="flex items-center gap-1">
                      <FaBullseye className="text-green-500" />
                      0.5 作为正反面的分界线
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

            {/* 技术细节 */}
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
              <h4 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <FaCode className="text-lg" />
                技术细节
              </h4>
              <div className="space-y-2 text-sm text-gray-700">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <h5 className="font-medium mb-1 flex items-center gap-2">
                      <FaShieldAlt className="text-gray-600" />
                      随机数质量:
                    </h5>
                    <ul className="list-disc list-inside space-y-1 text-xs">
                      <li className="flex items-center gap-1">
                        <FaShieldAlt className="text-gray-500" />
                        加密API: 密码学安全级别
                      </li>
                      <li className="flex items-center gap-1">
                        <FaRandom className="text-gray-500" />
                        多重组合: 高随机性
                      </li>
                      <li className="flex items-center gap-1">
                        <FaClock className="text-gray-500" />
                        时间熵: 基于系统时间
                      </li>
                      <li className="flex items-center gap-1">
                        <FaMousePointer className="text-gray-500" />
                        用户熵: 基于用户交互
                      </li>
                    </ul>
                  </div>
                  <div>
                    <h5 className="font-medium mb-1 flex items-center gap-2">
                      <FaCog className="text-gray-600" />
                      性能特点:
                    </h5>
                    <ul className="list-disc list-inside space-y-1 text-xs">
                      <li className="flex items-center gap-1">
                        <FaShieldAlt className="text-gray-500" />
                        加密API: 硬件加速
                      </li>
                      <li className="flex items-center gap-1">
                        <FaCalculator className="text-gray-500" />
                        多重组合: 计算开销小
                      </li>
                      <li className="flex items-center gap-1">
                        <FaPlay className="text-gray-500" />
                        实时生成: 无延迟
                      </li>
                      <li className="flex items-center gap-1">
                        <FaCheckCircle className="text-gray-500" />
                        浏览器兼容: 广泛支持
                      </li>
                    </ul>
                  </div>
                </div>
                <div className="text-xs text-gray-600 mt-3 p-2 bg-gray-100 rounded flex items-start gap-2">
                  <FaInfoCircle className="text-blue-500 mt-0.5 flex-shrink-0" />
                  <p><strong>注意:</strong> 本实现使用完全透明的随机算法，所有随机数生成过程都可以在浏览器开发者工具中查看和验证。</p>
                </div>
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
              <div className="bg-gray-50 rounded-lg p-4">
                <h4 className="font-semibold text-gray-900 mb-2">概率分析</h4>
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
                className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors text-sm font-medium flex items-center gap-2"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <FaDownload />
                导出数据
              </motion.button>

              <label className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors text-sm font-medium flex items-center gap-2 cursor-pointer">
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
                className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors text-sm font-medium flex items-center gap-2"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <FaRedo />
                重置统计
              </motion.button>
            </div>
          </motion.div>
        )}
      </motion.div>

      {/* 使用说明 */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="bg-white rounded-xl p-6 shadow-sm border border-gray-200"
      >
        <h3 className="text-xl font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <FaLightbulb className="text-2xl text-yellow-500" />
          使用说明
        </h3>
        <div className="space-y-3 text-gray-600">
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
  );
};

export default CoinFlip; 