import logger from "../utils/logger";
import { mongoose } from "./mongoService";

// =============== 类型定义 ===============

/** 服务响应结果 */
export interface ClarityServiceResult<T = void> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}

/** 错误码定义 */
export enum ClarityErrorCode {
  INVALID_FORMAT = "INVALID_FORMAT",
  INVALID_INPUT = "INVALID_INPUT",
  DB_NOT_CONNECTED = "DB_NOT_CONNECTED",
  UPDATE_FAILED = "UPDATE_FAILED",
  DELETE_FAILED = "DELETE_FAILED",
  READ_FAILED = "READ_FAILED",
  RATE_LIMIT_EXCEEDED = "RATE_LIMIT_EXCEEDED",
  CIRCUIT_BREAKER_OPEN = "CIRCUIT_BREAKER_OPEN",
}

/** 性能统计接口 */
interface PerformanceStats {
  totalOperations: number;
  successfulOperations: number;
  failedOperations: number;
  avgResponseTime: number;
  cacheHitRate: number;
  rateLimitHits: number;
}

/** 健康状态接口 */
interface HealthStatus {
  status: "healthy" | "degraded" | "unhealthy";
  uptime: number;
  errorRate: number;
  avgResponseTime: number;
  mongoConnected: boolean;
  cacheAge: number | null;
  lastError?: string;
  lastErrorTime?: number;
}

// =============== 验证函数 ===============

/**
 * 验证 Clarity Project ID 格式
 * Microsoft Clarity Project ID 格式：10位小写字母数字组合
 * 示例：t1dkcavsyz
 */
const validateClarityProjectId = (projectId: string): ClarityServiceResult<string> => {
  if (!projectId || typeof projectId !== "string") {
    return {
      success: false,
      error: {
        code: ClarityErrorCode.INVALID_INPUT,
        message: "Project ID 不能为空",
      },
    };
  }

  const trimmed = projectId.trim().toLowerCase();

  // Clarity Project ID 格式：10位小写字母数字组合
  const clarityIdPattern = /^[a-z0-9]{10}$/;

  if (!clarityIdPattern.test(trimmed)) {
    return {
      success: false,
      error: {
        code: ClarityErrorCode.INVALID_FORMAT,
        message: "Project ID 格式无效，应为10位小写字母数字组合（例如：t1dkcavsyz）",
      },
    };
  }

  return {
    success: true,
    data: trimmed,
  };
};

// =============== 数据模型 ===============

// Clarity配置文档接口
interface ClaritySettingDoc {
  key: string;
  value: string;
  updatedAt?: Date;
}

// Clarity配置历史记录接口
export interface ClarityHistoryDoc {
  key: string;
  oldValue: string | null;
  newValue: string | null;
  operation: "create" | "update" | "delete";
  changedBy?: string;
  changedAt: Date;
  metadata?: {
    ip?: string;
    userAgent?: string;
    reason?: string;
  };
}

// Clarity配置Schema（增强版）
const ClaritySettingSchema = new mongoose.Schema<ClaritySettingDoc>(
  {
    key: { type: String, required: true, unique: true, index: true, maxlength: 64 },
    value: { type: String, required: true, maxlength: 256 },
    updatedAt: { type: Date, default: Date.now, index: true },
  },
  {
    collection: "clarity_settings",
    strict: true, // 严格模式，拒绝未声明字段
  },
);

// Clarity配置历史Schema（增强版）
const ClarityHistorySchema = new mongoose.Schema<ClarityHistoryDoc>(
  {
    key: { type: String, required: true, index: true, maxlength: 64 },
    oldValue: { type: String, default: null, maxlength: 256 },
    newValue: { type: String, default: null, maxlength: 256 },
    operation: { type: String, required: true, enum: ["create", "update", "delete"], index: true },
    changedBy: { type: String, default: null, maxlength: 128 },
    changedAt: { type: Date, default: Date.now, index: true },
    metadata: {
      ip: { type: String, maxlength: 64 },
      userAgent: { type: String, maxlength: 512 },
      reason: { type: String, maxlength: 256 },
    },
  },
  {
    collection: "clarity_history",
    strict: true,
  },
);

// 复合索引优化
ClarityHistorySchema.index({ key: 1, changedAt: -1 }); // 按key和时间查询
ClarityHistorySchema.index({ operation: 1, changedAt: -1 }); // 按操作类型和时间查询

const ClaritySettingModel =
  (mongoose.models.ClaritySetting as mongoose.Model<ClaritySettingDoc>) ||
  mongoose.model<ClaritySettingDoc>("ClaritySetting", ClaritySettingSchema);

const ClarityHistoryModel =
  (mongoose.models.ClarityHistory as mongoose.Model<ClarityHistoryDoc>) ||
  mongoose.model<ClarityHistoryDoc>("ClarityHistory", ClarityHistorySchema);

// =============== 辅助函数 ===============

/**
 * 记录配置变更历史
 */
async function recordHistory(
  key: string,
  oldValue: string | null,
  newValue: string | null,
  operation: "create" | "update" | "delete",
  metadata?: {
    changedBy?: string;
    ip?: string;
    userAgent?: string;
    reason?: string;
  },
): Promise<void> {
  try {
    if (mongoose.connection.readyState === 1) {
      await ClarityHistoryModel.create({
        key,
        oldValue,
        newValue,
        operation,
        changedBy: metadata?.changedBy,
        changedAt: new Date(),
        metadata: {
          ip: metadata?.ip,
          userAgent: metadata?.userAgent,
          reason: metadata?.reason,
        },
      });
      logger.info("Clarity配置历史记录成功", { operation, key });
    }
  } catch (error) {
    // 历史记录失败不应影响主流程
    logger.warn("记录Clarity配置历史失败", error);
  }
}

/**
 * 从数据库获取Clarity项目ID
 */
async function getClarityProjectId(): Promise<string | null> {
  try {
    if (mongoose.connection.readyState === 1) {
      const doc = await ClaritySettingModel.findOne({ key: "CLARITY_PROJECT_ID" }).lean().exec();
      if (doc && typeof doc.value === "string" && doc.value.trim().length > 0) {
        return doc.value.trim();
      }
    }
  } catch (e) {
    logger.error("读取Clarity项目ID失败，回退到环境变量", e);
  }

  // 回退到环境变量
  const envKey = process.env.CLARITY_PROJECT_ID?.trim();
  return envKey && envKey.length > 0 ? envKey : null;
}

// =============== 主服务类 ===============

export class ClarityService {
  // =============== 缓存机制 ===============
  private static configCache: {
    projectId: string | null;
    cachedAt: number;
  } | null = null;

  private static readonly CACHE_TTL_MS = 60_000; // 60秒缓存

  // =============== 性能统计 ===============
  private static stats: PerformanceStats = {
    totalOperations: 0,
    successfulOperations: 0,
    failedOperations: 0,
    avgResponseTime: 0,
    cacheHitRate: 0,
    rateLimitHits: 0,
  };

  private static responseTimeSamples: number[] = [];
  private static readonly MAX_SAMPLES = 100;

  // =============== 健康监控 ===============
  private static readonly serviceStartTime = Date.now();
  private static lastError: string | undefined;
  private static lastErrorTime: number | undefined;

  // =============== 限流器 ===============
  private static readonly rateLimiter = new Map<string, { count: number; resetTime: number }>();
  private static readonly RATE_LIMIT_WINDOW = 60000; // 1分钟窗口
  private static readonly RATE_LIMIT_MAX_REQUESTS = 20; // 每分钟最多20次配置更新

  // =============== 断路器模式 ===============
  private static circuitBreakerState: "CLOSED" | "OPEN" | "HALF_OPEN" = "CLOSED";
  private static circuitBreakerFailureCount = 0;
  private static circuitBreakerLastFailureTime = 0;
  private static readonly CIRCUIT_BREAKER_THRESHOLD = 5;
  private static readonly CIRCUIT_BREAKER_TIMEOUT = 60000;
  private static readonly CIRCUIT_BREAKER_SUCCESS_THRESHOLD = 3;

  /**
   * 检查缓存是否有效
   */
  private static isCacheValid(): boolean {
    if (!ClarityService.configCache) return false;
    return Date.now() - ClarityService.configCache.cachedAt < ClarityService.CACHE_TTL_MS;
  }

  /**
   * 清除缓存
   */
  public static clearCache(): void {
    ClarityService.configCache = null;
    logger.debug("[ClarityService] 配置缓存已清除");
  }

  /**
   * 更新缓存
   */
  private static updateCache(projectId: string | null): void {
    ClarityService.configCache = {
      projectId,
      cachedAt: Date.now(),
    };
  }

  // =============== 辅助方法 ===============

  /**
   * 限流检查
   */
  private static checkRateLimit(userId: string): boolean {
    const now = Date.now();
    const key = `rate_limit_${userId}`;

    const limiter = ClarityService.rateLimiter.get(key);

    if (!limiter || now >= limiter.resetTime) {
      ClarityService.rateLimiter.set(key, {
        count: 1,
        resetTime: now + ClarityService.RATE_LIMIT_WINDOW,
      });
      return true;
    }

    if (limiter.count >= ClarityService.RATE_LIMIT_MAX_REQUESTS) {
      ClarityService.stats.rateLimitHits++;
      logger.warn(`[ClarityService] Rate limit exceeded for user: ${userId}`);
      return false;
    }

    limiter.count++;
    return true;
  }

  /**
   * 断路器检查
   */
  private static checkCircuitBreaker(): boolean {
    const now = Date.now();

    if (ClarityService.circuitBreakerState === "CLOSED") {
      return true;
    }

    if (ClarityService.circuitBreakerState === "OPEN") {
      if (now - ClarityService.circuitBreakerLastFailureTime >= ClarityService.CIRCUIT_BREAKER_TIMEOUT) {
        logger.info("[ClarityService] Circuit breaker transitioning to HALF_OPEN");
        ClarityService.circuitBreakerState = "HALF_OPEN";
        ClarityService.circuitBreakerFailureCount = 0;
        return true;
      }
      return false;
    }

    return true;
  }

  /**
   * 记录断路器成功
   */
  private static recordCircuitBreakerSuccess(): void {
    if (ClarityService.circuitBreakerState === "HALF_OPEN") {
      ClarityService.circuitBreakerFailureCount++;

      if (ClarityService.circuitBreakerFailureCount >= ClarityService.CIRCUIT_BREAKER_SUCCESS_THRESHOLD) {
        logger.info("[ClarityService] Circuit breaker closing after successful operations");
        ClarityService.circuitBreakerState = "CLOSED";
        ClarityService.circuitBreakerFailureCount = 0;
      }
    } else if (ClarityService.circuitBreakerState === "CLOSED") {
      ClarityService.circuitBreakerFailureCount = 0;
    }
  }

  /**
   * 记录断路器失败
   */
  private static recordCircuitBreakerFailure(): void {
    ClarityService.circuitBreakerFailureCount++;
    ClarityService.circuitBreakerLastFailureTime = Date.now();

    if (ClarityService.circuitBreakerState === "CLOSED") {
      if (ClarityService.circuitBreakerFailureCount >= ClarityService.CIRCUIT_BREAKER_THRESHOLD) {
        logger.error("[ClarityService] Circuit breaker OPENING after consecutive failures");
        ClarityService.circuitBreakerState = "OPEN";
      }
    } else if (ClarityService.circuitBreakerState === "HALF_OPEN") {
      logger.warn("[ClarityService] Circuit breaker reopening after failure in HALF_OPEN state");
      ClarityService.circuitBreakerState = "OPEN";
      ClarityService.circuitBreakerFailureCount = 0;
    }
  }

  /**
   * 记录错误
   */
  private static recordError(message: string, error: any): void {
    ClarityService.lastError = `${message}: ${error instanceof Error ? error.message : String(error)}`;
    ClarityService.lastErrorTime = Date.now();
  }

  /**
   * 更新响应时间
   */
  private static updateResponseTime(responseTime: number): void {
    ClarityService.responseTimeSamples.push(responseTime);
    if (ClarityService.responseTimeSamples.length > ClarityService.MAX_SAMPLES) {
      ClarityService.responseTimeSamples.shift();
    }

    ClarityService.stats.avgResponseTime =
      ClarityService.responseTimeSamples.reduce((a, b) => a + b, 0) / ClarityService.responseTimeSamples.length;
  }

  /**
   * 获取性能统计
   */
  public static getPerformanceStats(): PerformanceStats {
    return { ...ClarityService.stats };
  }

  /**
   * 获取健康状态
   */
  public static getHealthStatus(): HealthStatus {
    const now = Date.now();
    const uptime = now - ClarityService.serviceStartTime;
    const errorRate =
      ClarityService.stats.totalOperations > 0
        ? ClarityService.stats.failedOperations / ClarityService.stats.totalOperations
        : 0;

    let status: "healthy" | "degraded" | "unhealthy" = "healthy";

    if (ClarityService.circuitBreakerState === "OPEN" || errorRate > 0.5 || mongoose.connection.readyState !== 1) {
      status = "unhealthy";
    } else if (
      ClarityService.circuitBreakerState === "HALF_OPEN" ||
      errorRate > 0.2 ||
      ClarityService.stats.avgResponseTime > 2000
    ) {
      status = "degraded";
    }

    return {
      status,
      uptime,
      errorRate,
      avgResponseTime: ClarityService.stats.avgResponseTime,
      mongoConnected: mongoose.connection.readyState === 1,
      cacheAge: ClarityService.configCache ? now - ClarityService.configCache.cachedAt : null,
      lastError: ClarityService.lastError,
      lastErrorTime: ClarityService.lastErrorTime,
    };
  }

  // =============== 公共方法 ===============

  /**
   * 检查是否启用了 Clarity
   * @returns 是否启用
   */
  public static async isEnabled(): Promise<boolean> {
    const projectId = await ClarityService.getProjectIdWithCache();
    return !!projectId;
  }

  /**
   * 获取 Clarity 配置
   * @returns 配置信息
   */
  public static async getConfig(): Promise<{
    enabled: boolean;
    projectId: string | null;
  }> {
    const startTime = Date.now();

    try {
      const projectId = await ClarityService.getProjectIdWithCache();

      ClarityService.updateResponseTime(Date.now() - startTime);

      return {
        enabled: !!projectId,
        projectId,
      };
    } catch (error) {
      ClarityService.recordError("Get config failed", error);
      throw error;
    }
  }

  /**
   * 获取 Project ID（带缓存）
   */
  private static async getProjectIdWithCache(): Promise<string | null> {
    // 检查缓存
    if (ClarityService.isCacheValid() && ClarityService.configCache) {
      logger.debug("[ClarityService] 使用配置缓存");
      ClarityService.stats.cacheHitRate = ClarityService.stats.cacheHitRate * 0.9 + 0.1;
      return ClarityService.configCache.projectId;
    }

    // 从数据库获取（带超时保护）
    const projectId = await Promise.race([
      getClarityProjectId(),
      new Promise<null>((_, reject) => setTimeout(() => reject(new Error("Get project ID timeout")), 5000)),
    ]).catch((error) => {
      logger.error("[ClarityService] Failed to get project ID:", error);
      return null;
    });

    // 更新缓存
    ClarityService.updateCache(projectId);

    return projectId;
  }

  /**
   * 更新 Clarity 配置
   * @param value Project ID
   * @param metadata 元数据（操作人、IP等）
   * @returns 操作结果
   */
  public static async updateConfig(
    value: string,
    metadata?: {
      changedBy?: string;
      ip?: string;
      userAgent?: string;
      reason?: string;
    },
  ): Promise<ClarityServiceResult<string>> {
    const startTime = Date.now();
    ClarityService.stats.totalOperations++;

    try {
      // 1. 检查限流
      if (metadata?.changedBy && !ClarityService.checkRateLimit(metadata.changedBy)) {
        ClarityService.stats.failedOperations++;
        return {
          success: false,
          error: {
            code: ClarityErrorCode.RATE_LIMIT_EXCEEDED,
            message: "请求过于频繁，请稍后重试",
          },
        };
      }

      // 2. 检查断路器
      if (!ClarityService.checkCircuitBreaker()) {
        ClarityService.stats.failedOperations++;
        return {
          success: false,
          error: {
            code: ClarityErrorCode.CIRCUIT_BREAKER_OPEN,
            message: "服务暂时不可用，请稍后重试",
          },
        };
      }

      // 3. 验证 Project ID 格式
      const validationResult = validateClarityProjectId(value);
      if (!validationResult.success) {
        logger.warn("[ClarityService] 配置更新失败：格式验证失败", {
          error: validationResult.error,
          valueLength: value?.length,
        });
        ClarityService.stats.failedOperations++;
        return validationResult;
      }

      const validatedValue = validationResult.data!;

      // 4. 检查数据库连接
      if (mongoose.connection.readyState !== 1) {
        logger.error("[ClarityService] 数据库连接不可用，无法更新配置");
        ClarityService.stats.failedOperations++;
        ClarityService.recordCircuitBreakerFailure();
        return {
          success: false,
          error: {
            code: ClarityErrorCode.DB_NOT_CONNECTED,
            message: "数据库连接不可用",
          },
        };
      }

      // 5. 获取旧值（用于历史记录，带超时）
      const oldDoc = await Promise.race([
        ClaritySettingModel.findOne({ key: "CLARITY_PROJECT_ID" }).lean().maxTimeMS(5000).exec(),
        new Promise<null>((_, reject) => setTimeout(() => reject(new Error("Query timeout")), 10000)),
      ]);
      const oldValue = (oldDoc as any)?.value || null;

      // 6. 更新配置（带超时保护）
      await Promise.race([
        ClaritySettingModel.findOneAndUpdate(
          { key: "CLARITY_PROJECT_ID" },
          {
            key: "CLARITY_PROJECT_ID",
            value: validatedValue,
            updatedAt: new Date(),
          },
          { upsert: true, new: true },
        ).maxTimeMS(5000),
        new Promise((_, reject) => setTimeout(() => reject(new Error("Update timeout")), 10000)),
      ]);

      // 7. 记录历史
      const operation = oldValue ? "update" : "create";
      await recordHistory("CLARITY_PROJECT_ID", oldValue, validatedValue, operation, metadata);

      // 8. 清除缓存
      ClarityService.clearCache();

      // 9. 记录成功
      ClarityService.stats.successfulOperations++;
      ClarityService.recordCircuitBreakerSuccess();
      ClarityService.updateResponseTime(Date.now() - startTime);

      logger.info("[ClarityService] 配置更新成功", {
        operation,
        oldValue: oldValue ? "***" : null,
        newValue: "***",
      });

      return {
        success: true,
        data: validatedValue,
      };
    } catch (error) {
      ClarityService.stats.failedOperations++;
      ClarityService.recordCircuitBreakerFailure();
      ClarityService.recordError("Update config failed", error);
      ClarityService.updateResponseTime(Date.now() - startTime);

      logger.error("[ClarityService] 更新配置失败", error);
      return {
        success: false,
        error: {
          code: ClarityErrorCode.UPDATE_FAILED,
          message: "配置更新失败，请稍后重试",
        },
      };
    }
  }

  /**
   * 删除 Clarity 配置
   * @param metadata 元数据（操作人、IP等）
   * @returns 操作结果
   */
  public static async deleteConfig(metadata?: {
    changedBy?: string;
    ip?: string;
    userAgent?: string;
    reason?: string;
  }): Promise<ClarityServiceResult> {
    const startTime = Date.now();
    ClarityService.stats.totalOperations++;

    try {
      // 1. 检查限流
      if (metadata?.changedBy && !ClarityService.checkRateLimit(metadata.changedBy)) {
        ClarityService.stats.failedOperations++;
        return {
          success: false,
          error: {
            code: ClarityErrorCode.RATE_LIMIT_EXCEEDED,
            message: "请求过于频繁，请稍后重试",
          },
        };
      }

      // 2. 检查断路器
      if (!ClarityService.checkCircuitBreaker()) {
        ClarityService.stats.failedOperations++;
        return {
          success: false,
          error: {
            code: ClarityErrorCode.CIRCUIT_BREAKER_OPEN,
            message: "服务暂时不可用，请稍后重试",
          },
        };
      }

      // 3. 检查数据库连接
      if (mongoose.connection.readyState !== 1) {
        logger.error("[ClarityService] 数据库连接不可用，无法删除配置");
        ClarityService.stats.failedOperations++;
        ClarityService.recordCircuitBreakerFailure();
        return {
          success: false,
          error: {
            code: ClarityErrorCode.DB_NOT_CONNECTED,
            message: "数据库连接不可用",
          },
        };
      }

      // 4. 获取旧值（用于历史记录，带超时）
      const oldDoc = await Promise.race([
        ClaritySettingModel.findOne({ key: "CLARITY_PROJECT_ID" }).lean().maxTimeMS(5000).exec(),
        new Promise<null>((_, reject) => setTimeout(() => reject(new Error("Query timeout")), 10000)),
      ]);
      const oldValue = (oldDoc as any)?.value || null;

      // 5. 删除配置（带超时保护）
      await Promise.race([
        ClaritySettingModel.findOneAndDelete({ key: "CLARITY_PROJECT_ID" }).maxTimeMS(5000),
        new Promise((_, reject) => setTimeout(() => reject(new Error("Delete timeout")), 10000)),
      ]);

      // 6. 记录历史
      await recordHistory("CLARITY_PROJECT_ID", oldValue, null, "delete", metadata);

      // 7. 清除缓存
      ClarityService.clearCache();

      // 8. 记录成功
      ClarityService.stats.successfulOperations++;
      ClarityService.recordCircuitBreakerSuccess();
      ClarityService.updateResponseTime(Date.now() - startTime);

      logger.info("[ClarityService] 配置删除成功", { oldValue: oldValue ? "***" : null });

      return {
        success: true,
      };
    } catch (error) {
      ClarityService.stats.failedOperations++;
      ClarityService.recordCircuitBreakerFailure();
      ClarityService.recordError("Delete config failed", error);
      ClarityService.updateResponseTime(Date.now() - startTime);

      logger.error("[ClarityService] 删除配置失败", error);
      return {
        success: false,
        error: {
          code: ClarityErrorCode.DELETE_FAILED,
          message: "配置删除失败，请稍后重试",
        },
      };
    }
  }

  /**
   * 获取配置变更历史
   * @param limit 返回的记录数量（默认20条，最多100条）
   * @returns 历史记录列表
   */
  public static async getConfigHistory(limit: number = 20): Promise<ClarityServiceResult<ClarityHistoryDoc[]>> {
    const startTime = Date.now();

    try {
      // 检查数据库连接
      if (mongoose.connection.readyState !== 1) {
        return {
          success: false,
          error: {
            code: ClarityErrorCode.DB_NOT_CONNECTED,
            message: "数据库连接不可用",
          },
        };
      }

      // 验证limit参数
      const safeLimit = Math.min(Math.max(1, Math.floor(limit)), 100); // 1-100之间

      // 查询历史记录（带超时保护）
      const history = await Promise.race([
        ClarityHistoryModel.find({ key: "CLARITY_PROJECT_ID" })
          .sort({ changedAt: -1 })
          .limit(safeLimit)
          .lean()
          .maxTimeMS(5000) // 5秒超时
          .exec(),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Query timeout")), 10000)),
      ]);

      ClarityService.updateResponseTime(Date.now() - startTime);

      logger.debug("[ClarityService] 获取配置历史成功", { count: history.length });

      return {
        success: true,
        data: history as ClarityHistoryDoc[],
      };
    } catch (error) {
      ClarityService.recordError("Get config history failed", error);
      ClarityService.updateResponseTime(Date.now() - startTime);

      logger.error("[ClarityService] 获取配置历史失败", error);
      return {
        success: false,
        error: {
          code: ClarityErrorCode.READ_FAILED,
          message: "获取配置历史失败",
        },
      };
    }
  }

  /**
   * 获取缓存统计信息
   * @returns 缓存状态
   */
  public static getCacheStats(): {
    cached: boolean;
    age: number | null;
    ttl: number;
  } {
    return {
      cached: ClarityService.isCacheValid(),
      age: ClarityService.configCache ? Date.now() - ClarityService.configCache.cachedAt : null,
      ttl: ClarityService.CACHE_TTL_MS,
    };
  }
}
