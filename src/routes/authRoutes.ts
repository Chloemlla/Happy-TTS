import { Router } from 'express';
import { validateAuthInput } from '../middleware/inputValidation';
import rateLimiter from '../middleware/rateLimiter';
import logger from '../utils/logger';
import bcrypt from 'bcrypt';
import jwt, { SignOptions } from 'jsonwebtoken';
import { config } from '../config/config';
import prisma from '../lib/prisma';

const router = Router();

// 登录尝试限制
const loginLimiter = rateLimiter({
    windowMs: config.loginRateLimit.windowMs,
    max: config.loginRateLimit.max,
    message: '登录尝试次数过多，请15分钟后再试'
});

// 注册限制
const registerLimiter = rateLimiter({
    windowMs: config.registerRateLimit.windowMs,
    max: config.registerRateLimit.max,
    message: '注册尝试次数过多，请稍后再试'
});

// JWT 签名选项
const jwtSignOptions: SignOptions = {
    expiresIn: '24h'
};

// 注册路由
router.post('/register', registerLimiter, validateAuthInput, async (req, res) => {
    try {
        const { username, email, password } = req.body;

        // 检查用户是否已存在
        const existingUser = await prisma.user.findFirst({
            where: {
                OR: [
                    { username },
                    { email }
                ]
            }
        });

        if (existingUser) {
            return res.status(400).json({
                status: 'error',
                message: '用户名或邮箱已存在'
            });
        }

        // 密码加密
        const salt = await bcrypt.genSalt(config.bcryptSaltRounds);
        const hashedPassword = await bcrypt.hash(password, salt);

        // 创建用户
        const user = await prisma.user.create({
            data: {
                username,
                email,
                password: hashedPassword,
                salt
            }
        });

        // 生成 JWT token
        const token = jwt.sign(
            { id: user.id, username: user.username },
            config.jwtSecret,
            jwtSignOptions
        );

        // 记录成功日志
        logger.info('用户注册成功', {
            userId: user.id,
            username: user.username,
            timestamp: new Date().toISOString()
        });

        res.status(201).json({
            status: 'success',
            message: '注册成功',
            data: {
                token,
                user: {
                    id: user.id,
                    username: user.username,
                    email: user.email
                }
            }
        });
    } catch (error) {
        // 记录错误日志
        logger.error('注册失败', {
            error: error instanceof Error ? error.message : String(error),
            timestamp: new Date().toISOString()
        });

        res.status(500).json({
            status: 'error',
            message: '注册失败，请稍后重试'
        });
    }
});

// 登录路由
router.post('/login', loginLimiter, validateAuthInput, async (req, res) => {
    try {
        const { username, password } = req.body;

        // 查找用户
        const user = await prisma.user.findFirst({
            where: { username }
        });

        if (!user) {
            return res.status(401).json({
                status: 'error',
                message: '用户名或密码错误'
            });
        }

        // 验证密码
        const isValidPassword = await bcrypt.compare(password, user.password);
        if (!isValidPassword) {
            // 记录警告日志
            logger.warn('登录失败 - 密码错误', {
                username,
                timestamp: new Date().toISOString()
            });

            return res.status(401).json({
                status: 'error',
                message: '用户名或密码错误'
            });
        }

        // 生成新的 JWT token
        const token = jwt.sign(
            { id: user.id, username: user.username },
            config.jwtSecret,
            jwtSignOptions
        );

        // 记录成功日志
        logger.info('用户登录成功', {
            userId: user.id,
            username: user.username,
            timestamp: new Date().toISOString()
        });

        res.json({
            status: 'success',
            message: '登录成功',
            data: {
                token,
                user: {
                    id: user.id,
                    username: user.username,
                    email: user.email
                }
            }
        });
    } catch (error) {
        // 记录错误日志
        logger.error('登录失败', {
            error: error instanceof Error ? error.message : String(error),
            timestamp: new Date().toISOString()
        });

        res.status(500).json({
            status: 'error',
            message: '登录失败，请稍后重试'
        });
    }
});

// 获取当前用户信息
router.get('/me', async (req, res) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        
        if (!token) {
            return res.status(401).json({
                status: 'error',
                message: '未授权访问'
            });
        }

        const decoded = jwt.verify(token, config.jwtSecret) as { id: string };
        const user = await prisma.user.findUnique({
            where: { id: decoded.id },
            select: {
                id: true,
                username: true,
                email: true,
                createdAt: true
            }
        });

        if (!user) {
            return res.status(404).json({
                status: 'error',
                message: '用户不存在'
            });
        }

        res.json({
            status: 'success',
            data: { user }
        });
    } catch (error) {
        if (error instanceof jwt.JsonWebTokenError) {
            return res.status(401).json({
                status: 'error',
                message: '无效的token'
            });
        }
        
        // 记录错误日志
        logger.error('获取用户信息失败', {
            error: error instanceof Error ? error.message : String(error),
            timestamp: new Date().toISOString()
        });

        res.status(500).json({
            status: 'error',
            message: '获取用户信息失败'
        });
    }
});

export default router; 