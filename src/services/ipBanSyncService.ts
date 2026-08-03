import { config } from "../config/config";
import { IpBanModel } from "../models/ipBanModel";
import logger from "../utils/logger";
import { redisService } from "./redisService";

/**
 * IP 封禁同步服务
 * 负责 MongoDB 和 Redis 之间的数据同步和智能合并
 */
class IpBanSyncService {
  private syncInterval: NodeJS.Timeout | null = null;
  private isSyncing: boolean = false;
  private readonly SYNC_INTERVAL_MS = 5 * 60 * 1000; // 5分钟同步一次

  /**
   * 启动同步服务
   */
  public start(): void {
    if (!config.redis.enabled || !redisService.isAvailable()) {
      logger.info("📦 Redis 未启用，跳过同步服务");
      return;
    }

    logger.info("🔄 启动 IP 封禁同步服务...");

    // 立即执行一次同步
    this.syncMongoToRedis().catch((err) => {
      logger.error("初始同步失败:", err);
    });

    // 设置定时同步
    this.syncInterval = setInterval(() => {
      this.syncMongoToRedis().catch((err) => {
        logger.error("定时同步失败:", err);
      });
    }, this.SYNC_INTERVAL_MS);

    logger.info(`✅ 同步服务已启动，每 ${this.SYNC_INTERVAL_MS / 1000 / 60} 分钟同步一次`);
  }

  /**
   * 停止同步服务
   */
  public stop(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
      logger.info("👋 同步服务已停止");
    }
  }

  /**
   * 从 MongoDB 同步到 Redis（智能合并）
   */
  public async syncMongoToRedis(): Promise<{
    synced: number;
    merged: number;
    skipped: number;
    errors: number;
  }> {
    if (this.isSyncing) {
      logger.warn("⚠️ 同步正在进行中，跳过本次同步");
      return { synced: 0, merged: 0, skipped: 0, errors: 0 };
    }

    if (!redisService.isAvailable()) {
      logger.warn("⚠️ Redis 不可用，跳过同步");
      return { synced: 0, merged: 0, skipped: 0, errors: 0 };
    }

    this.isSyncing = true;
    const startTime = Date.now();
    let synced = 0;
    let merged = 0;
    let skipped = 0;
    let errors = 0;

    try {
      logger.info("🔄 开始同步 MongoDB -> Redis...");

      // 获取所有未过期的 MongoDB 封禁记录
      const mongoBans = await IpBanModel.find({
        expiresAt: { $gt: new Date() },
      }).lean();

      logger.info(`📊 MongoDB 中有 ${mongoBans.length} 条未过期的封禁记录`);

      // 获取所有 Redis 中的封禁记录
      const redisBans = await redisService.getAllBannedIPs();
      const redisBanMap = new Map(redisBans.map((ban) => [ban.ip, ban]));

      logger.info(`📊 Redis 中有 ${redisBans.length} 条封禁记录`);

      // 同步每条 MongoDB 记录到 Redis
      for (const mongoBan of mongoBans) {
        try {
          const ip = mongoBan.ipAddress;
          const redisBan = redisBanMap.get(ip);

          // 计算剩余封禁时长（分钟）
          const now = Date.now();
          const expiresAt = new Date(mongoBan.expiresAt).getTime();
          const remainingMs = expiresAt - now;
          const remainingMinutes = Math.ceil(remainingMs / 1000 / 60);

          if (remainingMinutes <= 0) {
            // 已过期，跳过
            skipped++;
            continue;
          }

          if (redisBan) {
            // Redis 中已存在，智能合并
            const mergeResult = await this.mergeIPBan(mongoBan, redisBan, remainingMinutes);
            if (mergeResult) {
              merged++;
            } else {
              skipped++;
            }
          } else {
            // Redis 中不存在，直接同步
            const success = await redisService.banIP(ip, mongoBan.reason, remainingMinutes, {
              fingerprint: mongoBan.fingerprint,
              userAgent: mongoBan.userAgent,
              violationCount: mongoBan.violationCount,
            });

            if (success) {
              synced++;
            } else {
              errors++;
            }
          }
        } catch (error) {
          logger.error(`同步 IP ${mongoBan.ipAddress} 失败:`, error);
          errors++;
        }
      }

      const duration = Date.now() - startTime;
      logger.info(`✅ 同步完成: 新增 ${synced}, 合并 ${merged}, 跳过 ${skipped}, 错误 ${errors}, 耗时 ${duration}ms`);

      return { synced, merged, skipped, errors };
    } catch (error) {
      logger.error("❌ 同步过程失败:", error);
      return { synced, merged, skipped, errors };
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * 智能合并 IP 封禁数据
   * @param mongoBan MongoDB 中的封禁记录
   * @param redisBan Redis 中的封禁记录
   * @param remainingMinutes 剩余封禁时长（分钟）
   * @returns 是否进行了合并
   */
  private async mergeIPBan(mongoBan: any, redisBan: any, remainingMinutes: number): Promise<boolean> {
    try {
      const ip = mongoBan.ipAddress;

      // 比较过期时间，使用较晚的那个
      const mongoExpiresAt = new Date(mongoBan.expiresAt).getTime();
      const redisExpiresAt = redisBan.expiresAt;

      // 如果 MongoDB 的过期时间更晚，更新 Redis
      if (mongoExpiresAt > redisExpiresAt) {
        logger.debug(`🔄 合并 ${ip}: MongoDB 过期时间更晚，更新 Redis`);

        // 合并违规次数（取较大值）
        const mergedViolationCount = Math.max(mongoBan.violationCount || 1, redisBan.violationCount || 1);

        // 合并原因（如果不同，拼接）
        let mergedReason = mongoBan.reason;
        if (redisBan.reason && redisBan.reason !== mongoBan.reason) {
          mergedReason = `${mongoBan.reason}; ${redisBan.reason}`;
        }

        // 更新 Redis
        await redisService.banIP(ip, mergedReason, remainingMinutes, {
          fingerprint: mongoBan.fingerprint || redisBan.fingerprint,
          userAgent: mongoBan.userAgent || redisBan.userAgent,
          violationCount: mergedViolationCount,
        });

        return true;
      } else {
        // Redis 的过期时间更晚或相同，不需要更新
        logger.debug(`⏭️ 跳过 ${ip}: Redis 数据已是最新`);
        return false;
      }
    } catch (error) {
      logger.error(`合并 IP ${mongoBan.ipAddress} 失败:`, error);
      return false;
    }
  }

  /**
   * 从 Redis 同步到 MongoDB（反向同步）
   * 用于将 Redis 中的新增封禁记录同步回 MongoDB
   */
  public async syncRedisToMongo(): Promise<{
    synced: number;
    updated: number;
    skipped: number;
    errors: number;
    duration: number;
  }> {
    if (!redisService.isAvailable()) {
      logger.warn("⚠️ Redis 不可用，跳过反向同步");
      return { synced: 0, updated: 0, skipped: 0, errors: 0, duration: 0 };
    }

    const startTime = Date.now();
    let synced = 0;
    let updated = 0;
    let skipped = 0;
    let errors = 0;

    try {
      logger.info("🔄 开始反向同步 Redis -> MongoDB...");

      // 获取所有 Redis 中的封禁记录
      const redisBans = await redisService.getAllBannedIPs();
      logger.info(`📊 Redis 中有 ${redisBans.length} 条封禁记录`);

      if (redisBans.length === 0) {
        logger.info("✅ 无 Redis 封禁记录需要同步");
        return { synced: 0, updated: 0, skipped: 0, errors: 0, duration: Date.now() - startTime };
      }

      // 批量获取所有 Redis IP 在 MongoDB 中的记录（一次查询）
      const redisIps = redisBans.map((b) => b.ip);
      const existingMongoBans = await IpBanModel.find({ ipAddress: { $in: redisIps } }).lean();
      const existingMap = new Map(existingMongoBans.map((b) => [b.ipAddress, b]));

      // 构造 bulkWrite 操作
      const bulkOps: any[] = [];

      for (const redisBan of redisBans) {
        try {
          const ip = redisBan.ip;
          const mongoBan = existingMap.get(ip);
          const redisExpiresAt = new Date(redisBan.expiresAt);

          if (mongoBan) {
            if (redisExpiresAt > mongoBan.expiresAt) {
              // Redis 的过期时间更晚，更新 MongoDB
              bulkOps.push({
                updateOne: {
                  filter: { ipAddress: ip },
                  update: {
                    $set: {
                      expiresAt: redisExpiresAt,
                      reason: redisBan.reason,
                      violationCount: Math.max(mongoBan.violationCount, redisBan.violationCount || 1),
                      ...(redisBan.fingerprint ? { fingerprint: redisBan.fingerprint } : {}),
                      ...(redisBan.userAgent ? { userAgent: redisBan.userAgent } : {}),
                    },
                  },
                },
              });
              updated++;
            } else {
              skipped++;
            }
          } else {
            // 不存在，创建新记录
            bulkOps.push({
              insertOne: {
                document: {
                  ipAddress: ip,
                  reason: redisBan.reason,
                  violationCount: redisBan.violationCount || 1,
                  bannedAt: new Date(redisBan.bannedAt),
                  expiresAt: redisExpiresAt,
                  fingerprint: redisBan.fingerprint || "",
                  userAgent: redisBan.userAgent || "",
                },
              },
            });
            synced++;
          }
        } catch (error) {
          logger.error(`反向同步 IP ${redisBan.ip} 失败:`, error);
          errors++;
        }
      }

      // 执行批量写入（一次操作）
      if (bulkOps.length > 0) {
        await IpBanModel.bulkWrite(bulkOps);
      }

      const duration = Date.now() - startTime;
      logger.info(
        `✅ 反向同步完成: 新增 ${synced}, 更新 ${updated}, 跳过 ${skipped}, 错误 ${errors}, 耗时 ${duration}ms`,
      );

      return { synced, updated, skipped, errors, duration: Date.now() - startTime };
    } catch (error) {
      logger.error("❌ 反向同步过程失败:", error);
      return { synced, updated, skipped, errors, duration: Date.now() - startTime };
    }
  }

  /**
   * 双向同步（MongoDB <-> Redis）
   */
  public async bidirectionalSync(): Promise<{
    mongoToRedis: { synced: number; merged: number; skipped: number; errors: number };
    redisToMongo: { synced: number; updated: number; skipped: number; errors: number };
  }> {
    logger.info("🔄 开始双向同步...");

    const mongoToRedis = await this.syncMongoToRedis();
    const redisToMongo = await this.syncRedisToMongo();

    logger.info("✅ 双向同步完成");

    return { mongoToRedis, redisToMongo };
  }

  /**
   * 清理过期的封禁记录（MongoDB 和 Redis）
   */
  public async cleanupExpired(): Promise<{
    mongoDeleted: number;
    redisDeleted: number;
  }> {
    logger.info("🧹 开始清理过期记录...");

    let mongoDeleted = 0;
    let redisDeleted = 0;

    try {
      // 清理 MongoDB 过期记录（虽然有 TTL 索引，但手动清理更及时）
      const mongoResult = await IpBanModel.deleteMany({
        expiresAt: { $lt: new Date() },
      });
      mongoDeleted = mongoResult.deletedCount || 0;

      // 清理 Redis 过期记录
      if (redisService.isAvailable()) {
        redisDeleted = await redisService.cleanupExpiredBans();
      }

      logger.info(`✅ 清理完成: MongoDB ${mongoDeleted} 条, Redis ${redisDeleted} 条`);
    } catch (error) {
      logger.error("❌ 清理过期记录失败:", error);
    }

    return { mongoDeleted, redisDeleted };
  }

  /**
   * 获取同步状态
   */
  public getStatus(): {
    isRunning: boolean;
    isSyncing: boolean;
    syncInterval: number;
    redisAvailable: boolean;
  } {
    return {
      isRunning: this.syncInterval !== null,
      isSyncing: this.isSyncing,
      syncInterval: this.SYNC_INTERVAL_MS,
      redisAvailable: redisService.isAvailable(),
    };
  }
}

// 导出单例
export const ipBanSyncService = new IpBanSyncService();
