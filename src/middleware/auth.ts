import { Request, Response, NextFunction } from 'express';
import config from '../config';

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({ error: '未提供认证信息' });
  }

  const [type, token] = authHeader.split(' ');

  if (type !== 'Bearer' || token !== config.server.password) {
    return res.status(401).json({ error: '认证失败' });
  }

  next();
} 