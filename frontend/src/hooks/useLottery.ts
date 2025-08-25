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
import CryptoJS from 'crypto-js';
import getApiBaseUrl from '../api';

// AES-256解密函数
function decryptAES256(encryptedData: string, iv: string, key: string): string {
  try {
    console.log('   开始AES-256解密...');
    console.log('   密钥长度:', key.length);
    console.log('   加密数据长度:', encryptedData.length);
    console.log('   IV长度:', iv.length);
    
    const keyBytes = CryptoJS.SHA256(key);
    const ivBytes = CryptoJS.enc.Hex.parse(iv);
    const encryptedBytes = CryptoJS.enc.Hex.parse(encryptedData);
    
    console.log('   密钥哈希完成，开始解密...');
    
    const decrypted = CryptoJS.AES.decrypt(
      { ciphertext: encryptedBytes },
      keyBytes,
      {
        iv: ivBytes,
        mode: CryptoJS.mode.CBC,
        padding: CryptoJS.pad.Pkcs7
      }
    );
    
    const result = decrypted.toString(CryptoJS.enc.Utf8);
    console.log('   解密完成，结果长度:', result.length);
    
    return result;
  } catch (error) {
    console.error('❌ AES-256解密失败:', error);
    throw new Error('解密失败');
  }
}

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
      const token = localStorage.getItem('token');
      
      // 直接调用API并处理加密响应
      const response = await fetch(getApiBaseUrl() + '/api/lottery/rounds', {
        headers: {
          'Content-Type': 'application/json',
          ...(token && { 'Authorization': `Bearer ${token}` }),
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      
      // 检查是否为加密数据
      if (data.data && data.iv && typeof data.data === 'string' && typeof data.iv === 'string') {
        try {
          console.log('🔐 开始解密抽奖轮次数据...');
          console.log('   加密数据长度:', data.data.length);
          console.log('   IV:', data.iv);
          console.log('   使用Token进行解密，Token长度:', token?.length || 0);
          
          // 解密数据
          const decryptedJson = decryptAES256(data.data, data.iv, token || '');
          const decryptedData = JSON.parse(decryptedJson);
          
          if (Array.isArray(decryptedData)) {
            console.log('✅ 解密成功，获取到', decryptedData.length, '个抽奖轮次');
            setAllRounds(decryptedData);
          } else {
            console.error('❌ 解密数据格式错误，期望数组格式');
            setError('解密数据格式错误');
          }
        } catch (decryptError) {
          console.error('❌ 解密失败:', decryptError);
          setError('数据解密失败，请检查登录状态');
        }
      } else {
        // 兼容未加密格式（普通用户或未登录用户）
        console.log('📝 使用未加密格式数据');
        if (Array.isArray(data.data)) {
          setAllRounds(data.data);
        } else {
          console.error('❌ 响应数据格式错误，期望数组格式');
          setError('响应数据格式错误');
        }
      }
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
  const participateInLottery = useCallback(async (roundId: string, cfToken?: string): Promise<LotteryWinner> => {
    if (!user) {
      throw new Error('请先登录');
    }

    setLoading(true);
    setError(null);
    
    try {
      const winner = await lotteryApi.participateInLottery(roundId, cfToken);
      
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