// 设置时区为上海
process.env.TZ = 'Asia/Shanghai';

import express, { Request, Response, NextFunction, RequestHandler } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import path, { join } from 'path';
import { config } from './config/config';
import logger from './utils/logger';
import ttsRoutes from './routes/ttsRoutes';
import authRoutes from './routes/authRoutes';
import adminRoutes from './routes/adminRoutes';
import totpRoutes from './routes/totpRoutes';
import rateLimit from 'express-rate-limit';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { OpenAI } from 'openai';
import { exec } from 'child_process';
import { promisify } from 'util';
import { writeFile, readFile, appendFile, mkdir } from 'fs/promises';
import { existsSync, mkdirSync } from 'fs';
import FingerprintJS from '@fingerprintjs/fingerprintjs';
import statusRouter from './routes/status';
import { getIPInfo } from './services/ip';
import tamperRoutes from './routes/tamperRoutes';
import { tamperProtectionMiddleware } from './middleware/tamperProtection';
import commandRoutes from './routes/commandRoutes';
import libreChatRoutes from './routes/libreChatRoutes';
import dataCollectionRoutes from './routes/dataCollectionRoutes';
import dataCollectionAdminRoutes from './routes/dataCollectionAdminRoutes';
import { AuthController, isAdminToken, registerLogoutRoute } from './controllers/authController';
import { adminController } from 'controllers/adminController';
import swaggerJSDoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import logRoutes from './routes/logRoutes';
import passkeyRoutes from './routes/passkeyRoutes';
import { passkeyAutoFixMiddleware, passkeyErrorHandler } from './middleware/passkeyAutoFix';
import ipfsRoutes from './routes/ipfsRoutes';
import networkRoutes from './routes/networkRoutes';
import dataProcessRoutes from './routes/dataProcessRoutes';
import mediaRoutes from './routes/mediaRoutes';
import socialRoutes from './routes/socialRoutes';
import lifeRoutes from './routes/lifeRoutes';
import { PasskeyDataRepairService } from './services/passkeyDataRepairService';
import miniapiRoutes from './routes/miniapiRoutes';
import lotteryRoutes from './routes/lotteryRoutes';
import { connectMongo } from './services/mongoService';
import { UserStorage } from './utils/userStorage';
import modlistRoutes from './routes/modlistRoutes';
import imageDataRoutes from './routes/imageDataRoutes';
import resourceRoutes from './routes/resourceRoutes';
import cdkRoutes from './routes/cdkRoutes';
import shortUrlRoutes from './routes/shortUrlRoutes';
import fbiWantedRoutes from './routes/fbiWantedRoutes';
import fbiWantedPublicRoutes from './routes/fbiWantedPublicRoutes';
import humanCheckRoutes from './routes/humanCheckRoutes';
import debugConsoleRoutes from './routes/debugConsoleRoutes';

import emailRoutes from './routes/emailRoutes';
import outemailRoutes from './routes/outemailRoutes';
import { commandStatusHandler } from './routes/commandRoutes';
import webhookRoutes from './routes/webhookRoutes';
import webhookEventRoutes from './routes/webhookEventRoutes';
import { authenticateToken } from './middleware/authenticateToken';
import { totpStatusHandler } from './routes/totpRoutes';
import turnstileRoutes from './routes/turnstileRoutes';
import { schedulerService } from './services/schedulerService';

// 扩展 Request 类型
declare global {
  namespace Express {
    interface Request {
      isLocalIp?: boolean;
    }
  }
}

// 邮件服务全局开关
// eslint-disable-next-line no-var
var EMAIL_ENABLED: boolean;
// 邮件服务状态全局变量
// eslint-disable-next-line no-var
var EMAIL_SERVICE_STATUS: { available: boolean; error?: string };

// Synchronous helper for Swagger UI initialization
const readOpenapiJsonSync = (): string => {
  const candidates = [
    process.env.OPENAPI_JSON_PATH && path.resolve(process.env.OPENAPI_JSON_PATH),
    '/app/openapi.json',
    path.join(process.cwd(), 'openapi.json'),
    path.join(__dirname, '../openapi.json'),
    path.join(process.cwd(), 'dist/openapi.json'),
  ].filter(Boolean) as string[];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p) && fs.statSync(p).isFile()) {
        return fs.readFileSync(p, 'utf-8');
      }
    } catch (_) { /* ignore */ }
  }
  throw new Error('openapi.json not found in: ' + candidates.join(' | '));
};
// 对外邮件服务状态全局变量
// eslint-disable-next-line no-var
var OUTEMAIL_SERVICE_STATUS: { available: boolean; error?: string };

const app = express();
const execAsync = promisify(exec);

// 允许的域名 - 必须在使用之前定义
const allowedOrigins = [
  'https://tts.hapx.one',
  'https://tts.hapxs.com',
  'https://api.hapxs.com',
  'http://localhost:3000',
  'http://localhost:3001',
  'http://127.0.0.1:3001',
  'http://192.168.137.1:3001',
  'http://192.168.10.7:3001'
];

// 为所有 /s/* 路由添加 OPTIONS 处理器 - 必须在路由挂载之前
app.options('/s/*path', (req: Request, res: Response) => {
  const origin = req.headers.origin;
  if (origin && allowedOrigins.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
  } else if (!origin) {
    res.header('Access-Control-Allow-Origin', '*');
  }
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin, Access-Control-Request-Method, Access-Control-Request-Headers, Cache-Control');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Max-Age', '86400');
  res.status(200).end();
});

// Mount webhook routes BEFORE global JSON parser to preserve raw body for Svix
app.use('/api/webhooks', webhookRoutes);

// 将数据收集路由提前到全局 JSON 解析器之前，避免 body-parser 对非 JSON 请求抛错
app.use('/api/data-collection', dataCollectionRoutes);
app.use('/', dataCollectionRoutes);

// JSON body parser middleware - 必须在短链路由之前
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 为所有 /s/* 路由添加 CORS 响应头中间件 - 必须在路由挂载之前
app.use('/s/*path', (req: Request, res: Response, next: NextFunction) => {
  const origin = req.headers.origin;
  if (origin && allowedOrigins.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
  } else if (!origin) {
    res.header('Access-Control-Allow-Origin', '*');
  }
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Expose-Headers', 'Content-Length, X-RateLimit-Limit, X-RateLimit-Remaining, Content-Disposition, Content-Type, Cache-Control');
  next();
});

// 最高优先级，短链跳转
app.use('/s', shortUrlRoutes);

// 为 /api/shorturl/* 添加 OPTIONS 处理器 - 必须在路由挂载之前
app.options('/api/shorturl/*path', (req: Request, res: Response) => {
  const origin = req.headers.origin;
  if (origin && allowedOrigins.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
  } else if (!origin) {
    res.header('Access-Control-Allow-Origin', '*');
  }
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin, Access-Control-Request-Method, Access-Control-Request-Headers, Cache-Control');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Max-Age', '86400');
  res.status(200).end();
});

// 为所有 /api/shorturl/* 路由添加 CORS 响应头中间件 - 必须在路由挂载之前
app.use('/api/shorturl/*path', (req: Request, res: Response, next: NextFunction) => {
  const origin = req.headers.origin;
  if (origin && allowedOrigins.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
  } else if (!origin) {
    res.header('Access-Control-Allow-Origin', '*');
  }
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Expose-Headers', 'Content-Length, X-RateLimit-Limit, X-RateLimit-Remaining, Content-Disposition, Content-Type, Cache-Control');
  next();
});

// 为前端管理面板提供 /api 前缀的别名挂载，便于通过代理访问管理接口
app.use('/api/shorturl', shortUrlRoutes);

// 设置信任代理 - 只信任第一个代理（安全）
app.set('trust proxy', 1);

// 检查是否是本地 IP 的中间件
const isLocalIp = (req: Request, res: Response, next: NextFunction) => {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  // DEV环境下不跳过二次校验，isLocalIp始终为false
  if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'dev') {
    req.isLocalIp = false;
  } else {
    req.isLocalIp = config.localIps.includes(ip);
  }
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
    const ip = req.ip || (req.socket?.remoteAddress) || 'unknown';
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
    const ip = req.ip || (req.socket?.remoteAddress) || 'unknown';
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
    const ip = req.ip || (req.socket?.remoteAddress) || 'unknown';
    return ip;
  },
  // 跳过本地 IP 的限制
  skip: (req: Request): boolean => {
    return req.isLocalIp || false;
  }
});

// 为 /api/auth/me 创建特殊的限流器
const meEndpointLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5分钟
  max: 300, // 限制每个IP每5分钟300次请求（平均每分钟60次）
  message: { error: '请求过于频繁，请稍后再试' },
  standardHeaders: true,
  legacyHeaders: false,
  // 添加 IP 地址获取方法
  keyGenerator: (req: Request) => {
    const ip = req.ip || (req.socket?.remoteAddress) || 'unknown';
    return ip;
  },
  // 跳过本地 IP 的限制
  skip: (req: Request): boolean => {
    return req.isLocalIp || false;
  }
});

// 管理员路由限流器
const adminLimiter = rateLimit({
  windowMs: 60 * 1000, // 1分钟
  max: 50, // 限制每个IP每分钟50次请求
  message: { error: '管理员操作过于频繁，请稍后再试' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => {
    const ip = req.ip || (req.socket?.remoteAddress) || 'unknown';
    return ip;
  },
  skip: (req: Request): boolean => {
    return req.isLocalIp || false;
  }
});

// 前端路由限流器
const frontendLimiter = rateLimit({
  windowMs: 60 * 1000, // 1分钟
  max: 150, // 限制每个IP每分钟150次请求
  message: { error: '请求过于频繁，请稍后再试' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => {
    const ip = req.ip || (req.socket?.remoteAddress) || 'unknown';
    return ip;
  },
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

// 允许的域名 (已在文件顶部定义)

app.use(cors({
  origin: function (origin, callback) {
    // 允许本地无origin的情况（如curl、postman等）
    if (!origin) return callback(null, true);
    // 允许所有 *.hapxs.com
    if (/^https:\/\/([a-zA-Z0-9-]+\.)*hapxs\.com$/.test(origin)) {
      return callback(null, true);
    }
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error('Not allowed by CORS'), false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'Accept',
    'Origin',
    'Access-Control-Request-Method',
    'Access-Control-Request-Headers',
    'Cache-Control'
  ],
  exposedHeaders: [
    'Content-Length',
    'X-RateLimit-Limit',
    'X-RateLimit-Remaining',
    'Content-Disposition',
    'Content-Type',
    'Cache-Control'
  ],
  maxAge: 86400, // 预检请求的结果可以缓存24小时
  preflightContinue: false,
  optionsSuccessStatus: 200
}));
// 安全头配置
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "blob:", "https:"],
      scriptSrc: ["'self'", "https://challenges.cloudflare.com"],
      connectSrc: ["'self'", "https://api.openai.com", "https://api.hapxs.com", "http://localhost:3000", "http://localhost:3001"],
      frameSrc: ["'self'", "https://challenges.cloudflare.com", "https://*.cloudflare.com"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: []
    }
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  },
  noSniff: true,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  xssFilter: true,
  frameguard: { action: 'deny' }
}));

// 移除可能泄露信息的响应头
app.use((req, res, next) => {
  res.removeHeader('X-Powered-By');
  res.removeHeader('Server');
  next();
});
app.use(morgan('combined'));
app.use(isLocalIp); // 添加本地 IP 检查中间件

// 立即注册 emailRoutes，确保 /api/email/outemail 无需 token 验证
app.use('/api/email', emailRoutes);
// 单独注册对外邮件公共路由，确保无鉴权访问
app.use('/api/outemail', outemailRoutes);

// 应用请求限制到不同路由
app.use('/api/auth', authLimiter);
app.use('/api/auth/me', meEndpointLimiter); // 为 /me 端点添加特殊的限流器
app.use('/api/tts/generate', ttsLimiter);
app.use('/api/tts/history', historyLimiter);


// 注册路由（路由内部已有速率限制）
app.use('/api/tts', ttsRoutes);

// TOTP路由限流器
const totpLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5分钟
  max: 20, // 限制每个IP每5分钟20次请求
  message: { error: 'TOTP操作过于频繁，请稍后再试' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => {
    const ip = req.ip || (req.socket?.remoteAddress) || 'unknown';
    return ip;
  },
  skip: (req: Request): boolean => {
    return req.isLocalIp || false;
  }
});

// Passkey路由限流器
const passkeyLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5分钟
  max: 30, // 限制每个IP每5分钟30次请求
  message: { error: 'Passkey操作过于频繁，请稍后再试' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => {
    const ip = req.ip || (req.socket?.remoteAddress) || 'unknown';
    return ip;
  },
  skip: (req: Request): boolean => {
    return req.isLocalIp || false;
  }
});

// 防篡改路由限流器
const tamperLimiter = rateLimit({
  windowMs: 60 * 1000, // 1分钟
  max: 30, // 限制每个IP每分钟30次请求
  message: { error: '防篡改验证请求过于频繁，请稍后再试' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => {
    const ip = req.ip || (req.socket?.remoteAddress) || 'unknown';
    return ip;
  },
  skip: (req: Request): boolean => {
    return req.isLocalIp || false;
  }
});

// 命令路由限流器
const commandLimiter = rateLimit({
  windowMs: 60 * 1000, // 1分钟
  max: 10, // 限制每个IP每分钟10次请求
  message: { error: '命令执行请求过于频繁，请稍后再试' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => {
    const ip = req.ip || (req.socket?.remoteAddress) || 'unknown';
    return ip;
  },
  skip: (req: Request): boolean => {
    return req.isLocalIp || false;
  }
});

// LibreChat路由限流器
const libreChatLimiter = rateLimit({
  windowMs: 60 * 1000, // 1分钟
  max: 60, // 限制每个IP每分钟60次请求
  message: { error: 'LibreChat请求过于频繁，请稍后再试' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => {
    const ip = req.ip || (req.socket?.remoteAddress) || 'unknown';
    return ip;
  },
  skip: (req: Request): boolean => {
    return req.isLocalIp || false;
  }
});

// LibreChat 路由
app.use('/api/librechat', libreChatLimiter, libreChatRoutes);

// 数据收集路由限流器
const dataCollectionLimiter = rateLimit({
  windowMs: 60 * 1000, // 1分钟
  max: 30, // 限制每个IP每分钟30次请求
  message: { error: '数据收集请求过于频繁，请稍后再试' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => {
    const ip = req.ip || (req.socket?.remoteAddress) || 'unknown';
    return ip;
  },
  skip: (req: Request): boolean => {
    return req.isLocalIp || false;
  }
});

// 日志路由限流器
const logsLimiter = rateLimit({
  windowMs: 60 * 1000, // 1分钟
  max: 20, // 限制每个IP每分钟20次请求
  message: { error: '日志请求过于频繁，请稍后再试' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => {
    const ip = req.ip || (req.socket?.remoteAddress) || 'unknown';
    return ip;
  },
  skip: (req: Request): boolean => {
    return req.isLocalIp || false;
  }
});

// IPFS上传路由限流器
const ipfsLimiter = rateLimit({
  windowMs: 60 * 1000, // 1分钟
  max: 10, // 限制每个IP每分钟10次上传请求
  message: { error: '上传请求过于频繁，请稍后再试' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => {
    const ip = req.ip || (req.socket?.remoteAddress) || 'unknown';
    return ip;
  },
  skip: (req: Request): boolean => {
    return req.isLocalIp || false;
  }
});

// 网络检测路由限流器
const networkLimiter = rateLimit({
  windowMs: 60 * 1000, // 1分钟
  max: 30, // 限制每个IP每分钟30次网络检测请求
  message: { error: '网络检测请求过于频繁，请稍后再试' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => {
    const ip = req.ip || (req.socket?.remoteAddress) || 'unknown';
    return ip;
  },
  skip: (req: Request): boolean => {
    return req.isLocalIp || false;
  }
});

// 数据处理路由限流器
const dataProcessLimiter = rateLimit({
  windowMs: 60 * 1000, // 1分钟
  max: 50, // 限制每个IP每分钟50次数据处理请求
  message: { error: '数据处理请求过于频繁，请稍后再试' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => {
    const ip = req.ip || (req.socket?.remoteAddress) || 'unknown';
    return ip;
  },
  skip: (req: Request): boolean => {
    return req.isLocalIp || false;
  }
});

// 媒体解析路由限流器
const mediaLimiter = rateLimit({
  windowMs: 60 * 1000, // 1分钟
  max: 20, // 限制每个IP每分钟20次媒体解析请求
  message: { error: '媒体解析请求过于频繁，请稍后再试' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => {
    const ip = req.ip || (req.socket?.remoteAddress) || 'unknown';
    return ip;
  },
  skip: (req: Request): boolean => {
    return req.isLocalIp || false;
  }
});

// 社交媒体路由限流器
const socialLimiter = rateLimit({
  windowMs: 60 * 1000, // 1分钟
  max: 30, // 限制每个IP每分钟30次社交媒体请求
  message: { error: '社交媒体请求过于频繁，请稍后再试' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => {
    const ip = req.ip || (req.socket?.remoteAddress) || 'unknown';
    return ip;
  },
  skip: (req: Request): boolean => {
    return req.isLocalIp || false;
  }
});

// 生活信息路由限流器
const lifeLimiter = rateLimit({
  windowMs: 60 * 1000, // 1分钟
  max: 40, // 限制每个IP每分钟40次生活信息请求
  message: { error: '生活信息请求过于频繁，请稍后再试' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => {
    const ip = req.ip || (req.socket?.remoteAddress) || 'unknown';
    return ip;
  },
  skip: (req: Request): boolean => {
    return req.isLocalIp || false;
  }
});

// MiniAPI路由限流器
const miniapiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1分钟
  max: 30, // 限制每个IP每分钟30次MiniAPI请求
  message: { error: 'MiniAPI请求过于频繁，请稍后再试' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => req.ip || (req.socket?.remoteAddress) || 'unknown',
  skip: (req: Request): boolean => req.isLocalIp || false
});

// 状态路由限流器
const statusLimiter = rateLimit({
  windowMs: 60 * 1000, // 1分钟
  max: 60, // 限制每个IP每分钟60次请求
  message: { error: '状态检查请求过于频繁，请稍后再试' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => {
    const ip = req.ip || (req.socket?.remoteAddress) || 'unknown';
    return ip;
  },
  skip: (req: Request): boolean => {
    return req.isLocalIp || false;
  }
});
app.use('/api/totp', totpLimiter);
app.use('/api/passkey', passkeyLimiter);
app.use('/api/tamper', tamperLimiter);
app.use('/api/command', commandLimiter);
app.use('/api/libre-chat', libreChatLimiter);
app.use('/api/data-collection', dataCollectionLimiter);
app.use('/api/ipfs', ipfsLimiter);
app.use('/api/network', networkLimiter);
app.use('/api/data', dataProcessLimiter);
app.use('/api/media', mediaLimiter);
app.use('/api/social', socialLimiter);
app.use('/api/life', lifeLimiter);
app.use('/api/status', statusLimiter);

// ========== Swagger OpenAPI 文档集成 ==========
const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Synapse API 文档',
      version: '1.0.0',
      description: '基于 OpenAPI 3.0 的接口文档'
    }
  },
  apis: [
    path.join(process.cwd(), 'src/routes/*.ts'),
    path.join(process.cwd(), 'dist/routes/*.js')
  ],
};
const swaggerSpec = swaggerJSDoc(swaggerOptions);

// Helper to load openapi.json from multiple candidate paths
const readOpenapiJson = async (): Promise<string> => {
  const candidates = [
    process.env.OPENAPI_JSON_PATH && path.resolve(process.env.OPENAPI_JSON_PATH),
    // Docker 默认路径
    '/app/openapi.json',
    path.join(process.cwd(), 'openapi.json'),
    path.join(__dirname, '../openapi.json'),
    path.join(process.cwd(), 'dist/openapi.json'),
  ].filter(Boolean) as string[];
  for (const p of candidates) {
    try {
      if (await fs.promises.stat(p).then(s => s.isFile()).catch(() => false)) {
        return await fs.promises.readFile(p, 'utf-8');
      }
    } catch (_) { /* ignore */ }
  }
  throw new Error('openapi.json not found in: ' + candidates.join(' | '));
};

// openapi.json 路由（必须在最前面）
const openapiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1分钟
  max: 10, // 每个IP每分钟最多10次
  message: { error: '请求过于频繁，请稍后再试' }
});
app.get('/api/api-docs.json', openapiLimiter, async (req, res) => {
  try {
    res.setHeader('Content-Type', 'application/json');
    const content = await readOpenapiJson();
    res.send(content);
  } catch (error) {
    res.status(500).json({ error: '无法读取API文档' });
  }
});
app.get('/api-docs.json', openapiLimiter, async (req, res) => {
  try {
    res.setHeader('Content-Type', 'application/json');
    const content = await readOpenapiJson();
    res.send(content);
  } catch (error) {
    res.status(500).json({ error: '无法读取API文档' });
  }
});
// 兼容根路径 openapi.json（Swagger UI 在容器中可能直接请求 /openapi.json）
app.get('/openapi.json', openapiLimiter, async (req, res) => {
  try {
    res.setHeader('Content-Type', 'application/json');
    const content = await readOpenapiJson();
    res.send(content);
  } catch (error) {
    res.status(500).json({ error: '无法读取API文档' });
  }
});
// Swagger UI 路由（优先使用预生成 openapi.json，避免容器中无源码注释导致无路径）
let swaggerUiSpec: any = swaggerSpec;
let swaggerLoadReason = 'swagger-jsdoc';
try {
  const json = readOpenapiJsonSync();
  swaggerUiSpec = JSON.parse(json);
  const pathsCount = swaggerUiSpec && swaggerUiSpec.paths ? Object.keys(swaggerUiSpec.paths).length : 0;
  logger.info(`[Swagger] 为 UI 加载预先生成的 openapi.json，路径数=${pathsCount}`);
  swaggerLoadReason = 'pre-generated-openapi.json';
} catch (e) {
  logger.warn('[Swagger] Falling back to swagger-jsdoc generated spec. Reason: ' + (e instanceof Error ? e.message : String(e)));
}

// Decide UI setup mode: if OPENAPI_JSON_PATH is defined or /app/openapi.json exists, let UI fetch /openapi.json directly
const preferSwaggerUrl = !!process.env.OPENAPI_JSON_PATH || fs.existsSync('/app/openapi.json');

// Override Swagger UI favicon request
app.get('/api-docs/favicon-32x32.png', (req: Request, res: Response) => {
  res.redirect(302, 'https://png.hapxs.com/i/2025/08/08/68953253d778d.png');
});
app.get('/api-docs/favicon-16x16.png', (req: Request, res: Response) => {
  res.redirect(302, 'https://png.hapxs.com/i/2025/08/08/68953253d778d.png');
});

app.use('/api-docs', (req: Request, res: Response, next: NextFunction) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  res.removeHeader && res.removeHeader('ETag');
  next();
}, swaggerUi.serve, preferSwaggerUrl
  ? swaggerUi.setup(undefined, {
    swaggerUrl: '/openapi.json',
    customSiteTitle: 'Happy API',
    customCss: `
      .swagger-ui .topbar .link img,
      .swagger-ui .topbar .link svg { display: none !important; }
      .swagger-ui .topbar .link {
        background-image: url('https://png.hapxs.com/i/2025/08/08/68953253d778d.png');
        background-repeat: no-repeat;
        background-position: left center;
        background-size: auto 40px;
        height: 50px;
        padding-left: 150px;
      }
    `
  })
  : swaggerUi.setup(swaggerUiSpec, {
    customSiteTitle: 'Happy API',
    customCss: `
      .swagger-ui .topbar .link img,
      .swagger-ui .topbar .link svg { display: none !important; }
      .swagger-ui .topbar .link {
        background-image: url('https://png.hapxs.com/i/2025/08/08/68953253d778d.png');
        background-repeat: no-repeat;
        background-position: left center;
        background-size: auto 40px;
        height: 50px;
        padding-left: 150px;
      }
    `
  })
);

// 音频文件服务限流器
const audioFileLimiter = rateLimit({
  windowMs: 60 * 1000, // 1分钟
  max: 50, // 每分钟最多50次音频文件请求
  message: { error: '音频文件请求过于频繁，请稍后再试' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => req.ip || (req.socket?.remoteAddress) || 'unknown',
  skip: (req: Request): boolean => req.isLocalIp || false
});

// Static files
const audioDir = path.join(__dirname, '../finish');
app.use('/static/audio', audioFileLimiter, express.static(audioDir, {
  setHeaders: (res) => {
    res.set('Cross-Origin-Resource-Policy', 'cross-origin');
    res.set('Access-Control-Allow-Origin', '*');
  }
}));

// 确保音频目录存在
const ensureAudioDir = async () => {
  if (!fs.existsSync(audioDir)) {
    await fs.promises.mkdir(audioDir, { recursive: true });
  }
};
ensureAudioDir().catch(console.error);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/totp', totpRoutes);
app.use('/api/totp/status', authenticateToken, totpStatusHandler as RequestHandler);
app.use('/api/admin', adminLimiter, adminRoutes);
app.use('/api/status', statusRouter);
app.use('/api/turnstile', turnstileRoutes);

// 添加篡改保护中间件
app.use(tamperProtectionMiddleware);

// 注册路由
app.use('/api/tamper', tamperRoutes);
app.use('/api/command', commandRoutes);
app.use('/api/libre-chat', libreChatRoutes);
app.use('/api/human-check', humanCheckRoutes);
app.use('/api/debug-console', debugConsoleRoutes);
app.use('/api/data-collection', dataCollectionRoutes);
app.use('/api/data-collection/admin', dataCollectionAdminRoutes);
app.use('/api/ipfs', ipfsRoutes);
app.use('/api/network', networkRoutes);
app.use('/api/data', dataProcessRoutes);
app.use('/api/lottery', lotteryRoutes);
app.use('/api/media', mediaRoutes);
app.use('/api/social', socialRoutes);
app.use('/api/life', lifeRoutes);
app.use('/api', logRoutes);
app.use('/api/passkey', passkeyAutoFixMiddleware);
app.use('/api/passkey', passkeyRoutes);
app.use('/api/email', emailRoutes);
app.use('/api/miniapi', miniapiLimiter, miniapiRoutes);
// 额外在挂载点增加一层限流，叠加路由内部限流，缓解扫接口类滥用
const modlistMountLimiter = rateLimit({
  windowMs: 60 * 1000, // 1分钟
  max: 60,
  message: { error: 'MOD列表请求过于频繁，请稍后再试' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/modlist', modlistMountLimiter, modlistRoutes);
app.use('/api/image-data', imageDataRoutes);
// 资源路由 - 部分需要认证
app.use('/api', resourceRoutes);
// CDK路由 - 需要认证（添加挂载限流）
const cdkMountLimiter = rateLimit({
  windowMs: 60 * 1000, // 1分钟
  max: 60, // 每IP每分钟最多60次
  message: { error: 'CDK 请求过于频繁，请稍后再试' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api', cdkMountLimiter, authenticateToken, cdkRoutes);
// Webhook事件管理 - 需要管理员认证（添加管理员限流）
app.use('/api/webhook-events', authenticateToken, adminLimiter, webhookEventRoutes);
// FBI通缉犯路由（管理员端，添加管理员限流）
app.use('/api/fbi-wanted', adminLimiter, fbiWantedRoutes);
// FBI通缉犯公开路由（完全无鉴权，添加前端限流）
app.use('/api/fbi-wanted-public', frontendLimiter, fbiWantedPublicRoutes);
// 额外公开别名（非 /api 前缀，绕过任何潜在的 /api 层鉴权拦截）- 添加前端限流
app.use('/public/fbi-wanted', frontendLimiter, fbiWantedPublicRoutes);
// app.use('/api', shortUrlRoutes);

// 完整性检测相关兜底接口限速
const integrityLimiter = rateLimit({
  windowMs: 60 * 1000, // 1分钟
  max: 10, // 每分钟最多10次
  message: { error: '请求过于频繁，请稍后再试' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => req.ip || (req.socket?.remoteAddress) || 'unknown',
  skip: (req: Request): boolean => req.isLocalIp || false
});

app.head('/api/proxy-test', integrityLimiter, (req, res) => res.sendStatus(200));
app.get('/api/proxy-test', integrityLimiter, (req, res) => res.sendStatus(200));
app.get('/api/timing-test', integrityLimiter, (req, res) => res.sendStatus(200));

// 根路由限流器
const rootLimiter = rateLimit({
  windowMs: 60 * 1000, // 1分钟
  max: 100, // 每分钟最多100次根路由访问
  message: { error: '访问过于频繁，请稍后再试' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => req.ip || (req.socket?.remoteAddress) || 'unknown',
  skip: (req: Request): boolean => req.isLocalIp || false
});

// 根路由重定向到前端站点
app.get('/', rootLimiter, (req, res) => {
  res.redirect('http://tts.hapxs.com/');
});

// favicon.ico 路由 - 重定向到指定的图片
app.get('/favicon.ico', (req, res) => {
  res.redirect(302, 'https://png.hapxs.com/i/2025/08/08/68953253d778d.png');
});

// 兼容旧路径：直接访问 /lc 与 /librechat-image
const lcCompatLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { error: '请求过于频繁，请稍后再试' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.get('/lc', lcCompatLimiter, (req, res) => {
  try {
    const { libreChatService } = require('./services/libreChatService');
    const record = libreChatService.getLatestRecord();
    if (record) {
      return res.json({
        update_time: record.updateTime,
        image_name: record.imageUrl,
        update_time_shanghai: record.updateTimeShanghai,
      });
    }
    return res.status(404).json({ error: 'No data available.' });
  } catch (e) {
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});
app.get('/librechat-image', lcCompatLimiter, (req, res) => res.redirect(302, '/api/libre-chat/librechat-image'));

// IP查询路由限流器
const ipQueryLimiter = rateLimit({
  windowMs: 60 * 1000, // 1分钟
  max: 30, // 每分钟最多30次IP查询
  message: { error: 'IP查询过于频繁，请稍后再试' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => req.ip || (req.socket?.remoteAddress) || 'unknown',
  skip: (req: Request): boolean => req.isLocalIp || false
});

// IP 信息路由（使用 getIPInfo 服务）
app.get('/ip', ipQueryLimiter, async (req, res) => {
  try {
    const ip = (req.headers['x-real-ip'] as string) || req.ip || '127.0.0.1';
    logger.info('收到IP信息查询请求', { ip, userAgent: req.headers['user-agent'] });

    const ipInfo = await getIPInfo(ip);
    logger.info('IP信息查询成功', { ip, ipInfo });
    res.json(ipInfo);
  } catch (error) {
    logger.error('IP信息查询失败', {
      ip: (req.headers['x-real-ip'] as string) || req.ip || '127.0.0.1',
      error: error instanceof Error ? error.message : String(error)
    });

    // 确保返回JSON格式的错误响应
    res.status(500).json({
      error: '获取IP信息失败',
      ip: (req.headers['x-real-ip'] as string) || req.ip || '127.0.0.1',
      message: error instanceof Error ? error.message : '未知错误'
    });
  }
});

// 定义公网IP上报白名单
const ipReportWhitelist = [
  '127.0.0.1', '::1', 'localhost',
  // 可扩展内网段
  /^10\./, /^192\.168\./, /^172\.(1[6-9]|2[0-9]|3[0-1])\./
];

// 公网IP上报专用限流器（默认每分钟25次）
const ipReportLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 25,
  message: { error: 'IP上报过于频繁，请稍后再试' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip || (req.socket?.remoteAddress) || 'unknown',
  skip: (req) => {
    const ip = req.ip || (req.socket?.remoteAddress) || '';
    // 白名单IP直接跳过限流
    return ipReportWhitelist.some(rule =>
      typeof rule === 'string' ? ip === rule : rule.test(ip)
    );
  }
});

// 前端上报公网IP
const DATA_DIR = path.join(process.cwd(), 'data');
const CLIENT_REPORTED_IP_FILE = path.join(DATA_DIR, 'clientReportedIP.json');
app.post('/api/report-ip', ipReportLimiter, async (req, res) => {
  try {
    const { ip: clientReportedIP, userAgent, url, referrer, timestamp } = req.body;
    const realIP = req.headers['x-real-ip'] || req.ip;
    const ua = req.headers['user-agent'] || '';
    logger.info(`前端上报公网IP: ${clientReportedIP}，请求真实IP: ${realIP}，UA: ${ua}，userAgent: ${userAgent}，url: ${url}，referrer: ${referrer}，timestamp: ${timestamp}`);

    // 确保 data 目录存在
    if (!existsSync(DATA_DIR)) {
      mkdirSync(DATA_DIR, { recursive: true });
    }

    // 读取已存在的 clientReportedIP.json
    let records = [];
    if (existsSync(CLIENT_REPORTED_IP_FILE)) {
      try {
        const content = await readFile(CLIENT_REPORTED_IP_FILE, 'utf-8');
        records = JSON.parse(content);
        if (!Array.isArray(records)) records = [];
      } catch (e) {
        records = [];
      }
    }

    // 追加新记录
    records.push({
      clientReportedIP,
      realIP,
      ua,
      userAgent,
      url,
      referrer,
      timestamp
    });

    // 写回文件
    await writeFile(CLIENT_REPORTED_IP_FILE, JSON.stringify(records, null, 2));

    res.json({ success: true });
  } catch (error) {
    logger.error('处理 /api/report-ip 失败:', error);
    res.status(500).json({ error: '上报公网IP失败' });
  }
});

// 静态文件服务限流器
const staticFileLimiter = rateLimit({
  windowMs: 60 * 1000, // 1分钟
  max: 200, // 每分钟最多200次静态文件请求
  message: { error: '静态文件请求过于频繁，请稍后再试' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => req.ip || (req.socket?.remoteAddress) || 'unknown',
  skip: (req: Request): boolean => req.isLocalIp || false
});

// 静态文件服务（兼容 Docker 镜像路径）
const frontendCandidates = [
  process.env.FRONTEND_DIST_DIR && path.resolve(process.env.FRONTEND_DIST_DIR),
  join(__dirname, '../frontend/dist'),
  join(__dirname, '../../frontend/dist'),
  path.resolve(process.cwd(), 'frontend/dist'),
].filter(Boolean) as string[];

const resolvedFrontendPath = frontendCandidates.find(p => existsSync(p));

if (resolvedFrontendPath) {
  logger.info('[Frontend] Serving static files from: ' + resolvedFrontendPath);
  app.use('/static', staticFileLimiter, express.static(resolvedFrontendPath));
  // 前端 SPA 路由 - 只匹配非 /api /api-docs /static /openapi 开头的路径
  app.get(/^\/(?!api|api-docs|static|openapi)(.*)/, frontendLimiter, (req, res) => {
    res.sendFile(join(resolvedFrontendPath, 'index.html'));
  });
} else {
  const expected = frontendCandidates.join(' | ');
  logger.warn('[Frontend] 在任何候选路径中均未找到前端文件。已尝试：' + expected);
  // 提供降级首页，确保 Docker 镜像在无前端构建文件时也可使用 Swagger
  app.get('/index.html', (req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.status(200).send(`<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Synapse API</title>
    <style>
      body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;padding:40px;line-height:1.6}
      .card{max-width:680px;margin:0 auto;border:1px solid #e5e7eb;border-radius:12px;padding:24px;box-shadow:0 4px 14px rgba(0,0,0,.08)}
      h1{margin:0 0 12px;font-size:24px}
      a{color:#3b82f6;text-decoration:none}
      code{background:#f3f4f6;padding:2px 6px;border-radius:6px}
    </style>
  </head>
  <body>
    <div class="card">
      <h1>Synapse 后端已启动</h1>
      <p>未检测到前端构建文件。您仍可通过 Swagger 访问 API 文档：</p>
      <ul>
        <li><a href="/api-docs" rel="noopener">Swagger UI</a></li>
        <li><a href="/api-docs.json" rel="noopener">Swagger JSON</a></li>
        <li><a href="/api/api-docs.json" rel="noopener">Swagger JSON (alt)</a></li>
      </ul>
      <p>如果需要启用前端，请设置环境变量 <code>FRONTEND_DIST_DIR</code> 或将构建产物放到以下任一路径：<br/><small>${expected}</small></p>
    </div>
  </body>
</html>`);
  });
}

// 文档加载超时上报接口限流器
const docsTimeoutLimiter = rateLimit({
  windowMs: 60 * 1000, // 1分钟
  max: 5, // 每分钟最多5次上报
  message: { error: '上报过于频繁，请稍后再试' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => req.ip || (req.socket?.remoteAddress) || 'unknown',
  skip: (req: Request): boolean => req.isLocalIp || false
});

// 文档加载超时上报接口
app.post('/api/report-docs-timeout', docsTimeoutLimiter, express.json(), (req, res) => {
  const { url, timestamp, userAgent } = req.body;
  logger.error('API文档加载超时', {
    url,
    timestamp: new Date(timestamp).toISOString(),
    userAgent,
    ip: req.ip,
    headers: req.headers
  });
  res.json({ success: true });
});

// 全局默认限流器（保护未明确限速的路由）
const globalDefaultLimiter = rateLimit({
  windowMs: 60 * 1000, // 1分钟
  max: 100, // 每分钟最多100次请求
  message: { error: '请求过于频繁，请稍后再试' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => req.ip || (req.socket?.remoteAddress) || 'unknown',
  skip: (req: Request): boolean => {
    if (req.originalUrl && req.originalUrl.startsWith('/api/command/status')) return true;
    return req.isLocalIp || false;
  },
  handler: (req, res, next) => {
    logger.warn(`[限流][globalDefaultLimiter] 429 Too Many Requests: ${req.method} ${req.originalUrl} IP: ${req.ip}`);
    res.status(429).json({ error: '请求过于频繁，请稍后再试' });
  }
});

// 404处理限流器
const notFoundLimiter = rateLimit({
  windowMs: 60 * 1000, // 1分钟
  max: 50, // 每分钟最多50次404请求
  message: { error: '请求过于频繁，请稍后再试' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => req.ip || (req.socket?.remoteAddress) || 'unknown',
  skip: (req: Request): boolean => req.isLocalIp || false
});

// 应用全局默认限流器
app.use(globalDefaultLimiter);

// 404 处理
app.use(notFoundLimiter, (req: Request, res: Response) => {
  logger.warn(`404 Not Found: ${req.method} ${req.url}`, {
    ip: req.ip,
    headers: req.headers,
    body: req.body
  });
  res.status(404).json({ error: 'Not Found' });
});

// 常量定义
const IP_DATA_FILE = 'ip_data.txt';
const LC_DATA_FILE = 'lc_data.txt';
const MAX_LINES = 200;
const PASSWORD = process.env.SERVER_PASSWORD || 'wmy';
const OPENAI_KEY = process.env.OPENAI_KEY;
const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL;

// 初始化 OpenAI 客户端
const openai = new OpenAI({
  apiKey: OPENAI_KEY,
  baseURL: OPENAI_BASE_URL,
});

// 限流器类
class RateLimiter {
  private calls: number[] = [];
  constructor(private maxCalls: number, private period: number) { }

  attempt(): boolean {
    const now = Date.now();
    this.calls = this.calls.filter(call => call > now - this.period);
    if (this.calls.length < this.maxCalls) {
      this.calls.push(now);
      return true;
    }
    return false;
  }
}

// 创建限流器实例
const ttsRateLimiter = new RateLimiter(5, 30000);

// IP 位置查询
async function getIpLocation(ip: string): Promise<string> {
  try {
    const response = await fetch(`https://api.vore.top/api/IPdata?ip=${ip}`);
    const data = await response.json();
    if (data.code === 200) {
      const info = data.ipdata;
      return `${info.info1}, ${info.info2}, ${info.info3} 运营商: ${info.isp}`;
    }
    return '未找到位置';
  } catch (error) {
    // 避免外部输入直接作为格式化字符串
    console.error('获取 IP 位置时出错:', { ip, error });
    return '获取位置时出错';
  }
}

// 记录 IP 数据
async function logIpData(ip: string, location: string): Promise<void> {
  await appendFile(IP_DATA_FILE, `${ip}, ${location}\n`);
}

// 读取 IP 数据
async function readIpData(): Promise<Record<string, string>> {
  if (!existsSync(IP_DATA_FILE)) {
    return {};
  }

  const content = await readFile(IP_DATA_FILE, 'utf-8');
  const ipData: Record<string, string> = {};

  content.split('\n').forEach(line => {
    if (line.trim()) {
      const [ip, location] = line.split(', ', 2);
      if (ip && location) {
        ipData[ip] = location;
      }
    }
  });

  return ipData;
}

// IP位置查询路由限流器
const ipLocationLimiter = rateLimit({
  windowMs: 60 * 1000, // 1分钟
  max: 20, // 每分钟最多20次IP位置查询
  message: { error: 'IP位置查询过于频繁，请稍后再试' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => req.ip || (req.socket?.remoteAddress) || 'unknown',
  skip: (req: Request): boolean => req.isLocalIp || false
});

// IP位置查询路由（使用外部API）
app.get('/ip-location', ipLocationLimiter, async (req, res) => {
  const providedIp = req.query.ip as string;
  const realTime = req.query['real-time'] !== undefined;

  let ip = providedIp;
  if (!ip) {
    const forwardedFor = req.headers['x-forwarded-for']?.toString();
    const realIp = req.headers['x-real-ip']?.toString();
    ip = forwardedFor?.split(',')[0] || realIp || req.ip || 'unknown';
  }

  console.log(`获取到的 IP: ${ip}`);

  if (realTime) {
    const locationInfo = await getIpLocation(ip);
    await logIpData(ip, locationInfo);
    return res.json({
      ip,
      location: locationInfo,
      message: '实时结果'
    });
  }

  const ipData = await readIpData();
  if (ip in ipData) {
    return res.json({
      ip,
      location: ipData[ip],
      message: '本次内容为缓存结果。您可以请求 /ip?real-time 来获取实时结果。'
    });
  }

  const locationInfo = await getIpLocation(ip);
  await logIpData(ip, locationInfo);

  return res.json({
    ip,
    location: locationInfo,
    message: '如果您提供的 IP 是 VPN 服务器的地址，位置信息可能不准确。'
  });
});

// 服务器状态查询限流器
const serverStatusLimiter = rateLimit({
  windowMs: 60 * 1000, // 1分钟
  max: 10, // 每分钟最多10次状态查询
  message: { error: '状态查询过于频繁，请稍后再试' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => req.ip || (req.socket?.remoteAddress) || 'unknown',
  skip: (req: Request): boolean => req.isLocalIp || false
});

// 服务器状态
app.post('/server_status', serverStatusLimiter, (req, res) => {
  const password = req.body.password;

  if (password === PASSWORD) {
    const bootTime = process.uptime();
    const memoryUsage = process.memoryUsage();

    const statusInfo = {
      boot_time: new Date(Date.now() - bootTime * 1000).toISOString(),
      uptime: bootTime,
      cpu_usage_percent: process.cpuUsage().user / 1000000,
      memory_usage: {
        used: memoryUsage.heapUsed,
        total: memoryUsage.heapTotal,
        percent: (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100
      }
    };

    return res.json(statusInfo);
  }

  // 返回模拟数据
  const statusInfo = {
    boot_time: '2023-01-01T00:00:00.000Z',
    uptime: Math.floor(Math.random() * 34200) + 1800,
    cpu_usage_percent: Math.floor(Math.random() * 90) + 5,
    memory_usage: {
      used: Math.floor(Math.random() * 7.5 * 1024 * 1024 * 1024) + 500 * 1024 * 1024,
      total: Math.floor(Math.random() * 14 * 1024 * 1024 * 1024) + 2 * 1024 * 1024 * 1024,
      percent: Math.floor(Math.random() * 90) + 5
    }
  };

  return res.json(statusInfo);
});

// 确保必要的目录存在
const ensureDirectories = async () => {
  const dirs = ['logs', 'finish', 'data'];
  for (const dir of dirs) {
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true });
    }
  }
};

// 注册登出接口
registerLogoutRoute(app);

// 检查邮件API密钥
if (!process.env.RESEND_API_KEY) {
  (globalThis as any).EMAIL_ENABLED = false;
  (globalThis as any).EMAIL_SERVICE_STATUS = { available: false, error: '未配置 RESEND_API_KEY' };
  (globalThis as any).OUTEMAIL_SERVICE_STATUS = { available: false, error: '未配置 RESEND_API_KEY' };
  console.warn('[邮件服务] 未检测到 RESEND_API_KEY，邮件发送功能已禁用');
} else {
  (globalThis as any).EMAIL_ENABLED = true;
  // 启动时仅做配置检查，不发送测试邮件
  (async () => {
    try {
      const { EmailService } = require('./services/emailService');
      // 只检查配置，不发测试邮件
      (globalThis as any).EMAIL_SERVICE_STATUS = { available: true };
      logger.info('[邮件服务] 配置检查完成：已启用');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '未知错误';
      (globalThis as any).EMAIL_SERVICE_STATUS = { available: false, error: errorMessage };
      logger.warn('[邮件服务] 配置检查失败：', errorMessage);
    }
  })();
  // 对外邮件服务同理
  (async () => {
    try {
      const config = require('./config').default;
      if (!config.email?.outemail?.enabled) {
        (globalThis as any).OUTEMAIL_SERVICE_STATUS = { available: false, error: '对外邮件服务未启用' };
        logger.warn('[对外邮件服务] 服务未启用');
        return;
      }
      if (!config.email?.outemail?.domain) {
        (globalThis as any).OUTEMAIL_SERVICE_STATUS = { available: false, error: '对外邮件服务未配置域名' };
        logger.warn('[对外邮件服务] 未配置域名');
        return;
      }
      const key = config.email.outemail.apiKey;
      if (!key || !/^re_\w{8,}/.test(key)) {
        (globalThis as any).OUTEMAIL_SERVICE_STATUS = { available: false, error: '未配置有效的对外邮件API密钥（re_ 开头）' };
        logger.warn('[对外邮件服务] 未配置有效API密钥');
        return;
      }
      (globalThis as any).OUTEMAIL_SERVICE_STATUS = { available: true };
      logger.info('[对外邮件服务] 配置检查完成：已启用');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '未知错误';
      (globalThis as any).OUTEMAIL_SERVICE_STATUS = { available: false, error: errorMessage };
      logger.warn('[对外邮件服务] 配置检查失败：', errorMessage);
    }
  })();
}

// Start server (only in non-test environment)
if (process.env.NODE_ENV !== 'test') {
  const PORT = config.port;
  app.listen(Number(PORT), '0.0.0.0', async () => {
    await ensureDirectories();
    logger.info(`服务器运行在 http://0.0.0.0:${PORT}`);
    logger.info(`生成音频目录: ${audioDir}`);
    logger.info(`当前生成码: ${config.generationCode}`);

    // 启动时检查文件权限
    try {
      // 尝试多个可能的路径
      let checkFilePermissions;
      const possiblePaths = [
        '../scripts/check-file-permissions.js',
        '../../scripts/check-file-permissions.js',
        './scripts/check-file-permissions.js',
        path.join(process.cwd(), 'scripts', 'check-file-permissions.js')
      ];

      for (const scriptPath of possiblePaths) {
        try {
          const scriptModule = require(scriptPath);
          checkFilePermissions = scriptModule.checkFilePermissions;
          if (checkFilePermissions) {
            logger.info(`[启动] 找到文件权限检查脚本: ${scriptPath}`);
            break;
          }
        } catch (e) {
          // 继续尝试下一个路径
        }
      }

      if (checkFilePermissions) {
        checkFilePermissions();
      } else {
        logger.warn('[启动] 未找到文件权限检查脚本，跳过检查');
      }
    } catch (error) {
      logger.warn('[启动] 文件权限检查失败，继续启动', {
        error: error instanceof Error ? error.message : String(error)
      });
    }

    // 启动时检查存储模式并初始化数据库
    try {
      logger.info('[启动] 检查用户存储模式...');
      const storageMode = process.env.USER_STORAGE_MODE || 'file';
      logger.info(`[启动] 当前存储模式: ${storageMode}`);

      // 检查存储模式是否可用并初始化数据库
      if (storageMode === 'mongo') {
        try {
          // 尝试连接 MongoDB
          const { connectMongo } = require('./services/mongoService');
          await connectMongo();
          logger.info('[启动] MongoDB 连接成功');

          // 初始化 MongoDB 数据库
          const initResult = await UserStorage.initializeDatabase();
          if (initResult.initialized) {
            logger.info(`[启动] ${initResult.message}`);
          } else {
            logger.error(`[启动] MongoDB 初始化失败: ${initResult.message}`);
          }
        } catch (error) {
          logger.warn('[启动] MongoDB 连接失败，建议切换到文件模式', {
            error: error instanceof Error ? error.message : String(error)
          });
        }
      } else if (storageMode === 'mysql') {
        try {
          // 尝试连接 MySQL
          const { getMysqlConnection } = require('./utils/userStorage');
          const conn = await getMysqlConnection();
          await conn.execute('SELECT 1');
          await conn.end();
          logger.info('[启动] MySQL 连接成功');

          // 初始化 MySQL 数据库
          const initResult = await UserStorage.initializeDatabase();
          if (initResult.initialized) {
            logger.info(`[启动] ${initResult.message}`);
          } else {
            logger.error(`[启动] MySQL 初始化失败: ${initResult.message}`);
          }
        } catch (error) {
          logger.warn('[启动] MySQL 连接失败，建议切换到文件模式', {
            error: error instanceof Error ? error.message : String(error)
          });
        }
      } else {
        // 文件存储模式初始化
        try {
          const initResult = await UserStorage.initializeDatabase();
          if (initResult.initialized) {
            logger.info(`[启动] ${initResult.message}`);
          } else {
            logger.error(`[启动] 文件存储初始化失败: ${initResult.message}`);
          }
        } catch (error) {
          logger.error('[启动] 文件存储初始化失败', {
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }

      // 初始化 UserStorage MongoDB 监听器（所有模式都需要）
      UserStorage.initializeMongoListener();

      // 启动定时任务服务
      try {
        schedulerService.start();
        logger.info('[启动] 定时任务服务已启动');
      } catch (error) {
        logger.warn('[启动] 定时任务服务启动失败，继续启动', {
          error: error instanceof Error ? error.message : String(error)
        });
      }

      // 移除自动修复Passkey数据
      // logger.info('[启动] 开始自动修复Passkey数据...');
      // await PasskeyDataRepairService.repairAllUsersPasskeyData();
      // logger.info('[启动] Passkey数据自动修复完成');
    } catch (error) {
      logger.error('[启动] 数据库初始化和Passkey数据修复失败', {
        error: error instanceof Error ? error.message : String(error)
      });
      // 不阻止服务器启动，只记录错误
    }
  });
}

// 确保在测试环境中也能正确导出 Express 应用
export default app;

// 禁止二次校验相关接口缓存，防止304导致安全绕过
app.use(['/api/totp/status', '/api/passkey/credentials', '/api/passkey/authenticate/start', '/api/passkey/authenticate/finish', '/api/passkey/register/start', '/api/passkey/register/finish', '/api/auth/me', '/api/auth/logout', '/api/auth/login', '/api/auth/register', '/api/totp/status'], (req: any, res: any, next: any) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  res.removeHeader && res.removeHeader('ETag');
  next();
});

// 添加Passkey错误处理中间件
app.use(passkeyErrorHandler);

// --- MongoDB tts -> user_datas 自动迁移逻辑 ---
import { MongoClient } from 'mongodb';
async function migrateTtsCollection() {
  const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017';
  const dbName = process.env.MONGO_DB || 'tts';
  const client = new MongoClient(mongoUri);
  try {
    await client.connect();
    const db = client.db(dbName);
    const ttsCol = db.collection('tts');
    const userDatasCol = db.collection('user_datas');
    const ttsCount = await ttsCol.countDocuments();
    if (ttsCount === 0) {
      logger.info('[迁移] tts 集合为空，无需迁移');
      return;
    }
    const userDatasCount = await userDatasCol.countDocuments();
    if (userDatasCount >= ttsCount) {
      logger.info('[迁移] user_datas 集合已包含全部数据，无需迁移');
      return;
    }
    const docs = await ttsCol.find().toArray();
    if (docs.length === 0) {
      console.log('[迁移] tts 集合无数据');
      return;
    }
    // 批量插入，避免重复
    const bulk = userDatasCol.initializeUnorderedBulkOp();
    for (const doc of docs) {
      bulk.find({ _id: doc._id }).upsert().replaceOne(doc);
    }
    if (bulk.length > 0) {
      const result = await bulk.execute();
      const migratedCount = (result.upsertedCount || 0) + (result.modifiedCount || 0);
      console.log(`[迁移] 已迁移 ${migratedCount} 条数据到 user_datas`);
    }
    // 校验完整性
    const afterCount = await userDatasCol.countDocuments();
    if (afterCount >= ttsCount) {
      await ttsCol.drop();
      console.log(`[迁移] 校验通过，已删除原 tts 集合。user_datas 总数: ${afterCount}`);
    } else {
      console.error(`[迁移] 校验失败，user_datas 数量(${afterCount}) < tts 数量(${ttsCount})，未删除原集合`);
    }
  } catch (err) {
    console.error('[迁移] 发生错误:', err);
  } finally {
    await client.close();
  }
}

// 启动时自动迁移
migrateTtsCollection();

// --- 全局WAF安全校验中间件 ---
const wafSkipMap = new Map<string, { last: number, count: number }>();
function wafCheckSimple(str: string, maxLen = 256): boolean {
  if (typeof str !== 'string') return false;
  if (!str.trim() || str.length > maxLen) return false;
  if (/[<>{}"'`;\\]/.test(str)) return false;
  if (/\b(select|update|delete|insert|drop|union|script|alert|onerror|onload)\b/i.test(str)) return false;
  return true;
}
app.use((req: Request, res: Response, next: NextFunction) => {
  if (
    !req.path.startsWith('/api/') ||
    req.path === '/api/auth/login' ||
    req.path === '/api/auth/register' ||
    req.path === '/api/webhooks/resend'
  ) return next();
  const ip = req.ip || (req.socket?.remoteAddress) || 'unknown';
  const now = Date.now();
  const rec = wafSkipMap.get(ip) || { last: 0, count: 0 };
  if (now - rec.last < 1000) {
    rec.count++;
    if (rec.count > 10) {
      wafSkipMap.set(ip, { last: now, count: rec.count });
      return next();
    }
  } else {
    rec.count = 1;
    rec.last = now;
  }
  wafSkipMap.set(ip, rec);
  // 异步参数检查，分片递归优化，避免大对象阻塞主线程
  function checkObjAsync(obj: any, batchSize = 100): Promise<boolean> {
    return new Promise((resolve) => {
      const keys = Object.keys(obj || {});
      let idx = 0;
      function nextBatch() {
        for (let i = 0; i < batchSize && idx < keys.length; i++, idx++) {
          const k = keys[idx];
          if (typeof obj[k] === 'string' && !wafCheckSimple(obj[k])) return resolve(false);
          if (typeof obj[k] === 'object' && obj[k] !== null) {
            checkObjAsync(obj[k], batchSize).then(ok => { if (!ok) resolve(false); });
          }
        }
        if (idx < keys.length) {
          setImmediate(nextBatch);
        } else {
          resolve(true);
        }
      }
      nextBatch();
    });
  }
  setImmediate(async () => {
    try {
      const [queryOk, bodyOk, paramsOk] = await Promise.all([
        checkObjAsync(req.query),
        checkObjAsync(req.body),
        checkObjAsync(req.params)
      ]);
      if (!queryOk || !bodyOk || !paramsOk) {
        res.status(400).json({ error: '参数非法（WAF拦截）' });
        return;
      }
      next();
    } catch {
      res.status(400).json({ error: '参数非法（WAF拦截）' });
    }
  });
});

// 启动时异步修复短链表中无 userId/username 的数据
(async () => {
  try {
    const mongoose = require('mongoose');
    const ShortUrlModel = mongoose.models.ShortUrl || mongoose.model('ShortUrl');
    const cursor = ShortUrlModel.find({ $or: [{ userId: { $exists: false } }, { username: { $exists: false } }] }).cursor();
    for await (const doc of cursor) {
      await ShortUrlModel.updateOne({ _id: doc._id }, {
        $set: { userId: 'admin', username: 'admin' }
      });
    }
    logger.info('[ShortLink] 启动时已修复所有无用户信息的短链');
  } catch (e) {
    logger.warn('[ShortLink] 启动时修复短链用户信息失败', e);
  }
})();

// 启动时自动检测和修正短链中的旧域名
(async () => {
  try {
    const { shortUrlMigrationService } = require('./services/shortUrlMigrationService');
    await shortUrlMigrationService.autoFixOnStartup();
  } catch (e) {
    logger.warn('[ShortUrlMigration] 启动时自动修正短链域名失败', e);
  }
})();

// 单独注册 /api/command/status，确保不受限流影响
app.post('/api/command/status', authenticateToken, commandStatusHandler as RequestHandler);
app.use('/api/command', commandRoutes); 