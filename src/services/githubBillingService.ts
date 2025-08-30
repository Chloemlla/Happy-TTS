import mongoose from 'mongoose';
import axios, { AxiosRequestConfig } from 'axios';

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
}

const GitHubBillingCacheSchema = new mongoose.Schema<GitHubBillingCacheDoc>({
  customerId: { type: String, required: true, unique: true },
  data: { type: mongoose.Schema.Types.Mixed, required: true },
  lastUpdated: { type: Date, default: Date.now },
  expiresAt: { type: Date, required: true }
}, { collection: 'github_billing_cache' });

const GitHubBillingCacheModel = (mongoose.models.GitHubBillingCache as mongoose.Model<GitHubBillingCacheDoc>) || 
  mongoose.model<GitHubBillingCacheDoc>('GitHubBillingCache', GitHubBillingCacheSchema);

export class GitHubBillingService {
  
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
    while ((urlMatch = urlPattern.exec(curlCommand)) !== null) {
      const url = urlMatch[1];
      if (url.includes('github.com')) {
        result.url = url;
        
        // 提取 customer_id
        const customerIdMatch = url.match(/customer_id=(\d+)/);
        if (customerIdMatch) {
          result.customerId = customerIdMatch[1];
        }
        break;
      }
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
        return null;
      }

      const method = await this.getConfigValue('GITHUB_BILLING_METHOD', 'GET');
      const headersStr = await this.getConfigValue('GITHUB_BILLING_HEADERS', '{}');
      const cookies = await this.getConfigValue('GITHUB_BILLING_COOKIES', '');
      const customerId = await this.getConfigValue('GITHUB_BILLING_CUSTOMER_ID');

      return {
        url,
        method: method!,
        headers: JSON.parse(headersStr!),
        cookies: cookies!,
        customerId
      };
    } catch (error) {
      console.error('获取保存的 curl 配置失败:', error);
      return null;
    }
  }

  /**
   * 从缓存获取 GitHub Billing 数据
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

      return cached ? cached.data : null;
    } catch (error) {
      console.error('获取缓存的 GitHub Billing 数据失败:', error);
      return null;
    }
  }

  /**
   * 缓存 GitHub Billing 数据
   */
  static async cacheBillingData(customerId: string, data: GitHubBillingUsage, ttlMinutes: number = 60): Promise<void> {
    try {
      if (mongoose.connection.readyState !== 1) {
        return;
      }

      const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);

      await GitHubBillingCacheModel.findOneAndUpdate(
        { customerId },
        {
          data,
          lastUpdated: new Date(),
          expiresAt
        },
        { upsert: true }
      );

      console.log(`GitHub Billing 数据已缓存，客户ID: ${customerId}, 过期时间: ${expiresAt}`);
    } catch (error) {
      console.error('缓存 GitHub Billing 数据失败:', error);
    }
  }

  /**
   * 请求 GitHub Billing 数据
   */
  static async fetchBillingData(): Promise<GitHubBillingUsage> {
    const config = await this.getSavedCurlConfig();
    if (!config) {
      throw new Error('未找到保存的 curl 配置，请先调用 saveCurlConfig 方法');
    }

    const targetCustomerId = config.customerId;
    if (!targetCustomerId) {
      throw new Error('配置中未找到 customer_id');
    }

    // 检查缓存
    const cached = await this.getCachedBillingData(targetCustomerId);
    if (cached) {
      console.log(`使用缓存的 GitHub Billing 数据，客户ID: ${targetCustomerId}`);
      return cached;
    }

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
      console.log(`请求 GitHub Billing 数据，客户ID: ${targetCustomerId}`);
      console.log('请求配置:', {
        method: requestConfig.method,
        url: requestConfig.url,
        headers: Object.keys(requestConfig.headers || {}),
        timeout: requestConfig.timeout
      });
      
      const response = await axios(requestConfig);

      if (response.status !== 200) {
        console.error(`GitHub API 响应详情:`, {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers,
          data: response.data
        });
        throw new Error(`GitHub API 返回错误状态码: ${response.status} - ${response.statusText}`);
      }

      const billingData: GitHubBillingUsage = response.data;

      // 缓存数据
      await this.cacheBillingData(targetCustomerId, billingData);

      return billingData;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        console.error('Axios 错误详情:', {
          message: error.message,
          code: error.code,
          status: error.response?.status,
          statusText: error.response?.statusText,
          responseData: error.response?.data,
          requestUrl: error.config?.url,
          requestMethod: error.config?.method
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
}
