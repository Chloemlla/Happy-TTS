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

// 管理员认证中间件
export const authenticateAdmin = async (
  req: Request & { user?: any },
  res: Response,
  next: NextFunction
) => {
  try {
    // 使用现有的用户信息
    const user = req.user;

    if (!user) {
      return res.status(401).json({ message: '未登录' });
    }

    // 检查用户是否为管理员
    if (user.role !== 'admin') {
      return res.status(403).json({ message: '权限不足' });
    }

    next();
  } catch (error) {
    return res.status(401).json({ message: '认证失败' });
  }
}; 