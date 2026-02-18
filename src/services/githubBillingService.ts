import axios, { type AxiosRequestConfig } from "axios";
import mongoose from "mongoose";
import logger from "../utils/logger";

// GitHub Billing 配置文档接口
interface GitHubBillingSettingDoc {
  key: string;
  value: string;
  updatedAt?: Date;
}

// GitHub Billing 多配置文档接口
interface GitHubBillingMultiConfigDoc {
  configKey: "config1" | "config2" | "config3";
  url: string;
  method: string;
  headers: Record<string, string>;
  cookies: string;
  customerId?: string;
  headersCount: number;
  hasCookies: boolean;
  updatedAt: Date;
  createdAt: Date;
}

// GitHub Billing 配置 Schema
const GitHubBillingSettingSchema = new mongoose.Schema<GitHubBillingSettingDoc>(
  {
    key: { type: String, required: true, unique: true },
    value: { type: String, required: true },
    updatedAt: { type: Date, default: Date.now },
  },
  { collection: "github_billing_settings" },
);

// GitHub Billing 多配置 Schema
const GitHubBillingMultiConfigSchema = new mongoose.Schema<GitHubBillingMultiConfigDoc>(
  {
    configKey: { type: String, enum: ["config1", "config2", "config3"], required: true, unique: true },
    url: { type: String, required: true },
    method: { type: String, required: true, default: "GET" },
    headers: { type: mongoose.Schema.Types.Mixed, required: true, default: {} },
    cookies: { type: String, required: true, default: "" },
    customerId: { type: String },
    headersCount: { type: Number, default: 0 },
    hasCookies: { type: Boolean, default: false },
    updatedAt: { type: Date, default: Date.now },
    createdAt: { type: Date, default: Date.now },
  },
  { collection: "github_billing_multi_configs" },
);

const GitHubBillingSettingModel =
  (mongoose.models.GitHubBillingSetting as mongoose.Model<GitHubBillingSettingDoc>) ||
  mongoose.model<GitHubBillingSettingDoc>("GitHubBillingSetting", GitHubBillingSettingSchema);

const GitHubBillingMultiConfigModel =
  (mongoose.models.GitHubBillingMultiConfig as mongoose.Model<GitHubBillingMultiConfigDoc>) ||
  mongoose.model<GitHubBillingMultiConfigDoc>("GitHubBillingMultiConfig", GitHubBillingMultiConfigSchema);

// curl 命令解析结果接口
interface ParsedCurlCommand {
  url: string;
  method: string;
  headers: Record<string, string>;
  cookies: string;
  customerId?: string;
}

// 多配置 curl 命令接口
interface MultiCurlConfig {
  config1?: ParsedCurlCommand;
  config2?: ParsedCurlCommand;
  config3?: ParsedCurlCommand;
  lastUpdated: Date;
}

// 聚合计费数据接口
interface AggregatedBillingData {
  totalBillableAmount: number;
  totalDiscountAmount: number;
  configCount: number;
  configs: {
    config1?: GitHubBillingUsage;
    config2?: GitHubBillingUsage;
    config3?: GitHubBillingUsage;
  };
  aggregatedRepoBreakdown: Record<string, number>;
  aggregatedOrgBreakdown: Record<string, number>;
  aggregatedDailyBreakdown: Record<string, number>;
  timestamp: string;
}

// GitHub Billing 折扣目标接口
interface DiscountTarget {
  id: string;
  type: string;
}

// GitHub Billing 折扣详情接口
interface DiscountDetail {
  targets: DiscountTarget[];
  percentage: number;
  targetAmount: number;
  uuid: string;
  startDate: number;
  endDate: number;
  discountType: string;
  fundingSource: string;
}

// GitHub Billing 使用项接口（新格式）
interface GitHubUsageItem {
  billedAmount: number;
  totalAmount: number;
  discountAmount: number;
  quantity: number | null;
  product: string | null;
  repo: {
    name: string;
  };
  org: {
    name: string;
    avatarSrc: string;
    login: string;
  };
  usageAt: string;
}

// GitHub Billing 其他项接口（新格式）
interface GitHubOtherItem {
  billedAmount: number;
  netAmount: number;
  discountAmount: number;
  usageAt: string;
}

// GitHub Billing 新响应格式接口
interface GitHubBillingNewResponse {
  usage: GitHubUsageItem[];
  other: GitHubOtherItem[];
}

// GitHub Billing 折扣项接口
interface BillingDiscount {
  isFullyApplied: boolean;
  currentAmount: number;
  targetAmount: number;
  percentage: number;
  uuid: string;
  targets: DiscountTarget[];
  discount: DiscountDetail;
  name: string | null;
}

// GitHub Billing 折扣响应接口
interface GitHubBillingDiscountResponse {
  discounts: BillingDiscount[];
}

// GitHub Billing 使用情况响应接口
interface GitHubBillingUsage {
  total_usage?: number;
  included_usage?: number;
  billable_usage?: number;
  usage_breakdown?: {
    actions: number;
    packages: number;
    codespaces: number;
    copilot: number;
  };
  billing_cycle?: {
    start_date: string;
    end_date: string;
  };
  // 新增字段：从折扣数据中提取的计费金额
  billable_amount?: number;
  discount_details?: BillingDiscount[];
  // 新增字段：支持新的usage数组格式
  total_discount_amount?: number;
  usage_details?: GitHubUsageItem[];
  other_details?: GitHubOtherItem[];
  repo_breakdown?: Record<string, number>;
  org_breakdown?: Record<string, number>;
  daily_breakdown?: Record<string, number>;
  // 兼容字段
  total_paid_minutes_used?: number;
  included_minutes?: number;
  minutes_used_breakdown?: Record<string, number>;
  timestamp?: string;
}

// GitHub Billing 缓存数据接口
interface GitHubBillingCacheDoc {
  customerId: string;
  data: GitHubBillingUsage;
  lastUpdated: Date;
  expiresAt: Date;
  accessCount: number;
  lastAccessed: Date;
  createdAt: Date;
  priority: "low" | "medium" | "high";
}

// GitHub Billing API 日志接口
interface GitHubBillingLogDoc {
  customerId: string;
  action: "fetch" | "cache_hit" | "cache_miss" | "error";
  timestamp: Date;
  duration?: number;
  success: boolean;
  errorMessage?: string;
  dataSize?: number;
  requestUrl?: string;
  statusCode?: number;
}

const GitHubBillingCacheSchema = new mongoose.Schema<GitHubBillingCacheDoc>(
  {
    customerId: { type: String, required: true, unique: true },
    data: { type: mongoose.Schema.Types.Mixed, required: true },
    lastUpdated: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true },
    accessCount: { type: Number, default: 0 },
    lastAccessed: { type: Date, default: Date.now },
    createdAt: { type: Date, default: Date.now },
    priority: { type: String, enum: ["low", "medium", "high"], default: "medium" },
  },
  { collection: "github_billing_cache" },
);

const GitHubBillingCacheModel =
  (mongoose.models.GitHubBillingCache as mongoose.Model<GitHubBillingCacheDoc>) ||
  mongoose.model<GitHubBillingCacheDoc>("GitHubBillingCache", GitHubBillingCacheSchema);

const GitHubBillingLogSchema = new mongoose.Schema<GitHubBillingLogDoc>(
  {
    customerId: { type: String, required: true },
    action: { type: String, enum: ["fetch", "cache_hit", "cache_miss", "error"], required: true },
    timestamp: { type: Date, default: Date.now },
    duration: { type: Number },
    success: { type: Boolean, required: true },
    errorMessage: { type: String },
    dataSize: { type: Number },
    requestUrl: { type: String },
    statusCode: { type: Number },
  },
  { collection: "github_billing_logs" },
);

const GitHubBillingLogModel =
  (mongoose.models.GitHubBillingLog as mongoose.Model<GitHubBillingLogDoc>) ||
  mongoose.model<GitHubBillingLogDoc>("GitHubBillingLog", GitHubBillingLogSchema);

export class GitHubBillingService {
  /**
   * 处理折扣数据格式，提取计费金额
   */
  private static processDiscountData(
    discountResponse: GitHubBillingDiscountResponse,
    customerId?: string,
  ): GitHubBillingUsage {
    logger.info(`[processDiscountData] 开始处理折扣数据，折扣项数量: ${discountResponse.discounts.length}`);

    // 计算总的计费金额（所有折扣项的 currentAmount 之和）
    let totalBillableAmount = 0;
    const processedDiscounts: BillingDiscount[] = [];

    discountResponse.discounts.forEach((discount, index) => {
      logger.info(`[processDiscountData] 处理折扣项 ${index + 1}:`);
      logger.info(`  - UUID: ${discount.uuid}`);
      logger.info(`  - 名称: ${discount.name || "未命名"}`);
      logger.info(`  - 当前金额: $${discount.currentAmount}`);
      logger.info(`  - 目标金额: $${discount.targetAmount}`);
      logger.info(`  - 是否完全应用: ${discount.isFullyApplied}`);
      logger.info(`  - 百分比: ${discount.percentage}%`);
      logger.info(`  - 目标数量: ${discount.targets.length}`);

      // 累加当前金额作为计费金额
      totalBillableAmount += discount.currentAmount || 0;
      processedDiscounts.push(discount);
    });

    logger.info(`[processDiscountData] 计算完成，总计费金额: $${totalBillableAmount}`);

    // 构造标准的 GitHubBillingUsage 格式
    const billingData: GitHubBillingUsage = {
      total_usage: totalBillableAmount,
      included_usage: 0,
      billable_usage: totalBillableAmount,
      usage_breakdown: {
        actions: 0,
        packages: 0,
        codespaces: 0,
        copilot: 0,
      },
      billing_cycle: {
        start_date: new Date().toISOString().split("T")[0],
        end_date: new Date().toISOString().split("T")[0],
      },
      // 新增字段：从折扣数据中提取的计费金额
      billable_amount: totalBillableAmount,
      discount_details: processedDiscounts,
    };

    // 如果提供了客户ID，则添加到结果中
    if (customerId && customerId !== "default") {
      (billingData as any).customerId = customerId;
    }

    logger.info(`[processDiscountData] 返回处理后的计费数据:`, {
      billable_amount: billingData.billable_amount,
      total_usage: billingData.total_usage,
      discount_count: processedDiscounts.length,
    });

    return billingData;
  }

  /**
   * 处理新的usage数组格式数据
   */
  private static processUsageArrayData(
    usageResponse: GitHubBillingNewResponse,
    customerId?: string,
  ): GitHubBillingUsage {
    let totalBillableAmount = 0;
    let totalDiscountAmount = 0;
    const repoBreakdown: Record<string, number> = {};
    const orgBreakdown: Record<string, number> = {};
    const dailyBreakdown: Record<string, number> = {};

    // 处理usage数组
    usageResponse.usage.forEach((item) => {
      totalBillableAmount += item.billedAmount || 0;
      totalDiscountAmount += item.discountAmount || 0;

      // 按仓库统计
      if (item.repo?.name) {
        repoBreakdown[item.repo.name] = (repoBreakdown[item.repo.name] || 0) + item.billedAmount;
      }

      // 按组织统计
      if (item.org?.name) {
        orgBreakdown[item.org.name] = (orgBreakdown[item.org.name] || 0) + item.billedAmount;
      }

      // 按日期统计
      if (item.usageAt) {
        const date = item.usageAt.split("T")[0];
        dailyBreakdown[date] = (dailyBreakdown[date] || 0) + item.billedAmount;
      }
    });

    // 处理other数组
    usageResponse.other.forEach((item) => {
      totalBillableAmount += item.billedAmount || 0;
      totalDiscountAmount += item.discountAmount || 0;
    });

    // 构建标准化的计费数据
    const billingData: GitHubBillingUsage = {
      billable_amount: totalBillableAmount,
      total_discount_amount: totalDiscountAmount,
      usage_details: usageResponse.usage,
      other_details: usageResponse.other,
      repo_breakdown: repoBreakdown,
      org_breakdown: orgBreakdown,
      daily_breakdown: dailyBreakdown,
      total_paid_minutes_used: 0,
      included_minutes: 0,
      minutes_used_breakdown: {},
      timestamp: new Date().toISOString(),
    };

    // 如果有客户ID，添加到数据中
    if (customerId && customerId !== "default") {
      (billingData as any).customerId = customerId;
    }

    return billingData;
  }

  /**
   * 记录API日志到数据库
   */
  private static async logApiActivity(logData: Partial<GitHubBillingLogDoc>): Promise<void> {
    try {
      if (mongoose.connection.readyState === 1) {
        await GitHubBillingLogModel.create({
          timestamp: new Date(),
          ...logData,
        });
      }
    } catch (error) {
      logger.error("记录API日志失败:", error);
    }
  }

  /**
   * 从数据库获取配置值
   */
  private static async getConfigValue(key: string, defaultValue?: string): Promise<string | undefined> {
    try {
      if (mongoose.connection.readyState === 1) {
        const setting = await GitHubBillingSettingModel.findOne({ key });
        if (setting) {
          return setting.value;
        }
      }
      return defaultValue || process.env[key];
    } catch (error) {
      logger.error(`获取配置 ${key} 失败:`, error);
      return defaultValue || process.env[key];
    }
  }

  /**
   * 设置配置值到数据库
   */
  private static async setConfigValue(key: string, value: string): Promise<void> {
    try {
      if (mongoose.connection.readyState === 1) {
        await GitHubBillingSettingModel.findOneAndUpdate({ key }, { value, updatedAt: new Date() }, { upsert: true });
      }
    } catch (error) {
      logger.error(`设置配置 ${key} 失败:`, error);
      throw error;
    }
  }

  /**
   * 解析 curl 命令
   */
  static parseCurlCommand(curlCommand: string): ParsedCurlCommand {
    const result: ParsedCurlCommand = {
      url: "",
      method: "GET",
      headers: {},
      cookies: "",
    };

    // 提取 URL - 使用安全的解析方法避免ReDoS
    const urlPattern = /'([^']+)'/g;
    let urlMatch;
    let foundValidUrl = false;

    while ((urlMatch = urlPattern.exec(curlCommand)) !== null) {
      const url = urlMatch[1];

      // 安全的 URL 验证：检查主机名是否为 github.com 或其子域名
      try {
        const parsedUrl = new URL(url);
        const hostname = parsedUrl.hostname.toLowerCase();

        // 只允许 github.com 和其官方子域名
        if (hostname === "github.com" || hostname.endsWith(".github.com")) {
          result.url = url;
          foundValidUrl = true;

          // 提取 customer_id
          const customerIdMatch = url.match(/customer_id=(\d+)/);
          if (customerIdMatch) {
            result.customerId = customerIdMatch[1];
          }
          break;
        }
      } catch (_error) {}
    }

    if (!foundValidUrl) {
      throw new Error("curl 命令中未找到有效的 GitHub URL");
    }

    // 提取方法
    const methodMatch = curlCommand.match(/-X\s+(\w+)/);
    if (methodMatch) {
      result.method = methodMatch[1];
    }

    // 提取所有 headers - 使用安全的解析方法避免ReDoS
    const headerPattern = /-H\s+'([^']+)'/g;
    let headerMatch;
    while ((headerMatch = headerPattern.exec(curlCommand)) !== null) {
      const headerValue = headerMatch[1];
      const colonIndex = headerValue.indexOf(":");

      if (colonIndex > 0) {
        const key = headerValue.substring(0, colonIndex).trim();
        const value = headerValue.substring(colonIndex + 1).trim();

        if (key.toLowerCase() === "cookie") {
          result.cookies = value;
        } else {
          result.headers[key] = value;
        }
      }
    }

    // customer_id 现在是可选的，因为新的折扣格式可能不需要它
    if (!result.customerId) {
      logger.warn("curl 命令中未找到 customer_id 参数，将使用默认值或跳过客户ID验证");
    }

    // 验证必要的 headers 是否存在
    if (Object.keys(result.headers).length === 0 && !result.cookies) {
      throw new Error("curl 命令中未找到认证信息（headers 或 cookies）");
    }

    return result;
  }

  /**
   * 保存解析的 curl 命令配置到 MongoDB（支持多配置）
   */
  static async saveCurlConfig(
    curlCommand: string,
    configKey: "config1" | "config2" | "config3" = "config1",
  ): Promise<ParsedCurlCommand> {
    const parsed = GitHubBillingService.parseCurlCommand(curlCommand);

    try {
      if (mongoose.connection.readyState === 1) {
        // 保存到多配置集合
        const configDoc: Partial<GitHubBillingMultiConfigDoc> = {
          configKey,
          url: parsed.url,
          method: parsed.method,
          headers: parsed.headers,
          cookies: parsed.cookies,
          customerId: parsed.customerId,
          headersCount: Object.keys(parsed.headers).length,
          hasCookies: Boolean(parsed.cookies),
          updatedAt: new Date(),
        };

        await GitHubBillingMultiConfigModel.findOneAndUpdate({ configKey }, configDoc, { upsert: true, new: true });

        // 如果是 config1，同时保存到原有的单配置位置（向后兼容）
        if (configKey === "config1") {
          await GitHubBillingService.setConfigValue("GITHUB_BILLING_URL", parsed.url);
          await GitHubBillingService.setConfigValue("GITHUB_BILLING_METHOD", parsed.method);
          await GitHubBillingService.setConfigValue("GITHUB_BILLING_HEADERS", JSON.stringify(parsed.headers));
          await GitHubBillingService.setConfigValue("GITHUB_BILLING_COOKIES", parsed.cookies);

          if (parsed.customerId) {
            await GitHubBillingService.setConfigValue("GITHUB_BILLING_CUSTOMER_ID", parsed.customerId);
          }
        }

        logger.info(`成功保存 GitHub Billing curl 配置 ${configKey} 到 MongoDB`);
      } else {
        throw new Error("MongoDB 连接未就绪");
      }
    } catch (error) {
      logger.error(`保存 GitHub Billing curl 配置 ${configKey} 失败:`, error);
      throw error;
    }

    return parsed;
  }

  /**
   * 获取保存的 curl 配置（从 MongoDB）
   */
  static async getSavedCurlConfig(
    configKey: "config1" | "config2" | "config3" = "config1",
  ): Promise<ParsedCurlCommand | null> {
    try {
      if (mongoose.connection.readyState === 1) {
        // 首先尝试从多配置集合获取
        const multiConfig = await GitHubBillingMultiConfigModel.findOne({ configKey });
        if (multiConfig) {
          return {
            url: multiConfig.url,
            method: multiConfig.method,
            headers: multiConfig.headers,
            cookies: multiConfig.cookies,
            customerId: multiConfig.customerId,
          };
        }
      }

      // 如果是 config1 且多配置中没有找到，回退到原有的单配置方式（向后兼容）
      if (configKey === "config1") {
        const url = await GitHubBillingService.getConfigValue("GITHUB_BILLING_URL");
        if (!url) {
          return null;
        }

        const method = await GitHubBillingService.getConfigValue("GITHUB_BILLING_METHOD", "GET");
        const headersStr = await GitHubBillingService.getConfigValue("GITHUB_BILLING_HEADERS", "{}");
        const cookies = await GitHubBillingService.getConfigValue("GITHUB_BILLING_COOKIES", "");
        const customerId = await GitHubBillingService.getConfigValue("GITHUB_BILLING_CUSTOMER_ID");

        let parsedHeaders: Record<string, string> = {};
        try {
          parsedHeaders = JSON.parse(headersStr!);
        } catch (error) {
          logger.error("解析保存的 headers 失败:", error);
          throw new Error("保存的配置格式错误，请重新保存 curl 命令");
        }

        return {
          url,
          method: method!,
          headers: parsedHeaders,
          cookies: cookies!,
          customerId,
        };
      }

      return null;
    } catch (error) {
      logger.error(`获取保存的 curl 配置 ${configKey} 失败:`, error);
      if (error instanceof Error && error.message.includes("未找到保存的 curl 配置")) {
        throw error;
      }
      throw new Error(`获取配置失败: ${error instanceof Error ? error.message : "未知错误"}`);
    }
  }

  /**
   * 从缓存获取 GitHub Billing 数据（智能缓存策略）
   */
  static async getCachedBillingData(customerId: string): Promise<GitHubBillingUsage | null> {
    try {
      if (mongoose.connection.readyState !== 1) {
        return null;
      }

      const cached = await GitHubBillingCacheModel.findOne({
        customerId,
        expiresAt: { $gt: new Date() },
      });

      if (cached) {
        // 更新访问统计
        await GitHubBillingCacheModel.updateOne(
          { customerId },
          {
            $inc: { accessCount: 1 },
            $set: { lastAccessed: new Date() },
          },
        );

        // 检查是否需要预热缓存（距离过期时间小于25%时）
        const now = new Date();
        const timeToExpire = cached.expiresAt.getTime() - now.getTime();
        const totalTTL = cached.expiresAt.getTime() - cached.createdAt.getTime();

        if (timeToExpire < totalTTL * 0.25) {
          // 异步预热缓存，不阻塞当前请求
          GitHubBillingService.warmupCache(customerId).catch((error: Error) => {
            logger.warn(`缓存预热失败 (客户ID: ${customerId}):`, error);
          });
        }

        return cached.data;
      }

      return null;
    } catch (error) {
      logger.error("获取缓存的 GitHub Billing 数据失败:", error);
      return null;
    }
  }

  /**
   * 缓存预热 - 异步刷新即将过期的缓存
   */
  static async warmupCache(customerId: string): Promise<void> {
    try {
      logger.info(`开始预热缓存 (客户ID: ${customerId})`);

      // 获取配置并刷新数据
      const config = await GitHubBillingService.getSavedCurlConfig();
      if (!config) {
        throw new Error("未找到保存的配置");
      }

      const freshData = await GitHubBillingService.fetchBillingData();

      // 计算智能TTL
      const intelligentTTL = await GitHubBillingService.calculateIntelligentTTL(customerId);

      // 更新缓存
      await GitHubBillingService.cacheBillingData(customerId, freshData, intelligentTTL);

      logger.info(`缓存预热完成 (客户ID: ${customerId}), TTL: ${intelligentTTL}分钟`);
    } catch (error) {
      logger.error(`缓存预热失败 (客户ID: ${customerId}):`, error);
      throw error;
    }
  }

  /**
   * 计算智能TTL - 基于访问模式调整缓存时间
   */
  static async calculateIntelligentTTL(customerId: string): Promise<number> {
    try {
      const cached = await GitHubBillingCacheModel.findOne({ customerId });

      if (!cached) {
        return 60; // 默认60分钟
      }

      const accessCount = cached.accessCount || 0;
      const priority = cached.priority || "medium";

      // 基础TTL
      let baseTTL = 60;

      // 根据优先级调整
      switch (priority) {
        case "high":
          baseTTL = 120; // 高优先级缓存更长时间
          break;
        case "low":
          baseTTL = 30; // 低优先级缓存较短时间
          break;
        default:
          baseTTL = 60; // 中等优先级
      }

      // 根据访问频率调整
      if (accessCount > 50) {
        baseTTL *= 1.5; // 高频访问延长50%
      } else if (accessCount > 20) {
        baseTTL *= 1.2; // 中频访问延长20%
      } else if (accessCount < 5) {
        baseTTL *= 0.8; // 低频访问减少20%
      }

      // 限制TTL范围在15分钟到4小时之间
      return Math.max(15, Math.min(240, Math.round(baseTTL)));
    } catch (error) {
      logger.error("计算智能TTL失败:", error);
      return 60; // 出错时返回默认值
    }
  }

  /**
   * 缓存大小限制和LRU淘汰
   */
  static async enforceCacheLimit(): Promise<void> {
    try {
      const MAX_CACHE_SIZE = 1000; // 最大缓存条目数

      const totalCount = await GitHubBillingCacheModel.countDocuments();

      if (totalCount > MAX_CACHE_SIZE) {
        const excessCount = totalCount - MAX_CACHE_SIZE;

        // 按最后访问时间排序，删除最久未访问的记录
        const oldestEntries = await GitHubBillingCacheModel.find()
          .sort({ lastAccessed: 1, accessCount: 1 })
          .limit(excessCount)
          .select("customerId");

        const customerIdsToDelete = oldestEntries.map((entry) => entry.customerId);

        await GitHubBillingCacheModel.deleteMany({
          customerId: { $in: customerIdsToDelete },
        });

        logger.info(`LRU淘汰: 删除了 ${excessCount} 个最久未访问的缓存条目`);
      }
    } catch (error) {
      logger.error("执行缓存限制失败:", error);
    }
  }

  /**
   * 缓存 GitHub Billing 数据（增强版）
   */
  static async cacheBillingData(customerId: string, data: GitHubBillingUsage, ttlMinutes: number = 60): Promise<void> {
    try {
      if (mongoose.connection.readyState !== 1) {
        return;
      }

      // 执行缓存大小限制
      await GitHubBillingService.enforceCacheLimit();

      const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);
      const now = new Date();

      const existingEntry = await GitHubBillingCacheModel.findOne({ customerId });

      if (existingEntry) {
        // 更新现有条目，保留 accessCount
        await GitHubBillingCacheModel.findOneAndUpdate(
          { customerId },
          {
            $set: {
              data,
              lastUpdated: now,
              expiresAt,
              lastAccessed: now,
            },
          },
        );
      } else {
        // 创建新条目
        await GitHubBillingCacheModel.findOneAndUpdate(
          { customerId },
          {
            $set: {
              data,
              lastUpdated: now,
              expiresAt,
              lastAccessed: now,
              createdAt: now,
              accessCount: 0,
              priority: "medium",
            },
          },
          { upsert: true },
        );
      }

      logger.info(`GitHub Billing 数据已缓存，客户ID: ${customerId}, 过期时间: ${expiresAt}`);
    } catch (error) {
      logger.error("缓存 GitHub Billing 数据失败:", error);
      // 缓存失败不应该影响主要功能，所以不抛出错误
    }
  }

  /**
   * 获取缓存性能统计
   */
  static async getCachePerformanceMetrics(): Promise<{
    totalEntries: number;
    hitRate: number;
    avgAccessCount: number;
    cacheSize: number;
    expiredEntries: number;
    topAccessedEntries: Array<{ customerId: string; accessCount: number }>;
  }> {
    try {
      if (mongoose.connection.readyState !== 1) {
        return {
          totalEntries: 0,
          hitRate: 0,
          avgAccessCount: 0,
          cacheSize: 0,
          expiredEntries: 0,
          topAccessedEntries: [],
        };
      }

      const now = new Date();

      // 基础统计
      const totalEntries = await GitHubBillingCacheModel.countDocuments();
      const expiredEntries = await GitHubBillingCacheModel.countDocuments({
        expiresAt: { $lt: now },
      });

      // 访问统计
      const accessStats = await GitHubBillingCacheModel.aggregate([
        {
          $group: {
            _id: null,
            avgAccessCount: { $avg: "$accessCount" },
            totalAccessCount: { $sum: "$accessCount" },
          },
        },
      ]);

      // 热门缓存条目
      const topAccessed = await GitHubBillingCacheModel.find()
        .sort({ accessCount: -1 })
        .limit(10)
        .select("customerId accessCount");

      // 计算缓存大小（估算）
      const sampleEntry = await GitHubBillingCacheModel.findOne();
      const estimatedEntrySize = sampleEntry ? JSON.stringify(sampleEntry.toObject()).length : 1024;
      const cacheSize = totalEntries * estimatedEntrySize;

      // 计算命中率（基于访问次数）
      const avgAccessCount = accessStats[0]?.avgAccessCount || 0;
      const hitRate = totalEntries > 0 ? Math.min(avgAccessCount / 10, 1) : 0;

      return {
        totalEntries,
        hitRate: Math.round(hitRate * 100) / 100,
        avgAccessCount: Math.round(avgAccessCount * 100) / 100,
        cacheSize,
        expiredEntries,
        topAccessedEntries: topAccessed.map((entry) => ({
          customerId: entry.customerId,
          accessCount: entry.accessCount,
        })),
      };
    } catch (error) {
      logger.error("获取缓存性能统计失败:", error);
      return {
        totalEntries: 0,
        hitRate: 0,
        avgAccessCount: 0,
        cacheSize: 0,
        expiredEntries: 0,
        topAccessedEntries: [],
      };
    }
  }

  /**
   * 记录缓存命中/未命中
   */
  static async recordCacheMetrics(customerId: string, hit: boolean): Promise<void> {
    try {
      // 这里可以扩展为更详细的指标收集
      // 目前通过 getCachedBillingData 中的 accessCount 更新来跟踪
      if (hit) {
        logger.info(`缓存命中: ${customerId}`);
      } else {
        logger.info(`缓存未命中: ${customerId}`);
      }
    } catch (error) {
      logger.error("记录缓存指标失败:", error);
    }
  }

  /**
   * 请求 GitHub Billing 数据
   */
  static async fetchBillingData(): Promise<GitHubBillingUsage> {
    const startTime = Date.now();
    const config = await GitHubBillingService.getSavedCurlConfig();
    if (!config) {
      throw new Error("未找到保存的 curl 配置，请先调用 saveCurlConfig 方法");
    }

    const targetCustomerId = config.customerId || "default";

    logger.info(`[GitHub Billing API] 开始获取数据 - 客户ID: ${targetCustomerId}, 时间: ${new Date().toISOString()}`);

    // 检查缓存（如果有客户ID的话）
    const cached = config.customerId ? await GitHubBillingService.getCachedBillingData(targetCustomerId) : null;
    if (cached) {
      await GitHubBillingService.recordCacheMetrics(targetCustomerId, true);
      const duration = Date.now() - startTime;

      // 记录缓存命中到数据库
      await GitHubBillingService.logApiActivity({
        customerId: targetCustomerId,
        action: "cache_hit",
        duration: duration,
        success: true,
        dataSize: JSON.stringify(cached).length,
      });

      logger.info(`[GitHub Billing API] 缓存命中 - 客户ID: ${targetCustomerId}, 耗时: ${duration}ms`);
      return cached;
    }

    // 记录缓存未命中
    await GitHubBillingService.recordCacheMetrics(targetCustomerId, false);
    await GitHubBillingService.logApiActivity({
      customerId: targetCustomerId,
      action: "cache_miss",
      success: true,
    });

    logger.info(`[GitHub Billing API] 缓存未命中，发起API请求 - 客户ID: ${targetCustomerId}`);

    // 使用配置中的 URL，不做任何修改
    const requestUrl = config.url;

    // 构建请求配置
    const requestConfig: AxiosRequestConfig = {
      method: config.method as any,
      url: requestUrl,
      headers: {
        ...config.headers,
        Cookie: config.cookies,
      },
      timeout: 30000,
      validateStatus: (status) => status < 500, // 允许 4xx 状态码
    };

    try {
      const apiStartTime = Date.now();
      logger.info(`[GitHub Billing API] 发起HTTP请求 - 客户ID: ${targetCustomerId}`);
      logger.info(`[GitHub Billing API] 请求配置:`, {
        method: requestConfig.method,
        url: requestConfig.url,
        headers: Object.keys(requestConfig.headers || {}),
        timeout: requestConfig.timeout,
      });

      const response = await axios(requestConfig);
      const apiDuration = Date.now() - apiStartTime;

      if (response.status !== 200) {
        logger.error(`[GitHub Billing API] 请求失败 - 状态码: ${response.status}`, {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers,
          data: response.data,
          customerId: targetCustomerId,
          duration: apiDuration,
        });
        throw new Error(`GitHub API 返回错误状态码: ${response.status} - ${response.statusText}`);
      }

      let billingData: GitHubBillingUsage;

      // 检查数据格式并相应处理
      if (response.data?.usage && Array.isArray(response.data.usage)) {
        logger.info("检测到新的usage数组格式数据，开始处理");
        const usageResponse = response.data as GitHubBillingNewResponse;
        billingData = GitHubBillingService.processUsageArrayData(usageResponse, targetCustomerId);
      } else if (response.data?.discounts && Array.isArray(response.data.discounts)) {
        logger.info("检测到折扣格式数据，开始处理");
        const discountResponse = response.data as GitHubBillingDiscountResponse;
        billingData = GitHubBillingService.processDiscountData(discountResponse, targetCustomerId);
      } else {
        // 传统格式处理
        logger.info("使用传统格式处理数据");
        billingData = response.data as GitHubBillingUsage;

        // 如果有客户ID，添加到数据中
        if (targetCustomerId && targetCustomerId !== "default") {
          (billingData as any).customerId = targetCustomerId;
        }
      }

      const dataSize = JSON.stringify(billingData).length;

      // 记录成功的API请求到数据库
      await GitHubBillingService.logApiActivity({
        customerId: targetCustomerId,
        action: "fetch",
        duration: apiDuration,
        success: true,
        dataSize: dataSize,
        requestUrl: requestUrl,
        statusCode: response.status,
      });

      logger.info(
        `[GitHub Billing API] 请求成功 - 客户ID: ${targetCustomerId}, API耗时: ${apiDuration}ms, 数据大小: ${dataSize} bytes`,
      );

      // 缓存数据（仅当有有效的客户ID时）
      if (config.customerId) {
        await GitHubBillingService.cacheBillingData(targetCustomerId, billingData);
      } else {
        logger.info(`[GitHub Billing API] 跳过缓存，因为没有客户ID - 使用折扣格式`);
      }

      const totalDuration = Date.now() - startTime;
      logger.info(`[GitHub Billing API] 完成数据获取和缓存 - 客户ID: ${targetCustomerId}, 总耗时: ${totalDuration}ms`);

      return billingData;
    } catch (error) {
      const errorDuration = Date.now() - startTime;

      // 记录错误到数据库
      await GitHubBillingService.logApiActivity({
        customerId: targetCustomerId,
        action: "error",
        duration: errorDuration,
        success: false,
        errorMessage: error instanceof Error ? error.message : "未知错误",
        requestUrl: requestUrl,
        statusCode: axios.isAxiosError(error) ? error.response?.status : undefined,
      });

      logger.error(`[GitHub Billing API] 请求失败 - 客户ID: ${targetCustomerId}, 耗时: ${errorDuration}ms`);

      if (axios.isAxiosError(error)) {
        logger.error(`[GitHub Billing API] Axios错误详情:`, {
          message: error.message,
          code: error.code,
          status: error.response?.status,
          statusText: error.response?.statusText,
          responseData: error.response?.data,
          requestUrl: error.config?.url,
          requestMethod: error.config?.method,
          customerId: targetCustomerId,
          duration: errorDuration,
        });

        if (error.response?.status === 503) {
          throw new Error("GitHub API 服务暂时不可用 (503)，请稍后重试");
        } else if (error.response?.status === 401) {
          throw new Error("GitHub API 认证失败 (401)，请检查 Cookie 或 Token 是否有效");
        } else if (error.response?.status === 403) {
          throw new Error("GitHub API 访问被拒绝 (403)，可能是权限不足或请求频率过高");
        } else if (error.response?.status === 429) {
          throw new Error("GitHub API 请求频率限制 (429)，请稍后重试");
        }
      }

      logger.error("请求 GitHub Billing 数据失败:", error);
      throw new Error(`请求 GitHub Billing 数据失败: ${error instanceof Error ? error.message : "未知错误"}`);
    }
  }

  /**
   * 清除指定客户的缓存
   */
  static async clearCache(customerId: string): Promise<void> {
    try {
      if (mongoose.connection.readyState === 1) {
        await GitHubBillingCacheModel.deleteOne({ customerId });
        logger.info(`已清除客户 ${customerId} 的缓存`);
      }
    } catch (error) {
      logger.error("清除缓存失败:", error);
      throw new Error(`清除缓存失败: ${error instanceof Error ? error.message : "未知错误"}`);
    }
  }

  /**
   * 清除所有过期缓存
   */
  static async clearExpiredCache(): Promise<void> {
    try {
      if (mongoose.connection.readyState === 1) {
        const result = await GitHubBillingCacheModel.deleteMany({
          expiresAt: { $lt: new Date() },
        });
        logger.info(`已清除 ${result.deletedCount} 条过期缓存`);
      }
    } catch (error) {
      logger.error("清除过期缓存失败:", error);
      throw new Error(`清除过期缓存失败: ${error instanceof Error ? error.message : "未知错误"}`);
    }
  }

  /**
   * 获取所有缓存的客户ID列表
   */
  static async getCachedCustomerIds(): Promise<string[]> {
    try {
      if (mongoose.connection.readyState !== 1) {
        return [];
      }

      const cached = await GitHubBillingCacheModel.find({ expiresAt: { $gt: new Date() } }, { customerId: 1 });

      return cached.map((item) => item.customerId);
    } catch (error) {
      logger.error("获取缓存客户ID列表失败:", error);
      return [];
    }
  }

  /**
   * 获取所有缓存的客户详细信息
   */
  static async getCachedCustomersDetails(): Promise<
    Array<{
      customerId: string;
      lastFetched: string;
      billableAmount: number;
    }>
  > {
    try {
      logger.info(`[getCachedCustomersDetails] 开始获取缓存客户详细信息`);

      if (mongoose.connection.readyState !== 1) {
        logger.warn(`[getCachedCustomersDetails] MongoDB连接状态异常: ${mongoose.connection.readyState}`);
        return [];
      }

      logger.info(`[getCachedCustomersDetails] MongoDB连接正常，查询缓存数据`);

      const cached = await GitHubBillingCacheModel.find(
        { expiresAt: { $gt: new Date() } },
        { customerId: 1, lastUpdated: 1, data: 1, accessCount: 1, createdAt: 1 },
      );

      logger.info(`[getCachedCustomersDetails] 找到 ${cached.length} 个有效缓存条目`);

      return cached.map((item) => {
        // 尝试多种可能的字段名来获取计费金额
        let billableAmount = 0;
        if (item.data) {
          const data = item.data as any;

          // 优先尝试新的折扣格式中的 billable_amount
          billableAmount =
            data?.billable_amount ||
            // 实际的API响应结构 data.usage.billableAmount
            data?.usage?.billableAmount ||
            data?.data?.usage?.billableAmount ||
            // 备用：标准的 GitHub API 字段名
            data.billable_usage ||
            data.total_usage ||
            // 其他可能的嵌套字段
            data?.usage?.billable_usage ||
            data?.billing?.billable_usage ||
            data?.amount ||
            0;

          // 如果有折扣详情，尝试计算总金额
          if (billableAmount === 0 && data?.discount_details && Array.isArray(data.discount_details)) {
            billableAmount = data.discount_details.reduce((total: number, discount: any) => {
              return total + (discount.currentAmount || 0);
            }, 0);
          }
        }

        logger.info(`[getCachedCustomersDetails] 处理客户 ${item.customerId}:`);
        logger.info(`  - 最后更新: ${item.lastUpdated.toISOString()}`);
        logger.info(`  - 访问次数: ${item.accessCount || 0}`);
        logger.info(`  - 创建时间: ${item.createdAt?.toISOString() || "未知"}`);
        logger.info(`  - 计费金额: $${billableAmount}`);
        logger.info(`  - 数据结构:`, JSON.stringify(item.data, null, 2));

        const result = {
          customerId: item.customerId,
          lastFetched: item.lastUpdated.toISOString(),
          billableAmount: billableAmount,
        };

        logger.info(`[getCachedCustomersDetails] 返回结果:`, result);
        return result;
      });
    } catch (error) {
      logger.error("获取缓存客户详细信息失败:", error);
      return [];
    }
  }

  /**
   * 获取所有多配置 curl 命令（从 MongoDB）
   */
  static async getAllMultiConfigs(): Promise<MultiCurlConfig | null> {
    try {
      if (mongoose.connection.readyState !== 1) {
        logger.warn("MongoDB 连接未就绪，无法获取多配置");
        return null;
      }

      const configs = await GitHubBillingMultiConfigModel.find({});
      if (configs.length === 0) {
        return null;
      }

      const multiConfig: MultiCurlConfig = {
        lastUpdated: new Date(),
      };

      configs.forEach((config) => {
        multiConfig[config.configKey] = {
          url: config.url,
          method: config.method,
          headers: config.headers,
          cookies: config.cookies,
          customerId: config.customerId,
        };

        // 使用最新的更新时间
        if (config.updatedAt > multiConfig.lastUpdated) {
          multiConfig.lastUpdated = config.updatedAt;
        }
      });

      logger.info(`成功获取 ${configs.length} 个多配置`);
      return multiConfig;
    } catch (error) {
      logger.error("获取多配置失败:", error);
      return null;
    }
  }

  /**
   * 删除指定的配置
   */
  static async deleteConfig(configKey: "config1" | "config2" | "config3"): Promise<void> {
    try {
      if (mongoose.connection.readyState !== 1) {
        throw new Error("MongoDB 连接未就绪");
      }

      const result = await GitHubBillingMultiConfigModel.deleteOne({ configKey });

      if (result.deletedCount === 0) {
        throw new Error(`配置 ${configKey} 不存在`);
      }

      // 如果删除的是 config1，同时清理原有的单配置数据（向后兼容）
      if (configKey === "config1") {
        await GitHubBillingSettingModel.deleteMany({
          key: {
            $in: [
              "GITHUB_BILLING_URL",
              "GITHUB_BILLING_METHOD",
              "GITHUB_BILLING_HEADERS",
              "GITHUB_BILLING_COOKIES",
              "GITHUB_BILLING_CUSTOMER_ID",
            ],
          },
        });
      }

      logger.info(`成功删除配置 ${configKey}`);
    } catch (error) {
      logger.error(`删除配置 ${configKey} 失败:`, error);
      throw error;
    }
  }

  /**
   * 获取聚合的 GitHub 计费数据
   */
  static async fetchAggregatedBillingData(forceRefresh: boolean = false): Promise<AggregatedBillingData> {
    const multiConfig = await GitHubBillingService.getAllMultiConfigs();
    if (!multiConfig) {
      throw new Error("未找到保存的 curl 配置");
    }

    const results: AggregatedBillingData = {
      totalBillableAmount: 0,
      totalDiscountAmount: 0,
      configCount: 0,
      configs: {},
      aggregatedRepoBreakdown: {},
      aggregatedOrgBreakdown: {},
      aggregatedDailyBreakdown: {},
      timestamp: new Date().toISOString(),
    };

    // 并发获取所有配置的数据
    const fetchPromises: Promise<void>[] = [];

    for (const configKey of ["config1", "config2", "config3"] as const) {
      const config = multiConfig[configKey];
      if (config) {
        fetchPromises.push(
          GitHubBillingService.fetchSingleConfigData(config, forceRefresh)
            .then((data) => {
              results.configs[configKey] = data;
              results.configCount++;

              // 聚合数据
              results.totalBillableAmount += data.billable_amount || 0;
              results.totalDiscountAmount += data.total_discount_amount || 0;

              // 聚合仓库分布
              if (data.repo_breakdown) {
                Object.entries(data.repo_breakdown).forEach(([repo, amount]) => {
                  results.aggregatedRepoBreakdown[repo] = (results.aggregatedRepoBreakdown[repo] || 0) + amount;
                });
              }

              // 聚合组织分布
              if (data.org_breakdown) {
                Object.entries(data.org_breakdown).forEach(([org, amount]) => {
                  results.aggregatedOrgBreakdown[org] = (results.aggregatedOrgBreakdown[org] || 0) + amount;
                });
              }

              // 聚合日期分布
              if (data.daily_breakdown) {
                Object.entries(data.daily_breakdown).forEach(([date, amount]) => {
                  results.aggregatedDailyBreakdown[date] = (results.aggregatedDailyBreakdown[date] || 0) + amount;
                });
              }
            })
            .catch((error) => {
              logger.error(`获取 ${configKey} 数据失败:`, error);
              // 继续处理其他配置
            }),
        );
      }
    }

    await Promise.all(fetchPromises);

    if (results.configCount === 0) {
      throw new Error("所有配置都获取数据失败");
    }

    logger.info(`成功聚合 ${results.configCount} 个配置的数据`);
    return results;
  }

  /**
   * 获取单个配置的 GitHub 计费数据
   */
  private static async fetchSingleConfigData(
    config: ParsedCurlCommand,
    forceRefresh: boolean = false,
  ): Promise<GitHubBillingUsage> {
    const targetCustomerId = config.customerId || "default";
    const cached = config.customerId ? await GitHubBillingService.getCachedBillingData(targetCustomerId) : null;

    // 如果不强制刷新且有缓存，返回缓存数据
    if (!forceRefresh && cached) {
      logger.info(`使用缓存数据: ${targetCustomerId}`);
      return cached;
    }

    const startTime = Date.now();

    try {
      logger.info(`开始获取 GitHub 计费数据: ${config.url}`);

      const response = await axios({
        method: config.method as any,
        url: config.url,
        headers: config.headers,
        timeout: 30000,
        validateStatus: () => true,
      });

      const apiDuration = Date.now() - startTime;

      if (response.status !== 200) {
        await GitHubBillingService.logApiActivity({
          action: "fetch",
          success: false,
          statusCode: response.status,
          customerId: targetCustomerId,
          duration: apiDuration,
        });
        throw new Error(`GitHub API 返回错误状态码: ${response.status} - ${response.statusText}`);
      }

      let billingData: GitHubBillingUsage;

      // 检查数据格式并相应处理
      if (response.data?.usage && Array.isArray(response.data.usage)) {
        logger.info("检测到新的usage数组格式数据，开始处理");
        const usageResponse = response.data as GitHubBillingNewResponse;
        billingData = GitHubBillingService.processUsageArrayData(usageResponse, targetCustomerId);
      } else if (response.data?.discounts && Array.isArray(response.data.discounts)) {
        logger.info("检测到折扣格式数据，开始处理");
        const discountResponse = response.data as GitHubBillingDiscountResponse;
        billingData = GitHubBillingService.processDiscountData(discountResponse, targetCustomerId);
      } else {
        // 传统格式处理
        logger.info("使用传统格式处理数据");
        billingData = response.data as GitHubBillingUsage;

        // 如果有客户ID，添加到数据中
        if (targetCustomerId && targetCustomerId !== "default") {
          (billingData as any).customerId = targetCustomerId;
        }
      }

      const dataSize = JSON.stringify(billingData).length;

      // 记录成功的API请求到数据库
      await GitHubBillingService.logApiActivity({
        customerId: targetCustomerId,
        action: "fetch",
        duration: apiDuration,
        success: true,
        statusCode: response.status,
        dataSize: dataSize,
      });

      // 仅在有有效customerId时缓存数据
      if (config.customerId) {
        await GitHubBillingService.cacheBillingData(targetCustomerId, billingData);
      }

      logger.info(`成功获取计费数据: ${targetCustomerId}, 数据大小: ${dataSize} 字节`);
      return billingData;
    } catch (error) {
      const apiDuration = Date.now() - startTime;

      await GitHubBillingService.logApiActivity({
        customerId: targetCustomerId,
        action: "fetch",
        duration: apiDuration,
        success: false,
        errorMessage: error instanceof Error ? error.message : String(error),
      });

      logger.error(`获取计费数据失败: ${targetCustomerId}`, error);
      throw error;
    }
  }
}
