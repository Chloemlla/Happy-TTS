import logger from "../utils/logger";
import { GitHubBillingService } from "./githubBillingService";
import { cleanupExpiredIPData } from "./ip";
import { ipBanSyncService } from "./ipBanSyncService";
import { TurnstileService } from "./turnstileService";

interface CleanupResult {
  fingerprintCount: number;
  accessTokenCount: number;
  ipBanCount: number;
  ipDataCount: number;
  totalCount: number;
}

interface SyncResult {
  mongoToRedis: { synced: number; merged: number; skipped: number; errors: number };
  redisToMongo: { synced: number; updated: number; skipped: number; errors: number };
}

interface SchedulerCapability {
  key: string;
  label: string;
  description: string;
  scope: string;
  enabled: boolean;
  requiresAdmin: boolean;
  rateLimited: boolean;
  audited: boolean;
  destructive: boolean;
  intervalMs?: number;
}

class SchedulerService {
  private readonly CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
  private readonly SYNC_INTERVAL_MS = 5 * 60 * 1000;
  private cleanupInterval: NodeJS.Timeout | null = null;
  private syncInterval: NodeJS.Timeout | null = null;
  private isRunning = false;
  private isSyncEnabled = false;
  private isCleanupRunning = false; // G5-19: 重入保护
  private isSyncRunning = false; // G5-19: 重入保护
  private startedAt?: Date;
  private stoppedAt?: Date;
  private nextCleanup?: Date;
  private nextSync?: Date;
  private totalCleanups = 0;
  private totalCleanupErrors = 0;
  private totalSyncs = 0;
  private totalSyncErrors = 0;
  private lastCleanupResult?: CleanupResult;
  private lastCleanupError?: string;
  private lastCleanupDurationMs?: number;
  private lastSyncResult?: SyncResult;
  private lastSyncError?: string;
  private lastSyncDurationMs?: number;

  public start(): void {
    if (this.isRunning) {
      logger.warn("定时任务服务已在运行中");
      return;
    }

    this.isRunning = true;
    this.startedAt = new Date();
    this.stoppedAt = undefined;
    this.nextCleanup = new Date(Date.now() + this.CLEANUP_INTERVAL_MS);

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
      this.CLEANUP_INTERVAL_MS,
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
    this.stoppedAt = new Date();
    this.nextCleanup = undefined;
    this.nextSync = undefined;
    logger.info("定时任务服务已停止");
  }

  private async executeCleanup(): Promise<CleanupResult> {
    // G5-19: 五步清理逐步兜底——单项失败不影响后续，避免"一个清理失败→另一处内存无界增长"的连锁。
    const steps: Array<{ name: string; run: () => Promise<number> }> = [
      { name: "fingerprints", run: () => TurnstileService.cleanupExpiredFingerprints() },
      { name: "accessTokens", run: () => TurnstileService.cleanupExpiredAccessTokens() },
      { name: "ipBans", run: () => TurnstileService.cleanupExpiredIpBans() },
      { name: "ipData", run: () => cleanupExpiredIPData() },
      { name: "billingCache", run: () => GitHubBillingService.clearExpiredCache().then(() => 0) },
    ];

    const results = await Promise.allSettled(steps.map((step) => step.run()));
    const result: CleanupResult = {
      fingerprintCount: 0,
      accessTokenCount: 0,
      ipBanCount: 0,
      ipDataCount: 0,
      totalCount: 0,
    };

    results.forEach((settled, index) => {
      const stepName = steps[index].name;
      if (settled.status === "fulfilled") {
        const value = Number(settled.value || 0);
        if (stepName === "fingerprints") result.fingerprintCount = value;
        else if (stepName === "accessTokens") result.accessTokenCount = value;
        else if (stepName === "ipBans") result.ipBanCount = value;
        else if (stepName === "ipData") result.ipDataCount = value;
      } else {
        logger.error(`[Scheduler] 清理步骤 ${stepName} 失败`, {
          error: settled.reason instanceof Error ? settled.reason.message : String(settled.reason),
        });
      }
    });

    result.totalCount =
      result.fingerprintCount + result.accessTokenCount + result.ipBanCount + result.ipDataCount;
    return result;
  }

  private recordCleanupSuccess(result: CleanupResult, durationMs: number): void {
    this.lastCleanup = new Date();
    this.lastCleanupResult = result;
    this.lastCleanupDurationMs = durationMs;
    this.lastCleanupError = undefined;
    this.totalCleanups += 1;
  }

  private recordCleanupFailure(error: unknown, durationMs: number): string {
    const errorMessage = error instanceof Error ? error.message : "未知错误";
    this.lastCleanupError = errorMessage;
    this.lastCleanupDurationMs = durationMs;
    this.totalCleanupErrors += 1;
    return errorMessage;
  }

  private async cleanupExpiredData(): Promise<CleanupResult | undefined> {
    // G5-19: 重入保护——集合变大后单轮清理超过 5 分钟会出现多轮重叠，deleteMany 并发放大 DB 负载。
    if (this.isCleanupRunning) {
      logger.warn("[Scheduler] 清理任务正在进行中，跳过本轮");
      return undefined;
    }
    this.isCleanupRunning = true;
    const startTime = Date.now();
    try {
      const result = await this.executeCleanup();
      this.recordCleanupSuccess(result, Date.now() - startTime);

      if (result.totalCount > 0) {
        logger.info(
          `定时清理完成: 临时指纹 ${result.fingerprintCount} 条, 访问密钥 ${result.accessTokenCount} 条, IP封禁 ${result.ipBanCount} 条, IP数据 ${result.ipDataCount} 条`,
        );
      }

      return result;
    } catch (error) {
      this.recordCleanupFailure(error, Date.now() - startTime);
      logger.error("定时清理任务失败", error);
    } finally {
      this.isCleanupRunning = false;
      // G5-19: Redis 晚启动/重启后自愈——清理轮检测到 Redis 可用但同步未启用则动态启动。
      if (this.isRunning && !this.isSyncEnabled && ipBanSyncService.getStatus().redisAvailable) {
        this.startIPBanSync();
      }
      this.nextCleanup = this.isRunning ? new Date(Date.now() + this.CLEANUP_INTERVAL_MS) : undefined;
    }
  }

  /**
   * 启动 IP 封禁同步服务
   */
  private startIPBanSync(): void {
    try {
      // 启动同步服务
      ipBanSyncService.start();
      const syncStatus = ipBanSyncService.getStatus();
      if (!syncStatus.redisAvailable || !syncStatus.isRunning) {
        this.isSyncEnabled = false;
        this.nextSync = undefined;
        logger.info("IP 封禁同步服务未启用：Redis 当前不可用或同步配置未开启");
        return;
      }

      this.isSyncEnabled = syncStatus.isRunning;
      this.nextSync = new Date(Date.now() + this.SYNC_INTERVAL_MS);

      // 每5分钟执行一次双向同步
      this.syncInterval = setInterval(
        () => {
          this.syncIPBans();
        },
        this.SYNC_INTERVAL_MS,
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
    // G5-19: 重入保护，防止定时轮与手动同步并发。
    if (this.isSyncRunning) {
      logger.warn("[Scheduler] 同步任务正在进行中，跳过本轮");
      return;
    }
    this.isSyncRunning = true;
    const startTime = Date.now();
    try {
      const result = await ipBanSyncService.bidirectionalSync();
      this.recordSyncSuccess(result, Date.now() - startTime);

      const mongoToRedisTotal = result.mongoToRedis.synced + result.mongoToRedis.merged;
      const redisToMongoTotal = result.redisToMongo.synced + result.redisToMongo.updated;

      if (mongoToRedisTotal > 0 || redisToMongoTotal > 0) {
        logger.info(
          `🔄 IP 封禁同步完成: ` +
            `MongoDB->Redis (新增${result.mongoToRedis.synced}, 合并${result.mongoToRedis.merged}), ` +
            `Redis->MongoDB (新增${result.redisToMongo.synced}, 更新${result.redisToMongo.updated})`,
        );
      }

    } catch (error) {
      this.recordSyncFailure(error, Date.now() - startTime);
      logger.error("❌ IP 封禁同步失败:", error);
    } finally {
      this.isSyncRunning = false;
      this.nextSync = this.isSyncEnabled ? new Date(Date.now() + this.SYNC_INTERVAL_MS) : undefined;
    }
  }

  private recordSyncSuccess(result: SyncResult, durationMs: number): void {
    this.lastSync = new Date();
    this.lastSyncResult = result;
    this.lastSyncDurationMs = durationMs;
    this.lastSyncError = undefined;
    this.totalSyncs += 1;
  }

  private recordSyncFailure(error: unknown, durationMs: number): string {
    const errorMessage = error instanceof Error ? error.message : "未知错误";
    this.lastSyncError = errorMessage;
    this.lastSyncDurationMs = durationMs;
    this.totalSyncErrors += 1;
    return errorMessage;
  }

  /**
   * 手动触发同步
   */
  public async manualSync(): Promise<{
    success: boolean;
    mongoToRedis?: SyncResult["mongoToRedis"];
    redisToMongo?: SyncResult["redisToMongo"];
    error?: string;
  }> {
    // G5-19: 手动同步与定时轮共用重入保护。
    if (this.isSyncRunning) {
      return { success: false, error: "同步任务正在进行中，请稍后再试" };
    }
    this.isSyncRunning = true;
    const startTime = Date.now();
    try {
      const result = await ipBanSyncService.bidirectionalSync();
      this.recordSyncSuccess(result, Date.now() - startTime);
      logger.info("✅ 手动同步完成");
      return {
        success: true,
        mongoToRedis: result.mongoToRedis,
        redisToMongo: result.redisToMongo,
      };
    } catch (error) {
      const errorMessage = this.recordSyncFailure(error, Date.now() - startTime);
      logger.error("❌ 手动同步失败:", error);
      return {
        success: false,
        error: errorMessage,
      };
    } finally {
      this.isSyncRunning = false;
    }
  }

  public getStatus(): {
    isRunning: boolean;
    isSyncEnabled: boolean;
    startedAt?: Date;
    stoppedAt?: Date;
    lastCleanup?: Date;
    nextCleanup?: Date;
    cleanupIntervalMs: number;
    totalCleanups: number;
    totalCleanupErrors: number;
    errors: number;
    lastCleanupResult?: CleanupResult;
    lastCleanupError?: string;
    lastCleanupDurationMs?: number;
    lastSync?: Date;
    nextSync?: Date;
    syncIntervalMs: number;
    totalSyncs: number;
    totalSyncErrors: number;
    lastSyncResult?: SyncResult;
    lastSyncError?: string;
    lastSyncDurationMs?: number;
    ipBanSyncStatus?: any;
    capabilities: SchedulerCapability[];
  } {
    return {
      isRunning: this.isRunning,
      isSyncEnabled: this.isSyncEnabled,
      startedAt: this.startedAt,
      stoppedAt: this.stoppedAt,
      lastCleanup: this.lastCleanup,
      nextCleanup: this.nextCleanup,
      cleanupIntervalMs: this.CLEANUP_INTERVAL_MS,
      totalCleanups: this.totalCleanups,
      totalCleanupErrors: this.totalCleanupErrors,
      errors: this.totalCleanupErrors,
      lastCleanupResult: this.lastCleanupResult,
      lastCleanupError: this.lastCleanupError,
      lastCleanupDurationMs: this.lastCleanupDurationMs,
      lastSync: this.lastSync,
      nextSync: this.nextSync,
      syncIntervalMs: this.SYNC_INTERVAL_MS,
      totalSyncs: this.totalSyncs,
      totalSyncErrors: this.totalSyncErrors,
      lastSyncResult: this.lastSyncResult,
      lastSyncError: this.lastSyncError,
      lastSyncDurationMs: this.lastSyncDurationMs,
      ipBanSyncStatus: this.isSyncEnabled ? ipBanSyncService.getStatus() : undefined,
      capabilities: this.getCapabilities(),
    };
  }

  private getCapabilities(): SchedulerCapability[] {
    return [
      {
        key: "scheduler.control",
        label: "调度器控制",
        description: "启动或停止定时清理和同步循环",
        scope: "scheduler:cleanup,scheduler:ipban-sync",
        enabled: true,
        requiresAdmin: true,
        rateLimited: true,
        audited: true,
        destructive: false,
      },
      {
        key: "cleanup.expired-data",
        label: "过期数据清理",
        description: "清理临时指纹、访问密钥、IP封禁、IP信息和 GitHub Billing 缓存",
        scope: "turnstile:fingerprints,turnstile:access-tokens,ip:bans,ip:metadata,billing:cache",
        enabled: true,
        requiresAdmin: true,
        rateLimited: true,
        audited: true,
        destructive: true,
        intervalMs: this.CLEANUP_INTERVAL_MS,
      },
      {
        key: "ipban.sync",
        label: "IP封禁双向同步",
        description: "在 MongoDB 与 Redis 之间同步和合并 IP 封禁记录",
        scope: "ipban:mongodb,ipban:redis",
        enabled: this.isSyncEnabled,
        requiresAdmin: true,
        rateLimited: true,
        audited: true,
        destructive: false,
        intervalMs: this.SYNC_INTERVAL_MS,
      },
    ];
  }

  public async manualCleanup(): Promise<{ success: boolean; deletedCount: number; details?: CleanupResult; error?: string }> {
    // G5-19: 手动清理与定时轮共用重入保护。
    if (this.isCleanupRunning) {
      return { success: false, deletedCount: 0, error: "清理任务正在进行中，请稍后再试" };
    }
    this.isCleanupRunning = true;
    const startTime = Date.now();
    try {
      const result = await this.executeCleanup();
      this.recordCleanupSuccess(result, Date.now() - startTime);

      logger.info(
        `手动清理完成: 临时指纹 ${result.fingerprintCount} 条, 访问密钥 ${result.accessTokenCount} 条, IP封禁 ${result.ipBanCount} 条, IP数据 ${result.ipDataCount} 条`,
      );

      return {
        success: true,
        deletedCount: result.totalCount,
        details: result,
      };
    } catch (error) {
      const errorMessage = this.recordCleanupFailure(error, Date.now() - startTime);
      logger.error("手动清理失败", error);
      return {
        success: false,
        deletedCount: 0,
        error: errorMessage,
      };
    } finally {
      this.isCleanupRunning = false;
    }
  }

  private lastCleanup?: Date;
  private lastSync?: Date;
}

const schedulerService = new SchedulerService();

export { schedulerService };
