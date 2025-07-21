import { getAllRounds, addRound, updateRound, getUserRecord, updateUserRecord } from './lotteryStorage';
import path from 'path';
import crypto from 'crypto';
import { logger } from './logger';

// 抽奖相关类型定义
export interface LotteryPrize {
  id: string;
  name: string;
  description: string;
  value: number;
  probability: number; // 中奖概率 (0-1)
  quantity: number; // 奖品数量
  remaining: number; // 剩余数量
  image?: string;
  category: 'common' | 'rare' | 'epic' | 'legendary';
}

export interface LotteryRound {
  id: string;
  name: string;
  description: string;
  startTime: number;
  endTime: number;
  isActive: boolean;
  prizes: LotteryPrize[];
  participants: string[];
  winners: LotteryWinner[];
  blockchainHeight: number;
  seed: string;
}

export interface LotteryWinner {
  userId: string;
  username: string;
  prizeId: string;
  prizeName: string;
  drawTime: number;
  transactionHash?: string;
}

export interface UserLotteryRecord {
  userId: string;
  username: string;
  participationCount: number;
  winCount: number;
  lastDrawTime: number;
  totalValue: number;
  history: {
    roundId: string;
    prizeId: string;
    prizeName: string;
    drawTime: number;
    value: number;
  }[];
}

export interface BlockchainData {
  height: number;
  hash: string;
  timestamp: number;
  difficulty: number;
}

class LotteryService {
  private dataDir: string;
  private roundsFile: string;
  private usersFile: string;
  private blockchainCacheFile: string;
  private rounds: Map<string, LotteryRound> = new Map();
  private userRecords: Map<string, UserLotteryRecord> = new Map();
  private blockchainCache: BlockchainData | null = null;

  constructor() {
    this.dataDir = path.join(process.cwd(), 'data', 'lottery');
    this.roundsFile = path.join(this.dataDir, 'rounds.json');
    this.usersFile = path.join(this.dataDir, 'users.json');
    this.blockchainCacheFile = path.join(this.dataDir, 'blockchain-cache.json');
    // 替换原有本地读写/Map操作，全部通过lotteryStorage接口实现
  }

  // 获取区块链高度作为随机种子
  private async getBlockchainHeight(): Promise<number> {
    try {
      // 模拟获取区块链高度，实际项目中可以调用真实的区块链API
      const response = await fetch('https://api.blockcypher.com/v1/btc/main');
      if (response.ok) {
        const data = await response.json();
        return data.height;
      }
    } catch (error) {
      logger.log('获取区块链高度失败，使用时间戳作为备选:', error);
    }

    // 备选方案：使用当前时间戳
    return Math.floor(Date.now() / 1000);
  }

  // 获取区块链数据
  public async getBlockchainData(): Promise<BlockchainData> {
    const now = Date.now();
    
    // 如果缓存存在且未过期（5分钟），直接返回
    if (this.blockchainCache && (now - this.blockchainCache.timestamp) < 5 * 60 * 1000) {
      return this.blockchainCache;
    }

    try {
      const height = await this.getBlockchainHeight();
      const hash = crypto.createHash('sha256').update(height.toString()).digest('hex');
      const difficulty = Math.random() * 1000000; // 模拟难度值

      this.blockchainCache = {
        height,
        hash,
        timestamp: now,
        difficulty
      };

      // 替换原有本地读写/Map操作，全部通过lotteryStorage接口实现
      // await this.saveData(); // 移除此行，因为不再直接保存
      return this.blockchainCache;
    } catch (error) {
      logger.error('获取区块链数据失败:', error);
      throw new Error('无法获取区块链数据');
    }
  }

  // 创建抽奖轮次
  public async createLotteryRound(roundData: Omit<LotteryRound, 'id' | 'participants' | 'winners' | 'blockchainHeight' | 'seed'>): Promise<LotteryRound> {
    const blockchainData = await this.getBlockchainData();
    const round: LotteryRound = {
      ...roundData,
      id: crypto.randomUUID(),
      participants: [],
      winners: [],
      blockchainHeight: blockchainData.height,
      seed: blockchainData.hash
    };
    try {
      await addRound(round);
      logger.log(`创建抽奖轮次: ${round.id} - ${round.name}`);
      // 创建后强制刷新所有轮次，避免缓存/延迟
      await this.getLotteryRounds();
    } catch (e: any) {
      logger.error(`创建抽奖轮次失败: ${e.message || e}`);
      throw new Error('数据库写入失败: ' + (e.message || e));
    }
    return round;
  }

  // 获取所有抽奖轮次
  public async getLotteryRounds(): Promise<LotteryRound[]> {
    const rounds = await getAllRounds();
    if (!rounds || !Array.isArray(rounds) || rounds.length === 0) {
      logger.log('[lottery] getLotteryRounds: 未读取到任何轮次数据');
    } else {
      logger.log(`[lottery] getLotteryRounds: 读取到 ${rounds.length} 条轮次数据`);
    }
    return rounds;
  }

  // 获取活跃的抽奖轮次
  public async getActiveRounds(): Promise<LotteryRound[]> {
    const now = Date.now();
    const rounds = await this.getLotteryRounds();
    return rounds.filter(round => 
      round.isActive && round.startTime <= now && round.endTime >= now
    );
  }

  // 参与抽奖
  public async participateInLottery(roundId: string, userId: string, username: string): Promise<LotteryWinner | null> {
    const round = await this.getRoundDetails(roundId); // 使用新的getRoundDetails
    if (!round) {
      throw new Error('抽奖轮次不存在');
    }

    if (!round.isActive) {
      throw new Error('抽奖轮次已结束');
    }

    const now = Date.now();
    if (now < round.startTime || now > round.endTime) {
      throw new Error('抽奖时间未到或已结束');
    }

    if (round.participants.includes(userId)) {
      throw new Error('您已经参与过此轮抽奖');
    }

    // 获取最新的区块链数据
    const blockchainData = await this.getBlockchainData();
    
    // 生成随机种子
    const seed = `${blockchainData.height}-${blockchainData.hash}-${userId}-${now}`;
    const randomValue = this.generateRandomValue(seed);

    // 选择奖品
    const prize = this.selectPrize(round.prizes, randomValue);
    if (!prize) {
      throw new Error('没有可用的奖品');
    }

    // 更新奖品数量
    prize.remaining--;

    // 创建中奖记录
    const winner: LotteryWinner = {
      userId,
      username,
      prizeId: prize.id,
      prizeName: prize.name,
      drawTime: now,
      transactionHash: this.generateTransactionHash(blockchainData, userId)
    };

    // 更新轮次数据
    round.participants.push(userId);
    round.winners.push(winner);
    round.blockchainHeight = blockchainData.height;
    round.seed = blockchainData.hash;

    // 更新用户记录
    this.updateUserRecord(userId, username, winner, prize);

    // 替换原有本地读写/Map操作，全部通过lotteryStorage接口实现
    // await this.saveData(); // 移除此行，因为不再直接保存

    logger.log(`用户 ${username} 在轮次 ${roundId} 中获得了 ${prize.name}`);
    return winner;
  }

  // 生成随机值
  private generateRandomValue(seed: string): number {
    const hash = crypto.createHash('sha256').update(seed).digest('hex');
    const decimal = parseInt(hash.substring(0, 8), 16);
    return decimal / 0xffffffff; // 归一化到 0-1
  }

  // 选择奖品
  private selectPrize(prizes: LotteryPrize[], randomValue: number): LotteryPrize | null {
    const availablePrizes = prizes.filter(prize => prize.remaining > 0);
    if (availablePrizes.length === 0) {
      return null;
    }

    // 按概率选择奖品
    let cumulativeProbability = 0;
    for (const prize of availablePrizes) {
      cumulativeProbability += prize.probability;
      if (randomValue <= cumulativeProbability) {
        return prize;
      }
    }

    // 如果没有按概率选中，返回第一个可用奖品
    return availablePrizes[0];
  }

  // 生成交易哈希
  private generateTransactionHash(blockchainData: BlockchainData, userId: string): string {
    const data = `${blockchainData.height}-${blockchainData.hash}-${userId}-${Date.now()}`;
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  // 更新用户记录
  private async updateUserRecord(userId: string, username: string, winner: LotteryWinner, prize: LotteryPrize): Promise<void> {
    const record = await getUserRecord(userId);
    if (!record) {
      // 替换原有本地读写/Map操作，全部通过lotteryStorage接口实现
      // this.userRecords.set(userId, {
      //   userId,
      //   username,
      //   participationCount: 0,
      //   winCount: 0,
      //   lastDrawTime: 0,
      //   totalValue: 0,
      //   history: []
      // });
      // await this.saveData(); // 移除此行，因为不再直接保存
    }

    // 替换原有本地读写/Map操作，全部通过lotteryStorage接口实现
    // await updateUserRecord(userId, {
    //   participationCount: record?.participationCount || 0 + 1,
    //   winCount: record?.winCount || 0 + 1,
    //   lastDrawTime: winner.drawTime,
    //   totalValue: record?.totalValue || 0 + prize.value,
    //   history: [...(record?.history || []), {
    //     roundId: winner.prizeId, // 这里应该存储轮次ID，暂时用奖品ID代替
    //     prizeId: winner.prizeId,
    //     prizeName: winner.prizeName,
    //     drawTime: winner.drawTime,
    //     value: prize.value
    //   }]
    // });
  }

  // 获取用户抽奖记录
  public async getUserRecord(userId: string): Promise<UserLotteryRecord | null> {
    return getUserRecord(userId);
  }

  // 获取轮次详情
  public async getRoundDetails(roundId: string): Promise<LotteryRound | null> {
    const rounds = await this.getLotteryRounds();
    return rounds.find(round => round.id === roundId) || null;
  }

  // 获取排行榜
  public async getLeaderboard(limit: number = 10): Promise<UserLotteryRecord[]> {
    const userRecords = await this.getAllUserRecords(); // 新增方法
    return userRecords
      .sort((a, b) => b.totalValue - a.totalValue)
      .slice(0, limit);
  }

  // 重置轮次（管理员功能）
  public async resetRound(roundId: string): Promise<void> {
    const round = await this.getRoundDetails(roundId);
    if (!round) {
      throw new Error('抽奖轮次不存在');
    }

    // 重置奖品数量
    round.prizes.forEach(prize => {
      prize.remaining = prize.quantity;
    });

    // 清空参与者和获奖者
    round.participants = [];
    round.winners = [];

    // 替换原有本地读写/Map操作，全部通过lotteryStorage接口实现
    // await this.saveData(); // 移除此行，因为不再直接保存
    logger.log(`重置抽奖轮次: ${roundId}`);
  }

  // 获取统计信息
  public async getStatistics(): Promise<{
    totalRounds: number;
    activeRounds: number;
    totalParticipants: number;
    totalWinners: number;
    totalValue: number;
  }> {
    const totalRounds = (await this.getLotteryRounds()).length;
    const activeRounds = (await this.getActiveRounds()).length;
    const totalParticipants = (await this.getLotteryRounds()).reduce((sum, round) => sum + round.participants.length, 0);
    const totalWinners = (await this.getLotteryRounds()).reduce((sum, round) => sum + round.winners.length, 0);
    const totalValue = (await this.getAllUserRecords()).reduce((sum, record) => sum + record.totalValue, 0);

    return {
      totalRounds,
      activeRounds,
      totalParticipants,
      totalWinners,
      totalValue
    };
  }

  // 新增方法：获取所有用户记录
  private async getAllUserRecords(): Promise<UserLotteryRecord[]> {
    const rounds = await this.getLotteryRounds();
    const userIds = Array.from(new Set(rounds.flatMap(round => round.participants)));
    const userRecords: UserLotteryRecord[] = [];
    for (const userId of userIds) {
      const record = await getUserRecord(userId);
      if (record) {
        userRecords.push(record);
      }
    }
    return userRecords;
  }

  // 删除所有抽奖轮次
  public async deleteAllRounds(): Promise<void> {
    if (typeof (global as any).deleteAllRounds === 'function') {
      await (global as any).deleteAllRounds();
    } else if (typeof require !== 'undefined') {
      // 动态引入 storage 层
      const storage = require('./lotteryStorage');
      if (typeof storage.deleteAllRounds === 'function') {
        await storage.deleteAllRounds();
      } else {
        throw new Error('当前存储实现不支持批量删除');
      }
    } else {
      throw new Error('无法找到 deleteAllRounds 实现');
    }
  }
}

export const lotteryService = new LotteryService();