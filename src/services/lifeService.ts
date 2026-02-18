import axios from "axios";
import logger from "../utils/logger";
import { createServiceConfig, ProductionServiceBase } from "../utils/ProductionServiceBase";
import { mongoose } from "./mongoService";

export interface LifeResponse {
  success: boolean;
  data?: any;
  error?: string;
}

// =============== MongoDB Schema 定义 ===============

interface LifeAPILogDoc {
  apiType: "phoneAddress" | "oilPrice";
  requestParams: {
    phone?: string;
    city?: string;
  };
  response?: {
    success: boolean;
    data?: any;
    error?: string;
    statusCode?: number;
  };
  metadata: {
    requestTime: Date;
    responseTime: Date;
    duration: number; // 请求耗时（毫秒）
    cacheHit: boolean; // 是否命中缓存
    rateLimited: boolean; // 是否被限流
    circuitBreakerState: string; // 断路器状态
  };
  clientInfo?: {
    ip?: string;
    userAgent?: string;
    userId?: string;
  };
}

const LifeAPILogSchema = new mongoose.Schema<LifeAPILogDoc>(
  {
    apiType: { type: String, required: true, enum: ["phoneAddress", "oilPrice"], index: true },
    requestParams: {
      phone: { type: String, maxlength: 20 },
      city: { type: String, maxlength: 100 },
    },
    response: {
      success: { type: Boolean, required: true },
      data: { type: mongoose.Schema.Types.Mixed },
      error: { type: String, maxlength: 500 },
      statusCode: { type: Number },
    },
    metadata: {
      requestTime: { type: Date, required: true, index: true },
      responseTime: { type: Date, required: true },
      duration: { type: Number, required: true },
      cacheHit: { type: Boolean, default: false, index: true },
      rateLimited: { type: Boolean, default: false, index: true },
      circuitBreakerState: { type: String, enum: ["CLOSED", "OPEN", "HALF_OPEN"], index: true },
    },
    clientInfo: {
      ip: { type: String, maxlength: 64 },
      userAgent: { type: String, maxlength: 512 },
      userId: { type: String, maxlength: 128 },
    },
  },
  {
    collection: "life_api_logs",
    strict: true,
    timestamps: true,
  },
);

// 复合索引优化
LifeAPILogSchema.index({ apiType: 1, "metadata.requestTime": -1 }); // 按API类型和时间查询
LifeAPILogSchema.index({ "metadata.cacheHit": 1, "metadata.requestTime": -1 }); // 缓存命中统计
LifeAPILogSchema.index({ "response.success": 1, "metadata.requestTime": -1 }); // 成功率统计
LifeAPILogSchema.index({ "metadata.duration": 1 }); // 性能分析

const LifeAPILogModel = mongoose.models.LifeAPILog || mongoose.model<LifeAPILogDoc>("LifeAPILog", LifeAPILogSchema);

export class LifeService extends ProductionServiceBase {
  private static instance: LifeService;
  private static readonly BASE_URL = "https://v2.xxapi.cn/api";

  private constructor() {
    super(
      createServiceConfig("LifeService", {
        // 自定义配置
        rateLimit: {
          enabled: true,
          maxRequests: 200, // 生活信息查询允许200次/分钟
          window: 60000,
        },
        cache: {
          enabled: true,
          ttl: 600000, // 查询结果缓存10分钟
          maxSize: 500,
        },
        circuitBreaker: {
          enabled: true,
          threshold: 3, // 外部API更敏感，3次失败即打开
          timeout: 30000, // 30秒后尝试恢复
          successThreshold: 2,
        },
        healthThresholds: {
          degradedResponseTime: 3000, // 外部API 3秒算降级
          unhealthyResponseTime: 8000, // 8秒算不健康
          degradedErrorRate: 0.1,
          unhealthyErrorRate: 0.3,
        },
        performance: {
          maxSamples: 100,
          queryTimeout: 5000,
          operationTimeout: 10000,
        },
      }),
    );

    logger.info("[LifeService] Service initialized with production enhancements");
  }

  public static getInstance(): LifeService {
    if (!LifeService.instance) {
      LifeService.instance = new LifeService();
    }
    return LifeService.instance;
  }

  // =============== 日志记录方法 ===============

  /**
   * 记录API调用到MongoDB
   */
  private async logAPICall(
    apiType: "phoneAddress" | "oilPrice",
    requestParams: { phone?: string; city?: string },
    response: LifeResponse,
    metadata: {
      requestTime: Date;
      responseTime: Date;
      duration: number;
      cacheHit: boolean;
      rateLimited: boolean;
    },
    clientInfo?: {
      ip?: string;
      userAgent?: string;
      userId?: string;
    },
  ): Promise<void> {
    try {
      // 只在MongoDB连接时记录
      if (this.isMongoReady()) {
        const health = this.getHealthStatus();

        // 创建日志记录（异步，不阻塞主流程）
        LifeAPILogModel.create({
          apiType,
          requestParams: {
            phone: requestParams.phone ? requestParams.phone.replace(/(\d{3})\d{4}(\d{4})/, "$1****$2") : undefined, // 脱敏处理
            city: requestParams.city,
          },
          response: {
            success: response.success,
            data: response.success ? this.sanitizeResponseData(response.data) : undefined,
            error: response.error,
            statusCode: response.success ? 200 : 500,
          },
          metadata: {
            ...metadata,
            circuitBreakerState: health.circuitBreakerState,
          },
          clientInfo,
        }).catch((error) => {
          // 日志记录失败不应影响主流程
          logger.warn("[LifeService] Failed to log API call to MongoDB:", error);
        });
      }
    } catch (error) {
      logger.warn("[LifeService] Error in logAPICall:", error);
    }
  }

  /**
   * 清洗响应数据，避免存储过大的数据
   */
  private sanitizeResponseData(data: any): any {
    if (!data || typeof data !== "object") {
      return data;
    }

    // 转换为字符串并限制大小
    const jsonStr = JSON.stringify(data);
    if (jsonStr.length > 10000) {
      // 限制10KB
      return {
        __truncated__: true,
        summary: jsonStr.substring(0, 500) + "...",
        size: jsonStr.length,
      };
    }

    return data;
  }

  /**
   * 查询API调用统计
   */
  public async getAPIStats(params?: {
    apiType?: "phoneAddress" | "oilPrice";
    startDate?: Date;
    endDate?: Date;
    limit?: number;
  }): Promise<{
    total: number;
    byType: any[];
    avgDuration: number;
    cacheHitRate: number;
    successRate: number;
  }> {
    try {
      if (!this.isMongoReady()) {
        throw new Error("MongoDB未连接");
      }

      const query: any = {};

      // 构建查询条件
      if (params?.apiType) {
        query.apiType = params.apiType;
      }

      if (params?.startDate || params?.endDate) {
        query["metadata.requestTime"] = {};
        if (params.startDate) {
          query["metadata.requestTime"].$gte = params.startDate;
        }
        if (params.endDate) {
          query["metadata.requestTime"].$lte = params.endDate;
        }
      }

      // 并发执行多个统计查询
      const [total, byType, avgDuration, cacheHits, successCount] = await Promise.all([
        LifeAPILogModel.countDocuments(query).maxTimeMS(5000),

        LifeAPILogModel.aggregate([
          { $match: query },
          { $group: { _id: "$apiType", count: { $sum: 1 } } },
          { $sort: { count: -1 } },
        ])
          .option({ maxTimeMS: 5000 })
          .exec(),

        LifeAPILogModel.aggregate([
          { $match: query },
          { $group: { _id: null, avgDuration: { $avg: "$metadata.duration" } } },
        ])
          .option({ maxTimeMS: 5000 })
          .exec(),

        LifeAPILogModel.countDocuments({ ...query, "metadata.cacheHit": true }).maxTimeMS(5000),

        LifeAPILogModel.countDocuments({ ...query, "response.success": true }).maxTimeMS(5000),
      ]);

      const cacheHitRate = total > 0 ? cacheHits / total : 0;
      const successRate = total > 0 ? successCount / total : 0;
      const avgDur = avgDuration.length > 0 ? avgDuration[0].avgDuration || 0 : 0;

      return {
        total,
        byType,
        avgDuration: Math.round(avgDur),
        cacheHitRate: Math.round(cacheHitRate * 100) / 100,
        successRate: Math.round(successRate * 100) / 100,
      };
    } catch (error) {
      logger.error("[LifeService] Failed to get API stats:", error);
      this.recordError("getAPIStats failed", error);
      throw error;
    }
  }

  /**
   * 查询API调用历史
   */
  public async getAPILogs(params?: {
    apiType?: "phoneAddress" | "oilPrice";
    startDate?: Date;
    endDate?: Date;
    page?: number;
    limit?: number;
  }): Promise<{
    logs: LifeAPILogDoc[];
    total: number;
    page: number;
    limit: number;
  }> {
    try {
      if (!this.isMongoReady()) {
        throw new Error("MongoDB未连接");
      }

      const query: any = {};

      if (params?.apiType) {
        query.apiType = params.apiType;
      }

      if (params?.startDate || params?.endDate) {
        query["metadata.requestTime"] = {};
        if (params.startDate) {
          query["metadata.requestTime"].$gte = params.startDate;
        }
        if (params.endDate) {
          query["metadata.requestTime"].$lte = params.endDate;
        }
      }

      const page = Math.max(1, params?.page || 1);
      const limit = Math.min(100, Math.max(1, params?.limit || 20));
      const skip = (page - 1) * limit;

      // 并发查询
      const [logs, total] = await Promise.all([
        LifeAPILogModel.find(query)
          .sort({ "metadata.requestTime": -1 })
          .skip(skip)
          .limit(limit)
          .lean()
          .maxTimeMS(10000)
          .exec(),
        LifeAPILogModel.countDocuments(query).maxTimeMS(5000),
      ]);

      return {
        logs: logs as any as LifeAPILogDoc[],
        total,
        page,
        limit,
      };
    } catch (error) {
      logger.error("[LifeService] Failed to get API logs:", error);
      this.recordError("getAPILogs failed", error);
      throw error;
    }
  }

  /**
   * 手机号码归属地查询
   * @param phone 手机号码
   * @param clientInfo 客户端信息（可选）
   * @returns 手机号码归属地信息
   */
  public async phoneAddress(
    phone: string,
    clientInfo?: { ip?: string; userAgent?: string; userId?: string },
  ): Promise<LifeResponse> {
    const requestTime = new Date();
    let cacheHit = false;
    let rateLimited = false;
    let response: LifeResponse;

    try {
      // 输入验证
      if (!phone || typeof phone !== "string" || !/^\d{11}$/.test(phone)) {
        response = {
          success: false,
          error: "手机号码格式无效，请输入11位数字",
        };

        // 记录日志
        await this.logAPICall(
          "phoneAddress",
          { phone },
          response,
          {
            requestTime,
            responseTime: new Date(),
            duration: Date.now() - requestTime.getTime(),
            cacheHit: false,
            rateLimited: false,
          },
          clientInfo,
        );

        return response;
      }

      // 限流检查（使用手机号作为标识）
      if (!this.checkRateLimit(phone)) {
        rateLimited = true;
        response = {
          success: false,
          error: "查询过于频繁，请稍后重试",
        };

        // 记录限流日志
        await this.logAPICall(
          "phoneAddress",
          { phone },
          response,
          {
            requestTime,
            responseTime: new Date(),
            duration: Date.now() - requestTime.getTime(),
            cacheHit: false,
            rateLimited: true,
          },
          clientInfo,
        );

        return response;
      }

      // 检查缓存
      const cacheKey = `phone_${phone}`;
      const cached = this.getCachedValue<any>(cacheKey);
      if (cached) {
        cacheHit = true;
        logger.debug("[LifeService] Cache hit for phone:", phone);

        response = {
          success: true,
          data: cached,
        };

        // 记录缓存命中日志
        await this.logAPICall(
          "phoneAddress",
          { phone },
          response,
          {
            requestTime,
            responseTime: new Date(),
            duration: Date.now() - requestTime.getTime(),
            cacheHit: true,
            rateLimited: false,
          },
          clientInfo,
        );

        return response;
      }

      // 使用executeWithMonitoring自动处理断路器、性能统计
      const result = await this.executeWithMonitoring(async () => {
        logger.info("[LifeService] 开始查询手机号码归属地", { phone });

        const apiResponse = await axios.get(`${LifeService.BASE_URL}/phoneAddress`, {
          params: { phone },
          timeout: 8000, // 8秒超时
        });

        logger.info("[LifeService] 手机号码归属地查询完成", { phone });

        return apiResponse.data;
      }, "phoneAddress");

      // 缓存成功结果
      this.setCachedValue(cacheKey, result);

      response = {
        success: true,
        data: result,
      };

      // 记录成功日志
      await this.logAPICall(
        "phoneAddress",
        { phone },
        response,
        {
          requestTime,
          responseTime: new Date(),
          duration: Date.now() - requestTime.getTime(),
          cacheHit: false,
          rateLimited: false,
        },
        clientInfo,
      );

      return response;
    } catch (error) {
      logger.error("[LifeService] 手机号码归属地查询失败", {
        phone,
        error: error instanceof Error ? error.message : "未知错误",
      });

      if (axios.isAxiosError(error)) {
        if (error.response) {
          response = {
            success: false,
            error: `手机号码归属地查询失败: ${error.response.status} - ${error.response.data?.message || "服务器错误"}`,
          };
        } else if (error.request) {
          response = {
            success: false,
            error: "生活信息服务无响应，请稍后重试",
          };
        } else {
          response = {
            success: false,
            error: error instanceof Error ? error.message : "未知错误",
          };
        }
      } else {
        response = {
          success: false,
          error: error instanceof Error ? error.message : "未知错误",
        };
      }

      // 记录失败日志
      await this.logAPICall(
        "phoneAddress",
        { phone },
        response,
        {
          requestTime,
          responseTime: new Date(),
          duration: Date.now() - requestTime.getTime(),
          cacheHit,
          rateLimited,
        },
        clientInfo,
      );

      return response;
    }
  }

  /**
   * 油价查询
   * @param city 城市名称（可选）
   * @param clientInfo 客户端信息（可选）
   * @returns 油价信息
   */
  public async oilPrice(
    city?: string,
    clientInfo?: { ip?: string; userAgent?: string; userId?: string },
  ): Promise<LifeResponse> {
    const requestTime = new Date();
    let cacheHit = false;
    let rateLimited = false;
    let response: LifeResponse;

    try {
      // 输入验证
      if (city && (typeof city !== "string" || city.length > 50)) {
        response = {
          success: false,
          error: "城市名称格式无效",
        };

        // 记录日志
        await this.logAPICall(
          "oilPrice",
          { city },
          response,
          {
            requestTime,
            responseTime: new Date(),
            duration: Date.now() - requestTime.getTime(),
            cacheHit: false,
            rateLimited: false,
          },
          clientInfo,
        );

        return response;
      }

      // 限流检查（使用城市名或'default'作为标识）
      const rateLimitKey = city || "default";
      if (!this.checkRateLimit(rateLimitKey)) {
        rateLimited = true;
        response = {
          success: false,
          error: "查询过于频繁，请稍后重试",
        };

        // 记录限流日志
        await this.logAPICall(
          "oilPrice",
          { city },
          response,
          {
            requestTime,
            responseTime: new Date(),
            duration: Date.now() - requestTime.getTime(),
            cacheHit: false,
            rateLimited: true,
          },
          clientInfo,
        );

        return response;
      }

      // 检查缓存
      const cacheKey = `oil_${city || "default"}`;
      const cached = this.getCachedValue<any>(cacheKey);
      if (cached) {
        cacheHit = true;
        logger.debug("[LifeService] Cache hit for oil price:", { city });

        response = {
          success: true,
          data: cached,
        };

        // 记录缓存命中日志
        await this.logAPICall(
          "oilPrice",
          { city },
          response,
          {
            requestTime,
            responseTime: new Date(),
            duration: Date.now() - requestTime.getTime(),
            cacheHit: true,
            rateLimited: false,
          },
          clientInfo,
        );

        return response;
      }

      // 使用executeWithMonitoring自动处理断路器、性能统计
      const result = await this.executeWithMonitoring(async () => {
        logger.info("[LifeService] 开始查询油价信息", { city });

        const params: any = {};
        if (city) {
          params.city = city;
        }

        const apiResponse = await axios.get(`${LifeService.BASE_URL}/oilPrice`, {
          params,
          timeout: 8000, // 8秒超时
        });

        logger.info("[LifeService] 油价查询完成", { city });

        return apiResponse.data;
      }, "oilPrice");

      // 缓存成功结果
      this.setCachedValue(cacheKey, result);

      response = {
        success: true,
        data: result,
      };

      // 记录成功日志
      await this.logAPICall(
        "oilPrice",
        { city },
        response,
        {
          requestTime,
          responseTime: new Date(),
          duration: Date.now() - requestTime.getTime(),
          cacheHit: false,
          rateLimited: false,
        },
        clientInfo,
      );

      return response;
    } catch (error) {
      logger.error("[LifeService] 油价查询失败", {
        city,
        error: error instanceof Error ? error.message : "未知错误",
      });

      if (axios.isAxiosError(error)) {
        if (error.response) {
          response = {
            success: false,
            error: `油价查询失败: ${error.response.status} - ${error.response.data?.message || "服务器错误"}`,
          };
        } else if (error.request) {
          response = {
            success: false,
            error: "生活信息服务无响应，请稍后重试",
          };
        } else {
          response = {
            success: false,
            error: error instanceof Error ? error.message : "未知错误",
          };
        }
      } else {
        response = {
          success: false,
          error: error instanceof Error ? error.message : "未知错误",
        };
      }

      // 记录失败日志
      await this.logAPICall(
        "oilPrice",
        { city },
        response,
        {
          requestTime,
          responseTime: new Date(),
          duration: Date.now() - requestTime.getTime(),
          cacheHit,
          rateLimited,
        },
        clientInfo,
      );

      return response;
    }
  }
}

// 导出单例
export const lifeService = LifeService.getInstance();
