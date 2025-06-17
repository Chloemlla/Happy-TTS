import { Request, Response, NextFunction } from 'express';
import { getIPInfo, isIPAllowed } from '../services/ip';
import { logger } from '../services/logger';

export async function ipCheckMiddleware(req: Request, res: Response, next: NextFunction) {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';

  try {
    const ipInfo = await getIPInfo(ip);
    logger.log('IP info', { ip, ipInfo });

    if (!isIPAllowed(ip)) {
      logger.log('IP not allowed', { ip, ipInfo });
      return res.status(403).json({ error: '您的 IP 地址未被允许访问此服务' });
    }

    next();
  } catch (error) {
    logger.error('IP check failed', error);
    return res.status(500).json({ error: 'IP 检查失败' });
  }
} 