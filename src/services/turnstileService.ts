import axios from 'axios';
import { config } from '../config/config';
import logger from '../utils/logger';
import { mongoose } from './mongoService';

// Turnstile配置文档接口
interface TurnstileSettingDoc { 
  key: string; 
  value: string; 
  updatedAt?: Date 
}

// Turnstile配置Schema
const TurnstileSettingSchema = new mongoose.Schema<TurnstileSettingDoc>({
  key: { type: String, required: true },
  value: { type: String, required: true },
  updatedAt: { type: Date, default: Date.now }
}, { collection: 'turnstile_settings' });

const TurnstileSettingModel = (mongoose.models.TurnstileSetting as mongoose.Model<TurnstileSettingDoc>) || 
  mongoose.model<TurnstileSettingDoc>('TurnstileSetting', TurnstileSettingSchema);

interface TurnstileResponse {
  success: boolean;
  'error-codes'?: string[];
  challenge_ts?: string;
  hostname?: string;
}

// 从数据库获取Turnstile密钥
async function getTurnstileKey(keyName: 'TURNSTILE_SECRET_KEY' | 'TURNSTILE_SITE_KEY'): Promise<string | null> {
  try {
    if (mongoose.connection.readyState === 1) {
      const doc = await TurnstileSettingModel.findOne({ key: keyName }).lean().exec();
      if (doc && typeof doc.value === 'string' && doc.value.trim().length > 0) {
        return doc.value.trim();
      }
    }
  } catch (e) {
    logger.error(`读取Turnstile ${keyName} 失败，回退到环境变量`, e);
  }
  
  // 回退到环境变量
  const envKey = process.env[keyName]?.trim();
  return envKey && envKey.length > 0 ? envKey : null;
}

export class TurnstileService {
  private static readonly VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

  /**
   * 验证 Turnstile token
   * @param token 前端返回的 token
   * @param remoteIp 用户 IP 地址
   * @returns 验证结果
   */
  public static async verifyToken(token: string, remoteIp?: string): Promise<boolean> {
    try {
      // 从数据库获取密钥
      const secretKey = await getTurnstileKey('TURNSTILE_SECRET_KEY');
      
      // 检查是否配置了密钥
      if (!secretKey) {
        logger.warn('Turnstile 密钥未配置，跳过验证');
        return true;
      }

      if (!token) {
        logger.warn('Turnstile token 为空');
        return false;
      }

      const formData = new URLSearchParams();
      formData.append('secret', secretKey);
      formData.append('response', token);
      
      if (remoteIp) {
        formData.append('remoteip', remoteIp);
      }

      const response = await axios.post<TurnstileResponse>(
        this.VERIFY_URL,
        formData,
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          timeout: 10000, // 10秒超时
        }
      );

      const result = response.data;

      if (!result.success) {
        logger.warn('Turnstile 验证失败', {
          errorCodes: result['error-codes'],
          remoteIp,
          timestamp: result.challenge_ts,
          hostname: result.hostname,
        });
        return false;
      }

      logger.info('Turnstile 验证成功', {
        remoteIp,
        timestamp: result.challenge_ts,
        hostname: result.hostname,
      });

      return true;
    } catch (error) {
      logger.error('Turnstile 验证请求失败', {
        error: error instanceof Error ? error.message : 'Unknown error',
        remoteIp,
      });
      return false;
    }
  }

  /**
   * 检查是否启用了 Turnstile
   */
  public static async isEnabled(): Promise<boolean> {
    const secretKey = await getTurnstileKey('TURNSTILE_SECRET_KEY');
    return !!secretKey;
  }

  /**
   * 获取Turnstile配置
   */
  public static async getConfig(): Promise<{
    enabled: boolean;
    siteKey: string | null;
    secretKey: string | null;
  }> {
    const [secretKey, siteKey] = await Promise.all([
      getTurnstileKey('TURNSTILE_SECRET_KEY'),
      getTurnstileKey('TURNSTILE_SITE_KEY')
    ]);

    return {
      enabled: !!secretKey,
      siteKey,
      secretKey
    };
  }

  /**
   * 更新Turnstile配置
   */
  public static async updateConfig(key: 'TURNSTILE_SECRET_KEY' | 'TURNSTILE_SITE_KEY', value: string): Promise<boolean> {
    try {
      if (mongoose.connection.readyState !== 1) {
        logger.error('数据库连接不可用，无法更新Turnstile配置');
        return false;
      }

      await TurnstileSettingModel.findOneAndUpdate(
        { key },
        { 
          key, 
          value: value.trim(), 
          updatedAt: new Date() 
        },
        { upsert: true, new: true }
      );

      logger.info(`Turnstile配置更新成功: ${key}`);
      return true;
    } catch (error) {
      logger.error(`更新Turnstile配置失败: ${key}`, error);
      return false;
    }
  }

  /**
   * 删除Turnstile配置
   */
  public static async deleteConfig(key: 'TURNSTILE_SECRET_KEY' | 'TURNSTILE_SITE_KEY'): Promise<boolean> {
    try {
      if (mongoose.connection.readyState !== 1) {
        logger.error('数据库连接不可用，无法删除Turnstile配置');
        return false;
      }

      await TurnstileSettingModel.findOneAndDelete({ key });
      logger.info(`Turnstile配置删除成功: ${key}`);
      return true;
    } catch (error) {
      logger.error(`删除Turnstile配置失败: ${key}`, error);
      return false;
    }
  }
} 