import { Request, Response, NextFunction } from 'express';
import { rateLimiter } from '../services/rateLimiter';
import { logger } from '../services/logger';

export async function rateLimitMiddleware(req: Request, res: Response, next: NextFunction) {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';

  const limited = await rateLimiter.isRateLimited(ip);
  if (limited) {
    logger.log('Rate limit exceeded', { ip });
    return res.status(429).json({ error: '请求过于频繁，请稍后再试' });
  }

  next();
} 