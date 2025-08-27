import axios from 'axios';
import { config } from '../config/config';
import logger from '../utils/logger';
import { mongoose } from './mongoService';
import { TempFingerprintModel, TempFingerprintDoc } from '../models/tempFingerprintModel';
import { AccessTokenModel, AccessTokenDoc } from '../models/accessTokenModel';
import { IpBanModel, IpBanDoc } from '../models/ipBanModel';
import crypto from 'crypto';

// 输入验证和清理函数
const sanitizeString = (input: string, maxLength: number = 1500): string | null => {
  if (!input || typeof input !== 'string') {
    return null;
  }

  // 移除危险字符和过长的输入
  const sanitized = input.trim().substring(0, maxLength);

  // 检查是否包含危险的字符序列
  const dangerousPatterns = [
    /[<>{}]/g, // 移除HTML/XML标签字符
    /javascript:/gi, // 移除JavaScript协议
    /data:/gi, // 移除data协议
    /vbscript:/gi, // 移除VBScript协议
    /on\w+\s*=/gi, // 移除事件处理器
  ];

  let cleaned = sanitized;
  dangerousPatterns.forEach(pattern => {
    cleaned = cleaned.replace(pattern, '');
  });

  return cleaned || null;
};

const validateFingerprint = (fingerprint: string): string | null => {
  if (!fingerprint || typeof fingerprint !== 'string') {
    return null;
  }

  // 指纹应该是有效的字符串，长度在合理范围内
  const sanitized = sanitizeString(fingerprint, 200);
  if (!sanitized || sanitized.length < 8) {
    return null;
  }

  // 检查指纹格式（应该是字母数字组合）
  if (!/^[a-zA-Z0-9_-]+$/.test(sanitized)) {
    return null;
  }

  return sanitized;
};

const validateToken = (token: string): string | null => {
  if (!token || typeof token !== 'string') {
    return null;
  }

  // 令牌应该是有效的字符串，长度在合理范围内
  const sanitized = sanitizeString(token, 2000); // 增加长度限制，Turnstile tokens 可能较长
  if (!sanitized || sanitized.length < 10) {
    return null;
  }

  // Turnstile tokens 可以包含各种字符，包括 Base64 编码字符
  // 主要的安全检查由 sanitizeString 函数处理（移除危险模式）
  // 这里只做基本的格式检查，确保不是纯空白字符
  if (!sanitized.trim()) {
    return null;
  }

  return sanitized;
};

const validateIpAddress = (ip: string): string | null => {
  if (!ip || typeof ip !== 'string') {
    return null;
  }

  // 简单的IP地址验证
  const sanitized = sanitizeString(ip, 50);
  if (!sanitized) {
    return null;
  }

  // 检查是否为有效的IP地址格式
  const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
  const ipv6Regex = /^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;

  if (ipv4Regex.test(sanitized) || ipv6Regex.test(sanitized)) {
    return sanitized;
  }

  return null;
};

const validateConfigKey = (key: string): 'TURNSTILE_SECRET_KEY' | 'TURNSTILE_SITE_KEY' | null => {
  if (!key || typeof key !== 'string') {
    return null;
  }

  // 只允许预定义的配置键
  const validKeys = ['TURNSTILE_SECRET_KEY', 'TURNSTILE_SITE_KEY'];
  return validKeys.includes(key) ? key as 'TURNSTILE_SECRET_KEY' | 'TURNSTILE_SITE_KEY' : null;
};

const validateConfigValue = (value: string): string | null => {
  if (!value || typeof value !== 'string') {
    return null;
  }

  // 配置值应该是有效的字符串，长度在合理范围内
  const sanitized = sanitizeString(value, 1000);
  if (!sanitized || sanitized.length < 1) {
    return null;
  }

  return sanitized;
};

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
  private static readonly MAX_VIOLATIONS = 3; // 最大违规次数
  private static readonly BAN_DURATION = 60 * 60 * 1000; // 封禁时长：60分钟

  /**
   * 检查IP是否被封禁
   * @param ipAddress IP地址
   * @returns 封禁状态
   */
  public static async isIpBanned(ipAddress: string): Promise<{ banned: boolean; reason?: string; expiresAt?: Date }> {
    try {
      const validatedIp = validateIpAddress(ipAddress);
      if (!validatedIp) {
        return { banned: false };
      }

      if (mongoose.connection.readyState !== 1) {
        return { banned: false };
      }

      const banDoc = await IpBanModel.findOne({
        ipAddress: validatedIp,
        expiresAt: { $gt: new Date() } // 确保封禁未过期
      }).lean().exec();

      if (banDoc) {
        return {
          banned: true,
          reason: banDoc.reason,
          expiresAt: banDoc.expiresAt
        };
      }

      return { banned: false };
    } catch (error) {
      logger.error('检查IP封禁状态失败', error);
      return { banned: false };
    }
  }

  /**
   * 记录违规并可能封禁IP
   * @param ipAddress IP地址
   * @param reason 违规原因
   * @param fingerprint 指纹（可选）
   * @param userAgent 用户代理（可选）
   * @returns 是否被封禁
   */
  public static async recordViolation(
    ipAddress: string,
    reason: string,
    fingerprint?: string,
    userAgent?: string
  ): Promise<boolean> {
    try {
      const validatedIp = validateIpAddress(ipAddress);
      if (!validatedIp) {
        return false;
      }

      if (mongoose.connection.readyState !== 1) {
        return false;
      }

      // 查找现有的封禁记录
      let banDoc = await IpBanModel.findOne({ ipAddress: validatedIp }).exec();

      if (banDoc) {
        // 更新现有记录
        banDoc.violationCount += 1;
        banDoc.reason = reason;
        // 由于 lean() 查询返回的对象没有 updatedAt 字段，这里不再直接赋值
        // 如果 banDoc 有 updatedAt 字段则更新，否则跳过
        if ('updatedAt' in banDoc) {
          banDoc.updatedAt = new Date();
        }

        // 如果违规次数达到阈值，延长封禁时间
        if (banDoc.violationCount >= this.MAX_VIOLATIONS) {
          banDoc.expiresAt = new Date(Date.now() + this.BAN_DURATION);
        }

        await banDoc.save();

        logger.warn(`IP ${validatedIp} 违规次数增加到 ${banDoc.violationCount}`, {
          reason,
          fingerprint: fingerprint?.substring(0, 8) + '...',
          banned: banDoc.violationCount >= this.MAX_VIOLATIONS
        });

        return banDoc.violationCount >= this.MAX_VIOLATIONS;
      } else {
        // 创建新的封禁记录
        const expiresAt = new Date(Date.now() + this.BAN_DURATION);
        await IpBanModel.create({
          ipAddress: validatedIp,
          reason,
          violationCount: 1,
          expiresAt,
          fingerprint,
          userAgent
        });

        logger.warn(`IP ${validatedIp} 首次违规，已封禁60分钟`, {
          reason,
          fingerprint: fingerprint?.substring(0, 8) + '...'
        });

        return true;
      }
    } catch (error) {
      logger.error('记录违规失败', error);
      return false;
    }
  }

  /**
   * 验证 Turnstile token
   * @param token 前端返回的 token
   * @param remoteIp 用户 IP 地址
   * @returns 验证结果
   */
  public static async verifyToken(token: string, remoteIp?: string): Promise<boolean> {
    try {
      // 验证输入参数
      const validatedToken = validateToken(token);

      if (!validatedToken) {
        logger.warn('Turnstile token 验证失败：输入参数无效', { tokenLength: token?.length });
        return false;
      }

      // 从数据库获取密钥
      const secretKey = await getTurnstileKey('TURNSTILE_SECRET_KEY');

      // 检查是否配置了密钥
      if (!secretKey) {
        logger.warn('Turnstile 密钥未配置，跳过验证');
        return true;
      }

      const formData = new URLSearchParams();
      formData.append('secret', secretKey);
      formData.append('response', validatedToken);

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
      // 验证输入参数
      const validatedKey = validateConfigKey(key);
      const validatedValue = validateConfigValue(value);

      if (!validatedKey || !validatedValue) {
        logger.warn('Turnstile配置更新失败：输入参数无效', { key, valueLength: value?.length });
        return false;
      }

      if (mongoose.connection.readyState !== 1) {
        logger.error('数据库连接不可用，无法更新Turnstile配置');
        return false;
      }

      await TurnstileSettingModel.findOneAndUpdate(
        { key: validatedKey },
        {
          key: validatedKey,
          value: validatedValue,
          updatedAt: new Date()
        },
        { upsert: true, new: true }
      );

      logger.info(`Turnstile配置更新成功: ${validatedKey}`);
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
      // 验证输入参数
      const validatedKey = validateConfigKey(key);

      if (!validatedKey) {
        logger.warn('Turnstile配置删除失败：输入参数无效', { key });
        return false;
      }

      if (mongoose.connection.readyState !== 1) {
        logger.error('数据库连接不可用，无法删除Turnstile配置');
        return false;
      }

      await TurnstileSettingModel.findOneAndDelete({ key: validatedKey });
      logger.info(`Turnstile配置删除成功: ${validatedKey}`);
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
   * @param ipAddress IP地址
   * @returns 是否首次访问和验证状态
   */
  public static async reportTempFingerprint(fingerprint: string, ipAddress: string): Promise<{
    isFirstVisit: boolean;
    verified: boolean;
  }> {
    try {
      // 验证输入参数
      const validatedFingerprint = validateFingerprint(fingerprint);
      const validatedIp = validateIpAddress(ipAddress);

      if (!validatedFingerprint || !validatedIp) {
        logger.warn('临时指纹上报失败：输入参数无效', {
          fingerprintLength: fingerprint?.length,
          ipAddress
        });
        return { isFirstVisit: false, verified: false };
      }

      // 检查IP是否被封禁
      const banStatus = await this.isIpBanned(validatedIp);
      if (banStatus.banned) {
        logger.warn(`IP ${validatedIp} 已被封禁，拒绝访问`, {
          reason: banStatus.reason,
          expiresAt: banStatus.expiresAt
        });
        return { isFirstVisit: false, verified: false };
      }

      if (mongoose.connection.readyState !== 1) {
        logger.error('数据库连接不可用，无法上报临时指纹');
        return { isFirstVisit: false, verified: false };
      }

      // 开发环境下本地IP的特殊处理
      const isDev = process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'dev';
      const isLocalhost = validatedIp === '127.0.0.1' || validatedIp === '::1' || validatedIp === '::ffff:127.0.0.1';

      // 检查指纹是否已存在
      const existingDoc = await TempFingerprintModel.findOne({ fingerprint: validatedFingerprint }).lean().exec();

      if (existingDoc) {
        // 开发环境本地IP自动标记为已验证
        if (isDev && isLocalhost && !existingDoc.verified) {
          await TempFingerprintModel.updateOne(
            { fingerprint: validatedFingerprint },
            { verified: true, updatedAt: new Date() }
          );
          logger.info('开发环境：本地IP指纹自动标记为已验证', {
            fingerprint: validatedFingerprint.substring(0, 8) + '...',
            ipAddress: validatedIp
          });
          return {
            isFirstVisit: false,
            verified: true,
          };
        }

        // 指纹已存在，返回当前状态
        return {
          isFirstVisit: false,
          verified: existingDoc.verified,
        };
      }

      // 首次访问，创建新记录
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5分钟后过期
      const isVerified = isDev && isLocalhost; // 开发环境本地IP自动验证

      await TempFingerprintModel.create({
        fingerprint: validatedFingerprint,
        verified: isVerified,
        expiresAt,
      });

      if (isVerified) {
        logger.info('开发环境：本地IP临时指纹自动验证', {
          fingerprint: validatedFingerprint.substring(0, 8) + '...',
          ipAddress: validatedIp
        });
      } else {
        logger.info('临时指纹上报成功', {
          fingerprint: validatedFingerprint.substring(0, 8) + '...',
          ipAddress: validatedIp
        });
      }

      return {
        isFirstVisit: true,
        verified: isVerified,
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
  ): Promise<{ success: boolean; accessToken?: string }> {
    try {
      // 验证输入参数
      const validatedFingerprint = validateFingerprint(fingerprint);
      const validatedToken = validateToken(cfToken);
      const validatedIp = validateIpAddress(remoteIp || '');

      if (!validatedFingerprint || !validatedToken || !validatedIp) {
        logger.warn('临时指纹验证失败：输入参数无效', {
          fingerprintLength: fingerprint?.length,
          tokenLength: cfToken?.length,
          ipAddress: remoteIp
        });
        return { success: false };
      }

      // 检查IP是否被封禁
      const banStatus = await this.isIpBanned(validatedIp);
      if (banStatus.banned) {
        logger.warn(`IP ${validatedIp} 已被封禁，拒绝验证`, {
          reason: banStatus.reason,
          expiresAt: banStatus.expiresAt
        });
        return { success: false };
      }

      if (mongoose.connection.readyState !== 1) {
        logger.error('数据库连接不可用，无法验证临时指纹');
        return { success: false };
      }

      // 查找指纹记录
      const doc = await TempFingerprintModel.findOne({ fingerprint: validatedFingerprint }).exec();
      if (!doc) {
        logger.warn('临时指纹不存在或已过期', {
          fingerprint: validatedFingerprint.substring(0, 8) + '...',
          ipAddress: validatedIp
        });
        return { success: false };
      }

      // 开发环境下本地IP跳过Turnstile验证
      const isDev = process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'dev';
      const isLocalhost = validatedIp === '127.0.0.1' || validatedIp === '::1' || validatedIp === '::ffff:127.0.0.1';

      let isValid = false;

      if (isDev && isLocalhost) {
        // 开发环境本地IP自动通过验证
        isValid = true;
        logger.info('开发环境：本地IP跳过Turnstile验证', {
          fingerprint: validatedFingerprint.substring(0, 8) + '...',
          ipAddress: validatedIp
        });
      } else {
        // 验证Turnstile令牌
        isValid = await this.verifyToken(validatedToken, validatedIp);
        if (!isValid) {
          // 记录违规
          await this.recordViolation(validatedIp, 'Turnstile验证失败', validatedFingerprint);
          logger.warn('Turnstile验证失败', {
            fingerprint: validatedFingerprint.substring(0, 8) + '...',
            ipAddress: validatedIp
          });
          return { success: false };
        }
      }

      // 标记为已验证
      doc.verified = true;
      doc.updatedAt = new Date();
      await doc.save();

      // 生成访问密钥
      const accessToken = await this.generateAccessToken(validatedFingerprint, validatedIp);

      logger.info('临时指纹验证成功，已生成访问密钥', {
        fingerprint: validatedFingerprint.substring(0, 8) + '...',
        ipAddress: validatedIp,
        accessToken: accessToken.substring(0, 8) + '...'
      });

      return { success: true, accessToken };
    } catch (error) {
      logger.error('临时指纹验证失败', error);
      return { success: false };
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
      // 验证输入参数
      const validatedFingerprint = validateFingerprint(fingerprint);

      if (!validatedFingerprint) {
        logger.warn('检查临时指纹状态失败：输入参数无效', { fingerprintLength: fingerprint?.length });
        return { exists: false, verified: false };
      }

      if (mongoose.connection.readyState !== 1) {
        logger.error('数据库连接不可用，无法检查临时指纹状态');
        return { exists: false, verified: false };
      }

      const doc = await TempFingerprintModel.findOne({ fingerprint: validatedFingerprint }).lean().exec();

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

  // ==================== 访问密钥管理 ====================

  /**
   * 生成访问密钥
   * @param fingerprint 浏览器指纹
   * @param ipAddress IP地址
   * @returns 访问密钥
   */
  public static async generateAccessToken(fingerprint: string, ipAddress: string): Promise<string> {
    try {
      // 验证输入参数
      const validatedFingerprint = validateFingerprint(fingerprint);
      const validatedIp = validateIpAddress(ipAddress);

      if (!validatedFingerprint || !validatedIp) {
        logger.warn('生成访问密钥失败：输入参数无效', {
          fingerprintLength: fingerprint?.length,
          ipAddress
        });
        throw new Error('无效的指纹或IP参数');
      }

      // 开发环境下为 127.0.0.1 提供永久访问令牌
      const isDev = process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'dev';
      const isLocalhost = validatedIp === '127.0.0.1' || validatedIp === '::1' || validatedIp === '::ffff:127.0.0.1';

      if (isDev && isLocalhost) {
        // 为开发环境生成固定的永久令牌
        const devToken = crypto.createHash('sha256')
          .update(`dev-token-${validatedFingerprint}-${validatedIp}`)
          .digest('hex');

        logger.info('开发环境：为本地IP生成永久访问密钥', {
          fingerprint: validatedFingerprint.substring(0, 8) + '...',
          ipAddress: validatedIp,
          token: devToken.substring(0, 8) + '...'
        });

        return devToken;
      }

      if (mongoose.connection.readyState !== 1) {
        logger.error('数据库连接不可用，无法生成访问密钥');
        throw new Error('数据库连接不可用');
      }

      // 生成随机密钥
      const token = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5分钟后过期

      // 保存到数据库
      await AccessTokenModel.create({
        token,
        fingerprint: validatedFingerprint,
        ipAddress: validatedIp,
        expiresAt,
      });

      logger.info('访问密钥生成成功', {
        fingerprint: validatedFingerprint.substring(0, 8) + '...',
        ipAddress: validatedIp,
        expiresAt
      });

      return token;
    } catch (error) {
      logger.error('生成访问密钥失败', error);
      throw error;
    }
  }

  /**
   * 验证访问密钥
   * @param token 访问密钥
   * @param fingerprint 浏览器指纹
   * @param ipAddress IP地址
   * @returns 验证结果
   */
  public static async verifyAccessToken(token: string, fingerprint: string, ipAddress: string): Promise<boolean> {
    try {
      // 验证输入参数
      const validatedToken = validateToken(token);
      const validatedFingerprint = validateFingerprint(fingerprint);
      const validatedIp = validateIpAddress(ipAddress);

      if (!validatedToken || !validatedFingerprint || !validatedIp) {
        logger.warn('验证访问密钥失败：输入参数无效', {
          tokenLength: token?.length,
          fingerprintLength: fingerprint?.length,
          ipAddress
        });
        return false;
      }

      // 开发环境下验证永久访问令牌
      const isDev = process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'dev';
      const isLocalhost = validatedIp === '127.0.0.1' || validatedIp === '::1' || validatedIp === '::ffff:127.0.0.1';

      if (isDev && isLocalhost) {
        // 生成期望的开发环境令牌
        const expectedDevToken = crypto.createHash('sha256')
          .update(`dev-token-${validatedFingerprint}-${validatedIp}`)
          .digest('hex');

        if (validatedToken === expectedDevToken) {
          logger.info('开发环境：永久访问密钥验证成功', {
            fingerprint: validatedFingerprint.substring(0, 8) + '...',
            ipAddress: validatedIp,
            token: validatedToken.substring(0, 8) + '...'
          });
          return true;
        }
      }

      // 检查IP是否被封禁（开发环境本地IP跳过封禁检查）
      if (!(isDev && isLocalhost)) {
        const banStatus = await this.isIpBanned(validatedIp);
        if (banStatus.banned) {
          logger.warn(`IP ${validatedIp} 已被封禁，拒绝验证访问密钥`, {
            reason: banStatus.reason,
            expiresAt: banStatus.expiresAt
          });
          return false;
        }
      }

      if (mongoose.connection.readyState !== 1) {
        logger.error('数据库连接不可用，无法验证访问密钥');
        return false;
      }

      // 查找并验证密钥（必须匹配token、fingerprint和ipAddress）
      const doc = await AccessTokenModel.findOne({
        token: validatedToken,
        fingerprint: validatedFingerprint,
        ipAddress: validatedIp,
        expiresAt: { $gt: new Date() } // 确保未过期
      }).exec();

      if (!doc) {
        logger.warn('访问密钥无效或已过期', {
          token: validatedToken.substring(0, 8) + '...',
          fingerprint: validatedFingerprint.substring(0, 8) + '...',
          ipAddress: validatedIp
        });
        return false;
      }

      // 更新最后访问时间
      doc.updatedAt = new Date();
      await doc.save();

      logger.info('访问密钥验证成功', {
        token: validatedToken.substring(0, 8) + '...',
        fingerprint: validatedFingerprint.substring(0, 8) + '...',
        ipAddress: validatedIp
      });

      return true;
    } catch (error) {
      logger.error('验证访问密钥失败', error);
      return false;
    }
  }

  /**
   * 检查指纹是否有有效的访问密钥
   * @param fingerprint 浏览器指纹
   * @param ipAddress IP地址
   * @returns 是否有有效密钥
   */
  public static async hasValidAccessToken(fingerprint: string, ipAddress: string): Promise<boolean> {
    try {
      // 验证输入参数
      const validatedFingerprint = validateFingerprint(fingerprint);
      const validatedIp = validateIpAddress(ipAddress);

      if (!validatedFingerprint || !validatedIp) {
        logger.warn('检查访问密钥失败：输入参数无效', {
          fingerprintLength: fingerprint?.length,
          ipAddress
        });
        return false;
      }

      // 开发环境下本地IP始终有有效的访问密钥
      const isDev = process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'dev';
      const isLocalhost = validatedIp === '127.0.0.1' || validatedIp === '::1' || validatedIp === '::ffff:127.0.0.1';

      if (isDev && isLocalhost) {
        logger.info('开发环境：本地IP自动拥有有效访问密钥', {
          fingerprint: validatedFingerprint.substring(0, 8) + '...',
          ipAddress: validatedIp
        });
        return true;
      }

      // 检查IP是否被封禁
      const banStatus = await this.isIpBanned(validatedIp);
      if (banStatus.banned) {
        logger.warn(`IP ${validatedIp} 已被封禁，拒绝检查访问密钥`, {
          reason: banStatus.reason,
          expiresAt: banStatus.expiresAt
        });
        return false;
      }

      if (mongoose.connection.readyState !== 1) {
        return false;
      }

      const doc = await AccessTokenModel.findOne({
        fingerprint: validatedFingerprint,
        ipAddress: validatedIp,
        expiresAt: { $gt: new Date() } // 确保未过期
      }).exec();

      return !!doc;
    } catch (error) {
      logger.error('检查访问密钥失败', error);
      return false;
    }
  }

  /**
   * 清理过期的访问密钥
   * @returns 清理的数量
   */
  public static async cleanupExpiredAccessTokens(): Promise<number> {
    try {
      if (mongoose.connection.readyState !== 1) {
        return 0;
      }

      const result = await AccessTokenModel.deleteMany({
        expiresAt: { $lt: new Date() }
      });

      if (result.deletedCount > 0) {
        logger.info(`清理了 ${result.deletedCount} 个过期访问密钥`);
      }

      return result.deletedCount;
    } catch (error) {
      logger.error('清理过期访问密钥失败', error);
      return 0;
    }
  }

  /**
   * 获取访问密钥统计信息
   * @returns 统计信息
   */
  public static async getAccessTokenStats(): Promise<{
    total: number;
    valid: number;
    expired: number;
  }> {
    try {
      if (mongoose.connection.readyState !== 1) {
        return { total: 0, valid: 0, expired: 0 };
      }

      const now = new Date();
      const [total, valid, expired] = await Promise.all([
        AccessTokenModel.countDocuments(),
        AccessTokenModel.countDocuments({ expiresAt: { $gt: now } }),
        AccessTokenModel.countDocuments({ expiresAt: { $lte: now } })
      ]);

      return { total, valid, expired };
    } catch (error) {
      logger.error('获取访问密钥统计失败', error);
      return { total: 0, valid: 0, expired: 0 };
    }
  }

  // ==================== IP封禁管理 ====================

  /**
   * 清理过期的IP封禁记录
   * @returns 清理的数量
   */
  public static async cleanupExpiredIpBans(): Promise<number> {
    try {
      if (mongoose.connection.readyState !== 1) {
        return 0;
      }

      const result = await IpBanModel.deleteMany({
        expiresAt: { $lt: new Date() }
      });

      if (result.deletedCount > 0) {
        logger.info(`清理了 ${result.deletedCount} 条过期IP封禁记录`);
      }

      return result.deletedCount;
    } catch (error) {
      logger.error('清理过期IP封禁记录失败', error);
      return 0;
    }
  }

  /**
   * 获取IP封禁统计信息
   * @returns 统计信息
   */
  public static async getIpBanStats(): Promise<{
    total: number;
    active: number;
    expired: number;
  }> {
    try {
      if (mongoose.connection.readyState !== 1) {
        return { total: 0, active: 0, expired: 0 };
      }

      const now = new Date();
      const [total, active, expired] = await Promise.all([
        IpBanModel.countDocuments(),
        IpBanModel.countDocuments({ expiresAt: { $gt: now } }),
        IpBanModel.countDocuments({ expiresAt: { $lte: now } })
      ]);

      return { total, active, expired };
    } catch (error) {
      logger.error('获取IP封禁统计失败', error);
      return { total: 0, active: 0, expired: 0 };
    }
  }

  /**
   * 手动封禁IP地址
   * @param ipAddress IP地址
   * @param reason 封禁原因
   * @param durationMinutes 封禁时长（分钟）
   * @param fingerprint 用户指纹（可选）
   * @param userAgent 用户代理（可选）
   * @returns 封禁结果
   */
  public static async manualBanIp(
    ipAddress: string,
    reason: string,
    durationMinutes: number = 60,
    fingerprint?: string,
    userAgent?: string
  ): Promise<{
    success: boolean;
    error?: string;
    expiresAt?: Date;
    bannedAt?: Date;
  }> {
    try {
      const validatedIp = validateIpAddress(ipAddress);
      if (!validatedIp) {
        return {
          success: false,
          error: 'IP地址格式无效'
        };
      }

      const sanitizedReason = sanitizeString(reason, 500);
      if (!sanitizedReason) {
        return {
          success: false,
          error: '封禁原因无效'
        };
      }

      // 验证封禁时长
      let validDuration = 60; // 默认60分钟

      if (durationMinutes !== undefined && durationMinutes !== null) {
        // 确保是数字类型
        const duration = Number(durationMinutes);

        // 检查是否为有效数字
        if (isNaN(duration) || !isFinite(duration)) {
          return {
            success: false,
            error: '封禁时长必须是有效的数字'
          };
        }

        // 设置合理的范围：1分钟到24小时（1440分钟）
        validDuration = Math.min(Math.max(duration, 1), 24 * 60);
      }

      if (mongoose.connection.readyState !== 1) {
        return {
          success: false,
          error: '数据库连接不可用'
        };
      }

      const now = new Date();
      const expiresAt = new Date(now.getTime() + validDuration * 60 * 1000);

      // 检查IP是否已经被封禁
      const existingBan = await IpBanModel.findOne({ ipAddress: validatedIp });

      if (existingBan) {
        // 如果IP已被封禁，更新过期时间和封禁原因
        existingBan.expiresAt = expiresAt;
        existingBan.reason = sanitizedReason;

        // 如果提供了新的指纹或用户代理，也更新它们
        if (fingerprint) {
          const sanitizedFingerprint = sanitizeString(fingerprint, 200);
          if (sanitizedFingerprint) {
            existingBan.fingerprint = sanitizedFingerprint;
          }
        }
        if (userAgent) {
          const sanitizedUserAgent = sanitizeString(userAgent, 500);
          if (sanitizedUserAgent) {
            existingBan.userAgent = sanitizedUserAgent;
          }
        }

        await existingBan.save();

        logger.info(`更新IP封禁: ${validatedIp}, 原因: ${sanitizedReason}, 新过期时间: ${expiresAt}`);

        return {
          success: true,
          expiresAt: expiresAt,
          bannedAt: existingBan.bannedAt
        };
      }

      // 创建新的封禁记录
      const banRecord = new IpBanModel({
        ipAddress: validatedIp,
        reason: sanitizedReason,
        violationCount: 1,
        bannedAt: now,
        expiresAt: expiresAt,
        fingerprint: fingerprint ? sanitizeString(fingerprint, 200) : undefined,
        userAgent: userAgent ? sanitizeString(userAgent, 500) : undefined
      });

      await banRecord.save();

      logger.info(`手动封禁IP: ${validatedIp}, 原因: ${sanitizedReason}, 时长: ${validDuration}分钟`);

      return {
        success: true,
        expiresAt: expiresAt,
        bannedAt: now
      };
    } catch (error) {
      logger.error('手动封禁IP失败', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : '未知错误'
      };
    }
  }

  /**
   * 手动解除IP封禁
   * @param ipAddress IP地址
   * @returns 是否成功
   */
  public static async unbanIp(ipAddress: string): Promise<boolean> {
    try {
      const validatedIp = validateIpAddress(ipAddress);
      if (!validatedIp) {
        return false;
      }

      if (mongoose.connection.readyState !== 1) {
        return false;
      }

      const result = await IpBanModel.deleteOne({ ipAddress: validatedIp });

      if (result.deletedCount > 0) {
        logger.info(`手动解除IP封禁: ${validatedIp}`);
        return true;
      }

      return false;
    } catch (error) {
      logger.error('手动解除IP封禁失败', error);
      return false;
    }
  }
} 