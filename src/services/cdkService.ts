import crypto from "crypto";
import { existsSync } from "fs";
import { mkdir, writeFile } from "fs/promises";
import mongoose from "mongoose";
import { basename, join, resolve, sep } from "path";
import CDKModel, { type ICDK } from "../models/cdkModel";
import ResourceModel from "../models/resourceModel";
import logger from "../utils/logger";
import { ResourceService } from "./resourceService";
import { TransactionService } from "./transactionService";

// 性能监控接口
interface PerformanceStats {
  totalRedemptions: number;
  successfulRedemptions: number;
  failedRedemptions: number;
  avgRedemptionTime: number;
  cacheHitRate: number;
  rateLimitHits: number;
  duplicateAttempts: number;
}

// 健康状态接口
interface HealthStatus {
  status: "healthy" | "degraded" | "unhealthy";
  uptime: number;
  errorRate: number;
  avgResponseTime: number;
  mongoConnected: boolean;
  lastError?: string;
  lastErrorTime?: number;
}

export class CDKService {
  private static instance: CDKService;
  private resourceService = new ResourceService();
  private readonly EXPORT_DIR = join(process.cwd(), "data", "exports");

  // 性能统计
  private stats: PerformanceStats = {
    totalRedemptions: 0,
    successfulRedemptions: 0,
    failedRedemptions: 0,
    avgRedemptionTime: 0,
    cacheHitRate: 0,
    rateLimitHits: 0,
    duplicateAttempts: 0,
  };

  // 响应时间样本
  private responseTimeSamples: number[] = [];
  private readonly MAX_SAMPLES = 100;

  // 健康监控
  private readonly serviceStartTime = Date.now();
  private lastError: string | undefined;
  private lastErrorTime: number | undefined;

  // 限流器（Rate Limiter）
  private readonly rateLimiter = new Map<string, { count: number; resetTime: number }>();
  private readonly RATE_LIMIT_WINDOW = 60000; // 1分钟窗口
  private readonly RATE_LIMIT_MAX_REQUESTS = 50; // 每分钟最多50次CDK兑换请求

  // 验证缓存
  private readonly validationCache = new Map<string, { valid: boolean; data?: any; timestamp: number }>();
  private readonly VALIDATION_CACHE_TTL = 300000; // 5分钟

  // CDK代码缓存（防止重复查询）
  private readonly cdkCache = new Map<string, { exists: boolean; timestamp: number }>();
  private readonly CDK_CACHE_TTL = 60000; // 1分钟

  // 断路器模式
  private circuitBreakerState: "CLOSED" | "OPEN" | "HALF_OPEN" = "CLOSED";
  private circuitBreakerFailureCount = 0;
  private circuitBreakerLastFailureTime = 0;
  private readonly CIRCUIT_BREAKER_THRESHOLD = 5;
  private readonly CIRCUIT_BREAKER_TIMEOUT = 60000;
  private readonly CIRCUIT_BREAKER_SUCCESS_THRESHOLD = 3;

  private constructor() {
    this.initializeService();
  }

  public static getInstance(): CDKService {
    if (!CDKService.instance) {
      CDKService.instance = new CDKService();
    }
    return CDKService.instance;
  }

  private async initializeService() {
    try {
      // 确保导出目录存在
      if (!existsSync(this.EXPORT_DIR)) {
        await mkdir(this.EXPORT_DIR, { recursive: true });
      }

      // 启动性能监控
      this.startPerformanceMonitoring();

      // 启动健康检查
      this.startHealthCheck();

      // 启动缓存清理
      this.startCacheCleanup();

      logger.info("[CDKService] Service initialized with production enhancements", {
        rateLimitEnabled: true,
        cacheEnabled: true,
        circuitBreakerEnabled: true,
      });
    } catch (error) {
      logger.error("[CDKService] Error initializing service:", error);
      this.recordError("Service initialization failed", error);
    }
  }

  // =============== 辅助方法 ===============

  private startPerformanceMonitoring() {
    setInterval(
      () => {
        const stats = this.getPerformanceStats();
        logger.info("[CDKService] Performance stats:", stats);
      },
      10 * 60 * 1000,
    ); // 10分钟
  }

  private startHealthCheck() {
    setInterval(() => {
      const health = this.getHealthStatus();

      if (health.status === "unhealthy") {
        logger.error("[CDKService] Service is UNHEALTHY:", health);
      } else if (health.status === "degraded") {
        logger.warn("[CDKService] Service is DEGRADED:", health);
      }
    }, 30000); // 30秒
  }

  private startCacheCleanup() {
    setInterval(
      () => {
        this.cleanupValidationCache();
        this.cleanupRateLimiter();
        this.cleanupCDKCache();
      },
      5 * 60 * 1000,
    ); // 5分钟
  }

  private checkRateLimit(userId: string): boolean {
    const now = Date.now();
    const key = `rate_limit_${userId}`;

    const limiter = this.rateLimiter.get(key);

    if (!limiter || now >= limiter.resetTime) {
      this.rateLimiter.set(key, {
        count: 1,
        resetTime: now + this.RATE_LIMIT_WINDOW,
      });
      return true;
    }

    if (limiter.count >= this.RATE_LIMIT_MAX_REQUESTS) {
      this.stats.rateLimitHits++;
      logger.warn(`[CDKService] Rate limit exceeded for user: ${userId}`);
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
      logger.debug(`[CDKService] Cleaned ${cleaned} expired rate limiters`);
    }
  }

  private getCachedValidation(key: string): { valid: boolean; data?: any } | null {
    const cached = this.validationCache.get(key);

    if (!cached) {
      return null;
    }

    const now = Date.now();
    if (now - cached.timestamp >= this.VALIDATION_CACHE_TTL) {
      this.validationCache.delete(key);
      return null;
    }

    this.stats.cacheHitRate = this.stats.cacheHitRate * 0.9 + 0.1;
    return { valid: cached.valid, data: cached.data };
  }

  private setCachedValidation(key: string, valid: boolean, data?: any): void {
    this.validationCache.set(key, {
      valid,
      data,
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
      logger.debug(`[CDKService] Cleaned ${cleaned} expired validation cache entries`);
    }
  }

  private cleanupCDKCache(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, cache] of this.cdkCache.entries()) {
      if (now - cache.timestamp >= this.CDK_CACHE_TTL) {
        this.cdkCache.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.debug(`[CDKService] Cleaned ${cleaned} expired CDK cache entries`);
    }
  }

  private checkCircuitBreaker(): boolean {
    const now = Date.now();

    if (this.circuitBreakerState === "CLOSED") {
      return true;
    }

    if (this.circuitBreakerState === "OPEN") {
      if (now - this.circuitBreakerLastFailureTime >= this.CIRCUIT_BREAKER_TIMEOUT) {
        logger.info("[CDKService] Circuit breaker transitioning to HALF_OPEN");
        this.circuitBreakerState = "HALF_OPEN";
        this.circuitBreakerFailureCount = 0;
        return true;
      }
      return false;
    }

    return true;
  }

  private recordCircuitBreakerSuccess(): void {
    if (this.circuitBreakerState === "HALF_OPEN") {
      this.circuitBreakerFailureCount++;

      if (this.circuitBreakerFailureCount >= this.CIRCUIT_BREAKER_SUCCESS_THRESHOLD) {
        logger.info("[CDKService] Circuit breaker closing after successful operations");
        this.circuitBreakerState = "CLOSED";
        this.circuitBreakerFailureCount = 0;
      }
    } else if (this.circuitBreakerState === "CLOSED") {
      this.circuitBreakerFailureCount = 0;
    }
  }

  private recordCircuitBreakerFailure(): void {
    this.circuitBreakerFailureCount++;
    this.circuitBreakerLastFailureTime = Date.now();

    if (this.circuitBreakerState === "CLOSED") {
      if (this.circuitBreakerFailureCount >= this.CIRCUIT_BREAKER_THRESHOLD) {
        logger.error("[CDKService] Circuit breaker OPENING after consecutive failures");
        this.circuitBreakerState = "OPEN";
      }
    } else if (this.circuitBreakerState === "HALF_OPEN") {
      logger.warn("[CDKService] Circuit breaker reopening after failure in HALF_OPEN state");
      this.circuitBreakerState = "OPEN";
      this.circuitBreakerFailureCount = 0;
    }
  }

  private recordError(message: string, error: any): void {
    this.lastError = `${message}: ${error instanceof Error ? error.message : String(error)}`;
    this.lastErrorTime = Date.now();
  }

  private updateResponseTime(responseTime: number): void {
    this.responseTimeSamples.push(responseTime);
    if (this.responseTimeSamples.length > this.MAX_SAMPLES) {
      this.responseTimeSamples.shift();
    }

    this.stats.avgRedemptionTime =
      this.responseTimeSamples.reduce((a, b) => a + b, 0) / this.responseTimeSamples.length;
  }

  public getPerformanceStats(): PerformanceStats {
    return { ...this.stats };
  }

  public getHealthStatus(): HealthStatus {
    const now = Date.now();
    const uptime = now - this.serviceStartTime;
    const errorRate = this.stats.totalRedemptions > 0 ? this.stats.failedRedemptions / this.stats.totalRedemptions : 0;

    let status: "healthy" | "degraded" | "unhealthy" = "healthy";

    if (this.circuitBreakerState === "OPEN" || errorRate > 0.5 || !this.isMongoReady()) {
      status = "unhealthy";
    } else if (this.circuitBreakerState === "HALF_OPEN" || errorRate > 0.2 || this.stats.avgRedemptionTime > 3000) {
      status = "degraded";
    }

    return {
      status,
      uptime,
      errorRate,
      avgResponseTime: this.stats.avgRedemptionTime,
      mongoConnected: this.isMongoReady(),
      lastError: this.lastError,
      lastErrorTime: this.lastErrorTime,
    };
  }

  private isMongoReady(): boolean {
    return mongoose.connection.readyState === 1;
  }

  // =============== 核心业务方法 ===============

  async redeemCDK(
    code: string,
    userInfo?: { userId: string; username: string },
    forceRedeem?: boolean,
    cfToken?: string,
    userRole?: string,
  ) {
    const startTime = Date.now();
    this.stats.totalRedemptions++;

    try {
      // 检查断路器
      if (!this.checkCircuitBreaker()) {
        throw new Error("服务暂时不可用，请稍后重试");
      }

      // 验证CDK代码格式
      if (!code || typeof code !== "string" || code.length !== 16 || !/^[A-Z0-9]{16}$/.test(code)) {
        logger.warn("[CDKService] 无效的CDK代码格式", { code });
        throw new Error("无效的CDK代码格式");
      }

      // 限流检查
      if (userInfo && !this.checkRateLimit(userInfo.userId)) {
        throw new Error("请求过于频繁，请稍后重试");
      }

      // 验证和清理用户信息以防止NoSQL注入
      if (userInfo) {
        if (!userInfo.userId || typeof userInfo.userId !== "string" || userInfo.userId.length > 100) {
          logger.warn("无效的用户ID格式", { userId: userInfo.userId });
          throw new Error("无效的用户ID格式");
        }
        if (!userInfo.username || typeof userInfo.username !== "string" || userInfo.username.length > 50) {
          logger.warn("无效的用户名格式", { username: userInfo.username });
          throw new Error("无效的用户名格式");
        }

        // 清理用户输入，移除潜在的NoSQL注入字符
        userInfo.userId = userInfo.userId.replace(/[{}$]/g, "");
        userInfo.username = userInfo.username.replace(/[{}$]/g, "");
      }

      // Turnstile 验证（非管理员用户）
      const isAdmin = userRole === "admin" || userRole === "administrator";
      if (!isAdmin && process.env.TURNSTILE_SECRET_KEY) {
        if (!cfToken) {
          logger.warn("非管理员用户缺少 Turnstile token，拒绝CDK兑换", { userId: userInfo?.userId, userRole });
          throw new Error("需要完成人机验证才能兑换CDK");
        }

        try {
          // 验证 Turnstile token
          const axios = await import("axios");
          const verificationResult = await axios.default.post(
            "https://challenges.cloudflare.com/turnstile/v0/siteverify",
            {
              secret: process.env.TURNSTILE_SECRET_KEY,
              response: cfToken,
            },
            {
              timeout: 10000, // 10秒超时
            },
          );

          if (!verificationResult.data.success) {
            logger.warn("Turnstile 验证失败", {
              userId: userInfo?.userId,
              userRole,
              errorCodes: verificationResult.data["error-codes"],
            });
            throw new Error("人机验证失败，请重新验证");
          }

          logger.info("Turnstile 验证成功", {
            userId: userInfo?.userId,
            userRole,
            hostname: verificationResult.data.hostname,
          });
        } catch (error) {
          if (error instanceof Error && error.message.includes("Turnstile")) {
            throw error;
          }
          logger.error("Turnstile 验证请求失败", {
            userId: userInfo?.userId,
            userRole,
            error: error instanceof Error ? error.message : String(error),
          });
          throw new Error("人机验证服务暂时不可用，请稍后重试");
        }
      } else if (!isAdmin && !process.env.TURNSTILE_SECRET_KEY) {
        logger.info("跳过 Turnstile 验证（未配置密钥）", { userId: userInfo?.userId, userRole });
      } else if (isAdmin) {
        logger.info("跳过 Turnstile 验证（管理员用户）", { userId: userInfo?.userId, userRole });
      }

      // 首先查找CDK以获取资源ID
      const cdkToRedeem = await CDKModel.findOne({
        code,
        isUsed: false,
        $or: [{ expiresAt: { $exists: false } }, { expiresAt: { $gt: new Date() } }],
      });

      if (!cdkToRedeem) {
        logger.warn("CDK兑换失败：无效或已使用", { code });
        throw new Error("无效或已使用的CDK");
      }

      // 如果提供了用户信息且未强制兑换，检查用户是否已拥有该资源
      if (userInfo && !forceRedeem) {
        // 使用参数化查询防止NoSQL注入
        const existingCDK = await CDKModel.findOne({
          resourceId: new mongoose.Types.ObjectId(cdkToRedeem.resourceId),
          isUsed: true,
          "usedBy.userId": { $eq: userInfo.userId }, // 使用$eq操作符确保精确匹配
        });

        if (existingCDK) {
          // 用户已拥有该资源，返回特殊错误以触发前端确认对话框
          const resource = await this.resourceService.getResourceById(cdkToRedeem.resourceId);
          const error = new Error("DUPLICATE_RESOURCE") as any;
          error.resourceTitle = resource?.title || "未知资源";
          error.resourceId = cdkToRedeem.resourceId;
          throw error;
        }
      }

      const updateData: any = {
        isUsed: true,
        usedAt: new Date(),
        usedIp: "127.0.0.1", // 实际应用中需要获取真实IP
      };

      // 如果提供了用户信息，则记录用户信息
      if (userInfo) {
        updateData.usedBy = {
          userId: userInfo.userId,
          username: userInfo.username,
        };
      }

      const cdk = await CDKModel.findOneAndUpdate(
        {
          code,
          isUsed: false,
          $or: [{ expiresAt: { $exists: false } }, { expiresAt: { $gt: new Date() } }],
        },
        { $set: updateData },
        { new: true },
      );

      if (!cdk) {
        logger.warn("CDK兑换失败：无效或已使用", { code });
        throw new Error("无效或已使用的CDK");
      }

      const resource = await this.resourceService.getResourceById(cdk.resourceId);
      if (!resource) {
        logger.warn("CDK兑换失败：资源不存在", { code, resourceId: cdk.resourceId });
        throw new Error("资源不存在");
      }

      logger.info("[CDKService] CDK兑换成功", {
        code,
        resourceId: cdk.resourceId,
        resourceTitle: resource.title,
        forceRedeem,
      });

      // 记录成功统计
      this.stats.successfulRedemptions++;
      this.recordCircuitBreakerSuccess();
      this.updateResponseTime(Date.now() - startTime);

      return {
        resource,
        cdk: cdk.toObject(),
      };
    } catch (error) {
      this.stats.failedRedemptions++;
      this.recordCircuitBreakerFailure();
      this.recordError("CDK redemption failed", error);

      logger.error("[CDKService] CDK兑换失败:", error);
      throw error;
    } finally {
      this.updateResponseTime(Date.now() - startTime);
    }
  }

  async getCDKs(page: number, resourceId?: string, filterType: "all" | "unused" | "used" = "all") {
    try {
      // 验证和清理输入参数
      const validatedPage = Math.max(1, Math.floor(Number(page) || 1));
      const pageSize = 10;
      const skip = (validatedPage - 1) * pageSize;

      // 验证resourceId格式
      const validatedResourceId =
        resourceId &&
        typeof resourceId === "string" &&
        resourceId.trim() !== "" &&
        resourceId.length === 24 &&
        /^[0-9a-fA-F]{24}$/.test(resourceId)
          ? resourceId
          : undefined;

      const queryFilter: any = {};
      if (validatedResourceId) {
        queryFilter.resourceId = validatedResourceId;
      }

      // 根据过滤类型添加使用状态条件
      if (filterType === "unused") {
        queryFilter.isUsed = false;
      } else if (filterType === "used") {
        queryFilter.isUsed = true;
      }

      // 添加超时保护的并发查询
      const [cdks, total] = (await Promise.race([
        Promise.all([
          CDKModel.find(queryFilter).skip(skip).limit(pageSize).sort({ createdAt: -1 }).lean().maxTimeMS(5000), // 5秒超时
          CDKModel.countDocuments(queryFilter).maxTimeMS(5000),
        ]),
        new Promise((_, reject) => setTimeout(() => reject(new Error("Query timeout")), 10000)),
      ])) as [any[], number];

      logger.info("[CDKService] 获取CDK列表成功", { page: validatedPage, resourceId: validatedResourceId, total });
      return {
        cdks: cdks.map((c) => {
          const obj = c as any;
          // 确保id字段存在，将_id转换为id
          obj.id = obj._id.toString();
          delete obj._id;
          delete obj.__v;
          return obj;
        }),
        total,
        page: validatedPage,
        pageSize,
      };
    } catch (error) {
      logger.error("[CDKService] 获取CDK列表失败:", error);
      this.recordError("Get CDKs failed", error);
      throw error;
    }
  }

  async getCDKStats() {
    try {
      const [total, used] = (await Promise.race([
        Promise.all([
          CDKModel.countDocuments().maxTimeMS(5000),
          CDKModel.countDocuments({ isUsed: true }).maxTimeMS(5000),
        ]),
        new Promise((_, reject) => setTimeout(() => reject(new Error("Stats query timeout")), 10000)),
      ])) as [number, number];

      logger.info("[CDKService] 获取CDK统计成功", { total, used, available: total - used });
      return {
        total,
        used,
        available: total - used,
      };
    } catch (error) {
      logger.error("[CDKService] 获取CDK统计失败:", error);
      this.recordError("Get CDK stats failed", error);
      throw error;
    }
  }

  async generateCDKs(resourceId: string, count: number, expiresAt?: Date) {
    try {
      // 使用事务确保数据一致性
      return await TransactionService.generateCDKsWithTransaction(resourceId, count, expiresAt);
    } catch (error) {
      logger.error("生成CDK失败:", error);
      throw error;
    }
  }

  async updateCDK(id: string, updateData: { code?: string; resourceId?: string; expiresAt?: Date }) {
    try {
      // 验证ID格式
      if (!mongoose.Types.ObjectId.isValid(id)) {
        throw new Error("无效的CDK ID格式");
      }

      const cdk = await CDKModel.findById(id);
      if (!cdk) {
        throw new Error("CDK不存在");
      }

      if (cdk.isUsed) {
        throw new Error("已使用的CDK无法编辑");
      }

      // 验证更新数据
      const validatedData: any = {};

      if (updateData.code !== undefined) {
        // 验证CDK代码格式
        if (
          !updateData.code ||
          typeof updateData.code !== "string" ||
          updateData.code.length !== 16 ||
          !/^[A-Z0-9]{16}$/.test(updateData.code)
        ) {
          throw new Error("无效的CDK代码格式");
        }

        // 检查代码是否已存在（排除当前CDK）
        const existingCDK = await CDKModel.findOne({
          code: updateData.code,
          _id: { $ne: id },
        });
        if (existingCDK) {
          throw new Error("CDK代码已存在");
        }

        validatedData.code = updateData.code;
      }

      if (updateData.resourceId !== undefined) {
        // 验证资源ID格式
        if (!mongoose.Types.ObjectId.isValid(updateData.resourceId)) {
          throw new Error("无效的资源ID格式");
        }

        // 验证资源是否存在
        const resource = await this.resourceService.getResourceById(updateData.resourceId);
        if (!resource) {
          throw new Error("资源不存在");
        }

        validatedData.resourceId = updateData.resourceId;
      }

      if (updateData.expiresAt !== undefined) {
        if (updateData.expiresAt && new Date(updateData.expiresAt) <= new Date()) {
          throw new Error("过期时间必须晚于当前时间");
        }
        validatedData.expiresAt = updateData.expiresAt;
      }

      const updatedCDK = await CDKModel.findByIdAndUpdate(id, { $set: validatedData }, { new: true });

      logger.info("更新CDK成功", { id, updateData: validatedData });
      return updatedCDK;
    } catch (error) {
      logger.error("更新CDK失败:", error);
      throw error;
    }
  }

  async deleteCDK(id: string) {
    try {
      // 验证ID格式
      if (!mongoose.Types.ObjectId.isValid(id)) {
        throw new Error("无效的CDK ID格式");
      }

      const cdk = await CDKModel.findById(id);
      if (!cdk) {
        throw new Error("CDK不存在");
      }

      if (cdk.isUsed) {
        throw new Error("已使用的CDK无法删除");
      }

      await CDKModel.findByIdAndDelete(id);
      logger.info("删除CDK成功", { id, code: cdk.code });
    } catch (error) {
      logger.error("删除CDK失败:", error);
      throw error;
    }
  }

  // 批量删除CDK
  async batchDeleteCDKs(ids: string[]) {
    try {
      // 验证输入参数
      if (!Array.isArray(ids) || ids.length === 0) {
        throw new Error("请提供有效的CDK ID列表");
      }

      // 限制批量删除数量，防止DoS攻击
      if (ids.length > 100) {
        throw new Error("批量删除数量不能超过100个");
      }

      // 验证每个ID的格式
      const validIds = ids.filter((id) => typeof id === "string" && id.length === 24 && /^[0-9a-fA-F]{24}$/.test(id));

      if (validIds.length === 0) {
        throw new Error("没有有效的CDK ID");
      }

      // 查找所有要删除的CDK
      const cdks = await CDKModel.find({ _id: { $in: validIds } });

      if (cdks.length === 0) {
        throw new Error("没有找到要删除的CDK");
      }

      // 检查是否有已使用的CDK
      const usedCDKs = cdks.filter((cdk) => cdk.isUsed);
      if (usedCDKs.length > 0) {
        const usedCodes = usedCDKs.map((cdk) => cdk.code).join(", ");
        throw new Error(`以下CDK已被使用，无法删除：${usedCodes}`);
      }

      // 执行批量删除
      const deleteResult = await CDKModel.deleteMany({
        _id: { $in: validIds },
        isUsed: false, // 双重保险，确保不删除已使用的CDK
      });

      logger.info("批量删除CDK成功", {
        requestedCount: ids.length,
        validCount: validIds.length,
        deletedCount: deleteResult.deletedCount,
        deletedCodes: cdks.map((cdk) => cdk.code),
      });

      return {
        requestedCount: ids.length,
        validCount: validIds.length,
        deletedCount: deleteResult.deletedCount,
        deletedCodes: cdks.map((cdk) => cdk.code),
      };
    } catch (error) {
      logger.error("批量删除CDK失败:", error);
      throw error;
    }
  }

  // 获取用户已兑换的资源
  async getUserRedeemedResources(userIp: string) {
    try {
      // 查找该IP地址兑换过的CDK
      const redeemedCDKs = await CDKModel.find({
        isUsed: true,
        usedIp: userIp,
      }).sort({ usedAt: -1 });

      if (redeemedCDKs.length === 0) {
        return { resources: [], total: 0 };
      }

      // 获取资源详情
      const resourceIds = [...new Set(redeemedCDKs.map((cdk) => cdk.resourceId))];
      const resources = await ResourceModel.find({ _id: { $in: resourceIds } });

      // 合并CDK信息和资源信息
      const result = resources.map((resource: any) => {
        const relatedCDKs = redeemedCDKs.filter((cdk) => cdk.resourceId === resource._id.toString());
        const latestRedemption = relatedCDKs[0]; // 已按时间排序

        return {
          id: resource._id.toString(),
          title: resource.title,
          description: resource.description,
          downloadUrl: resource.downloadUrl,
          price: resource.price,
          category: resource.category,
          imageUrl: resource.imageUrl,
          redeemedAt: latestRedemption.usedAt,
          cdkCode: latestRedemption.code,
          redemptionCount: relatedCDKs.length,
        };
      });

      logger.info("获取用户已兑换资源成功", { userIp, total: result.length });
      return { resources: result, total: result.length };
    } catch (error) {
      logger.error("获取用户已兑换资源失败:", error);
      throw error;
    }
  }

  // 获取CDK总数量
  async getTotalCDKCount() {
    try {
      const count = await CDKModel.countDocuments({});
      logger.info("获取CDK总数量成功", { totalCount: count });
      return { totalCount: count };
    } catch (error) {
      logger.error("获取CDK总数量失败:", error);
      throw error;
    }
  }

  // 删除所有CDK
  async deleteAllCDKs() {
    try {
      const result = await CDKModel.deleteMany({});
      logger.info("删除所有CDK成功", { deletedCount: result.deletedCount });
      return { deletedCount: result.deletedCount };
    } catch (error) {
      logger.error("删除所有CDK失败:", error);
      throw error;
    }
  }

  // 删除所有未使用的CDK
  async deleteUnusedCDKs() {
    try {
      const result = await CDKModel.deleteMany({ isUsed: false });
      logger.info("删除所有未使用CDK成功", { deletedCount: result.deletedCount });
      return { deletedCount: result.deletedCount };
    } catch (error) {
      logger.error("删除所有未使用CDK失败:", error);
      throw error;
    }
  }

  /**
   * 导入CDK数据（管理员功能）- 异步并发处理
   * 内容格式兼容多种导出样式，例如：
   *  - "1. CDK信息" / "1. CDK 信息"
   *  - 字段名支持："CDK代码:" 或 "代码:", "资源ID:", "过期时间:"
   */
  async importCDKs(content: string) {
    try {
      const lines = content.split("\n");
      const itemsToImport: any[] = [];
      let current: any = {};

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        // 开始新条目
        if (/^\d+\./.test(line) && /CDK/.test(line)) {
          if (current.code && current.resourceId) {
            itemsToImport.push({ ...current });
          }
          current = {};
          continue;
        }

        // 解析字段
        if (line.startsWith("CDK代码: ")) {
          current.code = line.replace("CDK代码: ", "").trim();
        } else if (line.startsWith("代码: ")) {
          current.code = line.replace("代码: ", "").trim();
        } else if (line.startsWith("资源ID: ")) {
          current.resourceId = line.replace("资源ID: ", "").trim();
        } else if (line.startsWith("过期时间: ")) {
          current.expiresAt = line.replace("过期时间: ", "").trim();
        }
      }

      // 处理最后一条
      if (current.code && current.resourceId) {
        itemsToImport.push({ ...current });
      }

      const results = await this.processCDKsAsync(itemsToImport);

      logger.info("导入CDK数据完成", {
        importedCount: results.importedCount,
        skippedCount: results.skippedCount,
        errorCount: results.errorCount,
        totalItems: itemsToImport.length,
      });

      return results;
    } catch (error) {
      logger.error("导入CDK数据失败:", error);
      throw error;
    }
  }

  /**
   * 异步并发处理多个CDK
   */
  private async processCDKsAsync(items: any[]): Promise<{
    importedCount: number;
    skippedCount: number;
    errorCount: number;
    errors: string[];
  }> {
    const batchSize = 10;
    const errors: string[] = [];
    let importedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);

      const batchPromises = batch.map(async (item) => {
        try {
          const result = await this.processImportCDKAsync(item);
          return result;
        } catch (error) {
          return {
            skipped: false,
            error: `CDK ${item.code}: ${error instanceof Error ? error.message : String(error)}`,
          };
        }
      });

      const batchResults = await Promise.all(batchPromises);

      batchResults.forEach((r) => {
        if (r.error) {
          errors.push(r.error);
          errorCount++;
        } else if (r.skipped) {
          skippedCount++;
        } else {
          importedCount++;
        }
      });

      logger.info(`处理CDK批次 ${Math.floor(i / batchSize) + 1}/${Math.ceil(items.length / batchSize)}`, {
        batchSize: batch.length,
        processed: i + batch.length,
        total: items.length,
      });
    }

    return {
      importedCount,
      skippedCount,
      errorCount,
      errors: errors.slice(0, 10),
    };
  }

  /**
   * 处理单个导入CDK - 异步版本
   */
  private async processImportCDKAsync(item: any): Promise<{ skipped: boolean; error?: string }> {
    return new Promise(async (resolve) => {
      try {
        // 必需字段
        if (!item.code || !item.resourceId) {
          throw new Error("缺少必需的CDK代码或资源ID");
        }

        // 过滤无效值
        if (
          item.code === "undefined" ||
          item.resourceId === "undefined" ||
          !String(item.code).trim() ||
          !String(item.resourceId).trim()
        ) {
          throw new Error("CDK代码或资源ID包含无效值");
        }

        const code = String(item.code).trim();
        const resourceId = String(item.resourceId).trim();

        // 验证代码格式：16位大写字母数字
        if (!/^[A-Z0-9]{16}$/.test(code)) {
          throw new Error("无效的CDK代码格式");
        }

        // 验证资源ID
        if (!mongoose.isValidObjectId(resourceId)) {
          throw new Error("无效的资源ID");
        }
        const resourceExists = await ResourceModel.exists({ _id: new mongoose.Types.ObjectId(resourceId) });
        if (!resourceExists) {
          throw new Error("资源不存在");
        }

        // 过期时间（可选）
        let expiresAt: Date | undefined;
        if (item.expiresAt) {
          const d = new Date(String(item.expiresAt));
          if (isNaN(d.getTime())) {
            throw new Error("过期时间格式无效");
          }
          if (d.getTime() <= Date.now()) {
            throw new Error("过期时间必须晚于当前时间");
          }
          expiresAt = d;
        }

        // 重复检查
        const existing = await CDKModel.findOne({ code });
        if (existing) {
          logger.info(`跳过重复CDK: ${code}`);
          resolve({ skipped: true });
          return;
        }

        // 创建
        const doc: Partial<ICDK> = {
          code,
          resourceId,
          isUsed: false,
          createdAt: new Date(),
        } as any;
        if (expiresAt) (doc as any).expiresAt = expiresAt;

        await CDKModel.create(doc);
        logger.debug(`成功导入CDK: ${code}`);
        resolve({ skipped: false });
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        logger.warn(`导入CDK失败 ${item.code}: ${msg}`);
        resolve({ skipped: false, error: msg });
      }
    });
  }

  /**
   * 导出CDK：若数量 > 5，则在后端生成UTF-8(BOM)文本文件供下载；否则以内联文本返回
   */
  public async exportCDKs(
    resourceId?: string,
    filterType: "all" | "unused" | "used" = "all",
  ): Promise<
    | { mode: "file"; filename: string; filePath: string; count: number }
    | { mode: "inline"; filename: string; content: string; count: number }
  > {
    try {
      // 可选过滤 resourceId（24位hex）
      const validatedResourceId =
        resourceId &&
        typeof resourceId === "string" &&
        resourceId.trim() !== "" &&
        resourceId.length === 24 &&
        /^[0-9a-fA-F]{24}$/.test(resourceId)
          ? resourceId
          : undefined;

      const query: any = {};
      if (validatedResourceId) query.resourceId = validatedResourceId;
      if (filterType === "unused") query.isUsed = false;
      if (filterType === "used") query.isUsed = true;

      // 先统计总数，决定导出策略
      const count = await CDKModel.countDocuments(query);

      const now = new Date();
      const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
      const ts = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
      const filterLabel = filterType === "all" ? "全部" : filterType === "unused" ? "未使用" : "已使用";
      const rawFilename = validatedResourceId
        ? `CDK导出_${filterLabel}_${validatedResourceId}_${ts}.txt`
        : `CDK导出_${filterLabel}_${ts}.txt`;
      // 额外净化：仅允许字母数字、下划线、短横线与中文，强制使用 basename 与 .txt 后缀
      const safeBase = basename(rawFilename).replace(/[^\w\-\u4e00-\u9fa5.]+/g, "_");
      const filename = safeBase.endsWith(".txt") ? safeBase : `${safeBase}.txt`;

      // 通用的头部文本（稍后与BOM组合）
      const header = `=== ${filterLabel}CDK导出报告 ===\n导出时间: ${now.toLocaleString("zh-CN")}\n${validatedResourceId ? `资源ID: ${validatedResourceId}\n` : ""}导出类型: ${filterLabel}\n总数量: ${count}\n\n`;

      // 字段投影，减少IO与解码成本
      const projection = {
        code: 1,
        resourceId: 1,
        createdAt: 1,
        expiresAt: 1,
        isUsed: 1,
        usedAt: 1,
        usedIp: 1,
        "usedBy.userId": 1,
        "usedBy.username": 1,
      } as const;

      if (count <= 5) {
        // 小数据量：以内联字符串返回，但仍然用游标逐行拼接，避免意外的超量占用
        const cursor = CDKModel.find(query).sort({ createdAt: -1 }).select(projection).lean().cursor();
        let index = 0;
        let body = header;
        for await (const c of cursor as any) {
          body +=
            [
              `${index + 1}. CDK代码: ${c.code}`,
              `   资源ID: ${c.resourceId}`,
              `   创建时间: ${new Date(c.createdAt).toLocaleString("zh-CN")}`,
              c.expiresAt ? `   过期时间: ${new Date(c.expiresAt).toLocaleString("zh-CN")}` : undefined,
              c.isUsed ? `   使用状态: 已使用` : "   使用状态: 未使用",
              c.isUsed && c.usedAt ? `   使用时间: ${new Date(c.usedAt).toLocaleString("zh-CN")}` : undefined,
              c.isUsed && c.usedIp ? `   使用IP: ${c.usedIp}` : undefined,
              c.isUsed && c.usedBy?.username
                ? `   使用用户: ${c.usedBy.username} (ID: ${c.usedBy.userId || "-"})`
                : undefined,
              "",
            ]
              .filter(Boolean)
              .join("\n") + "\n";
          index++;
        }
        body += `=== 导出完成 ===\n`;
        const contentWithBOM = `\uFEFF${body}`;
        logger.info("以内联文本返回CDK导出内容", { count });
        return { mode: "inline", filename, content: contentWithBOM, count };
      }

      // 大数据量：写入到文件（流式），避免内存峰值
      if (!existsSync(this.EXPORT_DIR)) {
        await mkdir(this.EXPORT_DIR, { recursive: true });
      }
      // 规范化并校验导出路径，防止路径穿越
      const resolvedExportDir = resolve(this.EXPORT_DIR) + sep;
      const candidatePath = resolve(this.EXPORT_DIR, filename);
      if (!(candidatePath + sep).startsWith(resolvedExportDir) && candidatePath !== resolvedExportDir.slice(0, -1)) {
        throw new Error("非法的导出文件路径");
      }
      const filePath = candidatePath;

      // 使用写流 + 游标逐行写入（不允许外部覆盖路径选项）
      const fs = await import("fs");
      const { createWriteStream } = fs;
      const ws = createWriteStream(filePath, { encoding: "utf8", flags: "w" });

      // 先写入BOM与头
      ws.write("\uFEFF");
      ws.write(header);

      const cursor = CDKModel.find(query).sort({ createdAt: -1 }).select(projection).lean().cursor();
      let index = 0;
      for await (const c of cursor as any) {
        const line =
          [
            `${index + 1}. CDK代码: ${c.code}`,
            `   资源ID: ${c.resourceId}`,
            `   创建时间: ${new Date(c.createdAt).toLocaleString("zh-CN")}`,
            c.expiresAt ? `   过期时间: ${new Date(c.expiresAt).toLocaleString("zh-CN")}` : undefined,
            c.isUsed ? `   使用状态: 已使用` : "   使用状态: 未使用",
            c.isUsed && c.usedAt ? `   使用时间: ${new Date(c.usedAt).toLocaleString("zh-CN")}` : undefined,
            c.isUsed && c.usedIp ? `   使用IP: ${c.usedIp}` : undefined,
            c.isUsed && c.usedBy?.username
              ? `   使用用户: ${c.usedBy.username} (ID: ${c.usedBy.userId || "-"})`
              : undefined,
            "",
          ]
            .filter(Boolean)
            .join("\n") + "\n";
        if (!ws.write(line)) {
          await new Promise<void>((resolve) => ws.once("drain", resolve));
        }
        index++;
      }
      ws.write("=== 导出完成 ===\n");
      await new Promise<void>((resolve, reject) => {
        ws.end(() => resolve());
        ws.on("error", reject);
      });

      logger.info("CDK导出操作", { resourceId, filterType, count, mode: "file", filename });
      return { mode: "file", filename, filePath, count };
    } catch (err) {
      logger.error("导出CDK失败", { err });
      throw err;
    }
  }

  private generateUniqueCode(): string {
    // 生成16位随机字符串
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let code = "";
    for (let i = 0; i < 16; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }
}
