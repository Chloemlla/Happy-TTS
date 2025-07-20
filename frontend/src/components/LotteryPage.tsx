import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLottery } from '../hooks/useLottery';
import { useAuth } from '../hooks/useAuth';
import { LotteryRound, LotteryWinner } from '../types/lottery';
import { toast } from 'react-toastify';
import { formatDistanceToNow } from 'date-fns';
import { zhCN } from 'date-fns/locale';

// 区块链数据展示组件
const BlockchainDisplay: React.FC<{ data: any }> = ({ data }) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    className="bg-gradient-to-r from-blue-500 to-purple-600 text-white p-6 rounded-lg shadow-lg"
  >
    <h3 className="text-xl font-bold mb-4">区块链数据</h3>
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <div className="text-center">
        <div className="text-2xl font-bold">{data.height.toLocaleString()}</div>
        <div className="text-sm opacity-90">区块高度</div>
      </div>
      <div className="text-center">
        <div className="text-sm font-mono truncate">{data.hash.substring(0, 8)}...</div>
        <div className="text-sm opacity-90">区块哈希</div>
      </div>
      <div className="text-center">
        <div className="text-lg font-bold">{new Date(data.timestamp).toLocaleTimeString()}</div>
        <div className="text-sm opacity-90">时间戳</div>
      </div>
      <div className="text-center">
        <div className="text-lg font-bold">{data.difficulty.toFixed(2)}</div>
        <div className="text-sm opacity-90">难度值</div>
      </div>
    </div>
  </motion.div>
);

// 奖品展示组件
const PrizeDisplay: React.FC<{ prize: any }> = ({ prize }) => {
  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'legendary': return 'from-yellow-400 to-orange-500';
      case 'epic': return 'from-purple-400 to-pink-500';
      case 'rare': return 'from-blue-400 to-cyan-500';
      default: return 'from-gray-400 to-gray-500';
    }
  };

  return (
    <motion.div
      whileHover={{ scale: 1.05 }}
      className={`bg-gradient-to-r ${getCategoryColor(prize.category)} text-white p-4 rounded-lg shadow-md`}
    >
      <div className="text-center">
        <h4 className="font-bold text-lg">{prize.name}</h4>
        <p className="text-sm opacity-90">{prize.description}</p>
        <div className="mt-2">
          <span className="text-2xl font-bold">¥{prize.value}</span>
        </div>
        <div className="mt-1 text-xs">
          概率: {(prize.probability * 100).toFixed(2)}% | 剩余: {prize.remaining}/{prize.quantity}
        </div>
      </div>
    </motion.div>
  );
};

// 抽奖轮次卡片组件
const LotteryRoundCard: React.FC<{ 
  round: LotteryRound; 
  onParticipate: (roundId: string) => void;
  loading: boolean;
}> = ({ round, onParticipate, loading }) => {
  const { user } = useAuth();
  const hasParticipated = round.participants.includes(user?.id || '');
  const isActive = round.isActive && Date.now() >= round.startTime && Date.now() <= round.endTime;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-lg shadow-lg p-6 border border-gray-200"
    >
      <div className="flex justify-between items-start mb-4">
        <div>
          <h3 className="text-xl font-bold text-gray-800">{round.name}</h3>
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
          <button
            onClick={() => onParticipate(round.id)}
            disabled={!isActive || hasParticipated || loading}
            className={`px-6 py-2 rounded-lg font-medium transition-colors ${
              !isActive || hasParticipated || loading
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                : 'bg-gradient-to-r from-blue-500 to-purple-600 text-white hover:from-blue-600 hover:to-purple-700'
            }`}
          >
            {loading ? '抽奖中...' : hasParticipated ? '已参与' : '立即参与'}
          </button>
        )}
      </div>
    </motion.div>
  );
};

// 用户记录组件
const UserRecordCard: React.FC<{ record: any }> = ({ record }) => (
  <motion.div
    initial={{ opacity: 0, x: -20 }}
    animate={{ opacity: 1, x: 0 }}
    className="bg-white rounded-lg shadow-lg p-6 border border-gray-200"
  >
    <h3 className="text-xl font-bold text-gray-800 mb-4">我的抽奖记录</h3>
    
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
      <div className="text-center">
        <div className="text-2xl font-bold text-blue-600">{record.participationCount}</div>
        <div className="text-sm text-gray-600">参与次数</div>
      </div>
      <div className="text-center">
        <div className="text-2xl font-bold text-green-600">{record.winCount}</div>
        <div className="text-sm text-gray-600">中奖次数</div>
      </div>
      <div className="text-center">
        <div className="text-2xl font-bold text-purple-600">¥{record.totalValue}</div>
        <div className="text-sm text-gray-600">总价值</div>
      </div>
      <div className="text-center">
        <div className="text-2xl font-bold text-orange-600">
          {record.participationCount > 0 ? ((record.winCount / record.participationCount) * 100).toFixed(1) : 0}%
        </div>
        <div className="text-sm text-gray-600">中奖率</div>
      </div>
    </div>

    {record.history.length > 0 && (
      <div>
        <h4 className="font-semibold text-gray-700 mb-3">最近中奖记录</h4>
        <div className="space-y-2 max-h-40 overflow-y-auto">
          {record.history.slice(0, 5).map((item: any, index: number) => (
            <div key={index} className="flex justify-between items-center p-2 bg-gray-50 rounded">
              <div>
                <div className="font-medium">{item.prizeName}</div>
                <div className="text-sm text-gray-500">
                  {formatDistanceToNow(item.drawTime, { addSuffix: true, locale: zhCN })}
                </div>
              </div>
              <div className="text-right">
                <div className="font-bold text-green-600">¥{item.value}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    )}
  </motion.div>
);

// 排行榜组件
const LeaderboardCard: React.FC<{ leaderboard: any[] }> = ({ leaderboard }) => (
  <motion.div
    initial={{ opacity: 0, x: 20 }}
    animate={{ opacity: 1, x: 0 }}
    className="bg-white rounded-lg shadow-lg p-6 border border-gray-200"
  >
    <h3 className="text-xl font-bold text-gray-800 mb-4">排行榜</h3>
    
    <div className="space-y-3">
      {leaderboard.map((user, index) => (
        <motion.div
          key={user.userId}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: index * 0.1 }}
          className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
        >
          <div className="flex items-center space-x-3">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white font-bold ${
              index === 0 ? 'bg-yellow-500' : 
              index === 1 ? 'bg-gray-400' : 
              index === 2 ? 'bg-orange-500' : 'bg-blue-500'
            }`}>
              {index + 1}
            </div>
            <div>
              <div className="font-medium">{user.username}</div>
              <div className="text-sm text-gray-500">
                参与 {user.participationCount} 次 | 中奖 {user.winCount} 次
              </div>
            </div>
          </div>
          <div className="text-right">
            <div className="font-bold text-green-600">¥{user.totalValue}</div>
          </div>
        </motion.div>
      ))}
    </div>
  </motion.div>
);

// 统计信息组件
const StatisticsCard: React.FC<{ stats: any }> = ({ stats }) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    className="bg-gradient-to-r from-green-500 to-blue-600 text-white p-6 rounded-lg shadow-lg"
  >
    <h3 className="text-xl font-bold mb-4">统计信息</h3>
    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
      <div className="text-center">
        <div className="text-2xl font-bold">{stats.totalRounds}</div>
        <div className="text-sm opacity-90">总轮次</div>
      </div>
      <div className="text-center">
        <div className="text-2xl font-bold">{stats.activeRounds}</div>
        <div className="text-sm opacity-90">活跃轮次</div>
      </div>
      <div className="text-center">
        <div className="text-2xl font-bold">{stats.totalParticipants}</div>
        <div className="text-sm opacity-90">总参与人数</div>
      </div>
      <div className="text-center">
        <div className="text-2xl font-bold">{stats.totalWinners}</div>
        <div className="text-sm opacity-90">总中奖人数</div>
      </div>
      <div className="text-center">
        <div className="text-2xl font-bold">¥{stats.totalValue}</div>
        <div className="text-sm opacity-90">总价值</div>
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
          className="bg-white rounded-lg p-8 max-w-md w-full text-center"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="text-6xl mb-4">🎉</div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">恭喜中奖！</h2>
          <p className="text-lg text-gray-600 mb-4">{winner.prizeName}</p>
          <div className="bg-gradient-to-r from-yellow-400 to-orange-500 text-white p-4 rounded-lg mb-4">
            <div className="text-2xl font-bold">交易哈希</div>
            <div className="text-sm font-mono break-all">{winner.transactionHash}</div>
          </div>
          <button
            onClick={onClose}
            className="bg-blue-500 text-white px-6 py-2 rounded-lg hover:bg-blue-600 transition-colors"
          >
            确定
          </button>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

// 主抽奖页面组件
export const LotteryPage: React.FC = () => {
  const { user } = useAuth();
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

  const handleParticipate = async (roundId: string) => {
    try {
      const result = await participateInLottery(roundId);
      setWinner(result);
      toast.success(`恭喜获得 ${result.prizeName}！`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '参与抽奖失败');
    }
  };

  if (error) {
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
      <div className="max-w-7xl mx-auto space-y-6">
        {/* 页面标题 */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center"
        >
          <h1 className="text-4xl font-bold text-gray-800 mb-2">区块链抽奖系统</h1>
          <p className="text-gray-600">基于区块链高度的公平透明抽奖平台</p>
        </motion.div>

        {/* 区块链数据 */}
        {blockchainData && <BlockchainDisplay data={blockchainData} />}

        {/* 统计信息 */}
        {statistics && <StatisticsCard stats={statistics} />}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* 用户记录 */}
          <div className="lg:col-span-1">
            {user && userRecord ? (
              <UserRecordCard record={userRecord} />
            ) : (
              <div className="bg-white rounded-lg shadow-lg p-6 border border-gray-200 text-center">
                <p className="text-gray-600">请登录查看个人记录</p>
              </div>
            )}
          </div>

          {/* 排行榜 */}
          <div className="lg:col-span-1">
            <LeaderboardCard leaderboard={leaderboard} />
          </div>
        </div>

        {/* 活跃轮次 */}
        <div>
          <h2 className="text-2xl font-bold text-gray-800 mb-4">活跃抽奖轮次</h2>
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
                />
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <p className="text-gray-600">暂无活跃的抽奖轮次</p>
            </div>
          )}
        </div>
      </div>

      {/* 中奖弹窗 */}
      <WinnerModal winner={winner} onClose={() => setWinner(null)} />
    </div>
  );
}; 