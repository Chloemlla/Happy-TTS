import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import logger from "../utils/logger";
import { mongoose } from "./mongoService";

// FilterQuery type definition for compatibility
type FilterQuery<T> = {
  [P in keyof T]?:
    | T[P]
    | { $in: T[P][] }
    | { $ne: T[P] }
    | { $gt: T[P] }
    | { $gte: T[P] }
    | { $lt: T[P] }
    | { $lte: T[P] }
    | { $exists: boolean };
} & { _id?: any };

import crypto from "node:crypto";
import { type DeviceFingerprint, RiskEvaluationEngine } from "./riskEvaluationEngine";

// 性能监控接口
interface PerformanceStats {
  totalWrites: number;
  batchWrites: number;
  singleWrites: number;
  avgBatchSize: number;
  avgWriteTime: number;
  cacheHitRate: number;
  queueSize: number;
  errorCount: number;
  lastFlushTime: number;
  retryCount: number;
  failedRetries: number;
  dedupeHits: number;
}

// 健康状态接口
interface HealthStatus {
  status: "healthy" | "degraded" | "unhealthy";
  uptime: number;
  queueUtilization: number;
  errorRate: number;
  avgWriteLatency: number;
  mongoConnected: boolean;
  lastError?: string;
  lastErrorTime?: number;
}

// 批量写入项接口
interface BatchWriteItem {
  data: any;
  timestamp: number;
  retryCount: number;
}

// MongoDB 数据收集 Schema（开启 strict 以拒绝未声明字段）
const DataCollectionSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, index: true, maxlength: 128 },
    action: { type: String, required: true, index: true, maxlength: 128 },
    timestamp: { type: String, required: true, maxlength: 64 },
    details: { type: Object },
    // 智能分析增强字段（可选）
    riskScore: { type: Number, default: 0, min: 0, max: 1 },
    riskLevel: { type: String, enum: ["LOW", "MEDIUM", "HIGH", "CRITICAL"], default: "LOW", index: true },
    analysis: { type: Object },
    hash: { type: String, index: true, maxlength: 64 },
    duplicate: { type: Boolean, default: false, index: true },
    category: { type: String, index: true, maxlength: 64 },
    tags: { type: [String], default: [] },
  },
  {
    collection: "data_collections",
    strict: true,
    // 添加TTL索引：可选自动过期数据（默认禁用，可通过环境变量启用）
    ...(process.env.DATA_COLLECTION_TTL_DAYS
      ? {
          timestamps: true,
          expireAfterSeconds: parseInt(process.env.DATA_COLLECTION_TTL_DAYS, 10) * 86400,
        }
      : {}),
  },
);

// 复合索引优化常用查询
DataCollectionSchema.index({ userId: 1, timestamp: -1 });
DataCollectionSchema.index({ action: 1, timestamp: -1 });
DataCollectionSchema.index({ riskLevel: 1, timestamp: -1 });
DataCollectionSchema.index({ duplicate: 1, hash: 1 });
DataCollectionSchema.index({ category: 1, timestamp: -1 });

const DataCollectionModel = mongoose.models.DataCollection || mongoose.model("DataCollection", DataCollectionSchema);

type StorageMode = "mongo" | "file" | "both";

class DataCollectionService {
  private static instance: DataCollectionService;
  private readonly DATA_DIR = join(process.cwd(), "data");
  private readonly TEST_DATA_DIR = join(process.cwd(), "test-data");

  // 智能分析引擎与去重缓存
  private readonly riskEngine = new RiskEvaluationEngine();
  private readonly dedupeTTLms = 10 * 60 * 1000; // 10分钟内视为重复
  private readonly hashSeenAt = new Map<string, number>();
  private readonly rawSecret = process.env.DATA_COLLECTION_RAW_SECRET || "";

  // =============== 批量写入优化配置 ===============
  private readonly BATCH_SIZE = parseInt(process.env.DATA_COLLECTION_BATCH_SIZE || "50", 10);
  private readonly BATCH_TIMEOUT = parseInt(process.env.DATA_COLLECTION_BATCH_TIMEOUT || "2000", 10); // 2秒
  private readonly MAX_QUEUE_SIZE = parseInt(process.env.DATA_COLLECTION_MAX_QUEUE_SIZE || "1000", 10);
  private readonly MAX_RETRY_COUNT = 3;

  // 批量写入队列和状态
  private writeQueue: BatchWriteItem[] = [];
  private batchTimer: NodeJS.Timeout | null = null;
  private isProcessingBatch = false;
  private isShuttingDown = false;

  // 性能统计
  private stats: PerformanceStats = {
    totalWrites: 0,
    batchWrites: 0,
    singleWrites: 0,
    avgBatchSize: 0,
    avgWriteTime: 0,
    cacheHitRate: 0,
    queueSize: 0,
    errorCount: 0,
    lastFlushTime: Date.now(),
    retryCount: 0,
    failedRetries: 0,
    dedupeHits: 0,
  };

  // 写入时间样本（用于计算平均值）
  private writeTimeSamples: number[] = [];
  private readonly MAX_SAMPLES = 100;

  // 健康监控
  private readonly serviceStartTime = Date.now();
  private lastError: string | undefined;
  private lastErrorTime: number | undefined;

  // 断路器模式（Circuit Breaker）
  private circuitBreakerState: "CLOSED" | "OPEN" | "HALF_OPEN" = "CLOSED";
  private circuitBreakerFailureCount = 0;
  private circuitBreakerLastFailureTime = 0;
  private readonly CIRCUIT_BREAKER_THRESHOLD = 5; // 5次连续失败后打开断路器
  private readonly CIRCUIT_BREAKER_TIMEOUT = 60000; // 1分钟后尝试半开状态
  private readonly CIRCUIT_BREAKER_SUCCESS_THRESHOLD = 3; // 半开状态下3次成功后关闭断路器

  // 限流器（Rate Limiter）
  private readonly rateLimiter = new Map<string, { count: number; resetTime: number }>();
  private readonly RATE_LIMIT_WINDOW = 60000; // 1分钟窗口
  private readonly RATE_LIMIT_MAX_REQUESTS = 1000; // 每分钟最多1000次请求

  // 数据验证缓存（避免重复验证）
  private readonly validationCache = new Map<string, { valid: boolean; timestamp: number }>();
  private readonly VALIDATION_CACHE_TTL = 300000; // 5分钟

  private constructor() {
    this.initializeService();
    this.setupBatchProcessor();
    this.setupGracefulShutdown();
  }

  public static getInstance(): DataCollectionService {
    if (!DataCollectionService.instance) {
      DataCollectionService.instance = new DataCollectionService();
    }
    return DataCollectionService.instance;
  }

  private async initializeService() {
    try {
      // 确保数据目录存在
      if (!existsSync(this.DATA_DIR)) {
        await mkdir(this.DATA_DIR, { recursive: true });
        logger.info("已创建数据收集目录");
      }

      // 启动性能监控
      this.startPerformanceMonitoring();

      // 启动健康检查
      this.startHealthCheck();

      // 启动缓存清理
      this.startCacheCleanup();

      logger.info("[DataCollection] Service initialized with batch optimization", {
        batchSize: this.BATCH_SIZE,
        batchTimeout: this.BATCH_TIMEOUT,
        maxQueueSize: this.MAX_QUEUE_SIZE,
        circuitBreakerEnabled: true,
        rateLimitEnabled: true,
      });
    } catch (error) {
      logger.error("初始化数据收集服务失败:", error);
      this.recordError("Service initialization failed", error);
    }
  }

  // =============== 批量写入优化实现 ===============

  private setupBatchProcessor() {
    // 定期处理批量写入
    setInterval(() => {
      if (this.writeQueue.length > 0 && !this.isProcessingBatch) {
        this.processBatch();
      }
    }, this.BATCH_TIMEOUT);
  }

  private setupGracefulShutdown() {
    const gracefulShutdown = async () => {
      logger.info("[数据收集] 开始优雅关闭");
      this.isShuttingDown = true;

      // 等待批量写入完成
      let waitCount = 0;
      const maxWaitTime = 30000; // 最多等待30秒

      while (this.writeQueue.length > 0 && waitCount < maxWaitTime) {
        logger.info(`[数据收集] 等待队列清空: 剩余 ${this.writeQueue.length} 项`);
        await new Promise((resolve) => setTimeout(resolve, 1000));
        waitCount++;
      }

      // 强制处理剩余队列
      if (this.writeQueue.length > 0) {
        logger.warn(`[DataCollection] Force processing ${this.writeQueue.length} remaining items`);
        await this.processBatch();
      }

      // 清理定时器
      if (this.batchTimer) {
        clearTimeout(this.batchTimer);
      }

      // 输出最终统计
      logger.info("[DataCollection] Final performance stats:", this.getPerformanceStats());

      process.exit(0);
    };

    process.on("SIGTERM", gracefulShutdown);
    process.on("SIGINT", gracefulShutdown);
  }

  private async processBatch() {
    if (this.isProcessingBatch || this.writeQueue.length === 0) {
      return;
    }

    // 检查断路器状态
    if (!this.checkCircuitBreaker()) {
      logger.warn("[DataCollection] Circuit breaker is OPEN, skipping batch processing");
      return;
    }

    this.isProcessingBatch = true;
    const startTime = Date.now();

    try {
      // 取出批量数据
      const batchSize = Math.min(this.BATCH_SIZE, this.writeQueue.length);
      const batch = this.writeQueue.splice(0, batchSize);

      if (batch.length === 0) {
        this.isProcessingBatch = false;
        return;
      }

      logger.debug(`[DataCollection] Processing batch of ${batch.length} items`);

      // 执行批量写入（带超时保护）
      await Promise.race([
        this.executeBulkWrite(batch),
        new Promise(
          (_, reject) => setTimeout(() => reject(new Error("Batch write timeout")), 30000), // 30秒超时
        ),
      ]);

      // 更新统计
      const writeTime = Date.now() - startTime;
      this.updatePerformanceStats(batch.length, writeTime, true);

      // 断路器：成功操作
      this.recordCircuitBreakerSuccess();

      logger.info(`[DataCollection] Batch write completed: ${batch.length} items in ${writeTime}ms`);
    } catch (error) {
      logger.error("[DataCollection] Batch processing failed:", error);
      this.stats.errorCount++;

      // 断路器：失败操作
      this.recordCircuitBreakerFailure();
      this.recordError("Batch processing failed", error);

      // 重试机制：将失败的项目重新加入队列（增加重试计数）
      const batchSize = Math.min(this.BATCH_SIZE, this.writeQueue.length);
      const failedBatch = this.writeQueue.splice(0, batchSize);

      const retryItems = failedBatch
        .filter((item) => item.retryCount < this.MAX_RETRY_COUNT)
        .map((item) => {
          this.stats.retryCount++;
          return { ...item, retryCount: item.retryCount + 1 };
        });

      const failedItems = failedBatch.filter((item) => item.retryCount >= this.MAX_RETRY_COUNT);
      if (failedItems.length > 0) {
        this.stats.failedRetries += failedItems.length;
        logger.error(`[DataCollection] ${failedItems.length} items exceeded max retry count and were dropped`);

        // 可选：将失败的数据写入降级文件
        await this.saveDegradedData(failedItems).catch((err) =>
          logger.error("[DataCollection] Failed to save degraded data:", err),
        );
      }

      if (retryItems.length > 0) {
        // 使用指数退避策略
        const delay = Math.min(1000 * 2 ** retryItems[0].retryCount, 10000);
        setTimeout(() => {
          this.writeQueue.unshift(...retryItems);
          logger.warn(`[DataCollection] ${retryItems.length} items queued for retry after ${delay}ms`);
        }, delay);
      }
    } finally {
      this.isProcessingBatch = false;
      this.stats.queueSize = this.writeQueue.length;
    }
  }

  private async executeBulkWrite(batch: BatchWriteItem[]) {
    if (mongoose.connection.readyState !== 1) {
      throw new Error("MongoDB 未连接");
    }

    const Model = DataCollectionModel;
    const operations = batch.map((item) => ({
      insertOne: {
        document: {
          userId: item.data.userId,
          action: item.data.action,
          timestamp: item.data.timestamp,
          details: item.data.details,
          riskScore: Number(item.data.riskScore || 0),
          riskLevel: item.data.riskLevel || "LOW",
          analysis: item.data.analysis || {},
          hash: item.data.hash || undefined,
          duplicate: Boolean(item.data.duplicate),
          category: item.data.category || undefined,
          tags: Array.isArray(item.data.tags) ? item.data.tags.slice(0, 50) : [],
          encryptedRaw: item.data.encryptedRaw || undefined,
        },
      },
    }));

    // 使用 bulkWrite 进行批量操作
    const result = await Model.bulkWrite(operations, {
      ordered: false, // 非顺序执行，提升并发性能
      writeConcern: { w: 1, j: false }, // 优化写入关注点
    });

    logger.debug(`[DataCollection] BulkWrite result:`, {
      insertedCount: result.insertedCount,
      modifiedCount: result.modifiedCount,
      upsertedCount: result.upsertedCount,
    });

    return result;
  }

  private updatePerformanceStats(itemCount: number, writeTime: number, isBatch: boolean) {
    this.stats.totalWrites += itemCount;

    if (isBatch) {
      this.stats.batchWrites++;
      this.stats.avgBatchSize =
        (this.stats.avgBatchSize * (this.stats.batchWrites - 1) + itemCount) / this.stats.batchWrites;
    } else {
      this.stats.singleWrites++;
    }

    // 更新写入时间样本
    this.writeTimeSamples.push(writeTime);
    if (this.writeTimeSamples.length > this.MAX_SAMPLES) {
      this.writeTimeSamples.shift();
    }

    // 计算平均写入时间
    this.stats.avgWriteTime = this.writeTimeSamples.reduce((a, b) => a + b, 0) / this.writeTimeSamples.length;
    this.stats.lastFlushTime = Date.now();
  }

  private startPerformanceMonitoring() {
    // 每10分钟输出性能统计
    setInterval(
      () => {
        const stats = this.getPerformanceStats();
        logger.info("[DataCollection] Performance stats:", stats);

        // 清理过期的去重缓存
        this.cleanupDedupeCache(Date.now());
      },
      10 * 60 * 1000,
    ); // 10分钟
  }

  private startHealthCheck() {
    // 每30秒检查服务健康状态
    setInterval(() => {
      const health = this.getHealthStatus();

      if (health.status === "unhealthy") {
        logger.error("[DataCollection] Service is UNHEALTHY:", health);
      } else if (health.status === "degraded") {
        logger.warn("[DataCollection] Service is DEGRADED:", health);
      } else {
        logger.debug("[DataCollection] Service is HEALTHY:", health);
      }
    }, 30000); // 30秒
  }

  private startCacheCleanup() {
    // 每5分钟清理过期缓存
    setInterval(
      () => {
        this.cleanupValidationCache();
        this.cleanupRateLimiter();
        logger.debug("[DataCollection] Cache cleanup completed");
      },
      5 * 60 * 1000,
    ); // 5分钟
  }

  // =============== 断路器模式实现 ===============

  private checkCircuitBreaker(): boolean {
    const now = Date.now();

    // 如果断路器关闭，允许通过
    if (this.circuitBreakerState === "CLOSED") {
      return true;
    }

    // 如果断路器打开，检查是否可以转为半开状态
    if (this.circuitBreakerState === "OPEN") {
      if (now - this.circuitBreakerLastFailureTime >= this.CIRCUIT_BREAKER_TIMEOUT) {
        logger.info("[DataCollection] Circuit breaker transitioning to HALF_OPEN");
        this.circuitBreakerState = "HALF_OPEN";
        this.circuitBreakerFailureCount = 0;
        return true;
      }
      return false;
    }

    // 半开状态：允许通过，但会根据结果决定是否关闭或重新打开
    return true;
  }

  private recordCircuitBreakerSuccess(): void {
    if (this.circuitBreakerState === "HALF_OPEN") {
      this.circuitBreakerFailureCount++;

      if (this.circuitBreakerFailureCount >= this.CIRCUIT_BREAKER_SUCCESS_THRESHOLD) {
        logger.info("[DataCollection] Circuit breaker closing after successful operations");
        this.circuitBreakerState = "CLOSED";
        this.circuitBreakerFailureCount = 0;
      }
    } else if (this.circuitBreakerState === "CLOSED") {
      // 重置失败计数
      this.circuitBreakerFailureCount = 0;
    }
  }

  private recordCircuitBreakerFailure(): void {
    this.circuitBreakerFailureCount++;
    this.circuitBreakerLastFailureTime = Date.now();

    if (this.circuitBreakerState === "CLOSED") {
      if (this.circuitBreakerFailureCount >= this.CIRCUIT_BREAKER_THRESHOLD) {
        logger.error("[DataCollection] Circuit breaker OPENING after consecutive failures");
        this.circuitBreakerState = "OPEN";
      }
    } else if (this.circuitBreakerState === "HALF_OPEN") {
      logger.warn("[DataCollection] Circuit breaker reopening after failure in HALF_OPEN state");
      this.circuitBreakerState = "OPEN";
      this.circuitBreakerFailureCount = 0;
    }
  }

  // =============== 限流器实现 ===============

  private checkRateLimit(userId: string): boolean {
    const now = Date.now();
    const key = `rate_limit_${userId}`;

    const limiter = this.rateLimiter.get(key);

    if (!limiter || now >= limiter.resetTime) {
      // 创建新的限流记录
      this.rateLimiter.set(key, {
        count: 1,
        resetTime: now + this.RATE_LIMIT_WINDOW,
      });
      return true;
    }

    if (limiter.count >= this.RATE_LIMIT_MAX_REQUESTS) {
      logger.warn(`[DataCollection] Rate limit exceeded for user: ${userId}`);
      return false;
    }

    limiter.count++;
    return true;
  }

  private cleanupRateLimiter(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, limiter] of this.rateLimiter.entries()) {
      if (now >= limiter.resetTime) {
        this.rateLimiter.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.debug(`[DataCollection] Cleaned ${cleaned} expired rate limiters`);
    }
  }

  // =============== 验证缓存实现 ===============

  private getCachedValidation(dataHash: string): boolean | null {
    const cached = this.validationCache.get(dataHash);

    if (!cached) {
      return null;
    }

    const now = Date.now();
    if (now - cached.timestamp >= this.VALIDATION_CACHE_TTL) {
      this.validationCache.delete(dataHash);
      return null;
    }

    return cached.valid;
  }

  private setCachedValidation(dataHash: string, valid: boolean): void {
    this.validationCache.set(dataHash, {
      valid,
      timestamp: Date.now(),
    });
  }

  private cleanupValidationCache(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, cache] of this.validationCache.entries()) {
      if (now - cache.timestamp >= this.VALIDATION_CACHE_TTL) {
        this.validationCache.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.debug(`[DataCollection] Cleaned ${cleaned} expired validation cache entries`);
    }
  }

  // =============== 错误记录 ===============

  private recordError(message: string, error: any): void {
    this.lastError = `${message}: ${error instanceof Error ? error.message : String(error)}`;
    this.lastErrorTime = Date.now();
  }

  // =============== 降级数据保存 ===============

  private async saveDegradedData(items: BatchWriteItem[]): Promise<void> {
    try {
      const degradedDir = join(this.DATA_DIR, "degraded");
      if (!existsSync(degradedDir)) {
        await mkdir(degradedDir, { recursive: true });
      }

      const filename = `degraded-${Date.now()}.json`;
      const filepath = join(degradedDir, filename);

      await writeFile(filepath, JSON.stringify(items, null, 2));
      logger.info(`[DataCollection] Saved ${items.length} degraded items to ${filename}`);
    } catch (error) {
      logger.error("[DataCollection] Failed to save degraded data:", error);
    }
  }

  public getPerformanceStats(): PerformanceStats {
    return {
      ...this.stats,
      queueSize: this.writeQueue.length,
      cacheHitRate:
        this.stats.dedupeHits > 0 ? this.stats.dedupeHits / (this.stats.totalWrites + this.stats.dedupeHits) : 0,
    };
  }

  public getHealthStatus(): HealthStatus {
    const now = Date.now();
    const uptime = now - this.serviceStartTime;
    const queueUtilization = this.writeQueue.length / this.MAX_QUEUE_SIZE;
    const errorRate = this.stats.totalWrites > 0 ? this.stats.errorCount / this.stats.totalWrites : 0;

    // 判断健康状态
    let status: "healthy" | "degraded" | "unhealthy" = "healthy";

    if (this.circuitBreakerState === "OPEN" || errorRate > 0.5 || queueUtilization > 0.9 || !this.isMongoReady()) {
      status = "unhealthy";
    } else if (
      this.circuitBreakerState === "HALF_OPEN" ||
      errorRate > 0.2 ||
      queueUtilization > 0.7 ||
      this.stats.avgWriteTime > 5000
    ) {
      status = "degraded";
    }

    return {
      status,
      uptime,
      queueUtilization,
      errorRate,
      avgWriteLatency: this.stats.avgWriteTime,
      mongoConnected: this.isMongoReady(),
      lastError: this.lastError,
      lastErrorTime: this.lastErrorTime,
    };
  }

  public resetPerformanceStats() {
    this.stats = {
      totalWrites: 0,
      batchWrites: 0,
      singleWrites: 0,
      avgBatchSize: 0,
      avgWriteTime: 0,
      cacheHitRate: 0,
      queueSize: 0,
      errorCount: 0,
      lastFlushTime: Date.now(),
      retryCount: 0,
      failedRetries: 0,
      dedupeHits: 0,
    };
    this.writeTimeSamples = [];
    logger.info("[DataCollection] Performance stats reset");
  }

  // 优雅关闭服务
  public async gracefulShutdown(): Promise<void> {
    logger.info("[DataCollection] Graceful shutdown requested");
    this.isShuttingDown = true;

    // 等待批量写入队列处理完成
    let waitTime = 0;
    const maxWaitTime = 30000; // 最多等待30秒

    while (this.writeQueue.length > 0 && waitTime < maxWaitTime) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      waitTime += 1000;
      logger.debug(`[DataCollection] Waiting for queue: ${this.writeQueue.length} items, ${waitTime / 1000}s elapsed`);
    }

    // 强制处理剩余的批量写入
    if (this.writeQueue.length > 0) {
      logger.warn(`[DataCollection] Force processing ${this.writeQueue.length} remaining items`);
      await this.processBatch();
    }

    // 清理定时器
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }

    // 输出最终统计
    const finalStats = this.getPerformanceStats();
    logger.info("[DataCollection] Graceful shutdown completed. Final stats:", finalStats);
  }

  // 递归清洗：
  // - 移除以 $ 开头的键（Mongo 操作符）
  // - 替换键名中的 . 为 _（禁止路径展开）
  // - 限制键名长度与字符集
  // - 规避循环引用
  // - 归一化非序列化类型（函数、Symbol、BigInt、非有限数字等）
  private static readonly MAX_KEY_LENGTH = 128;
  private sanitizeForMongo(input: any, seen = new WeakSet<object>()): any {
    if (input === null || input === undefined) return input;
    const t = typeof input;
    if (t === "number") return Number.isFinite(input) ? input : String(input);
    if (t === "bigint") return input.toString();
    if (t === "function" || t === "symbol") return String(input);
    if (t !== "object") return input;
    if (seen.has(input)) return "[Circular]";
    seen.add(input as object);
    if (Array.isArray(input)) return input.map((v) => this.sanitizeForMongo(v, seen));
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(input)) {
      if (!k) continue;
      // 丢弃可疑/危险键：Mongo 操作符与原型污染相关键
      if (k[0] === "$") continue;
      if (k === "__proto__" || k === "prototype" || k === "constructor") continue;
      // 限制键名长度与字符集（只保留可见字符），并替换点
      let safeKey = k.replace(/\./g, "_").replace(/[^\x20-\x7E]/g, "_");
      if (safeKey.length > DataCollectionService.MAX_KEY_LENGTH) {
        safeKey = safeKey.slice(0, DataCollectionService.MAX_KEY_LENGTH);
      }
      out[safeKey] = this.sanitizeForMongo(v, seen);
    }
    return out;
  }

  // 统一限制：深度、键数量、数组长度、字符串长度与整体大小
  private static readonly MAX_DEPTH = 6;
  private static readonly MAX_KEYS_PER_OBJECT = 200;
  private static readonly MAX_ARRAY_LENGTH = 200;
  private static readonly MAX_STRING_LENGTH = 40960; // 40KB 字符
  private static readonly MAX_DETAILS_BYTES = 5 * 1024 * 1024; // 5MB

  private clampDetails(input: any, depth = 0, seen = new WeakSet<object>()): any {
    if (input === null || input === undefined) return input;
    if (depth > DataCollectionService.MAX_DEPTH) return "[Truncated: depth limit]";
    const t = typeof input;
    if (t === "string") {
      return (input as string).length > DataCollectionService.MAX_STRING_LENGTH
        ? `${(input as string).slice(0, DataCollectionService.MAX_STRING_LENGTH)}…`
        : input;
    }
    if (t !== "object") return input;
    if (seen.has(input)) return "[Circular]";
    seen.add(input as object);
    if (Array.isArray(input)) {
      const arr = input
        .slice(0, DataCollectionService.MAX_ARRAY_LENGTH)
        .map((v) => this.clampDetails(v, depth + 1, seen));
      if (input.length > DataCollectionService.MAX_ARRAY_LENGTH) arr.push("[Truncated: array length]");
      return arr;
    }
    // object
    const out: Record<string, any> = {};
    let count = 0;
    for (const [k, v] of Object.entries(input)) {
      out[k] = this.clampDetails(v, depth + 1, seen);
      count++;
      if (count >= DataCollectionService.MAX_KEYS_PER_OBJECT) {
        out.__truncated__ = "object keys limit reached";
        break;
      }
    }
    return out;
  }

  private ensureSizeLimit(obj: any): any {
    // 如果超过上限，逐步降采样：移除 headers/cookies 等大字段
    const tryStringify = (o: any) => JSON.stringify(o);
    const bytes = (s: string) => Buffer.byteLength(s, "utf8");
    const current = obj;
    let s = tryStringify(current);
    if (bytes(s) <= DataCollectionService.MAX_DETAILS_BYTES) return current;
    // 尝试移除常见大字段
    const dropList = ["headers", "cookies", "payload_raw", "raw", "body"];
    if (current && typeof current === "object") {
      const clone = { ...current } as any;
      for (const key of dropList) {
        if (clone[key] !== undefined) delete clone[key];
      }
      s = tryStringify(clone);
      if (bytes(s) <= DataCollectionService.MAX_DETAILS_BYTES) return clone;
      // 仍超限，最后退化为简短提示
      return { note: "details truncated due to size limit" };
    }
    return { note: "details truncated due to size limit" };
  }

  private validate(data: any) {
    // 检查限流
    if (!this.checkRateLimit(data.userId || "anonymous")) {
      throw new Error("请求频率超限，请稍后重试");
    }

    // 生成数据哈希用于缓存验证
    const dataHash = this.computeHash({
      userId: data.userId,
      action: data.action,
      timestamp: data.timestamp,
    });

    // 检查验证缓存
    const cachedValidation = this.getCachedValidation(dataHash);
    if (cachedValidation !== null) {
      if (!cachedValidation) {
        throw new Error("数据验证失败（缓存）");
      }
      return; // 验证通过（从缓存）
    }

    // 执行完整验证
    try {
      if (!data || typeof data !== "object") {
        throw new Error("无效的数据格式");
      }
      if (!data.userId || !data.action || !data.timestamp) {
        throw new Error("缺少必需字段");
      }

      // 预编译的正则表达式（性能优化）
      const idPattern = /^[a-zA-Z0-9_\-:@.]{1,128}$/;
      if (typeof data.userId !== "string" || !idPattern.test(data.userId)) {
        throw new Error("userId 非法");
      }

      const actionPattern = /^[a-zA-Z0-9_\-:.]{1,128}$/;
      if (typeof data.action !== "string" || !actionPattern.test(data.action)) {
        throw new Error("action 非法");
      }

      // 简单 ISO-8601 校验（允许毫秒与 Z 后缀）
      const isoPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
      if (typeof data.timestamp !== "string" || data.timestamp.length > 64 || !isoPattern.test(data.timestamp)) {
        throw new Error("timestamp 非法");
      }

      // 时间戳合理性检查（不能是未来时间，不能太久以前）
      const timestampDate = new Date(data.timestamp);
      const now = Date.now();
      const timestampMs = timestampDate.getTime();

      if (timestampMs > now + 60000) {
        // 允许1分钟时钟偏差
        throw new Error("timestamp 不能是未来时间");
      }

      if (now - timestampMs > 86400000) {
        // 不能超过24小时前
        throw new Error("timestamp 过期（超过24小时）");
      }

      // 缓存验证结果
      this.setCachedValidation(dataHash, true);
    } catch (error) {
      // 缓存失败结果
      this.setCachedValidation(dataHash, false);
      throw error;
    }
  }

  // =============== 智能分析与优化 ===============
  private computeHash(obj: any): string {
    const s = JSON.stringify(obj, Object.keys(obj).sort());
    return crypto.createHash("sha256").update(s).digest("hex");
  }

  private cleanupDedupeCache(now: number) {
    for (const [h, t] of this.hashSeenAt.entries()) {
      if (now - t > this.dedupeTTLms) this.hashSeenAt.delete(h);
    }
  }

  private redactPII(details: any): { redacted: any; piiDetected: boolean; tags: string[] } {
    const clone = JSON.parse(JSON.stringify(details || {}));
    let pii = false;
    const tags: string[] = [];

    // 安全有界正则（避免潜在 ReDoS）
    // 邮箱：本地部分最长64，域名部分最长255，TLD 2-24
    const EMAIL_RE = /([A-Za-z0-9._%+-]{1,64})@(([A-Za-z0-9.-]{1,255})\.[A-Za-z]{2,24})/;
    const EMAIL_GLOBAL_RE = /([A-Za-z0-9._%+-]{1,64})@(([A-Za-z0-9.-]{1,255})\.[A-Za-z]{2,24})/g;
    // 电话（简化）：限制长度范围，避免大重复
    const PHONE_RE = /\+?\d[\d\s-]{7,18}\d/;

    const redactKeys = [
      "authorization",
      "cookie",
      "cookies",
      "set-cookie",
      "password",
      "pass",
      "token",
      "api-key",
      "apikey",
      "secret",
    ];
    const walk = (o: any) => {
      if (!o || typeof o !== "object") return;
      for (const k of Object.keys(o)) {
        const v = o[k];
        if (redactKeys.includes(k.toLowerCase())) {
          o[k] = "[REDACTED]";
          pii = true;
          if (!tags.includes("CREDENTIALS")) tags.push("CREDENTIALS");
          continue;
        }
        if (typeof v === "string") {
          // 邮箱（安全有界）
          if (EMAIL_RE.test(v)) {
            pii = true;
            o[k] = v.replace(EMAIL_GLOBAL_RE, "***@$2");
            if (!tags.includes("EMAIL")) tags.push("EMAIL");
          }
          // 手机/电话（安全有界简化）
          if (PHONE_RE.test(v)) {
            pii = true;
            o[k] = v.replace(/\d/g, "*");
            if (!tags.includes("PHONE")) tags.push("PHONE");
          }
          // 身份号/卡号（简化掩码）
          if (/\b\d{15,19}\b/.test(v)) {
            pii = true;
            o[k] = v.replace(/\d(?=\d{4})/g, "*");
            if (!tags.includes("ID")) tags.push("ID");
          }
        } else if (typeof v === "object") {
          walk(v);
        }
      }
    };
    walk(clone);
    return { redacted: clone, piiDetected: pii, tags };
  }

  private classify(action: string, details: any): { category: string; tags: string[] } {
    const tags: string[] = [];
    const a = action.toLowerCase();
    let category = "general";
    if (a.includes("login") || a.includes("auth")) {
      category = "auth";
      tags.push("AUTH");
    }
    if (a.includes("payment") || a.includes("order")) {
      category = "commerce";
      tags.push("COMMERCE");
    }
    if (a.includes("error") || a.includes("exception")) {
      category = "error";
      tags.push("ERROR");
    }
    if (a.includes("upload") || a.includes("file")) {
      category = "file";
      tags.push("FILE");
    }
    if (details && typeof details === "object") {
      const headers = (details as any).headers || {};
      const ua = String(headers["user-agent"] || headers["User-Agent"] || "").toLowerCase();
      if (ua.includes("bot") || ua.includes("crawler") || ua.includes("spider")) tags.push("BOT");
    }
    return { category, tags };
  }

  private async evaluateRisk(data: {
    details: any;
    ip?: string;
    userAgent?: string;
  }): Promise<{ riskScore: number; riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"; flags: string[] }> {
    try {
      const headers = data.details?.headers || {};
      const ua = String(data.userAgent || headers["user-agent"] || headers["User-Agent"] || "unknown");
      const ip = String(
        data.ip || data.details?.ip || data.details?.headers?.["x-forwarded-for"]?.split(",")[0] || "0.0.0.0",
      );
      const device: DeviceFingerprint = {
        canvasEntropy: String(data.details?.device?.canvasEntropy || "na"),
        userAgent: ua,
        timezone: String(data.details?.device?.timezone || "UTC"),
        screenResolution: data.details?.device?.screenResolution,
        language: data.details?.device?.language,
        platform: data.details?.device?.platform,
      };
      const behaviorScore = Number(data.details?.behaviorScore ?? 0.5);
      const assessed = await this.riskEngine.assessRisk(
        ip,
        device,
        Number.isNaN(behaviorScore) ? 0.5 : Math.max(0, Math.min(1, behaviorScore)),
        ua,
      );
      return { riskScore: assessed.overallRisk, riskLevel: assessed.riskLevel, flags: assessed.flags };
    } catch (_e) {
      return { riskScore: 0.5, riskLevel: "LOW", flags: ["EVAL_FALLBACK"] };
    }
  }

  private prepareRecord = async (data: any) => {
    // 先清洗与裁剪，后做敏感信息脱敏、分类与风控评估
    const sanitizedDetails = this.ensureSizeLimit(this.clampDetails(this.sanitizeForMongo(data.details ?? {})));
    const { redacted, piiDetected, tags: piiTags } = this.redactPII(sanitizedDetails);

    const { category, tags: catTags } = this.classify(String(data.action || ""), redacted);
    const hash = this.computeHash({ userId: data.userId, action: data.action, redacted });
    const now = Date.now();
    this.cleanupDedupeCache(now);
    const lastSeen = this.hashSeenAt.get(hash) || 0;
    const duplicate = now - lastSeen < this.dedupeTTLms;

    // 记录去重缓存命中
    if (duplicate) {
      this.stats.dedupeHits++;
    }

    this.hashSeenAt.set(hash, now);

    const risk = await this.evaluateRisk({ details: redacted });

    const allTags = Array.from(new Set([...(piiTags || []), ...(catTags || []), ...(risk.flags || [])]));

    // 可选：加密存储原始详情（仅管理员后台可解密查看）
    let encryptedRaw: { iv: string; tag: string; data: string } | undefined;
    if (this.rawSecret && typeof data.details !== "undefined") {
      try {
        const iv = crypto.randomBytes(12);
        const key = crypto.createHash("sha256").update(this.rawSecret).digest();
        const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
        const plaintext = Buffer.from(JSON.stringify(data.details), "utf8");
        const enc = Buffer.concat([cipher.update(plaintext), cipher.final()]);
        const tag = cipher.getAuthTag();
        encryptedRaw = { iv: iv.toString("base64"), tag: tag.toString("base64"), data: enc.toString("base64") };
      } catch (_e) {
        logger.warn("[DataCollection] encrypt raw failed");
      }
    }

    return {
      userId: data.userId,
      action: data.action,
      timestamp: data.timestamp,
      details: redacted,
      riskScore: risk.riskScore,
      riskLevel: risk.riskLevel,
      analysis: {
        piiDetected,
        duplicate,
        hash,
        flags: risk.flags,
      },
      hash,
      duplicate,
      category,
      tags: allTags,
      encryptedRaw,
    };
  };

  // 仅供后台路由调用：解密原始详情
  public decryptRawDetails(doc: any): any | null {
    try {
      if (!doc?.encryptedRaw || !this.rawSecret) return null;
      const { iv, tag, data } = doc.encryptedRaw;
      const key = crypto.createHash("sha256").update(this.rawSecret).digest();
      const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64"));
      decipher.setAuthTag(Buffer.from(tag, "base64"));
      const dec = Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]);
      return JSON.parse(dec.toString("utf8"));
    } catch (_e) {
      return null;
    }
  }

  private async saveToMongo(data: any): Promise<string> {
    // 检查断路器状态
    if (!this.checkCircuitBreaker()) {
      throw new Error("Circuit breaker is OPEN - MongoDB operations are temporarily suspended");
    }

    if (mongoose.connection.readyState !== 1) {
      throw new Error("MongoDB 未连接");
    }

    const startTime = Date.now();

    try {
      const doc = {
        userId: data.userId,
        action: data.action,
        timestamp: data.timestamp,
        details: data.details,
        riskScore: Number(data.riskScore || 0),
        riskLevel: data.riskLevel || "LOW",
        analysis: data.analysis || {},
        hash: data.hash || undefined,
        duplicate: Boolean(data.duplicate),
        category: data.category || undefined,
        tags: Array.isArray(data.tags) ? data.tags.slice(0, 50) : [],
        encryptedRaw: data.encryptedRaw || undefined,
      } as any;

      // 添加超时保护
      const created = (await Promise.race([
        DataCollectionModel.create(doc),
        new Promise(
          (_, reject) => setTimeout(() => reject(new Error("MongoDB write timeout")), 10000), // 10秒超时
        ),
      ])) as any;

      // 更新性能统计
      const writeTime = Date.now() - startTime;
      this.updatePerformanceStats(1, writeTime, false);

      // 断路器：成功操作
      this.recordCircuitBreakerSuccess();

      logger.debug("Data saved to MongoDB (single write)", {
        writeTime,
        userId: data.userId,
        action: data.action,
      });

      return created?._id ? String(created._id) : "";
    } catch (error) {
      // 断路器：失败操作
      this.recordCircuitBreakerFailure();
      this.recordError("MongoDB write failed", error);
      throw error;
    }
  }

  // 批量写入入口方法
  private async addToBatchQueue(data: any): Promise<void> {
    // 检查队列大小限制
    if (this.writeQueue.length >= this.MAX_QUEUE_SIZE) {
      logger.warn(`[DataCollection] Queue size limit reached (${this.MAX_QUEUE_SIZE}), forcing batch process`);
      await this.processBatch();
    }

    // 添加到批量队列
    const batchItem: BatchWriteItem = {
      data,
      timestamp: Date.now(),
      retryCount: 0,
    };

    this.writeQueue.push(batchItem);
    this.stats.queueSize = this.writeQueue.length;

    // 如果达到批量大小，立即处理
    if (this.writeQueue.length >= this.BATCH_SIZE) {
      setImmediate(() => this.processBatch());
    } else if (!this.batchTimer) {
      // 设置超时处理
      this.batchTimer = setTimeout(() => {
        this.batchTimer = null;
        this.processBatch();
      }, this.BATCH_TIMEOUT);
    }
  }

  private async saveToFile(data: any): Promise<void> {
    const saveDir = process.env.NODE_ENV === "test" ? this.TEST_DATA_DIR : this.DATA_DIR;
    const saveFile = join(saveDir, `data-${Date.now()}.json`);
    if (!existsSync(saveDir)) {
      await mkdir(saveDir, { recursive: true });
    }
    const serializable = {
      userId: data.userId,
      action: data.action,
      timestamp: data.timestamp,
      details: data.details,
      riskScore: Number(data.riskScore || 0),
      riskLevel: data.riskLevel || "LOW",
      analysis: data.analysis || {},
      hash: data.hash || undefined,
      duplicate: Boolean(data.duplicate),
      category: data.category || undefined,
      tags: Array.isArray(data.tags) ? data.tags.slice(0, 50) : [],
      encryptedRaw: data.encryptedRaw || undefined,
    };
    await writeFile(saveFile, JSON.stringify(serializable, null, 2));
    logger.info("Data saved to local file");
  }

  public async saveData(
    data: any,
    mode: StorageMode = "both",
    forceBatch = true,
  ): Promise<{ savedTo: StorageMode | "mongo_fallback_file" | "batch_queued"; id?: string; error?: string }> {
    try {
      // 验证数据（包含限流检查）
      this.validate(data);

      // 智能预处理与分析（带超时保护）
      const prepared = (await Promise.race([
        this.prepareRecord(data),
        new Promise((_, reject) => setTimeout(() => reject(new Error("Data preparation timeout")), 5000)),
      ])) as any;

      if (mode === "file") {
        await this.saveToFile(prepared);
        return { savedTo: "file" };
      }

      // 如果服务正在关闭，强制同步写入
      if (this.isShuttingDown) {
        forceBatch = false;
      }

      // 如果断路器打开，自动降级到文件存储（仅当mode为mongo或both时）
      if (!this.checkCircuitBreaker() && (mode === "mongo" || mode === "both")) {
        logger.warn("[DataCollection] Circuit breaker is OPEN, falling back to file storage");
        await this.saveToFile(prepared);
        return { savedTo: "mongo_fallback_file", error: "Circuit breaker active" };
      }

      if (mode === "mongo") {
        if (forceBatch && !this.isShuttingDown) {
          // 使用批量写入队列
          await this.addToBatchQueue(prepared);
          return { savedTo: "mongo" };
        } else {
          // 直接写入
          try {
            const id = await this.saveToMongo(prepared);
            return { savedTo: "mongo", id };
          } catch (err) {
            logger.error("[DataCollection] Direct MongoDB write failed:", err);
            throw err;
          }
        }
      }

      // both: 优先 Mongo，失败则文件兜底
      try {
        if (forceBatch && !this.isShuttingDown) {
          // 使用批量写入队列
          await this.addToBatchQueue(prepared);
          return { savedTo: "both" };
        } else {
          // 直接写入
          const id = await this.saveToMongo(prepared);
          return { savedTo: "both", id };
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        logger.error("[DataCollection] MongoDB 保存失败，回退到本地文件:", err);

        try {
          await this.saveToFile(prepared);
          return { savedTo: "mongo_fallback_file", error: errorMsg };
        } catch (fileErr) {
          logger.error("[DataCollection] File fallback also failed:", fileErr);
          throw new Error(`Both MongoDB and file storage failed: ${errorMsg}`);
        }
      }
    } catch (error) {
      const _errorMsg = error instanceof Error ? error.message : String(error);
      logger.error("[DataCollection] saveData failed:", error);
      this.recordError("saveData failed", error);
      throw error;
    }
  }

  // 强制刷新批量队列（用于测试或紧急情况）
  public async flushBatchQueue(): Promise<{ flushedCount: number; remainingCount: number }> {
    const initialCount = this.writeQueue.length;

    if (initialCount === 0) {
      return { flushedCount: 0, remainingCount: 0 };
    }

    logger.info(`[DataCollection] Manual flush requested: ${initialCount} items in queue`);

    await this.processBatch();

    const remainingCount = this.writeQueue.length;
    const flushedCount = initialCount - remainingCount;

    logger.info(`[DataCollection] Manual flush completed: ${flushedCount} flushed, ${remainingCount} remaining`);

    return { flushedCount, remainingCount };
  }

  // =============== Admin management helpers (Mongo only) ===============
  public isMongoReady(): boolean {
    return mongoose.connection.readyState === 1;
  }

  public async list(params: {
    page?: number;
    limit?: number;
    userId?: string;
    action?: string;
    start?: string;
    end?: string;
    sort?: "desc" | "asc";
    riskLevel?: string;
    category?: string;
  }): Promise<{ items: any[]; total: number; page: number; limit: number; executionTime: number }> {
    const startTime = Date.now();

    if (!this.isMongoReady()) {
      throw new Error("MongoDB 未连接");
    }

    const Model = DataCollectionModel;
    const {
      page: _page = 1,
      limit: _limit = 20,
      userId,
      action,
      start,
      end,
      sort = "desc",
      riskLevel,
      category,
    } = params || {};

    // 安全分页参数
    const safePage = Number.isFinite(_page as number) ? Math.max(1, Math.floor(_page as number)) : 1;
    const safeLimitRaw = Number.isFinite(_limit as number) ? Math.max(1, Math.floor(_limit as number)) : 20;
    const safeLimit = Math.min(100, safeLimitRaw); // 限制最大每页100

    // 防止过大的skip值（可能导致性能问题）
    const skip = (safePage - 1) * safeLimit;
    if (skip > 10000) {
      throw new Error("页码过大，请使用更小的页码或使用时间范围过滤");
    }

    const query: FilterQuery<any> = {};

    // 仅允许字符串等值匹配，避免NoSQL注入
    if (typeof userId === "string" && userId.trim().length > 0) {
      // 验证userId格式
      if (!/^[a-zA-Z0-9_\-:@.]{1,128}$/.test(userId)) {
        throw new Error("无效的 userId 格式");
      }
      query.userId = userId.trim();
    }

    if (typeof action === "string" && action.trim().length > 0) {
      // 验证action格式
      if (!/^[a-zA-Z0-9_\-:.]{1,128}$/.test(action)) {
        throw new Error("无效的 action 格式");
      }
      query.action = action.trim();
    }

    // riskLevel 过滤
    if (typeof riskLevel === "string" && riskLevel.trim().length > 0) {
      const validRiskLevels = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
      const upperRiskLevel = riskLevel.trim().toUpperCase();
      if (validRiskLevels.includes(upperRiskLevel)) {
        query.riskLevel = upperRiskLevel;
      }
    }

    // category 过滤
    if (typeof category === "string" && category.trim().length > 0) {
      query.category = category.trim();
    }

    // timestamp 过滤（ISO 字符串）；只接受有效日期
    const isValidISO = (s?: string) => {
      if (!s || typeof s !== "string") return false;
      const timestamp = Date.parse(s);
      return !Number.isNaN(timestamp) && timestamp > 0;
    };

    if (isValidISO(start) || isValidISO(end)) {
      query.timestamp = {} as any;
      if (isValidISO(start)) {
        (query.timestamp as any).$gte = new Date(start as string).toISOString();
      }
      if (isValidISO(end)) {
        (query.timestamp as any).$lte = new Date(end as string).toISOString();
      }
    }

    try {
      // 使用Promise.all并发执行count和find，提升性能
      const [total, items] = await Promise.all([
        Model.countDocuments(query).maxTimeMS(5000), // 5秒超时
        Model.find(query)
          .sort({ timestamp: sort === "asc" ? 1 : -1 })
          .skip(skip)
          .limit(safeLimit)
          .select("-encryptedRaw") // 默认不返回加密原始数据
          .lean()
          .maxTimeMS(10000), // 10秒超时
      ]);

      const executionTime = Date.now() - startTime;

      logger.debug("[DataCollection] List query completed", {
        query,
        total,
        returned: items.length,
        executionTime,
      });

      return { items, total, page: safePage, limit: safeLimit, executionTime };
    } catch (error) {
      logger.error("[DataCollection] List query failed:", error);
      this.recordError("List query failed", error);
      throw error;
    }
  }

  public async getById(id: string): Promise<any | null> {
    if (!this.isMongoReady()) {
      throw new Error("MongoDB 未连接");
    }

    // 验证ObjectId格式
    if (!id || typeof id !== "string" || !mongoose.Types.ObjectId.isValid(id)) {
      logger.warn("[DataCollection] Invalid ObjectId format", { id });
      return null;
    }

    try {
      const Model = DataCollectionModel;
      const result = await Model.findById(id)
        .select("-encryptedRaw") // 默认不返回加密原始数据
        .lean()
        .maxTimeMS(5000); // 5秒超时

      return result;
    } catch (error) {
      logger.error("[DataCollection] getById failed:", error);
      this.recordError("getById failed", error);
      throw error;
    }
  }

  public async deleteById(id: string): Promise<{ deleted: boolean; executionTime: number }> {
    const startTime = Date.now();

    if (!this.isMongoReady()) {
      throw new Error("MongoDB 未连接");
    }

    // 验证ObjectId格式
    if (!id || typeof id !== "string" || !mongoose.Types.ObjectId.isValid(id)) {
      logger.warn("[DataCollection] Invalid ObjectId format for deletion", { id });
      return { deleted: false, executionTime: Date.now() - startTime };
    }

    try {
      const Model = DataCollectionModel;
      const res = await Model.deleteOne({
        _id: new mongoose.Types.ObjectId(id),
      }).maxTimeMS(5000); // 5秒超时

      const executionTime = Date.now() - startTime;
      const deleted = (res.deletedCount || 0) > 0;

      if (deleted) {
        logger.info("[DataCollection] Record deleted", { id, executionTime });
      }

      return { deleted, executionTime };
    } catch (error) {
      logger.error("[DataCollection] deleteById failed:", error);
      this.recordError("deleteById failed", error);
      throw error;
    }
  }

  public async deleteBatch(ids: string[]): Promise<{ deletedCount: number; executionTime: number; errors: string[] }> {
    const startTime = Date.now();

    if (!this.isMongoReady()) {
      throw new Error("MongoDB 未连接");
    }

    // 验证输入
    if (!Array.isArray(ids) || ids.length === 0) {
      return { deletedCount: 0, executionTime: Date.now() - startTime, errors: ["No valid IDs provided"] };
    }

    // 限制批量删除数量
    if (ids.length > 1000) {
      throw new Error("批量删除数量不能超过1000个");
    }

    const errors: string[] = [];

    // 验证并过滤有效的ObjectId
    const validIds = ids
      .filter((x) => {
        if (typeof x !== "string") {
          errors.push(`Invalid ID type: ${typeof x}`);
          return false;
        }
        if (!mongoose.Types.ObjectId.isValid(x)) {
          errors.push(`Invalid ObjectId format: ${x}`);
          return false;
        }
        return true;
      })
      .map((x) => new mongoose.Types.ObjectId(x as string));

    if (validIds.length === 0) {
      return { deletedCount: 0, executionTime: Date.now() - startTime, errors };
    }

    try {
      const Model = DataCollectionModel;
      const res = await Model.deleteMany({
        _id: { $in: validIds },
      }).maxTimeMS(30000); // 30秒超时

      const executionTime = Date.now() - startTime;
      const deletedCount = res.deletedCount || 0;

      logger.info("[DataCollection] Batch delete completed", {
        requested: ids.length,
        valid: validIds.length,
        deleted: deletedCount,
        executionTime,
      });

      return { deletedCount, executionTime, errors };
    } catch (error) {
      logger.error("[DataCollection] deleteBatch failed:", error);
      this.recordError("deleteBatch failed", error);
      throw error;
    }
  }

  // 删除全部数据收集记录（管理员）
  public async deleteAll(): Promise<{ deletedCount: number; executionTime: number }> {
    const startTime = Date.now();

    if (!this.isMongoReady()) {
      throw new Error("MongoDB 未连接");
    }

    try {
      const Model = DataCollectionModel;

      // 先获取文档数量
      const before = await Model.estimatedDocumentCount().maxTimeMS(5000);

      // 执行删除操作（带超时）
      const ret = await Model.deleteMany({}).maxTimeMS(60000); // 60秒超时

      const deletedCount = typeof ret?.deletedCount === "number" ? ret.deletedCount : 0;
      const executionTime = Date.now() - startTime;

      logger.warn("[DataCollection] deleteAll completed", {
        before,
        deletedCount,
        executionTime,
      });

      return { deletedCount, executionTime };
    } catch (error) {
      logger.error("[DataCollection] deleteAll failed:", error);
      this.recordError("deleteAll failed", error);
      throw error;
    }
  }

  // Action 版本：封装确认校验与响应体
  public async deleteAllAction(payload: { confirm?: boolean }): Promise<{ statusCode: number; body: any }> {
    if (!payload?.confirm) {
      return { statusCode: 400, body: { success: false, message: "confirm required" } };
    }

    try {
      const { deletedCount, executionTime } = await this.deleteAll();
      return {
        statusCode: 200,
        body: { success: true, deletedCount, executionTime },
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      return {
        statusCode: 500,
        body: { success: false, message: "Failed to delete all records", error: errorMsg },
      };
    }
  }

  public async getStats() {
    if (!this.isMongoReady()) {
      throw new Error("MongoDB 未连接");
    }

    const startTime = Date.now();

    try {
      const Model = DataCollectionModel;

      // 使用Promise.all并发执行多个聚合查询
      const [total, byAction, byRiskLevel, byCategory, last7days, duplicateCount] = await Promise.all([
        // 总文档数
        Model.estimatedDocumentCount().maxTimeMS(5000),

        // 按action分组统计
        Model.aggregate([
          { $group: { _id: "$action", count: { $sum: 1 } } },
          { $sort: { count: -1 } },
          { $limit: 50 }, // 限制返回前50个
        ])
          .option({ maxTimeMS: 10000 })
          .exec(),

        // 按风险等级分组统计
        Model.aggregate([{ $group: { _id: "$riskLevel", count: { $sum: 1 } } }, { $sort: { count: -1 } }])
          .option({ maxTimeMS: 10000 })
          .exec(),

        // 按类别分组统计
        Model.aggregate([
          { $match: { category: { $exists: true, $ne: null } } },
          { $group: { _id: "$category", count: { $sum: 1 } } },
          { $sort: { count: -1 } },
          { $limit: 20 }, // 限制返回前20个
        ])
          .option({ maxTimeMS: 10000 })
          .exec(),

        // 最近7天的时间序列统计
        (async () => {
          const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
          return Model.aggregate([
            { $match: { timestamp: { $gte: sevenDaysAgo } } },
            { $addFields: { tsDate: { $toDate: "$timestamp" } } },
            {
              $group: {
                _id: { $dateToString: { format: "%Y-%m-%d", date: "$tsDate" } },
                count: { $sum: 1 },
              },
            },
            { $sort: { _id: 1 } },
          ])
            .option({ maxTimeMS: 10000 })
            .exec();
        })(),

        // 重复记录统计
        Model.countDocuments({ duplicate: true }).maxTimeMS(5000),
      ]);

      const executionTime = Date.now() - startTime;

      logger.debug("[DataCollection] Stats query completed", {
        total,
        executionTime,
      });

      return {
        total,
        byAction,
        byRiskLevel,
        byCategory,
        last7days,
        duplicateCount,
        executionTime,
        collectionDate: new Date().toISOString(),
      };
    } catch (error) {
      logger.error("[DataCollection] getStats failed:", error);
      this.recordError("getStats failed", error);
      throw error;
    }
  }
}

export const dataCollectionService = DataCollectionService.getInstance();
