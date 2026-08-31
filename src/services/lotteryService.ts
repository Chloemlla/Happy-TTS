import crypto from "node:crypto";
import path from "node:path";
import { isAdminRole } from "../middleware/auth";
import { logger } from "./logger";
import { addRound, getAllRounds, getUserRecord, updateRound, updateUserRecord, deleteAllRounds } from "./lotteryStorage";
import { TurnstileService } from "./turnstileService";

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
  category: "common" | "rare" | "epic" | "legendary";
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
}

class LotteryService {
  private dataDir: string;
  private roundsFile: string;
  private usersFile: string;
  private blockchainCacheFile: string;
  private blockchainCache: BlockchainData | null = null;

  constructor() {
    this.dataDir = path.join(process.cwd(), "data", "lottery");
    this.roundsFile = path.join(this.dataDir, "rounds.json");
    this.usersFile = path.join(this.dataDir, "users.json");
    this.blockchainCacheFile = path.join(this.dataDir, "blockchain-cache.json");
    // 替换原有本地读写/Map操作，全部通过lotteryStorage接口实现
  }

  // 获取区块链高度作为随机种子
  private async getBlockchainHeight(): Promise<number> {
    try {
      // 模拟获取区块链高度，实际项目中可以调用真实的区块链API
      const response = await fetch("https://api.blockcypher.com/v1/btc/main");
      if (response.ok) {
        const data = await response.json();
        return data.height;
      }
    } catch (error) {
      logger.warn("获取区块链高度失败，使用时间戳作为备选:", error);
    }

    // 备选方案：使用当前时间戳
    return Math.floor(Date.now() / 1000);
  }

  // 获取区块链数据
  // G7-09: 区块链高度只作为展示用的信息源，不再参与开奖随机数。此前把公开的
  // 区块高度 + sha256(高度) + 客户端 userId + 请求时间戳拼成种子，全部成分攻击者
  // 已知或可枚举，开奖结果可被预测。真正的随机由服务端 CSPRNG (crypto.randomInt)
  // 决定（见 participateInLottery）。`difficulty` 这个编造的难度字段已删除。
  public async getBlockchainData(): Promise<BlockchainData> {
    const now = Date.now();

    // 如果缓存存在且未过期（5分钟），直接返回
    if (this.blockchainCache && now - this.blockchainCache.timestamp < 5 * 60 * 1000) {
      return this.blockchainCache;
    }

    try {
      const height = await this.getBlockchainHeight();
      // 尽力取真实区块哈希；blockcypher /v1/btc/main 通常返回 hash 字段。
      let hash = "";
      try {
        const response = await fetch("https://api.blockcypher.com/v1/btc/main", { signal: AbortSignal.timeout(5000) });
        if (response.ok) {
          const data = await response.json();
          if (typeof data.hash === "string" && data.hash) hash = data.hash;
        }
      } catch {
        // 保持回退行为
      }

      this.blockchainCache = {
        height,
        hash,
        timestamp: now,
      };
      return this.blockchainCache;
    } catch (error) {
      logger.error("获取区块链数据失败:", error);
      throw new Error("无法获取区块链数据");
    }
  }

  // 创建抽奖轮次
  public async createLotteryRound(
    roundData: Omit<LotteryRound, "id" | "participants" | "winners" | "blockchainHeight" | "seed">,
  ): Promise<LotteryRound> {
    const blockchainData = await this.getBlockchainData();
    const round: LotteryRound = {
      ...roundData,
      id: crypto.randomUUID(),
      participants: [],
      winners: [],
      blockchainHeight: blockchainData.height,
      seed: blockchainData.hash,
    };
    try {
      await addRound(round);
      logger.info(`创建抽奖轮次: ${round.id} - ${round.name}`);
      // 创建后强制刷新所有轮次，避免缓存/延迟
      await this.getLotteryRounds();
    } catch (e: any) {
      logger.error(`创建抽奖轮次失败: ${e.message || e}`);
      throw new Error(`数据库写入失败: ${e.message || e}`);
    }
    return round;
  }

  // 获取所有抽奖轮次
  public async getLotteryRounds(): Promise<LotteryRound[]> {
    const rounds = await getAllRounds();
    if (!rounds || !Array.isArray(rounds) || rounds.length === 0) {
      logger.warn("[lottery] getLotteryRounds: 未读取到任何轮次数据");
    } else {
      logger.info(`[lottery] getLotteryRounds: 读取到 ${rounds.length} 条轮次数据`);
    }
    return rounds;
  }

  // 获取活跃的抽奖轮次
  public async getActiveRounds(): Promise<LotteryRound[]> {
    const now = Date.now();
    const rounds = await this.getLotteryRounds();
    return rounds.filter((round) => round.isActive && round.startTime <= now && round.endTime >= now);
  }

  // 参与抽奖
  public async participateInLottery(
    roundId: string,
    userId: string,
    username: string,
    cfToken?: string,
    userRole?: string,
  ): Promise<LotteryWinner | null> {
    const round = await this.getRoundDetails(roundId); // 使用新的getRoundDetails
    if (!round) {
      throw new Error("抽奖轮次不存在");
    }

    if (!round.isActive) {
      throw new Error("抽奖轮次已结束");
    }

    const now = Date.now();
    if (now < round.startTime || now > round.endTime) {
      throw new Error("抽奖时间未到或已结束");
    }

    if (round.participants.includes(userId)) {
      throw new Error("您已经参与过此轮抽奖");
    }

    // Turnstile 验证（非管理员用户）
    const isAdmin = isAdminRole(userRole);
    if (!isAdmin && process.env.TURNSTILE_SECRET_KEY) {
      if (!cfToken) {
        logger.warn("非管理员用户缺少 Turnstile token，拒绝参与抽奖", { userId, userRole });
        throw new Error("需要完成人机验证才能参与抽奖");
      }

      // G7-09/死代码: 复用统一的 TurnstileService（DB 优先、env 兜底的密钥解析），
      // 不再直读 process.env 重复实现 siteverify 调用。
      try {
        const verified = await TurnstileService.verifyToken(cfToken);
        if (!verified) {
          logger.warn("Turnstile 验证失败", { userId, userRole });
          throw new Error("人机验证失败，请重新验证");
        }
        logger.info("Turnstile 验证成功", { userId, userRole });
      } catch (error) {
        if (error instanceof Error && error.message.includes("Turnstile")) {
          throw error;
        }
        logger.error("Turnstile 验证请求失败", {
          userId,
          userRole,
          error: error instanceof Error ? error.message : String(error),
        });
        throw new Error("人机验证服务暂时不可用，请稍后重试");
      }
    } else if (!isAdmin && !process.env.TURNSTILE_SECRET_KEY) {
      logger.info("跳过 Turnstile 验证（未配置密钥）", { userId, userRole });
    } else if (isAdmin) {
      logger.info("跳过 Turnstile 验证（管理员用户）", { userId, userRole });
    }

    // G7-09: 开奖随机数必须由服务端 CSPRNG 决定，不能用公开区块高度/客户端字段/时间戳
    // 拼种子（那些成分攻击者全部已知或可枚举）。这里直接 crypto.randomInt。
    const randomValue = crypto.randomInt(0, 0xffffffff) / 0xffffffff;

    // 获取最新的区块链数据（仅作展示信息）
    const blockchainData = await this.getBlockchainData();

    // 选择奖品
    const prize = this.selectPrize(round.prizes, randomValue);
    if (!prize) {
      throw new Error("没有可用的奖品");
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
      // G7-09: 本地抽奖标识，不是链上交易哈希。字段名保留以兼容旧契约，但值只是随机 ID。
      transactionHash: `local-${crypto.randomUUID()}`,
    };

    // 更新轮次数据
    round.participants.push(userId);
    round.winners.push(winner);
    round.blockchainHeight = blockchainData.height;
    round.seed = blockchainData.hash;

    // G7-08: 把本次抽奖的所有状态变更真正落库。此前这里只改内存对象，请求一结束
    // 全部丢弃，导致可无限抽奖、库存永不扣减、中奖记录不存在。
    await updateRound(roundId, {
      prizes: round.prizes,
      participants: round.participants,
      winners: round.winners,
      blockchainHeight: round.blockchainHeight,
      seed: round.seed,
    });

    // 更新用户记录
    await this.updateUserRecord(userId, username, winner, prize);

    logger.info(`用户 ${username} 在轮次 ${roundId} 中获得了 ${prize.name}`);
    return winner;
  }

  // 选择奖品
  private selectPrize(prizes: LotteryPrize[], randomValue: number): LotteryPrize | null {
    const availablePrizes = prizes.filter((prize) => prize.remaining > 0);
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

  // 更新用户记录
  // G7-08: 恢复真实实现。此前函数体整段被注释掉，导致 getLeaderboard/getStatistics 恒为空。
  private async updateUserRecord(
    userId: string,
    username: string,
    winner: LotteryWinner,
    prize: LotteryPrize,
  ): Promise<void> {
    const record = await getUserRecord(userId);
    await updateUserRecord(userId, {
      userId,
      username: username || record?.username || "",
      participationCount: (record?.participationCount || 0) + 1,
      winCount: (record?.winCount || 0) + 1,
      lastDrawTime: winner.drawTime,
      totalValue: (record?.totalValue || 0) + prize.value,
      history: [
        ...(record?.history || []),
        {
          roundId: winner.prizeId, // 兼容旧字段语义，这里实际是奖品 ID
          prizeId: winner.prizeId,
          prizeName: winner.prizeName,
          drawTime: winner.drawTime,
          value: prize.value,
        },
      ],
    });
  }

  // 获取用户抽奖记录
  public async getUserRecord(userId: string): Promise<UserLotteryRecord | null> {
    return getUserRecord(userId);
  }

  // 获取轮次详情
  public async getRoundDetails(roundId: string): Promise<LotteryRound | null> {
    const rounds = await this.getLotteryRounds();
    return rounds.find((round) => round.id === roundId) || null;
  }

  // 获取排行榜
  public async getLeaderboard(limit: number = 10): Promise<UserLotteryRecord[]> {
    const userRecords = await this.getAllUserRecords(); // 新增方法
    return userRecords.sort((a, b) => b.totalValue - a.totalValue).slice(0, limit);
  }

  // 重置轮次（管理员功能）
  public async resetRound(roundId: string): Promise<void> {
    const round = await this.getRoundDetails(roundId);
    if (!round) {
      throw new Error("抽奖轮次不存在");
    }

    // 重置奖品数量
    round.prizes.forEach((prize) => {
      prize.remaining = prize.quantity;
    });

    // 清空参与者和获奖者
    round.participants = [];
    round.winners = [];

    // 替换原有本地读写/Map操作，全部通过lotteryStorage接口实现
    // await this.saveData(); // 移除此行，因为不再直接保存
    await updateRound(roundId, {
      prizes: round.prizes,
      participants: round.participants,
      winners: round.winners,
    });
    logger.info(`重置抽奖轮次: ${roundId}`);
  }

  // G4-22: 补齐真实的状态更新，不再返回假的成功
  public async updateRoundStatus(roundId: string, isActive: boolean): Promise<LotteryRound> {
    const round = await this.getRoundDetails(roundId);
    if (!round) {
      throw new Error("抽奖轮次不存在");
    }
    if (typeof isActive !== "boolean") {
      throw new Error("isActive 必须为布尔值");
    }
    const updated = await updateRound(roundId, { isActive });
    logger.info(`更新抽奖轮次状态: ${roundId}, isActive=${isActive}`);
    return updated;
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
    const totalParticipants = (await this.getLotteryRounds()).reduce(
      (sum, round) => sum + round.participants.length,
      0,
    );
    const totalWinners = (await this.getLotteryRounds()).reduce((sum, round) => sum + round.winners.length, 0);
    const totalValue = (await this.getAllUserRecords()).reduce((sum, record) => sum + record.totalValue, 0);

    return {
      totalRounds,
      activeRounds,
      totalParticipants,
      totalWinners,
      totalValue,
    };
  }

  // 新增方法：获取所有用户记录
  private async getAllUserRecords(): Promise<UserLotteryRecord[]> {
    const rounds = await this.getLotteryRounds();
    const userIds = Array.from(new Set(rounds.flatMap((round) => round.participants)));
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
    // G7-08: 之前用 global 变量 + require 动态查找当逃生舱，混淆构建下脆弱。
    // 改为顶部静态 import。
    await deleteAllRounds();
  }
}

export const lotteryService = new LotteryService();
