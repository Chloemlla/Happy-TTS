import logger from "../utils/logger";
import { GitHubBillingService } from "./githubBillingService";
import { cleanupExpiredIPData } from "./ip";
import { ipBanSyncService } from "./ipBanSyncService";
import { TurnstileService } from "./turnstileService";

class SchedulerService {
  private cleanupInterval: NodeJS.Timeout | null = null;
  private syncInterval: NodeJS.Timeout | null = null;
  private isRunning = false;
  private isSyncEnabled = false;

  public start(): void {
    if (this.isRunning) {
      logger.warn("定时任务服务已在运行中");
      return;
    }

    this.isRunning = true;

    // 启动时先执行一次清理任务
    logger.info("定时任务服务启动中，执行初始清理...");
    this.cleanupExpiredData()
      .then((result) => {
        logger.info("初始清理完成", result);
      })
      .catch((error) => {
        logger.error("初始清理失败", error);
      });

    this.cleanupInterval = setInterval(
      () => {
        this.cleanupExpiredData();
      },
      5 * 60 * 1000,
    ); // 每5分钟执行一次

    // 启动 IP 封禁同步服务（如果 Redis 可用）
    this.startIPBanSync();

    logger.info("定时任务服务已启动，每5分钟清理一次过期数据");
  }

  public stop(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
    // 停止 IP 封禁同步服务
    ipBanSyncService.stop();
    this.isRunning = false;
    this.isSyncEnabled = false;
    logger.info("定时任务服务已停止");
  }

  private async cleanupExpiredData(): Promise<
    | {
        fingerprintCount: number;
        accessTokenCount: number;
        ipBanCount: number;
        ipDataCount: number;
        totalCount: number;
      }
    | undefined
  > {
    try {
      // 清理过期的临时指纹
      const fingerprintCount = await TurnstileService.cleanupExpiredFingerprints();

      // 清理过期的访问密钥
      const accessTokenCount = await TurnstileService.cleanupExpiredAccessTokens();

      // 清理过期的IP封禁记录
      const ipBanCount = await TurnstileService.cleanupExpiredIpBans();

      // 清理过期的IP信息数据
      const ipDataCount = await cleanupExpiredIPData();

      // 清理过期的GitHub Billing缓存
      await GitHubBillingService.clearExpiredCache();

      const totalCount = fingerprintCount + accessTokenCount + ipBanCount + ipDataCount;
      const result = { fingerprintCount, accessTokenCount, ipBanCount, ipDataCount, totalCount };

      if (totalCount > 0) {
        logger.info(
          `定时清理完成: 临时指纹 ${fingerprintCount} 条, 访问密钥 ${accessTokenCount} 条, IP封禁 ${ipBanCount} 条, IP数据 ${ipDataCount} 条`,
        );
      }

      this.lastCleanup = new Date();
      return result;
    } catch (error) {
      logger.error("定时清理任务失败", error);
    }
  }

  /**
   * 启动 IP 封禁同步服务
   */
  private startIPBanSync(): void {
    try {
      // 启动同步服务
      ipBanSyncService.start();
      this.isSyncEnabled = true;

      // 每5分钟执行一次双向同步
      this.syncInterval = setInterval(
        () => {
          this.syncIPBans();
        },
        5 * 60 * 1000,
      );

      logger.info("✅ IP 封禁同步服务已启动");
    } catch (error) {
      logger.warn("⚠️ IP 封禁同步服务启动失败（可能 Redis 未配置）:", error);
    }
  }

  /**
   * 执行 IP 封禁同步
   */
  private async syncIPBans(): Promise<void> {
    try {
      const result = await ipBanSyncService.bidirectionalSync();

      const mongoToRedisTotal = result.mongoToRedis.synced + result.mongoToRedis.merged;
      const redisToMongoTotal = result.redisToMongo.synced + result.redisToMongo.updated;

      if (mongoToRedisTotal > 0 || redisToMongoTotal > 0) {
        logger.info(
          `🔄 IP 封禁同步完成: ` +
            `MongoDB->Redis (新增${result.mongoToRedis.synced}, 合并${result.mongoToRedis.merged}), ` +
            `Redis->MongoDB (新增${result.redisToMongo.synced}, 更新${result.redisToMongo.updated})`,
        );
      }

      this.lastSync = new Date();
    } catch (error) {
      logger.error("❌ IP 封禁同步失败:", error);
    }
  }

  /**
   * 手动触发同步
   */
  public async manualSync(): Promise<{
    success: boolean;
    mongoToRedis?: any;
    redisToMongo?: any;
    error?: string;
  }> {
    try {
      const result = await ipBanSyncService.bidirectionalSync();
      logger.info("✅ 手动同步完成");
      return {
        success: true,
        mongoToRedis: result.mongoToRedis,
        redisToMongo: result.redisToMongo,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "未知错误";
      logger.error("❌ 手动同步失败:", error);
      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  public getStatus(): {
    isRunning: boolean;
    isSyncEnabled: boolean;
    lastCleanup?: Date;
    lastSync?: Date;
    ipBanSyncStatus?: any;
  } {
    return {
      isRunning: this.isRunning,
      isSyncEnabled: this.isSyncEnabled,
      lastCleanup: this.lastCleanup,
      lastSync: this.lastSync,
      ipBanSyncStatus: this.isSyncEnabled ? ipBanSyncService.getStatus() : undefined,
    };
  }

  public async manualCleanup(): Promise<{ success: boolean; deletedCount: number; error?: string }> {
    try {
      const fingerprintCount = await TurnstileService.cleanupExpiredFingerprints();
      const accessTokenCount = await TurnstileService.cleanupExpiredAccessTokens();
      const ipBanCount = await TurnstileService.cleanupExpiredIpBans();

      // 清理过期的IP信息数据
      const ipDataCount = await cleanupExpiredIPData();

      // 清理GitHub Billing缓存
      await GitHubBillingService.clearExpiredCache();

      const totalCount = fingerprintCount + accessTokenCount + ipBanCount + ipDataCount;

      logger.info(
        `手动清理完成: 临时指纹 ${fingerprintCount} 条, 访问密钥 ${accessTokenCount} 条, IP封禁 ${ipBanCount} 条, IP数据 ${ipDataCount} 条`,
      );

      return {
        success: true,
        deletedCount: totalCount,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "未知错误";
      logger.error("手动清理失败", error);
      return {
        success: false,
        deletedCount: 0,
        error: errorMessage,
      };
    }
  }

  private lastCleanup?: Date;
  private lastSync?: Date;
}

const schedulerService = new SchedulerService();

export { schedulerService };
