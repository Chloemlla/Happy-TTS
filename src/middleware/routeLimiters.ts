import { Request } from 'express';
import rateLimit from 'express-rate-limit';

// 通用限流器配置生成函数
const createLimiter = (options: {
    windowMs: number;
    max: number;
    message: string;
}) => {
    return rateLimit({
        windowMs: options.windowMs,
        max: options.max,
        message: { error: options.message },
        standardHeaders: true,
        legacyHeaders: false,
        keyGenerator: (req: Request) => req.ip || req.socket.remoteAddress || 'unknown',
        skip: (req: Request): boolean => req.isLocalIp || false
    });
};

// 防篡改路由限流器
export const tamperLimiter = createLimiter({
    windowMs: 60 * 1000, // 1分钟
    max: 30, // 限制每个IP每分钟30次请求
    message: '防篡改验证请求过于频繁，请稍后再试'
});

// 命令路由限流器
export const commandLimiter = createLimiter({
    windowMs: 60 * 1000, // 1分钟
    max: 10, // 限制每个IP每分钟10次请求
    message: '命令执行请求过于频繁，请稍后再试'
});

// LibreChat路由限流器
export const libreChatLimiter = createLimiter({
    windowMs: 60 * 1000, // 1分钟
    max: 60, // 限制每个IP每分钟60次请求
    message: 'LibreChat请求过于频繁，请稍后再试'
});

// 数据收集路由限流器
export const dataCollectionLimiter = createLimiter({
    windowMs: 60 * 1000, // 1分钟
    max: 30, // 限制每个IP每分钟30次请求
    message: '数据收集请求过于频繁，请稍后再试'
});

// 日志路由限流器
export const logsLimiter = createLimiter({
    windowMs: 60 * 1000, // 1分钟
    max: 20, // 限制每个IP每分钟20次请求
    message: '日志请求过于频繁，请稍后再试'
});

// Passkey路由限流器
export const passkeyLimiter = createLimiter({
    windowMs: 5 * 60 * 1000, // 5分钟
    max: 30, // 限制每个IP每5分钟30次请求
    message: 'Passkey操作过于频繁，请稍后再试'
});