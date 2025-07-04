import rateLimit from 'express-rate-limit';
import config from '../config';

// 创建基础速率限制器
const createLimiter = (options: {
    windowMs?: number;
    max?: number;
    message?: string;
}) => {
    return rateLimit({
        windowMs: options.windowMs || 15 * 60 * 1000, // 默认15分钟
        max: options.max || 100, // 默认限制100次
        message: options.message || '请求过于频繁，请稍后再试',
        standardHeaders: true,
        legacyHeaders: false,
    });
};

// WebAuthn相关的速率限制器
export const webAuthnLimiter = {
    // 获取认证器列表
    credentials: createLimiter({
        windowMs: 1 * 60 * 1000, // 1分钟
        max: 30,
    }),

    // 注册开始
    registerStart: createLimiter({
        windowMs: 5 * 60 * 1000, // 5分钟
        max: 10,
    }),

    // 注册完成
    registerFinish: createLimiter({
        windowMs: 5 * 60 * 1000, // 5分钟
        max: 10,
    }),

    // 认证开始
    authenticateStart: createLimiter({
        windowMs: 1 * 60 * 1000, // 1分钟
        max: 20,
    }),

    // 认证完成
    authenticateFinish: createLimiter({
        windowMs: 1 * 60 * 1000, // 1分钟
        max: 20,
    }),

    // 删除认证器
    removeCredential: createLimiter({
        windowMs: 5 * 60 * 1000, // 5分钟
        max: 10,
    }),
};

// TOTP相关的速率限制器
export const totpLimiter = {
    // 获取状态
    status: createLimiter({
        windowMs: 1 * 60 * 1000, // 1分钟
        max: 30,
    }),

    // 生成设置
    generateSetup: createLimiter({
        windowMs: 5 * 60 * 1000, // 5分钟
        max: 5,
    }),

    // 验证并启用
    verifyAndEnable: createLimiter({
        windowMs: 5 * 60 * 1000, // 5分钟
        max: 10,
    }),

    // 验证令牌
    verifyToken: createLimiter({
        windowMs: 5 * 60 * 1000, // 5分钟
        max: 10,
    }),

    // 禁用TOTP
    disable: createLimiter({
        windowMs: 5 * 60 * 1000, // 5分钟
        max: 5,
    }),
};

// API相关的速率限制器
export const apiLimiter = {
    // TTS生成
    ttsGenerate: createLimiter({
        windowMs: 1 * 60 * 1000, // 1分钟
        max: 10,
    }),

    // 用户管理
    userManagement: createLimiter({
        windowMs: 5 * 60 * 1000, // 5分钟
        max: 50,
    }),
}; 