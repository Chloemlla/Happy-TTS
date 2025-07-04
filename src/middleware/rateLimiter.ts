import rateLimit from 'express-rate-limit';
import { config } from '../config/config';
import logger from '../utils/logger';
import { Request, Response } from 'express';

// IP白名单配置
const whitelistedIPs = new Set<string>([
    ...(config.localIps || []),
    // 可以从配置文件添加更多白名单IP
]);

// 检查IP是否在白名单中
const isWhitelisted = (ip: string): boolean => {
    const localIps = config.localIps || [];
    return whitelistedIPs.has(ip) || localIps.some((pattern: string | RegExp) => {
        if (typeof pattern === 'string') return ip === pattern;
        if (pattern instanceof RegExp) return pattern.test(ip);
        return false;
    });
};

// 创建基础速率限制器
export const createLimiter = (options: {
    windowMs?: number;
    max?: number;
    message?: string;
    routeName?: string; // 添加路由名称用于日志
}) => {
    const windowMs = options.windowMs || 15 * 60 * 1000; // 默认15分钟
    const routeName = options.routeName || '未知路由';

    return rateLimit({
        windowMs: windowMs,
        max: options.max || 100, // 默认限制100次
        message: {
            error: options.message || '请求过于频繁，请稍后再试',
            retryAfter: windowMs / 1000, // 添加重试时间（秒）
            routeName: routeName // 添加路由信息
        },
        standardHeaders: true, // 返回 RateLimit-* 头
        legacyHeaders: false,
        skip: (req: Request): boolean => {
            const ip = req.ip || req.socket.remoteAddress || 'unknown';
            return isWhitelisted(ip);
        },
        handler: (req: Request, res: Response) => {
            const ip = req.ip || req.socket.remoteAddress || 'unknown';
            logger.warn(`速率限制超出: ${routeName} - IP: ${ip} - ${req.method} ${req.url}`, {
                ip,
                route: routeName,
                method: req.method,
                url: req.url,
                headers: req.headers,
                timestamp: new Date().toISOString()
            });
            res.status(429).json({
                error: options.message || '请求过于频繁，请稍后再试',
                retryAfter: windowMs / 1000,
                routeName: routeName
            });
        },
        keyGenerator: (req: Request): string => {
            return req.ip || req.socket.remoteAddress || 'unknown';
        }
    });
};

// Passkey相关的速率限制器
export const passkeyLimiter = {
    // 获取认证器列表
    credentials: createLimiter({
        windowMs: 1 * 60 * 1000, // 1分钟
        max: 30,
        routeName: 'passkey.credentials',
        message: 'Passkey凭证请求过于频繁，请稍后再试'
    }),

    // 注册开始
    registerStart: createLimiter({
        windowMs: 5 * 60 * 1000, // 5分钟
        max: 10,
        routeName: 'passkey.registerStart',
        message: 'Passkey注册请求过于频繁，请稍后再试'
    }),

    // 注册完成
    registerFinish: createLimiter({
        windowMs: 5 * 60 * 1000, // 5分钟
        max: 10,
        routeName: 'passkey.registerFinish',
        message: 'Passkey注册完成请求过于频繁，请稍后再试'
    }),

    // 认证开始
    authenticateStart: createLimiter({
        windowMs: 1 * 60 * 1000, // 1分钟
        max: 20,
        routeName: 'passkey.authenticateStart',
        message: 'Passkey认证请求过于频繁，请稍后再试'
    }),

    // 认证完成
    authenticateFinish: createLimiter({
        windowMs: 1 * 60 * 1000, // 1分钟
        max: 20,
        routeName: 'passkey.authenticateFinish',
        message: 'Passkey认证完成请求过于频繁，请稍后再试'
    }),

    // 删除认证器
    removeCredential: createLimiter({
        windowMs: 5 * 60 * 1000, // 5分钟
        max: 10,
        routeName: 'passkey.removeCredential',
        message: 'Passkey凭证删除请求过于频繁，请稍后再试'
    }),
};

// TOTP相关的速率限制器
export const totpLimiter = {
    // 获取状态
    status: createLimiter({
        windowMs: 1 * 60 * 1000, // 1分钟
        max: 30,
        routeName: 'totp.status',
        message: 'TOTP状态查询过于频繁，请稍后再试'
    }),

    // 生成设置
    generateSetup: createLimiter({
        windowMs: 5 * 60 * 1000, // 5分钟
        max: 5,
        routeName: 'totp.generateSetup',
        message: 'TOTP设置生成请求过于频繁，请稍后再试'
    }),

    // 验证并启用
    verifyAndEnable: createLimiter({
        windowMs: 5 * 60 * 1000, // 5分钟
        max: 10,
        routeName: 'totp.verifyAndEnable',
        message: 'TOTP验证请求过于频繁，请稍后再试'
    }),

    // 验证令牌
    verifyToken: createLimiter({
        windowMs: 5 * 60 * 1000, // 5分钟
        max: 10,
        routeName: 'totp.verifyToken',
        message: 'TOTP令牌验证请求过于频繁，请稍后再试'
    }),

    // 禁用TOTP
    disable: createLimiter({
        windowMs: 5 * 60 * 1000, // 5分钟
        max: 5,
        routeName: 'totp.disable',
        message: 'TOTP禁用请求过于频繁，请稍后再试'
    }),
};

// API相关的速率限制器
export const apiLimiter = {
    // TTS生成
    ttsGenerate: createLimiter({
        windowMs: 1 * 60 * 1000, // 1分钟
        max: 10,
        routeName: 'api.ttsGenerate',
        message: 'TTS生成请求过于频繁，请稍后再试'
    }),

    // 用户管理
    userManagement: createLimiter({
        windowMs: 5 * 60 * 1000, // 5分钟
        max: 50,
        routeName: 'api.userManagement',
        message: '用户管理操作过于频繁，请稍后再试'
    }),
}; 