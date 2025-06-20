import { Request, Response, NextFunction } from 'express';
import { UserStorage } from '../utils/userStorage';
import { config } from '../config/config';
import logger from '../utils/logger';

export const authenticateToken = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const authHeader = req.headers.authorization;
        const ip = req.ip || 'unknown';

        // 如果是本地 IP，则跳过验证，并附加管理员信息
        if (config.localIps.includes(ip)) {
            const adminUser = await UserStorage.getUserById('1');
            if (adminUser) {
                // @ts-ignore
                req.user = adminUser;
            }
            return next();
        }

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: '未授权' });
        }

        const token = authHeader.split(' ')[1];
        if (!token) {
            return res.status(401).json({ error: '无效的Token' });
        }

        // 在这个简单的系统中，token 就是 userId
        const user = await UserStorage.getUserById(token);

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