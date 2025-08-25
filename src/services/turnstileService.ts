import axios from 'axios';
import { config } from '../config/config';
import logger from '../utils/logger';
import { mongoose } from './mongoService';
import { TempFingerprintModel, TempFingerprintDoc } from '../models/tempFingerprintModel';

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

  // ==================== 临时指纹管理 ====================

  /**
   * 上报临时指纹
   * @param fingerprint 浏览器指纹
   * @returns 是否首次访问和验证状态
   */
  public static async reportTempFingerprint(fingerprint: string): Promise<{
    isFirstVisit: boolean;
    verified: boolean;
  }> {
    try {
      if (mongoose.connection.readyState !== 1) {
        logger.error('数据库连接不可用，无法上报临时指纹');
        return { isFirstVisit: false, verified: false };
      }

      // 检查指纹是否已存在
      const existingDoc = await TempFingerprintModel.findOne({ fingerprint }).lean().exec();
      
      if (existingDoc) {
        // 指纹已存在，返回当前状态
        return {
          isFirstVisit: false,
          verified: existingDoc.verified,
        };
      }

      // 首次访问，创建新记录
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5分钟后过期
      await TempFingerprintModel.create({
        fingerprint,
        verified: false,
        expiresAt,
      });

      logger.info('临时指纹上报成功', { fingerprint: fingerprint.substring(0, 8) + '...' });
      
      return {
        isFirstVisit: true,
        verified: false,
      };
    } catch (error) {
      logger.error('临时指纹上报失败', error);
      return { isFirstVisit: false, verified: false };
    }
  }

  /**
   * 验证临时指纹
   * @param fingerprint 浏览器指纹
   * @param cfToken Turnstile验证令牌
   * @param remoteIp 用户IP地址
   * @returns 验证结果
   */
  public static async verifyTempFingerprint(
    fingerprint: string, 
    cfToken: string, 
    remoteIp?: string
  ): Promise<boolean> {
    try {
      if (mongoose.connection.readyState !== 1) {
        logger.error('数据库连接不可用，无法验证临时指纹');
        return false;
      }

      // 查找指纹记录
      const doc = await TempFingerprintModel.findOne({ fingerprint }).exec();
      if (!doc) {
        logger.warn('临时指纹不存在或已过期', { fingerprint: fingerprint.substring(0, 8) + '...' });
        return false;
      }

      // 验证Turnstile令牌
      const isValid = await this.verifyToken(cfToken, remoteIp);
      if (!isValid) {
        logger.warn('Turnstile验证失败', { fingerprint: fingerprint.substring(0, 8) + '...' });
        return false;
      }

      // 标记为已验证
      doc.verified = true;
      doc.updatedAt = new Date();
      await doc.save();

      logger.info('临时指纹验证成功', { fingerprint: fingerprint.substring(0, 8) + '...' });
      return true;
    } catch (error) {
      logger.error('临时指纹验证失败', error);
      return false;
    }
  }

  /**
   * 检查临时指纹状态
   * @param fingerprint 浏览器指纹
   * @returns 指纹状态
   */
  public static async checkTempFingerprintStatus(fingerprint: string): Promise<{
    exists: boolean;
    verified: boolean;
  }> {
    try {
      if (mongoose.connection.readyState !== 1) {
        logger.error('数据库连接不可用，无法检查临时指纹状态');
        return { exists: false, verified: false };
      }

      const doc = await TempFingerprintModel.findOne({ fingerprint }).lean().exec();
      
      if (!doc) {
        return { exists: false, verified: false };
      }

      return {
        exists: true,
        verified: doc.verified,
      };
    } catch (error) {
      logger.error('检查临时指纹状态失败', error);
      return { exists: false, verified: false };
    }
  }

  /**
   * 清理过期的临时指纹
   * @returns 清理的文档数量
   */
  public static async cleanupExpiredFingerprints(): Promise<number> {
    try {
      if (mongoose.connection.readyState !== 1) {
        logger.error('数据库连接不可用，无法清理过期指纹');
        return 0;
      }

      const now = new Date();
      const result = await TempFingerprintModel.deleteMany({
        expiresAt: { $lt: now }
      });

      if (result.deletedCount > 0) {
        logger.info(`清理过期临时指纹完成，删除 ${result.deletedCount} 条记录`);
      }

      return result.deletedCount || 0;
    } catch (error) {
      logger.error('清理过期临时指纹失败', error);
      return 0;
    }
  }

  /**
   * 获取临时指纹统计信息
   * @returns 统计信息
   */
  public static async getTempFingerprintStats(): Promise<{
    total: number;
    verified: number;
    unverified: number;
    expired: number;
  }> {
    try {
      if (mongoose.connection.readyState !== 1) {
        logger.error('数据库连接不可用，无法获取临时指纹统计');
        return { total: 0, verified: 0, unverified: 0, expired: 0 };
      }

      const now = new Date();
      
      const [total, verified, unverified, expired] = await Promise.all([
        TempFingerprintModel.countDocuments(),
        TempFingerprintModel.countDocuments({ verified: true }),
        TempFingerprintModel.countDocuments({ verified: false }),
        TempFingerprintModel.countDocuments({ expiresAt: { $lt: now } }),
      ]);

      return {
        total,
        verified,
        unverified,
        expired,
      };
    } catch (error) {
      logger.error('获取临时指纹统计失败', error);
      return { total: 0, verified: 0, unverified: 0, expired: 0 };
    }
  }
} 