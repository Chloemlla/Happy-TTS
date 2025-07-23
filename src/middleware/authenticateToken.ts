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
        // 只支持JWT
        let userId: string;
        try {
            const decoded: any = jwt.verify(token, config.jwtSecret);
            userId = decoded.userId;
        } catch (err) {
            return res.status(401).json({ error: 'Token 无效或已过期' });
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