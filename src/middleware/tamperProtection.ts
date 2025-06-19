import { Request, Response, NextFunction } from 'express';
import { tamperService } from '../services/tamperService';
import logger from '../utils/logger';

export async function tamperProtectionMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const ip = req.ip || req.connection.remoteAddress || 'unknown';
  
  // 检查 IP 是否被封禁
  if (tamperService.isIPBlocked(ip)) {
    const details = tamperService.getBlockDetails(ip);
    logger.warn(`Blocked IP ${ip} attempted to access the site`);
    return res.status(403).json({
      error: '访问被拒绝',
      reason: details?.reason || '您的 IP 已被封禁',
      expiresAt: details?.expiresAt
    });
  }

  // 继续处理请求
  next();
} 