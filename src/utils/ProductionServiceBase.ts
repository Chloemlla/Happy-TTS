import { mongoose } from "../services/mongoService";
import logger from "./logger";

// =============== 配置接口 ===============

/**
 * 服务配置接口 - 允许每个服务自定义配置
 */
export interface ServiceConfig {
  // 服务标识
  serviceName: string;

  // 限流器配置
  rateLimit?: {
    enabled: boolean;
    window: number; // 时间窗口（毫秒）
    maxRequests: number; // 最大请求数
    keyPrefix?: string; // 限流键前缀
  };

  // 断路器配置
  circuitBreaker?: {
    enabled: boolean;
    threshold: number; // 失败阈值
    timeout: number; // 超时时间（毫秒）
    successThreshold: number; // 成功阈值
  };

  // 缓存配置
  cache?: {
    enabled: boolean;
    ttl: number; // 缓存时间（毫秒）
    maxSize?: number; // 最大缓存数量
  };

  // 监控配置
  monitoring?: {
    enabled: boolean;
    performanceInterval: number; // 性能统计间隔（毫秒）
    healthCheckInterval: number; // 健康检查间隔（毫秒）
    cacheCleanupInterval: number; // 缓存清理间隔（毫秒）
  };

  // 性能配置
  performance?: {
    maxSamples: number; // 最大响应时间样本数
    queryTimeout: number; // 查询超时（毫秒）
    operationTimeout: number; // 操作总超时（毫秒）
  };

  // 健康状态阈值
  healthThresholds?: {
    degradedErrorRate: number; // 降级错误率阈值
    unhealthyErrorRate: number; //不健康错误率阈值
    degradedResponseTime: number; // 降级响应时间阈值
    unhealthyResponseTime: number; // 不健康响应时间阈值
  };
}

// 默认配置
export const DEFAULT_SERVICE_CONFIG: ServiceConfig = {
  serviceName: "UnnamedService",

  rateLimit: {
    enabled: true,
    window: 60000, // 1分钟
    maxRequests: 100, // 100次/分钟
    keyPrefix: "rate_limit_",
  },

  circuitBreaker: {
    enabled: true,
    threshold: 5, // 5次失败
    timeout: 60000, // 1分钟
    successThreshold: 3, // 3次成功
  },

  cache: {
    enabled: true,
    ttl: 300000, // 5分钟
    maxSize: 1000, // 最多1000条缓存
  },

  monitoring: {
    enabled: true,
    performanceInterval: 600000, // 10分钟
    healthCheckInterval: 30000, // 30秒
    cacheCleanupInterval: 300000, // 5分钟
  },

  performance: {
    maxSamples: 100,
    queryTimeout: 5000, // 5秒
    operationTimeout: 10000, // 10秒
  },

  healthThresholds: {
    degradedErrorRate: 0.2, // 20%
    unhealthyErrorRate: 0.5, // 50%
    degradedResponseTime: 2000, // 2秒
    unhealthyResponseTime: 5000, // 5秒
  },
};

// =============== 性能统计接口 ===============

export interface PerformanceStats {
  totalOperations: number;
  successfulOperations: number;
  failedOperations: number;
  avgResponseTime: number;
  cacheHitRate: number;
  rateLimitHits: number;
  circuitBreakerOpens: number;
}

// =============== 健康状态接口 ===============

export interface HealthStatus {
  status: "healthy" | "degraded" | "unhealthy";
  uptime: number;
  errorRate: number;
  avgResponseTime: number;
  mongoConnected: boolean;
  circuitBreakerState: "CLOSED" | "OPEN" | "HALF_OPEN";
  cacheSize: number;
  lastError?: string;
  lastErrorTime?: number;
}

// =============== 生产级服务基础类 ===============

/**
 * 生产级服务基础类
 * 提供断路器、限流器、缓存、监控等通用功能
 */
export abstract class ProductionServiceBase {
  protected readonly config: ServiceConfig;

  // 性能统计
  protected stats: PerformanceStats = {
    totalOperations: 0,
    successfulOperations: 0,
    failedOperations: 0,
    avgResponseTime: 0,
    cacheHitRate: 0,
    rateLimitHits: 0,
    circuitBreakerOpens: 0,
  };

  // 响应时间样本
  private responseTimeSamples: number[] = [];

  // 健康监控
  private readonly serviceStartTime = Date.now();
  private lastError: string | undefined;
  private lastErrorTime: number | undefined;

  // 限流器
  private readonly rateLimiter = new Map<string, { count: number; resetTime: number }>();

  // 缓存
  protected readonly cache = new Map<string, { data: any; timestamp: number }>();

  // 断路器
  private circuitBreakerState: "CLOSED" | "OPEN" | "HALF_OPEN" = "CLOSED";
  private circuitBreakerFailureCount = 0;
  private circuitBreakerLastFailureTime = 0;
  private circuitBreakerSuccessCount = 0;

  // 监控定时器
  private monitoringIntervals: NodeJS.Timeout[] = [];

  constructor(config: Partial<ServiceConfig> = {}) {
    // 合并配置
    this.config = this.mergeConfig(DEFAULT_SERVICE_CONFIG, config);

    // 初始化服务
    this.initialize();
  }

  // =============== 配置合并 ===============

  private mergeConfig(defaultConfig: ServiceConfig, customConfig: Partial<ServiceConfig>): ServiceConfig {
    return {
      serviceName: customConfig.serviceName || defaultConfig.serviceName,
      rateLimit: customConfig.rateLimit
        ? { ...defaultConfig.rateLimit, ...customConfig.rateLimit }
        : defaultConfig.rateLimit,
      circuitBreaker: customConfig.circuitBreaker
        ? { ...defaultConfig.circuitBreaker, ...customConfig.circuitBreaker }
        : defaultConfig.circuitBreaker,
      cache: customConfig.cache ? { ...defaultConfig.cache, ...customConfig.cache } : defaultConfig.cache,
      monitoring: customConfig.monitoring
        ? { ...defaultConfig.monitoring, ...customConfig.monitoring }
        : defaultConfig.monitoring,
      performance: customConfig.performance
        ? { ...defaultConfig.performance, ...customConfig.performance }
        : defaultConfig.performance,
      healthThresholds: customConfig.healthThresholds
        ? { ...defaultConfig.healthThresholds, ...customConfig.healthThresholds }
        : defaultConfig.healthThresholds,
    };
  }

  // =============== 初始化 ===============

  private initialize(): void {
    logger.info(`[${this.config.serviceName}] Initializing with production enhancements`, {
      rateLimitEnabled: this.config.rateLimit?.enabled,
      circuitBreakerEnabled: this.config.circuitBreaker?.enabled,
      cacheEnabled: this.config.cache?.enabled,
      monitoringEnabled: this.config.monitoring?.enabled,
    });

    if (this.config.monitoring?.enabled) {
      this.startMonitoring();
    }
  }

  // =============== 监控系统 ===============

  private startMonitoring(): void {
    const { performanceInterval, healthCheckInterval, cacheCleanupInterval } = this.config.monitoring!;

    // 性能监控
    const perfInterval = setInterval(() => {
      const stats = this.getPerformanceStats();
      logger.info(`[${this.config.serviceName}] Performance stats:`, stats);
    }, performanceInterval);
    this.monitoringIntervals.push(perfInterval);

    // 健康检查
    const healthInterval = setInterval(() => {
      const health = this.getHealthStatus();

      if (health.status === "unhealthy") {
        logger.error(`[${this.config.serviceName}] Service is UNHEALTHY:`, health);
      } else if (health.status === "degraded") {
        logger.warn(`[${this.config.serviceName}] Service is DEGRADED:`, health);
      }
    }, healthCheckInterval);
    this.monitoringIntervals.push(healthInterval);

    // 缓存清理
    const cacheInterval = setInterval(() => {
      this.cleanupCache();
      this.cleanupRateLimiter();
    }, cacheCleanupInterval);
    this.monitoringIntervals.push(cacheInterval);
  }

  /**
   * 停止监控（用于优雅关闭）
   */
  public stopMonitoring(): void {
    this.monitoringIntervals.forEach((interval) => clearInterval(interval));
    this.monitoringIntervals = [];
    logger.info(`[${this.config.serviceName}] Monitoring stopped`);
  }

  // =============== 限流器 ===============

  protected checkRateLimit(identifier: string): boolean {
    if (!this.config.rateLimit?.enabled) {
      return true;
    }

    const now = Date.now();
    const key = `${this.config.rateLimit.keyPrefix}${identifier}`;

    const limiter = this.rateLimiter.get(key);

    if (!limiter || now >= limiter.resetTime) {
      this.rateLimiter.set(key, {
        count: 1,
        resetTime: now + this.config.rateLimit.window,
      });
      return true;
    }

    if (limiter.count >= this.config.rateLimit.maxRequests) {
      this.stats.rateLimitHits++;
      logger.warn(`[${this.config.serviceName}] Rate limit exceeded:`, { identifier });
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
      logger.debug(`[${this.config.serviceName}] Cleaned ${cleaned} expired rate limiters`);
    }
  }

  // =============== 断路器 ===============

  protected checkCircuitBreaker(): boolean {
    if (!this.config.circuitBreaker?.enabled) {
      return true;
    }

    const now = Date.now();

    if (this.circuitBreakerState === "CLOSED") {
      return true;
    }

    if (this.circuitBreakerState === "OPEN") {
      if (now - this.circuitBreakerLastFailureTime >= this.config.circuitBreaker.timeout) {
        logger.info(`[${this.config.serviceName}] Circuit breaker transitioning to HALF_OPEN`);
        this.circuitBreakerState = "HALF_OPEN";
        this.circuitBreakerFailureCount = 0;
        this.circuitBreakerSuccessCount = 0;
        return true;
      }
      return false;
    }

    return true; // HALF_OPEN
  }

  protected recordCircuitBreakerSuccess(): void {
    if (!this.config.circuitBreaker?.enabled) {
      return;
    }

    if (this.circuitBreakerState === "HALF_OPEN") {
      this.circuitBreakerSuccessCount++;

      if (this.circuitBreakerSuccessCount >= this.config.circuitBreaker.successThreshold) {
        logger.info(`[${this.config.serviceName}] Circuit breaker closing after successful operations`);
        this.circuitBreakerState = "CLOSED";
        this.circuitBreakerFailureCount = 0;
        this.circuitBreakerSuccessCount = 0;
      }
    } else if (this.circuitBreakerState === "CLOSED") {
      this.circuitBreakerFailureCount = 0;
    }
  }

  protected recordCircuitBreakerFailure(): void {
    if (!this.config.circuitBreaker?.enabled) {
      return;
    }

    this.circuitBreakerFailureCount++;
    this.circuitBreakerLastFailureTime = Date.now();

    if (this.circuitBreakerState === "CLOSED") {
      if (this.circuitBreakerFailureCount >= this.config.circuitBreaker.threshold) {
        logger.error(`[${this.config.serviceName}] Circuit breaker OPENING after consecutive failures`);
        this.circuitBreakerState = "OPEN";
        this.stats.circuitBreakerOpens++;
      }
    } else if (this.circuitBreakerState === "HALF_OPEN") {
      logger.warn(`[${this.config.serviceName}] Circuit breaker reopening after failure in HALF_OPEN state`);
      this.circuitBreakerState = "OPEN";
      this.circuitBreakerFailureCount = 0;
      this.circuitBreakerSuccessCount = 0;
    }
  }

  // =============== 缓存管理 ===============

  protected getCachedValue<T>(key: string): T | null {
    if (!this.config.cache?.enabled) {
      return null;
    }

    const cached = this.cache.get(key);

    if (!cached) {
      return null;
    }

    const now = Date.now();
    if (now - cached.timestamp >= this.config.cache.ttl) {
      this.cache.delete(key);
      return null;
    }

    // 记录缓存命中
    this.stats.cacheHitRate = this.stats.cacheHitRate * 0.95 + 0.05;

    return cached.data as T;
  }

  protected setCachedValue<T>(key: string, data: T): void {
    if (!this.config.cache?.enabled) {
      return;
    }

    // 检查缓存大小限制
    if (this.config.cache.maxSize && this.cache.size >= this.config.cache.maxSize) {
      // 删除最旧的缓存项
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }

    this.cache.set(key, {
      data,
      timestamp: Date.now(),
    });
  }

  protected clearCache(key?: string): void {
    if (key) {
      this.cache.delete(key);
      logger.debug(`[${this.config.serviceName}] Cache cleared for key: ${key}`);
    } else {
      this.cache.clear();
      logger.debug(`[${this.config.serviceName}] All cache cleared`);
    }
  }

  private cleanupCache(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, cached] of this.cache.entries()) {
      if (now - cached.timestamp >= (this.config.cache?.ttl ?? 0)) {
        this.cache.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.debug(`[${this.config.serviceName}] Cleaned ${cleaned} expired cache entries`);
    }
  }

  // =============== 错误处理 ===============

  protected recordError(message: string, error: any): void {
    this.lastError = `${message}: ${error instanceof Error ? error.message : String(error)}`;
    this.lastErrorTime = Date.now();
    logger.error(`[${this.config.serviceName}] ${this.lastError}`);
  }

  // =============== 性能跟踪 ===============

  protected updateResponseTime(responseTime: number): void {
    this.responseTimeSamples.push(responseTime);

    const maxSamples = this.config.performance?.maxSamples || 100;
    if (this.responseTimeSamples.length > maxSamples) {
      this.responseTimeSamples.shift();
    }

    if (this.responseTimeSamples.length > 0) {
      this.stats.avgResponseTime =
        this.responseTimeSamples.reduce((a, b) => a + b, 0) / this.responseTimeSamples.length;
    }
  }

  /**
   * 执行带监控的操作
   * 自动跟踪性能、断路器、错误等
   */
  protected async executeWithMonitoring<T>(operation: () => Promise<T>, operationName: string): Promise<T> {
    const startTime = Date.now();
    this.stats.totalOperations++;

    try {
      // 检查断路器
      if (!this.checkCircuitBreaker()) {
        throw new Error(`Circuit breaker is OPEN for ${this.config.serviceName}`);
      }

      // 执行操作（带超时保护）
      const result = await Promise.race([
        operation(),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error(`${operationName} timeout`)),
            this.config.performance?.operationTimeout || 10000,
          ),
        ),
      ]);

      // 记录成功
      this.stats.successfulOperations++;
      this.recordCircuitBreakerSuccess();
      this.updateResponseTime(Date.now() - startTime);

      return result;
    } catch (error) {
      // 记录失败
      this.stats.failedOperations++;
      this.recordCircuitBreakerFailure();
      this.recordError(operationName, error);
      this.updateResponseTime(Date.now() - startTime);

      throw error;
    }
  }

  // =============== 数据库查询辅助 ===============

  /**
   * 执行带超时保护的MongoDB查询
   */
  protected async executeQuery<T>(query: Promise<T>, queryName: string = "Query"): Promise<T> {
    const _timeout = this.config.performance?.queryTimeout || 5000;
    const operationTimeout = this.config.performance?.operationTimeout || 10000;

    return await Promise.race([
      query,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`${queryName} timeout after ${operationTimeout}ms`)), operationTimeout),
      ),
    ]);
  }

  /**
   * 检查MongoDB连接状态
   */
  protected isMongoReady(): boolean {
    return mongoose.connection.readyState === 1;
  }

  // =============== 统计和健康 ===============

  public getPerformanceStats(): PerformanceStats {
    return { ...this.stats };
  }

  public getHealthStatus(): HealthStatus {
    const now = Date.now();
    const uptime = now - this.serviceStartTime;
    const errorRate = this.stats.totalOperations > 0 ? this.stats.failedOperations / this.stats.totalOperations : 0;

    let status: "healthy" | "degraded" | "unhealthy" = "healthy";

    const thresholds = this.config.healthThresholds!;

    // 判断不健康状态
    if (
      this.circuitBreakerState === "OPEN" ||
      errorRate > thresholds.unhealthyErrorRate ||
      this.stats.avgResponseTime > thresholds.unhealthyResponseTime ||
      !this.isMongoReady()
    ) {
      status = "unhealthy";
    }
    // 判断降级状态
    else if (
      this.circuitBreakerState === "HALF_OPEN" ||
      errorRate > thresholds.degradedErrorRate ||
      this.stats.avgResponseTime > thresholds.degradedResponseTime
    ) {
      status = "degraded";
    }

    return {
      status,
      uptime,
      errorRate,
      avgResponseTime: this.stats.avgResponseTime,
      mongoConnected: this.isMongoReady(),
      circuitBreakerState: this.circuitBreakerState,
      cacheSize: this.cache.size,
      lastError: this.lastError,
      lastErrorTime: this.lastErrorTime,
    };
  }

  /**
   * 重置性能统计
   */
  public resetStats(): void {
    this.stats = {
      totalOperations: 0,
      successfulOperations: 0,
      failedOperations: 0,
      avgResponseTime: 0,
      cacheHitRate: 0,
      rateLimitHits: 0,
      circuitBreakerOpens: 0,
    };
    this.responseTimeSamples = [];
    logger.info(`[${this.config.serviceName}] Stats reset`);
  }

  /**
   * 优雅关闭
   */
  public async gracefulShutdown(): Promise<void> {
    logger.info(`[${this.config.serviceName}] Graceful shutdown initiated`);

    // 停止监控
    this.stopMonitoring();

    // 清理缓存
    this.cache.clear();
    this.rateLimiter.clear();

    // 输出最终统计
    const finalStats = this.getPerformanceStats();
    const finalHealth = this.getHealthStatus();

    logger.info(`[${this.config.serviceName}] Final stats:`, {
      stats: finalStats,
      health: finalHealth,
    });
  }
}

// =============== 工具函数 ===============

/**
 * 创建服务配置的辅助函数
 */
export function createServiceConfig(
  serviceName: string,
  customConfig: Partial<Omit<ServiceConfig, "serviceName">> = {},
): ServiceConfig {
  const baseConfig = { ...DEFAULT_SERVICE_CONFIG };
  return {
    ...baseConfig,
    serviceName,
    rateLimit: customConfig.rateLimit ? { ...baseConfig.rateLimit, ...customConfig.rateLimit } : baseConfig.rateLimit,
    circuitBreaker: customConfig.circuitBreaker
      ? { ...baseConfig.circuitBreaker, ...customConfig.circuitBreaker }
      : baseConfig.circuitBreaker,
    cache: customConfig.cache ? { ...baseConfig.cache, ...customConfig.cache } : baseConfig.cache,
    monitoring: customConfig.monitoring
      ? { ...baseConfig.monitoring, ...customConfig.monitoring }
      : baseConfig.monitoring,
    performance: customConfig.performance
      ? { ...baseConfig.performance, ...customConfig.performance }
      : baseConfig.performance,
    healthThresholds: customConfig.healthThresholds
      ? { ...baseConfig.healthThresholds, ...customConfig.healthThresholds }
      : baseConfig.healthThresholds,
  };
}

/**
 * 合并多个配置
 */
export function mergeConfigs(...configs: Partial<ServiceConfig>[]): ServiceConfig {
  const result = { ...DEFAULT_SERVICE_CONFIG };

  for (const config of configs) {
    if (config.serviceName) result.serviceName = config.serviceName;
    if (config.rateLimit) result.rateLimit = { ...result.rateLimit!, ...config.rateLimit };
    if (config.circuitBreaker) result.circuitBreaker = { ...result.circuitBreaker!, ...config.circuitBreaker };
    if (config.cache) result.cache = { ...result.cache!, ...config.cache };
    if (config.monitoring) result.monitoring = { ...result.monitoring!, ...config.monitoring };
    if (config.performance) result.performance = { ...result.performance!, ...config.performance };
    if (config.healthThresholds) result.healthThresholds = { ...result.healthThresholds!, ...config.healthThresholds };
  }

  return result;
}
