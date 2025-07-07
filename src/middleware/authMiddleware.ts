import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/config';
import { UserStorage } from '../utils/userStorage';
import logger from '../utils/logger';
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

export const authMiddleware = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const token = req.headers.authorization?.replace('Bearer ', '');
        
        if (!token) {
            return res.status(401).json({ error: '未提供认证令牌' });
        }

        try {
            // 首先尝试作为JWT令牌验证
            try {
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
                return;
            } catch (jwtError) {
                // 如果不是JWT格式，尝试作为用户ID处理
                if (jwtError instanceof jwt.JsonWebTokenError) {
                    // 尝试将token作为用户ID处理
                    const user = await UserStorage.getUserById(token);
                    if (!user) {
                        return res.status(401).json({ error: '用户不存在' });
                    }

                    // 检查token是否过期（从users.json文件中读取）
                    try {
                        const USERS_FILE = path.join(process.cwd(), 'data', 'users.json');
                        if (fs.existsSync(USERS_FILE)) {
                            const data = await fs.promises.readFile(USERS_FILE, 'utf-8');
                            const users = JSON.parse(data);
                            const userWithToken = users.find((u: any) => u.id === user.id);
                            if (userWithToken && userWithToken.tokenExpiresAt && Date.now() > userWithToken.tokenExpiresAt) {
                                return res.status(401).json({ error: '认证令牌已过期' });
                            }
                        }
                    } catch (error) {
                        // 如果读取token过期时间失败，继续执行
                        logger.warn('读取token过期时间失败:', error);
                    }

                    // 将用户信息添加到请求对象
                    req.user = {
                        id: user.id,
                        username: user.username,
                        role: user.role
                    };

                    next();
                    return;
                }
                throw jwtError;
            }
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