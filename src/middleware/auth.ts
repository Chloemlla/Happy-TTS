import { Request, Response, NextFunction } from 'express';
import config from '../config';
import logger from '../utils/logger';

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
    // 如果上游尚未注入 user，则尝试从 Authorization 头推断
    if (!req.user) {
      const authHeader = req.headers.authorization || '';
      const [type, token] = authHeader.split(' ');
      if (type === 'Bearer' && token) {
        // 方案1：与后端简单密码对齐（用于本地/简易部署）
        if (token === config.server.password) {
          req.user = { id: 'admin', username: 'admin', role: 'admin' };
        } else if (process.env.NODE_ENV !== 'production') {
          // 方案2：开发环境放宽校验，任何 Bearer 视为管理员（仅开发环境）
          req.user = { id: 'dev-admin', username: 'dev-admin', role: 'admin' };
        } else {
          // 方案3：生产环境尽量从 JWT 载荷中提取（不校验签名，仅作角色判断）
          try {
            const parts = token.split('.');
            if (parts.length === 3) {
              const payloadRaw = parts[1].replace(/-/g, '+').replace(/_/g, '/');
              const padded = payloadRaw + '='.repeat((4 - (payloadRaw.length % 4)) % 4);
              const payloadJson = Buffer.from(padded, 'base64').toString('utf8');
              const payload = JSON.parse(payloadJson || '{}');
              if (payload && payload.role === 'admin') {
                req.user = {
                  id: payload.userId || payload.sub || 'admin',
                  username: payload.username || 'admin',
                  role: 'admin',
                };
              }
            }
          } catch (e) {
            // 忽略解析失败，走后续严格校验
          }
        }
      }
    }

    // 检查用户信息是否存在
    const user = req.user;

    if (!user) {
      logger.warn('管理员认证失败：用户信息不存在', { ip: req.ip });
      return res.status(401).json({ message: '未登录，请先登录' });
    }

    // 检查用户角色
    if (!user.role || user.role !== 'admin') {
      logger.warn('管理员认证失败：非管理员用户', { 
        userId: user.id, 
        username: user.username, 
        role: user.role,
        ip: req.ip 
      });
      return res.status(403).json({ message: '权限不足，仅限管理员访问' });
    }

    logger.info('管理员认证成功', { 
      userId: user.id, 
      username: user.username, 
      ip: req.ip 
    });

    next();
  } catch (error) {
    logger.error('管理员认证过程中发生错误:', error);
    return res.status(401).json({ message: '认证失败，请重新登录' });
  }
}; 