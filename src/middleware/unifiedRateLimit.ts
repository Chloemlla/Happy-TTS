import { Request } from 'express';
import rateLimit from 'express-rate-limit';

// 通用限流器配置生成函数
const createLimiter = (options: {
    windowMs: number;
    max: number;
    message: string;
    routeName?: string;
}) => {
    return rateLimit({
        windowMs: options.windowMs,
        max: options.max,
        message: { error: options.message },
        standardHeaders: true,
        legacyHeaders: false,
        keyGenerator: (req: Request) => req.ip || req.socket.remoteAddress || 'unknown',
        skip: (req: Request): boolean => req.isLocalIp || false,
        handler: (req, res) => {
            res.status(429).json({
                error: options.message,
                route: options.routeName || req.path,
                retryAfter: Math.ceil(options.windowMs / 1000 / 60)
            });
        }
    });
};

// 认证相关限流器
export const authLimiter = createLimiter({
    windowMs: 60 * 1000, // 1分钟
    max: 30,
    message: '认证请求过于频繁，请稍后再试',
    routeName: 'auth'
});

export const meEndpointLimiter = createLimiter({
    windowMs: 5 * 60 * 1000, // 5分钟
    max: 300, // 平均每分钟60次
    message: '用户信息查询过于频繁，请稍后再试',
    routeName: 'auth/me'
});

// TTS相关限流器
export const ttsLimiter = createLimiter({
    windowMs: 60 * 1000, // 1分钟
    max: 10,
    message: 'TTS生成请求过于频繁，请稍后再试',
    routeName: 'tts'
});

export const historyLimiter = createLimiter({
    windowMs: 60 * 1000, // 1分钟
    max: 20,
    message: '历史记录查询过于频繁，请稍后再试',
    routeName: 'tts/history'
});

// 二次验证限流器
export const totpLimiter = createLimiter({
    windowMs: 5 * 60 * 1000, // 5分钟
    max: 20,
    message: 'TOTP操作过于频繁，请稍后再试',
    routeName: 'totp'
});

export const passkeyLimiter = createLimiter({
    windowMs: 5 * 60 * 1000, // 5分钟
    max: 30,
    message: 'Passkey操作过于频繁，请稍后再试',
    routeName: 'passkey'
});

// 管理员限流器
export const adminLimiter = createLimiter({
    windowMs: 60 * 1000, // 1分钟
    max: 50,
    message: '管理员操作过于频繁，请稍后再试',
    routeName: 'admin'
});

// 功能路由限流器
export const tamperLimiter = createLimiter({
    windowMs: 60 * 1000, // 1分钟
    max: 30,
    message: '防篡改验证请求过于频繁，请稍后再试',
    routeName: 'tamper'
});

export const commandLimiter = createLimiter({
    windowMs: 60 * 1000, // 1分钟
    max: 10,
    message: '命令执行请求过于频繁，请稍后再试',
    routeName: 'command'
});

export const libreChatLimiter = createLimiter({
    windowMs: 60 * 1000, // 1分钟
    max: 60,
    message: 'LibreChat请求过于频繁，请稍后再试',
    routeName: 'libre-chat'
});

export const dataCollectionLimiter = createLimiter({
    windowMs: 60 * 1000, // 1分钟
    max: 30,
    message: '数据收集请求过于频繁，请稍后再试',
    routeName: 'data-collection'
});

export const logsLimiter = createLimiter({
    windowMs: 60 * 1000, // 1分钟
    max: 20,
    message: '日志请求过于频繁，请稍后再试',
    routeName: 'logs'
});

export const ipfsLimiter = createLimiter({
    windowMs: 60 * 1000, // 1分钟
    max: 10,
    message: 'IPFS上传请求过于频繁，请稍后再试',
    routeName: 'ipfs'
});

export const networkLimiter = createLimiter({
    windowMs: 60 * 1000, // 1分钟
    max: 30,
    message: '网络检测请求过于频繁，请稍后再试',
    routeName: 'network'
});

export const dataProcessLimiter = createLimiter({
    windowMs: 60 * 1000, // 1分钟
    max: 50,
    message: '数据处理请求过于频繁，请稍后再试',
    routeName: 'data-process'
});

export const mediaLimiter = createLimiter({
    windowMs: 60 * 1000, // 1分钟
    max: 20,
    message: '媒体解析请求过于频繁，请稍后再试',
    routeName: 'media'
});

export const socialLimiter = createLimiter({
    windowMs: 60 * 1000, // 1分钟
    max: 30,
    message: '社交媒体请求过于频繁，请稍后再试',
    routeName: 'social'
});

export const lifeLimiter = createLimiter({
    windowMs: 60 * 1000, // 1分钟
    max: 20,
    message: '生活服务请求过于频繁，请稍后再试',
    routeName: 'life'
});

export const statusLimiter = createLimiter({
    windowMs: 60 * 1000, // 1分钟
    max: 10,
    message: '状态查询请求过于频繁，请稍后再试',
    routeName: 'status'
});

// 静态文件限流器
export const staticFileLimiter = createLimiter({
    windowMs: 60 * 1000, // 1分钟
    max: 100,
    message: '静态文件请求过于频繁，请稍后再试',
    routeName: 'static'
});

export const audioFileLimiter = createLimiter({
    windowMs: 60 * 1000, // 1分钟
    max: 50,
    message: '音频文件请求过于频繁，请稍后再试',
    routeName: 'audio'
});

// 全局默认限流器
export const globalDefaultLimiter = createLimiter({
    windowMs: 60 * 1000, // 1分钟
    max: 100,
    message: '请求过于频繁，请稍后再试',
    routeName: 'global'
});

// 404处理限流器
export const notFoundLimiter = createLimiter({
    windowMs: 60 * 1000, // 1分钟
    max: 50,
    message: '无效请求过于频繁，请稍后再试',
    routeName: '404'
});

// 特殊功能限流器
export const openapiLimiter = createLimiter({
    windowMs: 60 * 1000, // 1分钟
    max: 30,
    message: 'API文档请求过于频繁，请稍后再试',
    routeName: 'openapi'
});

export const integrityLimiter = createLimiter({
    windowMs: 60 * 1000, // 1分钟
    max: 20,
    message: '完整性检查请求过于频繁，请稍后再试',
    routeName: 'integrity'
});

export const rootLimiter = createLimiter({
    windowMs: 60 * 1000, // 1分钟
    max: 30,
    message: '根路径请求过于频繁，请稍后再试',
    routeName: 'root'
});

export const ipQueryLimiter = createLimiter({
    windowMs: 60 * 1000, // 1分钟
    max: 20,
    message: 'IP查询请求过于频繁，请稍后再试',
    routeName: 'ip-query'
});

export const ipReportLimiter = createLimiter({
    windowMs: 60 * 1000, // 1分钟
    max: 10,
    message: 'IP报告请求过于频繁，请稍后再试',
    routeName: 'ip-report'
});

export const docsTimeoutLimiter = createLimiter({
    windowMs: 60 * 1000, // 1分钟
    max: 5,
    message: '文档超时请求过于频繁，请稍后再试',
    routeName: 'docs-timeout'
});

export const serverStatusLimiter = createLimiter({
    windowMs: 60 * 1000, // 1分钟
    max: 10,
    message: '服务器状态查询过于频繁，请稍后再试',
    routeName: 'server-status'
});

export const ipLocationLimiter = createLimiter({
    windowMs: 60 * 1000, // 1分钟
    max: 20,
    message: 'IP位置查询过于频繁，请稍后再试',
    routeName: 'ip-location'
}); 