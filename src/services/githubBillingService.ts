import mongoose from 'mongoose';
import axios, { AxiosRequestConfig } from 'axios';
import logger from '../utils/logger';

// GitHub Billing 配置文档接口
interface GitHubBillingSettingDoc {
  key: string;
  value: string;
  updatedAt?: Date;
}

// GitHub Billing 配置 Schema
const GitHubBillingSettingSchema = new mongoose.Schema<GitHubBillingSettingDoc>({
  key: { type: String, required: true, unique: true },
  value: { type: String, required: true },
  updatedAt: { type: Date, default: Date.now }
}, { collection: 'github_billing_settings' });

const GitHubBillingSettingModel = (mongoose.models.GitHubBillingSetting as mongoose.Model<GitHubBillingSettingDoc>) ||
  mongoose.model<GitHubBillingSettingDoc>('GitHubBillingSetting', GitHubBillingSettingSchema);

// curl 命令解析结果接口
interface ParsedCurlCommand {
  url: string;
  method: string;
  headers: Record<string, string>;
  cookies: string;
  customerId?: string;
}

// GitHub Billing 使用情况响应接口
interface GitHubBillingUsage {
  total_usage: number;
  included_usage: number;
  billable_usage: number;
  usage_breakdown: {
    actions: number;
    packages: number;
    codespaces: number;
    copilot: number;
  };
  billing_cycle: {
    start_date: string;
    end_date: string;
  };
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
  priority: 'low' | 'medium' | 'high';
}

// GitHub Billing API 日志接口
interface GitHubBillingLogDoc {
  customerId: string;
  action: 'fetch' | 'cache_hit' | 'cache_miss' | 'error';
  timestamp: Date;
  duration?: number;
  success: boolean;
  errorMessage?: string;
  dataSize?: number;
  requestUrl?: string;
  statusCode?: number;
}

const GitHubBillingCacheSchema = new mongoose.Schema<GitHubBillingCacheDoc>({
  customerId: { type: String, required: true, unique: true },
  data: { type: mongoose.Schema.Types.Mixed, required: true },
  lastUpdated: { type: Date, default: Date.now },
  expiresAt: { type: Date, required: true },
  accessCount: { type: Number, default: 0 },
  lastAccessed: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now },
  priority: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' }
}, { collection: 'github_billing_cache' });

const GitHubBillingCacheModel = (mongoose.models.GitHubBillingCache as mongoose.Model<GitHubBillingCacheDoc>) ||
  mongoose.model<GitHubBillingCacheDoc>('GitHubBillingCache', GitHubBillingCacheSchema);

const GitHubBillingLogSchema = new mongoose.Schema<GitHubBillingLogDoc>({
  customerId: { type: String, required: true },
  action: { type: String, enum: ['fetch', 'cache_hit', 'cache_miss', 'error'], required: true },
  timestamp: { type: Date, default: Date.now },
  duration: { type: Number },
  success: { type: Boolean, required: true },
  errorMessage: { type: String },
  dataSize: { type: Number },
  requestUrl: { type: String },
  statusCode: { type: Number }
}, { collection: 'github_billing_logs' });

const GitHubBillingLogModel = (mongoose.models.GitHubBillingLog as mongoose.Model<GitHubBillingLogDoc>) ||
  mongoose.model<GitHubBillingLogDoc>('GitHubBillingLog', GitHubBillingLogSchema);

export class GitHubBillingService {

  /**
   * 记录API日志到数据库
   */
  private static async logApiActivity(logData: Partial<GitHubBillingLogDoc>): Promise<void> {
    try {
      if (mongoose.connection.readyState === 1) {
        await GitHubBillingLogModel.create({
          timestamp: new Date(),
          ...logData
        });
      }
    } catch (error) {
      console.error('记录API日志失败:', error);
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
      console.error(`获取配置 ${key} 失败:`, error);
      return defaultValue || process.env[key];
    }
  }

  /**
   * 设置配置值到数据库
   */
  private static async setConfigValue(key: string, value: string): Promise<void> {
    try {
      if (mongoose.connection.readyState === 1) {
        await GitHubBillingSettingModel.findOneAndUpdate(
          { key },
          { value, updatedAt: new Date() },
          { upsert: true }
        );
      }
    } catch (error) {
      console.error(`设置配置 ${key} 失败:`, error);
      throw error;
    }
  }

  /**
   * 解析 curl 命令
   */
  static parseCurlCommand(curlCommand: string): ParsedCurlCommand {
    const result: ParsedCurlCommand = {
      url: '',
      method: 'GET',
      headers: {},
      cookies: ''
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
        if (hostname === 'github.com' || hostname.endsWith('.github.com')) {
          result.url = url;
          foundValidUrl = true;

          // 提取 customer_id
          const customerIdMatch = url.match(/customer_id=(\d+)/);
          if (customerIdMatch) {
            result.customerId = customerIdMatch[1];
          }
          break;
        }
      } catch (error) {
        // URL 解析失败，跳过这个 URL
        continue;
      }
    }

    if (!foundValidUrl) {
      throw new Error('curl 命令中未找到有效的 GitHub URL');
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
      const colonIndex = headerValue.indexOf(':');

      if (colonIndex > 0) {
        const key = headerValue.substring(0, colonIndex).trim();
        const value = headerValue.substring(colonIndex + 1).trim();

        if (key.toLowerCase() === 'cookie') {
          result.cookies = value;
        } else {
          result.headers[key] = value;
        }
      }
    }

    if (!result.customerId) {
      throw new Error('curl 命令中未找到 customer_id 参数');
    }

    // 验证必要的 headers 是否存在
    if (Object.keys(result.headers).length === 0 && !result.cookies) {
      throw new Error('curl 命令中未找到认证信息（headers 或 cookies）');
    }

    return result;
  }

  /**
   * 保存解析的 curl 命令配置
   */
  static async saveCurlConfig(curlCommand: string): Promise<ParsedCurlCommand> {
    const parsed = this.parseCurlCommand(curlCommand);

    // 保存各个配置项
    await this.setConfigValue('GITHUB_BILLING_URL', parsed.url);
    await this.setConfigValue('GITHUB_BILLING_METHOD', parsed.method);
    await this.setConfigValue('GITHUB_BILLING_HEADERS', JSON.stringify(parsed.headers));
    await this.setConfigValue('GITHUB_BILLING_COOKIES', parsed.cookies);
    if (parsed.customerId) {
      await this.setConfigValue('GITHUB_BILLING_CUSTOMER_ID', parsed.customerId);
    }

    console.log('GitHub Billing curl 配置已保存');
    return parsed;
  }

  /**
   * 获取保存的 curl 配置
   */
  static async getSavedCurlConfig(): Promise<ParsedCurlCommand | null> {
    try {
      const url = await this.getConfigValue('GITHUB_BILLING_URL');
      if (!url) {
        throw new Error('未找到保存的 curl 配置，请先保存 curl 命令配置');
      }

      const method = await this.getConfigValue('GITHUB_BILLING_METHOD', 'GET');
      const headersStr = await this.getConfigValue('GITHUB_BILLING_HEADERS', '{}');
      const cookies = await this.getConfigValue('GITHUB_BILLING_COOKIES', '');
      const customerId = await this.getConfigValue('GITHUB_BILLING_CUSTOMER_ID');

      let parsedHeaders: Record<string, string> = {};
      try {
        parsedHeaders = JSON.parse(headersStr!);
      } catch (error) {
        console.error('解析保存的 headers 失败:', error);
        throw new Error('保存的配置格式错误，请重新保存 curl 命令');
      }

      return {
        url,
        method: method!,
        headers: parsedHeaders,
        cookies: cookies!,
        customerId
      };
    } catch (error) {
      console.error('获取保存的 curl 配置失败:', error);
      if (error instanceof Error && error.message.includes('未找到保存的 curl 配置')) {
        throw error;
      }
      throw new Error('获取配置失败: ' + (error instanceof Error ? error.message : '未知错误'));
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
        expiresAt: { $gt: new Date() }
      });

      if (cached) {
        // 更新访问统计
        await GitHubBillingCacheModel.updateOne(
          { customerId },
          {
            $inc: { accessCount: 1 },
            $set: { lastAccessed: new Date() }
          }
        );

        // 检查是否需要预热缓存（距离过期时间小于25%时）
        const now = new Date();
        const timeToExpire = cached.expiresAt.getTime() - now.getTime();
        const totalTTL = cached.expiresAt.getTime() - cached.createdAt.getTime();

        if (timeToExpire < totalTTL * 0.25) {
          // 异步预热缓存，不阻塞当前请求
          this.warmupCache(customerId).catch((error: Error) => {
            console.warn(`缓存预热失败 (客户ID: ${customerId}):`, error);
          });
        }

        return cached.data;
      }

      return null;
    } catch (error) {
      console.error('获取缓存的 GitHub Billing 数据失败:', error);
      return null;
    }
  }

  /**
   * 缓存预热 - 异步刷新即将过期的缓存
   */
  static async warmupCache(customerId: string): Promise<void> {
    try {
      console.log(`开始预热缓存 (客户ID: ${customerId})`);

      // 获取配置并刷新数据
      const config = await this.getSavedCurlConfig();
      if (!config) {
        throw new Error('未找到保存的配置');
      }

      const freshData = await this.fetchBillingData();

      // 计算智能TTL
      const intelligentTTL = await this.calculateIntelligentTTL(customerId);

      // 更新缓存
      await this.cacheBillingData(customerId, freshData, intelligentTTL);

      console.log(`缓存预热完成 (客户ID: ${customerId}), TTL: ${intelligentTTL}分钟`);
    } catch (error) {
      console.error(`缓存预热失败 (客户ID: ${customerId}):`, error);
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
      const priority = cached.priority || 'medium';

      // 基础TTL
      let baseTTL = 60;

      // 根据优先级调整
      switch (priority) {
        case 'high':
          baseTTL = 120; // 高优先级缓存更长时间
          break;
        case 'low':
          baseTTL = 30;  // 低优先级缓存较短时间
          break;
        default:
          baseTTL = 60;  // 中等优先级
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
      console.error('计算智能TTL失败:', error);
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
        const oldestEntries = await GitHubBillingCacheModel
          .find()
          .sort({ lastAccessed: 1, accessCount: 1 })
          .limit(excessCount)
          .select('customerId');

        const customerIdsToDelete = oldestEntries.map(entry => entry.customerId);

        await GitHubBillingCacheModel.deleteMany({
          customerId: { $in: customerIdsToDelete }
        });

        console.log(`LRU淘汰: 删除了 ${excessCount} 个最久未访问的缓存条目`);
      }
    } catch (error) {
      console.error('执行缓存限制失败:', error);
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
      await this.enforceCacheLimit();

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
              lastAccessed: now
            }
          }
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
              priority: 'medium'
            }
          },
          { upsert: true }
        );
      }

      console.log(`GitHub Billing 数据已缓存，客户ID: ${customerId}, 过期时间: ${expiresAt}`);
    } catch (error) {
      console.error('缓存 GitHub Billing 数据失败:', error);
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
          topAccessedEntries: []
        };
      }

      const now = new Date();

      // 基础统计
      const totalEntries = await GitHubBillingCacheModel.countDocuments();
      const expiredEntries = await GitHubBillingCacheModel.countDocuments({
        expiresAt: { $lt: now }
      });

      // 访问统计
      const accessStats = await GitHubBillingCacheModel.aggregate([
        {
          $group: {
            _id: null,
            avgAccessCount: { $avg: '$accessCount' },
            totalAccessCount: { $sum: '$accessCount' }
          }
        }
      ]);

      // 热门缓存条目
      const topAccessed = await GitHubBillingCacheModel
        .find()
        .sort({ accessCount: -1 })
        .limit(10)
        .select('customerId accessCount');

      // 计算缓存大小（估算）
      const sampleEntry = await GitHubBillingCacheModel.findOne();
      const estimatedEntrySize = sampleEntry ?
        JSON.stringify(sampleEntry.toObject()).length : 1024;
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
        topAccessedEntries: topAccessed.map(entry => ({
          customerId: entry.customerId,
          accessCount: entry.accessCount
        }))
      };
    } catch (error) {
      console.error('获取缓存性能统计失败:', error);
      return {
        totalEntries: 0,
        hitRate: 0,
        avgAccessCount: 0,
        cacheSize: 0,
        expiredEntries: 0,
        topAccessedEntries: []
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
        console.log(`缓存命中: ${customerId}`);
      } else {
        console.log(`缓存未命中: ${customerId}`);
      }
    } catch (error) {
      console.error('记录缓存指标失败:', error);
    }
  }

  /**
   * 请求 GitHub Billing 数据
   */
  static async fetchBillingData(): Promise<GitHubBillingUsage> {
    const startTime = Date.now();
    const config = await this.getSavedCurlConfig();
    if (!config) {
      throw new Error('未找到保存的 curl 配置，请先调用 saveCurlConfig 方法');
    }

    const targetCustomerId = config.customerId;
    if (!targetCustomerId) {
      throw new Error('配置中未找到 customer_id');
    }

    console.log(`[GitHub Billing API] 开始获取数据 - 客户ID: ${targetCustomerId}, 时间: ${new Date().toISOString()}`);

    // 检查缓存
    const cached = await this.getCachedBillingData(targetCustomerId);
    if (cached) {
      await this.recordCacheMetrics(targetCustomerId, true);
      const duration = Date.now() - startTime;
      
      // 记录缓存命中到数据库
      await this.logApiActivity({
        customerId: targetCustomerId,
        action: 'cache_hit',
        duration: duration,
        success: true,
        dataSize: JSON.stringify(cached).length
      });
      
      console.log(`[GitHub Billing API] 缓存命中 - 客户ID: ${targetCustomerId}, 耗时: ${duration}ms`);
      return cached;
    }

    // 记录缓存未命中
    await this.recordCacheMetrics(targetCustomerId, false);
    await this.logApiActivity({
      customerId: targetCustomerId,
      action: 'cache_miss',
      success: true
    });
    
    console.log(`[GitHub Billing API] 缓存未命中，发起API请求 - 客户ID: ${targetCustomerId}`);

    // 使用配置中的 URL，不做任何修改
    const requestUrl = config.url;

    // 构建请求配置
    const requestConfig: AxiosRequestConfig = {
      method: config.method as any,
      url: requestUrl,
      headers: {
        ...config.headers,
        'Cookie': config.cookies
      },
      timeout: 30000,
      validateStatus: (status) => status < 500 // 允许 4xx 状态码
    };

    try {
      const apiStartTime = Date.now();
      console.log(`[GitHub Billing API] 发起HTTP请求 - 客户ID: ${targetCustomerId}`);
      console.log(`[GitHub Billing API] 请求配置:`, {
        method: requestConfig.method,
        url: requestConfig.url,
        headers: Object.keys(requestConfig.headers || {}),
        timeout: requestConfig.timeout
      });

      const response = await axios(requestConfig);
      const apiDuration = Date.now() - apiStartTime;

      if (response.status !== 200) {
        console.error(`[GitHub Billing API] 请求失败 - 状态码: ${response.status}`, {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers,
          data: response.data,
          customerId: targetCustomerId,
          duration: apiDuration
        });
        throw new Error(`GitHub API 返回错误状态码: ${response.status} - ${response.statusText}`);
      }

      const billingData: GitHubBillingUsage = response.data;
      const dataSize = JSON.stringify(billingData).length;
      
      // 记录成功的API请求到数据库
      await this.logApiActivity({
        customerId: targetCustomerId,
        action: 'fetch',
        duration: apiDuration,
        success: true,
        dataSize: dataSize,
        requestUrl: requestUrl,
        statusCode: response.status
      });
      
      console.log(`[GitHub Billing API] 请求成功 - 客户ID: ${targetCustomerId}, API耗时: ${apiDuration}ms, 数据大小: ${dataSize} bytes`);

      // 缓存数据
      await this.cacheBillingData(targetCustomerId, billingData);
      
      const totalDuration = Date.now() - startTime;
      console.log(`[GitHub Billing API] 完成数据获取和缓存 - 客户ID: ${targetCustomerId}, 总耗时: ${totalDuration}ms`);

      return billingData;
    } catch (error) {
      const errorDuration = Date.now() - startTime;
      
      // 记录错误到数据库
      await this.logApiActivity({
        customerId: targetCustomerId,
        action: 'error',
        duration: errorDuration,
        success: false,
        errorMessage: error instanceof Error ? error.message : '未知错误',
        requestUrl: requestUrl,
        statusCode: axios.isAxiosError(error) ? error.response?.status : undefined
      });
      
      console.error(`[GitHub Billing API] 请求失败 - 客户ID: ${targetCustomerId}, 耗时: ${errorDuration}ms`);
      
      if (axios.isAxiosError(error)) {
        console.error(`[GitHub Billing API] Axios错误详情:`, {
          message: error.message,
          code: error.code,
          status: error.response?.status,
          statusText: error.response?.statusText,
          responseData: error.response?.data,
          requestUrl: error.config?.url,
          requestMethod: error.config?.method,
          customerId: targetCustomerId,
          duration: errorDuration
        });

        if (error.response?.status === 503) {
          throw new Error('GitHub API 服务暂时不可用 (503)，请稍后重试');
        } else if (error.response?.status === 401) {
          throw new Error('GitHub API 认证失败 (401)，请检查 Cookie 或 Token 是否有效');
        } else if (error.response?.status === 403) {
          throw new Error('GitHub API 访问被拒绝 (403)，可能是权限不足或请求频率过高');
        } else if (error.response?.status === 429) {
          throw new Error('GitHub API 请求频率限制 (429)，请稍后重试');
        }
      }

      console.error('请求 GitHub Billing 数据失败:', error);
      throw new Error(`请求 GitHub Billing 数据失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  }

  /**
   * 清除指定客户的缓存
   */
  static async clearCache(customerId: string): Promise<void> {
    try {
      if (mongoose.connection.readyState === 1) {
        await GitHubBillingCacheModel.deleteOne({ customerId });
        console.log(`已清除客户 ${customerId} 的缓存`);
      }
    } catch (error) {
      console.error('清除缓存失败:', error);
      throw new Error('清除缓存失败: ' + (error instanceof Error ? error.message : '未知错误'));
    }
  }

  /**
   * 清除所有过期缓存
   */
  static async clearExpiredCache(): Promise<void> {
    try {
      if (mongoose.connection.readyState === 1) {
        const result = await GitHubBillingCacheModel.deleteMany({
          expiresAt: { $lt: new Date() }
        });
        console.log(`已清除 ${result.deletedCount} 条过期缓存`);
      }
    } catch (error) {
      console.error('清除过期缓存失败:', error);
      throw new Error('清除过期缓存失败: ' + (error instanceof Error ? error.message : '未知错误'));
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

      const cached = await GitHubBillingCacheModel.find(
        { expiresAt: { $gt: new Date() } },
        { customerId: 1 }
      );

      return cached.map(item => item.customerId);
    } catch (error) {
      console.error('获取缓存客户ID列表失败:', error);
      return [];
    }
  }

  /**
   * 获取所有缓存的客户详细信息
   */
  static async getCachedCustomersDetails(): Promise<Array<{
    customerId: string;
    lastFetched: string;
    billableAmount: number;
  }>> {
    try {
      console.log(`[getCachedCustomersDetails] 开始获取缓存客户详细信息`);
      
      if (mongoose.connection.readyState !== 1) {
        console.log(`[getCachedCustomersDetails] MongoDB连接状态异常: ${mongoose.connection.readyState}`);
        return [];
      }

      console.log(`[getCachedCustomersDetails] MongoDB连接正常，查询缓存数据`);
      
      const cached = await GitHubBillingCacheModel.find(
        { expiresAt: { $gt: new Date() } },
        { customerId: 1, lastUpdated: 1, data: 1, accessCount: 1, createdAt: 1 }
      );

      console.log(`[getCachedCustomersDetails] 找到 ${cached.length} 个有效缓存条目`);

      return cached.map(item => {
        // 尝试多种可能的字段名来获取计费金额
        let billableAmount = 0;
        if (item.data) {
          const data = item.data as any;
          
          // 优先尝试实际的API响应结构 data.usage.billableAmount
          billableAmount = data?.usage?.billableAmount ||
                          data?.data?.usage?.billableAmount ||
                          // 备用：标准的 GitHub API 字段名
                          data.billable_usage ||
                          data.total_usage ||
                          // 其他可能的嵌套字段
                          data?.usage?.billable_usage ||
                          data?.billing?.billable_usage ||
                          data?.amount ||
                          0;
        }

        console.log(`[getCachedCustomersDetails] 处理客户 ${item.customerId}:`);
        console.log(`  - 最后更新: ${item.lastUpdated.toISOString()}`);
        console.log(`  - 访问次数: ${item.accessCount || 0}`);
        console.log(`  - 创建时间: ${item.createdAt?.toISOString() || '未知'}`);
        console.log(`  - 计费金额: $${billableAmount}`);
        console.log(`  - 数据结构:`, JSON.stringify(item.data, null, 2));
        
        const result = {
          customerId: item.customerId,
          lastFetched: item.lastUpdated.toISOString(),
          billableAmount: billableAmount
        };
        
        console.log(`[getCachedCustomersDetails] 返回结果:`, result);
        return result;
      });
    } catch (error) {
      console.error('获取缓存客户详细信息失败:', error);
      return [];
    }
  }
}
