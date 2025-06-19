import rateLimit from 'express-rate-limit';
import { RateLimitRequestHandler } from 'express-rate-limit';

interface RateLimitConfig {
    windowMs: number;
    max: number;
    message: string;
}

const rateLimiter = (config: RateLimitConfig): RateLimitRequestHandler => {
    return rateLimit({
        windowMs: config.windowMs,
        max: config.max,
        message: { 
            status: 'error',
            message: config.message
        },
        standardHeaders: true,
        legacyHeaders: false,
        // 添加IP地址获取方法
        keyGenerator: (req) => {
            return req.ip || req.socket.remoteAddress || 'unknown';
        },
        // 跳过本地IP的限制
        skip: (req) => {
            const ip = req.ip || req.socket.remoteAddress || 'unknown';
            return ['127.0.0.1', 'localhost', '::1'].includes(ip);
        }
    });
};

export default rateLimiter; 