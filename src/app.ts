'use server';

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import path from 'path';
import { config } from './config/config';
import logger from './utils/logger';
import ttsRoutes from './routes/ttsRoutes';
import authRoutes from './routes/authRoutes';
import rateLimit from 'express-rate-limit';
import fs from 'fs';

// 扩展 Request 类型
declare global {
    namespace Express {
        interface Request {
            isLocalIp?: boolean;
        }
    }
}

const app = express();

// 设置信任代理 - 只信任本地代理
app.set('trust proxy', 'loopback');

// 检查是否是本地 IP 的中间件
const isLocalIp = (req: Request, res: Response, next: NextFunction) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    req.isLocalIp = config.localIps.includes(ip);
    next();
};

// 创建限流器
const ttsLimiter = rateLimit({
    windowMs: 60 * 1000, // 1分钟
    max: 10, // 限制每个IP每分钟10次请求
    message: { error: '请求过于频繁，请稍后再试' },
    standardHeaders: true,
    legacyHeaders: false,
    // 添加 IP 地址获取方法
    keyGenerator: (req: Request) => {
        const ip = req.ip || req.socket.remoteAddress || 'unknown';
        return ip;
    },
    // 跳过本地 IP 的限制
    skip: (req: Request): boolean => {
        return req.isLocalIp || false;
    }
});

const authLimiter = rateLimit({
    windowMs: 60 * 1000, // 1分钟
    max: 30, // 限制每个IP每分钟30次请求
    message: { error: '请求过于频繁，请稍后再试' },
    standardHeaders: true,
    legacyHeaders: false,
    // 添加 IP 地址获取方法
    keyGenerator: (req: Request) => {
        const ip = req.ip || req.socket.remoteAddress || 'unknown';
        return ip;
    },
    // 跳过本地 IP 的限制
    skip: (req: Request): boolean => {
        return req.isLocalIp || false;
    }
});

const historyLimiter = rateLimit({
    windowMs: 60 * 1000, // 1分钟
    max: 20, // 限制每个IP每分钟20次请求
    message: { error: '请求过于频繁，请稍后再试' },
    standardHeaders: true,
    legacyHeaders: false,
    // 添加 IP 地址获取方法
    keyGenerator: (req: Request) => {
        const ip = req.ip || req.socket.remoteAddress || 'unknown';
        return ip;
    },
    // 跳过本地 IP 的限制
    skip: (req: Request): boolean => {
        return req.isLocalIp || false;
    }
});

// 为 /api/auth/me 创建特殊的限流器
const meEndpointLimiter = rateLimit({
    windowMs: 60 * 1000, // 1分钟
    max: 60, // 限制每个IP每分钟60次请求
    message: { error: '请求过于频繁，请稍后再试' },
    standardHeaders: true,
    legacyHeaders: false,
    // 添加 IP 地址获取方法
    keyGenerator: (req: Request) => {
        const ip = req.ip || req.socket.remoteAddress || 'unknown';
        return ip;
    },
    // 跳过本地 IP 的限制
    skip: (req: Request): boolean => {
        return req.isLocalIp || false;
    }
});

// 请求日志中间件
app.use((req: Request, res: Response, next: NextFunction) => {
    logger.info(`收到请求: ${req.method} ${req.url}`, {
        ip: req.ip,
        headers: req.headers,
        body: req.body
    });
    next();
});

// Middleware
app.use(cors({
    origin: ['https://tts.hapx.one', 'https://tts.hapxs.com', 'http://localhost:3000'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    crossOriginEmbedderPolicy: false
}));
app.use(morgan('combined'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(isLocalIp); // 添加本地 IP 检查中间件

// 应用请求限制到不同路由
app.use('/api/tts/generate', ttsLimiter);
app.use('/api/auth', authLimiter);
app.use('/api/auth/me', meEndpointLimiter); // 为 /me 端点添加特殊的限流器
app.use('/api/tts/history', historyLimiter);

// Static files
const audioDir = path.join(__dirname, '../finish');
app.use('/static/audio', express.static(audioDir, {
  setHeaders: (res) => {
    res.set('Cross-Origin-Resource-Policy', 'cross-origin');
    res.set('Access-Control-Allow-Origin', '*');
  }
}));

// 确保音频目录存在
if (!fs.existsSync(audioDir)) {
  fs.mkdirSync(audioDir, { recursive: true });
}

// Routes
app.use('/api/tts', ttsRoutes);
app.use('/api/auth', authRoutes);

// Error handling
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  logger.error('服务器错误:', {
    error: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method
  });
  res.status(500).json({ error: 'Something broke!' });
});

// 404 处理
app.use((req: Request, res: Response) => {
  logger.warn(`404 Not Found: ${req.method} ${req.url}`, {
    ip: req.ip,
    headers: req.headers,
    body: req.body
  });
  res.status(404).json({ error: 'Not Found' });
});

// Start server
app.listen(config.port, () => {
  logger.info(`Server is running on port ${config.port}`);
  logger.info(`Audio files directory: ${audioDir}`);
}); 