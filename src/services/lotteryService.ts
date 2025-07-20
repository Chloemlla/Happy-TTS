 import { writeFile, readFile, mkdir } from 'fs/promises';
import { existsSync, mkdirSync } from 'fs';
import path from 'path';
import crypto from 'crypto';
import logger from './logger';

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
    this.ensureDataDir();
    this.loadData();
  }

  private ensureDataDir(): void {
    if (!existsSync(this.dataDir)) {
      mkdirSync(this.dataDir, { recursive: true });
    }
  }

  private async loadData(): Promise<void> {
    try {
      // 加载抽奖轮次数据
      if (existsSync(this.roundsFile)) {
        const roundsData = await readFile(this.roundsFile, 'utf-8');
        const rounds = JSON.parse(roundsData);
        this.rounds = new Map(Object.entries(rounds));
      }

      // 加载用户记录数据
      if (existsSync(this.usersFile)) {
        const usersData = await readFile(this.usersFile, 'utf-8');
        const users = JSON.parse(usersData);
        this.userRecords = new Map(Object.entries(users));
      }

      // 加载区块链缓存数据
      if (existsSync(this.blockchainCacheFile)) {
        const cacheData = await readFile(this.blockchainCacheFile, 'utf-8');
        this.blockchainCache = JSON.parse(cacheData);
      }

      logger.info('抽奖服务数据加载完成');
    } catch (error) {
      logger.error('加载抽奖数据失败:', error);
    }
  }

  private async saveData(): Promise<void> {
    try {
      // 保存抽奖轮次数据
      const roundsObj = Object.fromEntries(this.rounds);
      await writeFile(this.roundsFile, JSON.stringify(roundsObj, null, 2));

      // 保存用户记录数据
      const usersObj = Object.fromEntries(this.userRecords);
      await writeFile(this.usersFile, JSON.stringify(usersObj, null, 2));

      // 保存区块链缓存数据
      if (this.blockchainCache) {
        await writeFile(this.blockchainCacheFile, JSON.stringify(this.blockchainCache, null, 2));
      }

      logger.info('抽奖服务数据保存完成');
    } catch (error) {
      logger.error('保存抽奖数据失败:', error);
    }
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
      logger.warn('获取区块链高度失败，使用时间戳作为备选:', error);
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

      await this.saveData();
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

    this.rounds.set(round.id, round);
    await this.saveData();

    logger.info(`创建抽奖轮次: ${round.id} - ${round.name}`);
    return round;
  }

  // 获取所有抽奖轮次
  public getLotteryRounds(): LotteryRound[] {
    return Array.from(this.rounds.values());
  }

  // 获取活跃的抽奖轮次
  public getActiveRounds(): LotteryRound[] {
    const now = Date.now();
    return Array.from(this.rounds.values()).filter(round => 
      round.isActive && round.startTime <= now && round.endTime >= now
    );
  }

  // 参与抽奖
  public async participateInLottery(roundId: string, userId: string, username: string): Promise<LotteryWinner | null> {
    const round = this.rounds.get(roundId);
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

    await this.saveData();

    logger.info(`用户 ${username} 在轮次 ${roundId} 中获得了 ${prize.name}`);
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
  private updateUserRecord(userId: string, username: string, winner: LotteryWinner, prize: LotteryPrize): void {
    let record = this.userRecords.get(userId);
    if (!record) {
      record = {
        userId,
        username,
        participationCount: 0,
        winCount: 0,
        lastDrawTime: 0,
        totalValue: 0,
        history: []
      };
    }

    record.participationCount++;
    record.winCount++;
    record.lastDrawTime = winner.drawTime;
    record.totalValue += prize.value;
    record.history.push({
      roundId: winner.prizeId, // 这里应该存储轮次ID，暂时用奖品ID代替
      prizeId: winner.prizeId,
      prizeName: winner.prizeName,
      drawTime: winner.drawTime,
      value: prize.value
    });

    this.userRecords.set(userId, record);
  }

  // 获取用户抽奖记录
  public getUserRecord(userId: string): UserLotteryRecord | null {
    return this.userRecords.get(userId) || null;
  }

  // 获取轮次详情
  public getRoundDetails(roundId: string): LotteryRound | null {
    return this.rounds.get(roundId) || null;
  }

  // 获取排行榜
  public getLeaderboard(limit: number = 10): UserLotteryRecord[] {
    return Array.from(this.userRecords.values())
      .sort((a, b) => b.totalValue - a.totalValue)
      .slice(0, limit);
  }

  // 重置轮次（管理员功能）
  public async resetRound(roundId: string): Promise<void> {
    const round = this.rounds.get(roundId);
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

    await this.saveData();
    logger.info(`重置抽奖轮次: ${roundId}`);
  }

  // 获取统计信息
  public getStatistics(): {
    totalRounds: number;
    activeRounds: number;
    totalParticipants: number;
    totalWinners: number;
    totalValue: number;
  } {
    const totalRounds = this.rounds.size;
    const activeRounds = this.getActiveRounds().length;
    const totalParticipants = Array.from(this.rounds.values())
      .reduce((sum, round) => sum + round.participants.length, 0);
    const totalWinners = Array.from(this.rounds.values())
      .reduce((sum, round) => sum + round.winners.length, 0);
    const totalValue = Array.from(this.userRecords.values())
      .reduce((sum, record) => sum + record.totalValue, 0);

    return {
      totalRounds,
      activeRounds,
      totalParticipants,
      totalWinners,
      totalValue
    };
  }
}

export const lotteryService = new LotteryService();