import { Request, Response, NextFunction } from 'express';
import { UserStorage } from '../utils/userStorage';
import { config } from '../config/config';
import logger from '../utils/logger';
import jwt from 'jsonwebtoken';

export const authenticateToken = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const authHeader = req.headers.authorization;
        const ip = req.ip || 'unknown';

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: '未授权' });
        }

        const token = authHeader.split(' ')[1];
        if (!token) {
            return res.status(401).json({ error: '无效的Token' });
        }

        // 尝试解析 JWT，获取 userId
        let userId: string;
        try {
            const decoded: any = jwt.verify(token, config.jwtSecret);
            userId = decoded.userId;
        } catch (err) {
            // 如果JWT验证失败，尝试将token作为用户ID直接使用
            // 这是为了兼容登录时返回用户ID作为token的情况
            try {
                // 验证用户ID是否存在
                const user = await UserStorage.getUserById(token);
                if (user) {
                    userId = token;
                } else {
                    return res.status(401).json({ error: 'Token 无效或已过期' });
                }
            } catch (userError) {
                return res.status(401).json({ error: 'Token 无效或已过期' });
            }
        }

        if (!userId) {
            return res.status(401).json({ error: 'Token 无 userId' });
        }

        const user = await UserStorage.getUserById(userId);

        if (!user) {
            return res.status(403).json({ error: '无效的Token' });
        }

        // @ts-ignore
        req.user = user;
        next();
    } catch (error) {
        logger.error('Token 认证失败:', error);
        res.status(401).json({ error: '认证失败' });
    }
}; 