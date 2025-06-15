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

            // 检查是否是本地 IP
            if (AuthController.isLocalIp(ip)) {
                logger.info('本地 IP 访问，自动登录管理员账户', {
                    ip,
                    timestamp: new Date().toISOString()
                });

                // 获取管理员账户
                const adminUser = await UserStorage.getUserById('1');
                if (!adminUser) {
                    return res.status(500).json({
                        error: '管理员账户不存在'
                    });
                }

                // 不返回密码
                const { password: _, ...userWithoutPassword } = adminUser;
                res.json({
                    user: userWithoutPassword,
                    token: adminUser.id // 使用用户 ID 作为 token
                });
                return;
            }

            if (!identifier || !password) {
                return res.status(400).json({
                    error: '请提供登录信息'
                });
            }

            // 记录登录尝试
            logger.info('登录尝试', {
                identifier,
                timestamp: new Date().toISOString(),
                ip: req.ip,
                userAgent: req.headers['user-agent']
            });

            // 先查找用户是否存在
            const users = await UserStorage.getAllUsers();
            const user = users.find((u: User) => u.username === identifier || u.email === identifier);

            if (!user) {
                logger.warn('登录失败：用户不存在', {
                    identifier,
                    timestamp: new Date().toISOString(),
                    ip: req.ip,
                    userAgent: req.headers['user-agent']
                });
                return res.status(401).json({
                    error: '用户名/邮箱或密码错误'
                });
            }

            // 验证密码
            if (user.password !== password) {
                logger.warn('登录失败：密码错误', {
                    identifier,
                    timestamp: new Date().toISOString(),
                    ip: req.ip,
                    userAgent: req.headers['user-agent']
                });
                return res.status(401).json({
                    error: '用户名/邮箱或密码错误'
                });
            }

            // 记录登录成功
            logger.info('登录成功', {
                userId: user.id,
                username: user.username,
                email: user.email,
                role: user.role,
                timestamp: new Date().toISOString(),
                ip: req.ip,
                userAgent: req.headers['user-agent']
            });

            // 不返回密码
            const { password: _, ...userWithoutPassword } = user;
            res.json({
                user: userWithoutPassword,
                token: user.id // 使用用户 ID 作为 token
            });
        } catch (error) {
            logger.error('登录失败:', error);
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