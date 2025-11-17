import { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { IpBanModel } from '../models/ipBanModel';
import logger from '../utils/logger';
import { config } from '../config/config';

// IP 封禁检查速率限制器 - 防止恶意 IP 频繁查询封禁状态
const ipBanCheckLimiter = rateLimit({
  windowMs: 60 * 1000, // 1分钟
  max: 100, // 每分钟最多100次请求
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // 只计算被拒绝的请求
  keyGenerator: (req: Request) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    return ip.replace(/^::ffff:/, '');
  },
  handler: (req: Request, res: Response) => {
    logger.warn(`⚠️ IP 封禁检查速率限制触发: ${req.ip}`);
    res.status(429).json({
      error: '请求过于频繁，请稍后再试',
      retryAfter: 60
    });
  }
});

// 白名单路径 - 这些路径不进行IP封禁检查
const WHITELIST_PATHS = [
  '/health',
  '/api/health',
  '/status',
  '/api/status',
  // 人机验证相关端点 - 必须放行以允许验证流程
  '/api/turnstile/verify',
  '/api/turnstile/verify-token',
  '/api/turnstile/public-turnstile',
  '/api/turnstile/public-config',
  '/api/turnstile/hcaptcha-verify',
  '/api/turnstile/secure-captcha-config',
  // 指纹相关端点（包括认证和非认证）
  '/api/turnstile/fingerprint/report',
  '/api/turnstile/fingerprint/status',
  '/api/turnstile/fingerprint/dismiss',
  '/api/turnstile/temp-fingerprint',
  '/api/turnstile/verify-temp-fingerprint',
  '/api/turnstile/verify-access-token',
  // 访问令牌和指纹状态查询
  '/api/turnstile/check-access-token',
  '/api/turnstile/temp-fingerprint'
];

/**
 * IP封禁检查中间件
 * 检查请求IP是否在封禁列表中，如果是则直接拒绝请求
 */
export const ipBanCheckMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // 检查是否是白名单路径
    if (WHITELIST_PATHS.some(path => req.path === path || req.path.startsWith(path))) {
      next();
      return;
    }
    // 获取客户端IP
    const clientIP = req.ip || 
                     req.headers['x-forwarded-for'] as string || 
                     req.headers['x-real-ip'] as string ||
                     req.socket.remoteAddress || 
                     'unknown';

    // 处理IPv6映射的IPv4地址 (::ffff:192.168.1.1 -> 192.168.1.1)
    const normalizedIP = clientIP.replace(/^::ffff:/, '');

    // 根据配置选择存储方式检查IP封禁
    let bannedInfo: { reason: string; expiresAt: Date | number } | null = null;

    if (config.ipBanStorage === 'redis') {
      // 优先使用 Redis 检查（如果配置了）
      try {
        const { redisService } = await import('../services/redisService');
        const redisBan = await redisService.checkIPBan(normalizedIP);
        if (redisBan) {
          bannedInfo = {
            reason: redisBan.reason,
            expiresAt: new Date(redisBan.expiresAt)
          };
        }
      } catch (error) {
        // Redis 检查失败，降级到 MongoDB
        logger.warn('Redis 检查失败，降级到 MongoDB:', error);
      }
    }

    // 如果 Redis 未配置或检查失败，使用 MongoDB
    if (!bannedInfo) {
      const bannedIP = await IpBanModel.findOne({
        ipAddress: normalizedIP,
        expiresAt: { $gt: new Date() } // 只查询未过期的封禁记录
      });

      if (bannedIP) {
        bannedInfo = {
          reason: bannedIP.reason,
          expiresAt: bannedIP.expiresAt
        };
      }
    }

    // 如果IP被封禁，拒绝请求
    if (bannedInfo) {
      logger.warn(
        `🚫 封禁IP尝试访问: ${normalizedIP}, ` +
        `路径: ${req.method} ${req.path}, ` +
        `原因: ${bannedInfo.reason}, ` +
        `到期时间: ${bannedInfo.expiresAt}`
      );
      
      res.status(403).json({
        error: '您的IP地址已被封禁，无法访问此服务',
        reason: bannedInfo.reason,
        expiresAt: bannedInfo.expiresAt
      });
      return;
    }

    // IP未被封禁，继续处理请求
    next();
  } catch (error) {
    // 发生错误时记录日志，但不阻止请求（避免因检查失败导致服务不可用）
    logger.error('IP封禁检查失败:', error);
    next();
  }
};

/**
 * 带速率限制的 IP 封禁检查中间件（推荐使用）
 * 组合了速率限制和 IP 封禁检查，提供更好的安全保护
 */
export const ipBanCheckWithRateLimit = [ipBanCheckLimiter, ipBanCheckMiddleware];
