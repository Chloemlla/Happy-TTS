import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/config';
import { UserStorage } from '../utils/userStorage';
import logger from '../utils/logger';

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

export const authMiddleware = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const token = req.headers.authorization?.replace('Bearer ', '');
        
        if (!token) {
            return res.status(401).json({ error: '未提供认证令牌' });
        }

        try {
            // 验证JWT令牌
            const decoded = jwt.verify(token, config.jwtSecret) as {
                userId: string;
                username: string;
            };

            // 获取用户信息
            const user = await UserStorage.getUserById(decoded.userId);
            if (!user) {
                return res.status(401).json({ error: '用户不存在' });
            }

            // 将用户信息添加到请求对象
            req.user = {
                id: user.id,
                username: user.username,
                role: user.role
            };

            next();
        } catch (error) {
            if (error instanceof jwt.TokenExpiredError) {
                return res.status(401).json({ error: '认证令牌已过期' });
            }
            if (error instanceof jwt.JsonWebTokenError) {
                return res.status(401).json({ error: '无效的认证令牌' });
            }
            throw error;
        }
    } catch (error) {
        logger.error('认证中间件错误:', error);
        res.status(500).json({ error: '认证失败' });
    }
}; 