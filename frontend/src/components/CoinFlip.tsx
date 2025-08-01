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
  FaEyeSlash
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

  // 保存统计数据到localStorage
  const saveStats = (newStats: CoinFlipStats) => {
    try {
      localStorage.setItem('coin-flip-stats', JSON.stringify(newStats));
    } catch (error) {
      console.error('保存统计数据失败:', error);
    }
  };

  // 播放音效
  const playSound = (type: 'flip' | 'result') => {
    if (!audioEnabled) return;
    
    try {
      const audio = new Audio();
      if (type === 'flip') {
        audio.src = 'data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBSuBzvLZiTYIG2m98OScTgwOUarm7blmGgU7k9n1unEiBC13yO/eizEIHWq+8+OWT';
      } else {
        audio.src = 'data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBSuBzvLZiTYIG2m98OScTgwOUarm7blmGgU7k9n1unEiBC13yO/eizEIHWq+8+OWT';
      }
      audio.volume = 0.3;
      audio.play().catch(() => {
        // 忽略音频播放错误
      });
    } catch (error) {
      // 忽略音频错误
    }
  };

  // 抛硬币
  const flipCoin = () => {
    if (isFlipping) return;

    setIsFlipping(true);
    setResult(null);
    playSound('flip');

    // 模拟抛硬币动画
    setTimeout(() => {
      const newResult = Math.random() < 0.5 ? 'heads' : 'tails';
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
    }, 2000);
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
              scale: [1, 1.1, 1, 1.1, 1]
            } : {}}
            transition={isFlipping ? {
              duration: 2,
              ease: "easeInOut"
            } : {}}
          >
            <AnimatePresence mode="wait">
              {result && !isFlipping && (
                <motion.div
                  key={result}
                  initial={{ opacity: 0, scale: 0.5 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.5 }}
                  className="text-6xl font-bold text-white"
                >
                  <FaCoins className="text-6xl" />
                </motion.div>
              )}
            </AnimatePresence>
            
            {!result && !isFlipping && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-6xl font-bold text-white"
              >
                <FaCoins className="text-6xl" />
              </motion.div>
            )}
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
              <div className={`inline-block px-6 py-3 rounded-lg text-lg font-semibold ${
                result === 'heads' 
                  ? 'bg-green-100 text-green-800 border border-green-200' 
                  : 'bg-blue-100 text-blue-800 border border-blue-200'
              }`}>
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
            <span className="text-blue-500 font-bold">1.</span>
            <span>点击"抛硬币"按钮开始随机抛硬币</span>
          </div>
          <div className="flex items-start gap-3">
            <span className="text-blue-500 font-bold">2.</span>
            <span>等待动画完成后查看结果</span>
          </div>
          <div className="flex items-start gap-3">
            <span className="text-blue-500 font-bold">3.</span>
            <span>系统会自动记录每次抛硬币的结果</span>
          </div>
          <div className="flex items-start gap-3">
            <span className="text-blue-500 font-bold">4.</span>
            <span>可以导出或导入统计数据</span>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};

export default CoinFlip; 