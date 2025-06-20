import { Request, Response } from 'express';
import { UserStorage, User } from '../utils/userStorage';
import logger from '../utils/logger';
import { config } from '../config/config';

export class AuthController {
    private static isLocalIp(ip: string): boolean {
        return config.localIps.includes(ip);
    }

    public static async register(req: Request, res: Response) {
        try {
            const { username, email, password } = req.body;

            if (!username || !email || !password) {
                return res.status(400).json({
                    error: '请提供所有必需的注册信息'
                });
            }

            // 验证邮箱格式
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(email)) {
                return res.status(400).json({
                    error: '邮箱格式不正确'
                });
            }

            const user = await UserStorage.createUser(username, email, password);
            if (!user) {
                return res.status(400).json({
                    error: '用户名或邮箱已被使用'
                });
            }

            // 不返回密码
            const { password: _, ...userWithoutPassword } = user;
            res.status(201).json(userWithoutPassword);
        } catch (error) {
            logger.error('注册失败:', error);
            res.status(500).json({ error: '注册失败' });
        }
    }

    public static async login(req: Request, res: Response) {
        try {
            const { identifier, password } = req.body;
            const ip = req.ip || 'unknown';
            const userAgent = req.headers['user-agent'] || 'unknown';

            const logDetails = {
                identifier,
                ip,
                userAgent,
                timestamp: new Date().toISOString()
            };

            // 检查是否是本地 IP
            if (AuthController.isLocalIp(ip)) {
                logger.info('本地 IP 访问，自动登录管理员账户', logDetails);
                const adminUser = await UserStorage.getUserById('1');
                if (!adminUser) {
                    logger.error('管理员账户不存在，无法自动登录', logDetails);
                    return res.status(500).json({ error: '管理员账户不存在' });
                }
                const { password: _, ...userWithoutPassword } = adminUser;
                return res.json({
                    user: userWithoutPassword,
                    token: adminUser.id // 使用用户 ID 作为 token
                });
            }

            if (!identifier || !password) {
                return res.status(400).json({ error: '请提供登录信息' });
            }

            logger.info('登录尝试', logDetails);

            // 使用 UserStorage 进行认证
            const user = await UserStorage.authenticateUser(identifier, password);

            if (!user) {
                // 为了确定失败的具体原因，我们再次查找用户
                const allUsers = await UserStorage.getAllUsers();
                const userExists = allUsers.some(u => u.username === identifier || u.email === identifier);

                if (!userExists) {
                    logger.warn('登录失败：用户不存在', logDetails);
                } else {
                    logger.warn('登录失败：密码错误', logDetails);
                }
                
                return res.status(401).json({ error: '用户名/邮箱或密码错误' });
            }

            // 记录登录成功
            logger.info('登录成功', {
                userId: user.id,
                username: user.username,
                ...logDetails
            });

            // 不返回密码
            const { password: _, ...userWithoutPassword } = user;
            res.json({
                user: userWithoutPassword,
                token: user.id // 使用用户 ID 作为 token
            });
        } catch (error) {
            logger.error('登录流程发生未知错误', {
                error: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : undefined,
                identifier: req.body.identifier,
                ip: req.ip
            });
            res.status(500).json({ error: '登录失败' });
        }
    }

    public static async getCurrentUser(req: Request, res: Response) {
        try {
            const ip = req.ip || 'unknown';
            const authHeader = req.headers.authorization;

            // 检查是否是本地 IP
            if (AuthController.isLocalIp(ip)) {
                logger.info('本地 IP 访问，自动获取管理员信息', {
                    ip,
                    timestamp: new Date().toISOString()
                });

                const adminUser = await UserStorage.getUserById('1');
                if (!adminUser) {
                    return res.status(500).json({
                        error: '管理员账户不存在'
                    });
                }

                const remainingUsage = await UserStorage.getRemainingUsage(adminUser.id);
                const { password: _, ...userWithoutPassword } = adminUser;

                res.json({
                    ...userWithoutPassword,
                    remainingUsage
                });
                return;
            }

            if (!authHeader || !authHeader.startsWith('Bearer ')) {
                return res.status(401).json({
                    error: '未登录'
                });
            }

            const token = authHeader.split(' ')[1];
            if (!token) {
                return res.status(401).json({
                    error: '无效的认证令牌'
                });
            }

            // 从 token 中获取用户 ID
            const userId = token; // 这里简化处理，实际应该解析 JWT token
            const user = await UserStorage.getUserById(userId);
            if (!user) {
                return res.status(404).json({
                    error: '用户不存在'
                });
            }

            const remainingUsage = await UserStorage.getRemainingUsage(userId);
            const { password: _, ...userWithoutPassword } = user;

            res.json({
                ...userWithoutPassword,
                remainingUsage
            });
        } catch (error) {
            logger.error('获取用户信息失败:', error);
            res.status(500).json({ error: '获取用户信息失败' });
        }
    }
} 