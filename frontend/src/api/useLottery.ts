import { useState, useEffect, useCallback } from 'react';
import { 
  BlockchainData, 
  LotteryRound, 
  LotteryWinner, 
  UserLotteryRecord, 
  LotteryStatistics 
} from '../types/lottery';
import * as lotteryApi from '../api/lottery';
import { useAuth } from './useAuth';

export function useLottery() {
  const { user } = useAuth();
  const [blockchainData, setBlockchainData] = useState<BlockchainData | null>(null);
  const [activeRounds, setActiveRounds] = useState<LotteryRound[]>([]);
  const [allRounds, setAllRounds] = useState<LotteryRound[]>([]);
  const [userRecord, setUserRecord] = useState<UserLotteryRecord | null>(null);
  const [leaderboard, setLeaderboard] = useState<UserLotteryRecord[]>([]);
  const [statistics, setStatistics] = useState<LotteryStatistics | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 获取区块链数据
  const fetchBlockchainData = useCallback(async () => {
    try {
      setError(null);
      const data = await lotteryApi.getBlockchainData();
      setBlockchainData(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : '获取区块链数据失败');
    }
  }, []);

  // 获取活跃轮次
  const fetchActiveRounds = useCallback(async () => {
    try {
      setError(null);
      const rounds = await lotteryApi.getActiveRounds();
      setActiveRounds(rounds);
    } catch (err) {
      setError(err instanceof Error ? err.message : '获取活跃轮次失败');
    }
  }, []);

  // 获取所有轮次
  const fetchAllRounds = useCallback(async () => {
    try {
      setError(null);
      const rounds = await lotteryApi.getLotteryRounds();
      setAllRounds(rounds);
    } catch (err) {
      setError(err instanceof Error ? err.message : '获取所有轮次失败');
    }
  }, []);

  // 获取用户记录
  const fetchUserRecord = useCallback(async () => {
    if (!user) {
      setUserRecord(null);
      return;
    }

    try {
      setError(null);
      const record = await lotteryApi.getUserRecord();
      setUserRecord(record);
    } catch (err) {
      setError(err instanceof Error ? err.message : '获取用户记录失败');
    }
  }, [user]);

  // 获取排行榜
  const fetchLeaderboard = useCallback(async (limit: number = 10) => {
    try {
      setError(null);
      const data = await lotteryApi.getLeaderboard(limit);
      setLeaderboard(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : '获取排行榜失败');
    }
  }, []);

  // 获取统计信息
  const fetchStatistics = useCallback(async () => {
    try {
      setError(null);
      const stats = await lotteryApi.getStatistics();
      setStatistics(stats);
    } catch (err) {
      setError(err instanceof Error ? err.message : '获取统计信息失败');
    }
  }, []);

  // 参与抽奖
  const participateInLottery = useCallback(async (roundId: string): Promise<LotteryWinner> => {
    if (!user) {
      throw new Error('请先登录');
    }

    setLoading(true);
    setError(null);
    
    try {
      const winner = await lotteryApi.participateInLottery(roundId);
      
      // 更新相关数据
      await Promise.all([
        fetchActiveRounds(),
        fetchUserRecord(),
        fetchLeaderboard(),
        fetchStatistics()
      ]);
      
      return winner;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '参与抽奖失败';
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [user, fetchActiveRounds, fetchUserRecord, fetchLeaderboard, fetchStatistics]);

  // 获取轮次详情
  const getRoundDetails = useCallback(async (roundId: string): Promise<LotteryRound> => {
    try {
      setError(null);
      return await lotteryApi.getRoundDetails(roundId);
    } catch (err) {
      setError(err instanceof Error ? err.message : '获取轮次详情失败');
      throw err;
    }
  }, []);

  // 初始化数据
  useEffect(() => {
    const initializeData = async () => {
      setLoading(true);
      try {
        await Promise.all([
          fetchBlockchainData(),
          fetchActiveRounds(),
          fetchAllRounds(),
          fetchLeaderboard(),
          fetchStatistics()
        ]);
      } catch (err) {
        console.error('初始化抽奖数据失败:', err);
      } finally {
        setLoading(false);
      }
    };

    initializeData();
  }, [fetchBlockchainData, fetchActiveRounds, fetchAllRounds, fetchLeaderboard, fetchStatistics]);

  // 当用户登录状态改变时，获取用户记录
  useEffect(() => {
    fetchUserRecord();
  }, [fetchUserRecord]);

  // 定期更新区块链数据
  useEffect(() => {
    const interval = setInterval(fetchBlockchainData, 30000); // 每30秒更新一次
    return () => clearInterval(interval);
  }, [fetchBlockchainData]);

  return {
    // 数据
    blockchainData,
    activeRounds,
    allRounds,
    userRecord,
    leaderboard,
    statistics,
    loading,
    error,
    
    // 方法
    fetchBlockchainData,
    fetchActiveRounds,
    fetchAllRounds,
    fetchUserRecord,
    fetchLeaderboard,
    fetchStatistics,
    participateInLottery,
    getRoundDetails,
    
    // 工具方法
    clearError: () => setError(null),
  };
} 