import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/config';
import { UserStorage } from '../utils/userStorage';
import { safeLog } from '../utils/logger';
import fs from 'fs';
import path from 'path';

// 扩展Request类型以包含用户信息
declare global {
    namespace Express {
        interface Request {
            user?: {
                id: string;
                username: string;
                role: string;
            };
        }
    }
}

// 登录尝试记录
const loginAttempts = new Map<string, { count: number; lastAttempt: number; blockedUntil?: number }>();

// 检查登录尝试限制
const checkLoginAttempts = (identifier: string): boolean => {
  const attempts = loginAttempts.get(identifier);
  if (!attempts) return true;
  
  const now = Date.now();
  
  // 检查是否被阻止
  if (attempts.blockedUntil && now < attempts.blockedUntil) {
    return false;
  }
  
  // 重置超过15分钟的尝试记录
  if (now - attempts.lastAttempt > 15 * 60 * 1000) {
    loginAttempts.delete(identifier);
    return true;
  }
  
  return attempts.count < 5;
};

// 记录登录尝试
const recordLoginAttempt = (identifier: string, success: boolean) => {
  const attempts = loginAttempts.get(identifier) || { count: 0, lastAttempt: 0 };
  
  if (success) {
    loginAttempts.delete(identifier);
  } else {
    attempts.count++;
    attempts.lastAttempt = Date.now();
    
    // 超过5次失败，阻止15分钟
    if (attempts.count >= 5) {
      attempts.blockedUntil = Date.now() + 15 * 60 * 1000;
    }
    
    loginAttempts.set(identifier, attempts);
  }
};

// 增强的认证中间件
export const authMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ error: '未提供认证令牌' });
    }
    
    // 验证JWT令牌
    const decoded = jwt.verify(token, config.jwtSecret) as any;
    
    // 检查令牌是否过期
    if (decoded.exp && Date.now() >= decoded.exp * 1000) {
      return res.status(401).json({ error: '令牌已过期' });
    }
    
    // 获取用户信息
    const user = await UserStorage.getUserById(decoded.userId);
    if (!user) {
      return res.status(401).json({ error: '用户不存在' });
    }
    
    // 检查用户状态
    if ((user as any).disabled) {
      return res.status(403).json({ error: '账户已被禁用' });
    }
    
    // 添加用户信息到请求对象
    req.user = user;
    
    // 记录访问日志（脱敏）
    safeLog('info', `用户访问: ${user.username}`, { 
      path: req.path, 
      method: req.method, 
      ip: req.ip 
    });
    
    next();
  } catch (error: any) {
    if (error instanceof jwt.JsonWebTokenError) {
      return res.status(401).json({ error: '无效的认证令牌' });
    }
    if (error instanceof jwt.TokenExpiredError) {
      return res.status(401).json({ error: '令牌已过期' });
    }
    
    safeLog('error', '认证中间件错误', { error: error.message });
    return res.status(500).json({ error: '认证服务错误' });
  }
};

// 管理员权限检查中间件
export const adminAuthMiddleware = (req: Request, res: Response, next: NextFunction) => {
  if (!req.user) {
    return res.status(401).json({ error: '未认证' });
  }
  
  if (req.user.role !== 'admin') {
    safeLog('warn', '非管理员尝试访问管理员功能', { 
      username: req.user.username, 
      path: req.path 
    });
    return res.status(403).json({ error: '需要管理员权限' });
  }
  
  next();
};

export { checkLoginAttempts, recordLoginAttempt }; 