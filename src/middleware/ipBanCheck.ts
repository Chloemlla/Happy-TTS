import { Request, Response, NextFunction } from 'express';
import { IpBanModel } from '../models/ipBanModel';
import logger from '../utils/logger';
import { config } from '../config/config';

// 白名单路径 - 这些路径不进行IP封禁检查
const WHITELIST_PATHS = [
  '/health',
  '/api/health',
  '/status',
  '/api/status'
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
      logger.warn(`🚫 封禁IP尝试访问: ${normalizedIP}, 原因: ${bannedInfo.reason}, 到期时间: ${bannedInfo.expiresAt}`);
      
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
