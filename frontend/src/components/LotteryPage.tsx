import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLottery } from '../hooks/useLottery';
import { useAuth } from '../hooks/useAuth';
import { LotteryRound, LotteryWinner } from '../types/lottery';
import { formatDistanceToNow } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { useNotification } from './Notification';
import getApiBaseUrl, { getApiBaseUrl as namedGetApiBaseUrl } from '../api';
import { TurnstileWidget } from './TurnstileWidget';
import { useTurnstileConfig } from '../hooks/useTurnstileConfig';
import { 
  FaLink, 
  FaChartBar, 
  FaTrophy, 
  FaUsers, 
  FaCrosshairs, 
  FaDice,
  FaGift,
  FaCrown,
  FaMedal,
  FaCheckCircle,
  FaExclamationTriangle
} from 'react-icons/fa';

// 区块链数据展示组件
const BlockchainDisplay: React.FC<{ data: any }> = ({ data }) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.6 }}
    className="bg-white rounded-xl p-6 shadow-sm border border-gray-200"
  >
    <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
          <FaLink className="text-lg text-blue-500" />
          区块链数据
        </h3>
    </div>
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <div className="text-center p-3 bg-blue-50 rounded-lg">
        <div className="text-2xl font-bold text-blue-700">{data.height.toLocaleString()}</div>
        <div className="text-sm text-gray-600">区块高度</div>
      </div>
      <div className="text-center p-3 bg-green-50 rounded-lg">
        <div className="text-sm font-mono truncate text-green-700">{data.hash.substring(0, 8)}...</div>
        <div className="text-sm text-gray-600">区块哈希</div>
      </div>
      <div className="text-center p-3 bg-purple-50 rounded-lg">
        <div className="text-lg font-bold text-purple-700">{new Date(data.timestamp).toLocaleTimeString()}</div>
        <div className="text-sm text-gray-600">时间戳</div>
      </div>
      <div className="text-center p-3 bg-orange-50 rounded-lg">
        <div className="text-lg font-bold text-orange-700">{data.difficulty.toFixed(2)}</div>
        <div className="text-sm text-gray-600">难度值</div>
      </div>
    </div>
  </motion.div>
);

// 奖品展示组件
const PrizeDisplay: React.FC<{ prize: any }> = ({ prize }) => {
  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'legendary': return 'bg-yellow-50 border-yellow-200 text-yellow-800';
      case 'epic': return 'bg-purple-50 border-purple-200 text-purple-800';
      case 'rare': return 'bg-blue-50 border-blue-200 text-blue-800';
      default: return 'bg-gray-50 border-gray-200 text-gray-800';
    }
  };

  return (
    <motion.div
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      className={`border-2 rounded-lg p-3 shadow-sm ${getCategoryColor(prize.category)}`}
    >
      <div className="text-center">
        <h4 className="font-semibold text-sm">{prize.name}</h4>
        <p className="text-xs opacity-80 mt-1">{prize.description}</p>
        <div className="mt-2">
          <span className="text-lg font-bold">¥{prize.value}</span>
        </div>
        <div className="mt-1 text-xs opacity-70">
          概率: {(prize.probability * 100).toFixed(2)}% | 剩余: {prize.remaining}/{prize.quantity}
        </div>
      </div>
    </motion.div>
  );
};

// 抽奖轮次卡片组件
const LotteryRoundCard: React.FC<{ 
  round: LotteryRound; 
  onParticipate: (roundId: string, cfToken?: string) => void;
  loading: boolean;
  turnstileVerified?: boolean;
  turnstileToken?: string;
  isAdmin?: boolean;
  turnstileConfig?: any;
  turnstileConfigLoading?: boolean;
  onTurnstileVerify?: (token: string) => void;
  onTurnstileExpire?: () => void;
  onTurnstileError?: () => void;
}> = ({ 
  round, 
  onParticipate, 
  loading, 
  turnstileVerified = false,
  turnstileToken = '',
  isAdmin = false,
  turnstileConfig,
  turnstileConfigLoading = false,
  onTurnstileVerify,
  onTurnstileExpire,
  onTurnstileError
}) => {
  const { user } = useAuth();
  const hasParticipated = round.participants.includes(user?.id || '');
  const isActive = round.isActive && Date.now() >= round.startTime && Date.now() <= round.endTime;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6 }}
      className="bg-white rounded-xl p-6 shadow-sm border border-gray-200"
      whileHover={{ scale: 1.02, y: -2, boxShadow: '0 8px 32px 0 rgba(0,0,0,0.12)' }}
      whileTap={{ scale: 0.98 }}
    >
      <div className="flex justify-between items-start mb-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-800">{round.name}</h3>
          <p className="text-gray-600 mt-1">{round.description}</p>
        </div>
        <div className={`px-3 py-1 rounded-full text-sm font-medium ${
          isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
        }`}>
          {isActive ? '进行中' : '已结束'}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div className="text-sm text-gray-600">
          <div>开始时间: {new Date(round.startTime).toLocaleString()}</div>
          <div>结束时间: {new Date(round.endTime).toLocaleString()}</div>
        </div>
        <div className="text-sm text-gray-600">
          <div>参与人数: {round.participants.length}</div>
          <div>中奖人数: {round.winners.length}</div>
        </div>
      </div>

      <div className="mb-4">
        <h4 className="font-semibold text-gray-700 mb-2">奖品列表</h4>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {round.prizes.slice(0, 6).map((prize) => (
            <PrizeDisplay key={prize.id} prize={prize} />
          ))}
        </div>
      </div>

      <div className="flex justify-between items-center">
        <div className="text-sm text-gray-500">
          区块链高度: {round.blockchainHeight.toLocaleString()}
        </div>
        {user && (
          <div className="flex flex-col gap-2">
            <motion.button
              onClick={() => onParticipate(round.id, turnstileToken)}
              disabled={!isActive || hasParticipated || loading || (!isAdmin && !!turnstileConfig?.siteKey && !turnstileVerified)}
              className={`px-6 py-2 rounded-lg font-medium transition-colors ${
                !isActive || hasParticipated || loading || (!isAdmin && !!turnstileConfig?.siteKey && !turnstileVerified)
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : 'bg-blue-500 text-white hover:bg-blue-600'
              }`}
              whileTap={{ scale: 0.95 }}
            >
              {loading ? '抽奖中...' : hasParticipated ? '已参与' : '立即参与'}
            </motion.button>
            
            {/* Turnstile 验证组件（非管理员用户） */}
            {!isAdmin && !turnstileConfigLoading && turnstileConfig?.siteKey && typeof turnstileConfig.siteKey === 'string' && (
              <div className="mt-2">
                <div className="flex items-center gap-2 mb-2">
                  {turnstileVerified ? (
                    <>
                      <FaCheckCircle className="w-4 h-4 text-green-500" />
                      <span className="text-sm text-green-600 font-medium">已完成</span>
                    </>
                  ) : (
                    <>
                      <FaExclamationTriangle className="w-4 h-4 text-yellow-500" />
                      <span className="text-sm text-gray-600">请完成人机验证</span>
                    </>
                  )}
                </div>
                <TurnstileWidget
                  siteKey={turnstileConfig.siteKey}
                  onVerify={onTurnstileVerify || (() => {})}
                  onExpire={onTurnstileExpire || (() => {})}
                  onError={onTurnstileError || (() => {})}
                  theme="light"
                  size="normal"
                />
              </div>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
};

// 用户记录组件
const UserRecordCard: React.FC<{ record: any }> = ({ record }) => {
  // 防御性处理，确保 record 存在且 history 为数组
  if (!record || typeof record !== 'object') {
    return (
      <motion.div 
        className="bg-white rounded-xl p-6 shadow-sm border border-gray-200 text-center"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
      >
        <h3 className="text-lg font-semibold text-gray-800 mb-4">我的抽奖记录</h3>
        <div className="text-gray-400">暂无抽奖记录</div>
      </motion.div>
    );
  }
  const safeHistory = Array.isArray(record.history) ? record.history : [];
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6 }}
      className="bg-white rounded-xl p-6 shadow-sm border border-gray-200"
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
          <FaChartBar className="text-lg text-blue-500" />
          我的抽奖记录
        </h3>
        </div>
      
      {/* 统计信息 */}
      <motion.div 
        className="bg-blue-50 rounded-lg p-3 mb-4 text-left"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <span className="text-xl font-bold text-blue-700">{record.participationCount}</span>
        <span className="ml-2 text-sm text-gray-600">参与次数</span>
      </motion.div>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="text-left p-3 bg-green-50 rounded-lg">
          <div className="text-2xl font-bold text-green-700">{record.winCount}</div>
          <div className="text-sm text-gray-600">中奖次数</div>
        </div>
        <div className="text-left p-3 bg-purple-50 rounded-lg">
          <div className="text-2xl font-bold text-purple-700">¥{record.totalValue}</div>
          <div className="text-sm text-gray-600">总价值</div>
        </div>
        <div className="text-left p-3 bg-orange-50 rounded-lg">
          <div className="text-2xl font-bold text-orange-700">
            {record.participationCount > 0 ? ((record.winCount / record.participationCount) * 100).toFixed(1) : 0}%
          </div>
          <div className="text-sm text-gray-600">中奖率</div>
        </div>
      </div>
      
      {/* 历史记录 */}
      {safeHistory.length > 0 && (
        <div>
          <h4 className="text-md font-semibold text-blue-700 mb-3">最近中奖记录</h4>
          <div className="space-y-2">
            {safeHistory.slice(0, 5).map((item: any, index: number) => (
              <motion.div 
                key={index} 
                className="text-sm flex items-center gap-2 p-2 hover:bg-gray-50 rounded-lg"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.3, delay: 0.1 * index }}
                whileHover={{ scale: 1.02, x: 5 }}
              >
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-gray-900 truncate">{item.prizeName}</div>
                  <div className="text-xs text-gray-500">
                    {formatDistanceToNow(item.drawTime, { addSuffix: true, locale: zhCN })}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-bold text-green-600">¥{item.value}</div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      )}
    </motion.div>
  );
};

// 排行榜组件
const LeaderboardCard: React.FC<{ leaderboard: any[] }> = ({ leaderboard }) => {
  // 修复：防御性处理，确保 leaderboard 一定为数组
  const safeLeaderboard = Array.isArray(leaderboard) ? leaderboard : [];
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6 }}
      className="bg-white rounded-xl p-6 shadow-sm border border-gray-200"
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
          <FaTrophy className="text-lg text-yellow-500" />
          排行榜
        </h3>
      </div>
      
      <div className="space-y-2">
        {safeLeaderboard.length === 0 ? (
          <motion.div
            className="text-center text-gray-400 py-8"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
          >
            暂无排行榜数据
          </motion.div>
        ) : (
          safeLeaderboard.map((user, index) => (
            <motion.div
              key={user.userId}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3, delay: 0.1 * index }}
              className="text-sm flex items-center gap-2 p-2 hover:bg-gray-50 rounded-lg"
              whileHover={{ scale: 1.02, x: -5 }}
          >
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-white font-bold text-xs ${
              index === 0 ? 'bg-yellow-500' : 
              index === 1 ? 'bg-gray-400' : 
              index === 2 ? 'bg-orange-500' : 'bg-blue-500'
            }`}>
              {index === 0 ? <FaCrown className="w-3 h-3" /> : 
               index === 1 ? <FaMedal className="w-3 h-3" /> : 
               index === 2 ? <FaMedal className="w-3 h-3" /> : 
               index + 1}
            </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-gray-900 truncate">{user.username}</div>
                <div className="text-xs text-gray-500">
                参与 {user.participationCount} 次 | 中奖 {user.winCount} 次
              </div>
            </div>
            <div className="text-right">
              <div className="font-bold text-green-600">¥{user.totalValue}</div>
            </div>
          </motion.div>
          ))
        )}
      </div>
    </motion.div>
  );
};

// 统计信息组件
const StatisticsCard: React.FC<{ stats: any }> = ({ stats }) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.6 }}
    className="bg-white rounded-xl p-6 shadow-sm border border-gray-200"
  >
    <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
          <FaChartBar className="text-lg text-blue-500" />
          统计信息
        </h3>
    </div>
    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
      <div className="text-center p-3 bg-blue-50 rounded-lg">
        <div className="text-2xl font-bold text-blue-700">{stats.totalRounds}</div>
        <div className="text-sm text-gray-600">总轮次</div>
      </div>
      <div className="text-center p-3 bg-green-50 rounded-lg">
        <div className="text-2xl font-bold text-green-700">{stats.activeRounds}</div>
        <div className="text-sm text-gray-600">活跃轮次</div>
      </div>
      <div className="text-center p-3 bg-purple-50 rounded-lg">
        <div className="text-2xl font-bold text-purple-700">{stats.totalParticipants}</div>
        <div className="text-sm text-gray-600">总参与人数</div>
      </div>
      <div className="text-center p-3 bg-orange-50 rounded-lg">
        <div className="text-2xl font-bold text-orange-700">{stats.totalWinners}</div>
        <div className="text-sm text-gray-600">总中奖人数</div>
      </div>
      <div className="text-center p-3 bg-red-50 rounded-lg">
        <div className="text-2xl font-bold text-red-700">¥{stats.totalValue}</div>
        <div className="text-sm text-gray-600">总价值</div>
      </div>
    </div>
  </motion.div>
);

// 中奖弹窗组件
const WinnerModal: React.FC<{ 
  winner: LotteryWinner | null; 
  onClose: () => void; 
}> = ({ winner, onClose }) => {
  if (!winner) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.8, opacity: 0 }}
          className="bg-white rounded-xl p-8 max-w-md w-full text-center shadow-lg"
          onClick={(e) => e.stopPropagation()}
        >
          <FaGift className="text-6xl mb-4 text-yellow-500" />
          <h2 className="text-2xl font-bold text-gray-800 mb-2">恭喜中奖！</h2>
          <p className="text-lg text-gray-600 mb-4">{winner.prizeName}</p>
          <div className="bg-blue-50 border border-blue-200 p-4 rounded-lg mb-4">
            <div className="text-lg font-bold text-blue-700">交易哈希</div>
            <div className="text-sm font-mono break-all text-blue-600">{winner.transactionHash}</div>
          </div>
          <motion.button
            onClick={onClose}
            className="bg-blue-500 text-white px-6 py-2 rounded-lg hover:bg-blue-600 transition-colors"
            whileTap={{ scale: 0.95 }}
          >
            确定
          </motion.button>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

// 主抽奖页面组件
const LotteryPage: React.FC = () => {
  const { user } = useAuth();
  const { setNotification } = useNotification();
  const {
    blockchainData,
    activeRounds,
    userRecord,
    leaderboard,
    statistics,
    loading,
    error,
    participateInLottery,
    clearError
  } = useLottery();

  const [winner, setWinner] = useState<LotteryWinner | null>(null);
  
  // Turnstile 相关状态
  const { config: turnstileConfig, loading: turnstileConfigLoading } = useTurnstileConfig();
  const [turnstileToken, setTurnstileToken] = useState<string>('');
  const [turnstileVerified, setTurnstileVerified] = useState<boolean>(false);
  const [turnstileError, setTurnstileError] = useState<string>('');
  const [turnstileKey, setTurnstileKey] = useState<string>('');

  // 检查是否为管理员
  const isAdmin = useMemo(() => {
    const userRole = localStorage.getItem('userRole');
    return userRole === 'admin' || userRole === 'administrator';
  }, []);

  // Turnstile 回调函数
  const handleTurnstileVerify = (token: string) => {
    setTurnstileToken(token);
    setTurnstileVerified(true);
    setTurnstileError('');
    setTurnstileKey(token);
  };

  const handleTurnstileExpire = () => {
    setTurnstileToken('');
    setTurnstileVerified(false);
    setTurnstileError('');
    setTurnstileKey('');
  };

  const handleTurnstileError = () => {
    setTurnstileToken('');
    setTurnstileVerified(false);
    setTurnstileError('验证失败，请重试');
    setTurnstileKey('');
  };

  const handleParticipate = async (roundId: string, cfToken?: string) => {
    try {
      // 检查非管理员用户的 Turnstile 验证
      if (!isAdmin && !!turnstileConfig.siteKey && (!turnstileVerified || !turnstileToken)) {
        setNotification({ message: '请先完成人机验证', type: 'error' });
        return;
      }

      const result = await participateInLottery(roundId, cfToken);
      setWinner(result);
      setNotification({ message: `恭喜获得 ${result.prizeName}！`, type: 'success' });
      
      // 重置 Turnstile 状态
      setTurnstileToken('');
      setTurnstileVerified(false);
      setTurnstileKey('');
    } catch (err) {
      const msg = err instanceof Error ? err.message : '参与抽奖失败';
      setNotification({ message: msg, type: 'error' });
    }
  };

  if (error) {
    setNotification({ message: error, type: 'error' });
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 p-4">
        <div className="max-w-7xl mx-auto">
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
            <strong>错误:</strong> {error}
            <button
              onClick={clearError}
              className="ml-4 text-red-800 underline"
            >
              重试
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 p-4">
      <div className="max-w-7xl mx-auto">
        <motion.div
          className="space-y-6"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          {/* 标题和说明 */}
          <motion.div 
            className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-6 border border-blue-100"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
        >
            <h2 className="text-2xl font-bold text-blue-700 mb-3 flex items-center gap-2">
              <FaDice className="text-2xl text-blue-600" />
              区块链抽奖系统
            </h2>
            <div className="text-gray-600 space-y-2">
              <p>基于区块链高度的公平透明抽奖平台，确保每次抽奖结果的不可篡改性和随机性。</p>
              <div className="flex items-start gap-2 text-sm">
                <div>
                  <p className="font-semibold text-blue-700">功能特点：</p>
                  <ul className="list-disc list-inside space-y-1 mt-1">
                    <li>基于区块链高度的随机数生成</li>
                    <li>实时查看抽奖轮次和奖品信息</li>
                    <li>个人抽奖记录和排行榜</li>
                    <li>透明公正的抽奖机制</li>
                  </ul>
                </div>
              </div>
            </div>
        </motion.div>

        {/* 区块链数据 */}
        {blockchainData && <BlockchainDisplay data={blockchainData} />}

        {/* 统计信息 */}
        {statistics && <StatisticsCard stats={statistics} />}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* 用户记录 */}
          <div className="lg:col-span-1">
            {user ? (
              <UserRecordCard record={userRecord} />
            ) : (
            <motion.div 
              className="bg-white rounded-xl p-6 shadow-sm border border-gray-200 text-center"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
            >
                <p className="text-gray-600">请登录查看个人记录</p>
            </motion.div>
            )}
          </div>

          {/* 排行榜 */}
          <div className="lg:col-span-1">
            <LeaderboardCard leaderboard={leaderboard} />
          </div>
        </div>

        {/* 活跃轮次 */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="bg-white rounded-xl p-6 shadow-sm border border-gray-200"
        >
          <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
            <FaCrosshairs className="text-lg text-red-500" />
            活跃抽奖轮次
          </h3>
          </div>
          {loading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
              <p className="mt-4 text-gray-600">加载中...</p>
            </div>
          ) : activeRounds.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {activeRounds.map((round) => (
                <LotteryRoundCard
                  key={round.id}
                  round={round}
                  onParticipate={handleParticipate}
                  loading={loading}
                  turnstileVerified={turnstileVerified}
                  turnstileToken={turnstileToken}
                  isAdmin={isAdmin}
                  turnstileConfig={turnstileConfig}
                  turnstileConfigLoading={turnstileConfigLoading}
                  onTurnstileVerify={handleTurnstileVerify}
                  onTurnstileExpire={handleTurnstileExpire}
                  onTurnstileError={handleTurnstileError}
                />
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <p className="text-gray-600">暂无活跃的抽奖轮次</p>
            </div>
          )}
        </motion.div>
        </motion.div>
      </div>

      {/* 中奖弹窗 */}
      <WinnerModal winner={winner} onClose={() => setWinner(null)} />
    </div>
  );
};

export default LotteryPage; 