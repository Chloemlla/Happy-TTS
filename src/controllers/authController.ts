import { Request, Response } from 'express';
import { UserStorage, User } from '../utils/userStorage';
import logger from '../utils/logger';
import { config } from '../config/config';
import fs from 'fs';
import path from 'path';

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
            const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
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
            // 记录收到的请求体
            logger.info('收到登录请求', {
                body: req.body,
                headers: req.headers,
                ip: req.ip,
                timestamp: new Date().toISOString()
            });

            const { identifier, password } = req.body;
            const ip = req.ip || 'unknown';
            const userAgent = req.headers['user-agent'] || 'unknown';

            // 验证必填字段
            if (!identifier) {
                logger.warn('登录失败：identifier 字段缺失', { body: req.body });
                return res.status(400).json({ error: '请提供用户名或邮箱' });
            }
            if (!password) {
                logger.warn('登录失败：password 字段缺失', { body: req.body });
                return res.status(400).json({ error: '请提供密码' });
            }

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
                // 生成token（用id即可）
                const token = adminUser.id;
                // 写入token到users.json
                updateUserToken(adminUser.id, token);
                const { password: _, ...userWithoutPassword } = adminUser;
                return res.json({
                    user: userWithoutPassword,
                    token
                });
            }

            logger.info('开始用户认证', logDetails);

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

            // 检查用户是否启用了TOTP或Passkey
            const hasTOTP = !!user.totpEnabled;
            const hasPasskey = Array.isArray(user.passkeyCredentials) && user.passkeyCredentials.length > 0;
            if (hasTOTP || hasPasskey) {
                // 兜底：只返回临时token和二次验证类型，禁止直接登录
                // 必须通过TOTP或Passkey二次验证接口后，才发放正式token
                const tempToken = user.id;
                updateUserToken(user.id, tempToken, 5 * 60 * 1000); // 5分钟过期
                const { password: _, ...userWithoutPassword } = user;
                return res.json({
                    user: userWithoutPassword,
                    token: tempToken,
                    requires2FA: true,
                    twoFactorType: [hasTOTP ? 'TOTP' : null, hasPasskey ? 'Passkey' : null].filter(Boolean)
                });
            }

            // 记录登录成功
            logger.info('登录成功', {
                userId: user.id,
                username: user.username,
                ...logDetails
            });

            // 生成token（用id即可）
            const token = user.id;
            // 写入token到users.json
            updateUserToken(user.id, token);
            // 不返回密码
            const { password: _, ...userWithoutPassword } = user;
            res.json({
                user: userWithoutPassword,
                token
            });
        } catch (error) {
            logger.error('登录流程发生未知错误', {
                error: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : undefined,
                identifier: req.body?.identifier,
                ip: req.ip,
                body: req.body
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

// 辅助函数：写入token和过期时间到users.json
function updateUserToken(userId: string, token: string, expiresInMs = 2 * 60 * 60 * 1000) {
    const USERS_FILE = path.join(process.cwd(), 'data', 'users.json');
    if (!fs.existsSync(USERS_FILE)) return;
    const users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8'));
    const idx = users.findIndex((u: any) => u.id === userId);
    if (idx !== -1) {
        users[idx].token = token;
        users[idx].tokenExpiresAt = Date.now() + expiresInMs;
        fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
    }
}

// 校验token及过期
export function isAdminToken(token: string | undefined): boolean {
    const USERS_FILE = path.join(process.cwd(), 'data', 'users.json');
    if (!fs.existsSync(USERS_FILE)) return false;
    const users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8'));
    const user = users.find((u: any) => u.role === 'admin' && u.token === token);
    if (!user) return false;
    if (!user.tokenExpiresAt || Date.now() > user.tokenExpiresAt) return false;
    return true;
}

// 登出接口
export function registerLogoutRoute(app: any) {
    app.post('/api/auth/logout', (req: Request, res: Response) => {
        const token = req.headers.authorization?.replace('Bearer ', '');
        const USERS_FILE = path.join(process.cwd(), 'data', 'users.json');
        if (!fs.existsSync(USERS_FILE)) return res.status(500).json({ error: '用户数据不存在' });
        const users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8'));
        const idx = users.findIndex((u: any) => u.token === token);
        if (idx !== -1) {
            users[idx].token = undefined;
            users[idx].tokenExpiresAt = undefined;
            fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
        }
        res.json({ success: true });
    });
} 