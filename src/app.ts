'use server';

import express, { Request, Response, NextFunction } from 'express';
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
import { AuthController, isAdminToken, registerLogoutRoute } from './controllers/authController';
import { adminController } from 'controllers/adminController';

// 扩展 Request 类型
declare global {
    namespace Express {
        interface Request {
            isLocalIp?: boolean;
        }
    }
}

const app = express();
const execAsync = promisify(exec);

// 设置信任代理 - 信任所有代理
app.set('trust proxy', true);

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
    windowMs: 5 * 60 * 1000, // 5分钟
    max: 300, // 限制每个IP每5分钟300次请求（平均每分钟60次）
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

// 管理员路由限流器
const adminLimiter = rateLimit({
    windowMs: 60 * 1000, // 1分钟
    max: 50, // 限制每个IP每分钟50次请求
    message: { error: '管理员操作过于频繁，请稍后再试' },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req: Request) => {
        const ip = req.ip || req.socket.remoteAddress || 'unknown';
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

// Middleware
app.use(cors({
    origin: ['https://tts.hapx.one', 'https://tts.hapxs.com', 'http://localhost:3000'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: [
        'Content-Type',
        'Authorization',
        'X-Requested-With',
        'Accept',
        'Origin',
        'Access-Control-Request-Method',
        'Access-Control-Request-Headers'
    ],
    exposedHeaders: ['Content-Length', 'X-RateLimit-Limit', 'X-RateLimit-Remaining'],
    maxAge: 86400 // 预检请求的结果可以缓存24小时
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
app.use('/api/totp', totpRoutes);
app.use('/api/admin', adminLimiter, adminRoutes);
app.use('/api', statusRouter);

// 添加篡改保护中间件
app.use(tamperProtectionMiddleware);

// 注册路由
app.use('/api', tamperRoutes);
app.use('/', commandRoutes);
app.use('/', libreChatRoutes);
app.use('/', dataCollectionRoutes);

// 根路由重定向到前端
app.get('/', (req, res) => {
  res.redirect('/index.html');
});

// IP 路由
app.get('/ip', async (req, res) => {
  try {
    const ip = (req.headers['x-real-ip'] as string) || req.ip || '127.0.0.1';
    const ipInfo = await getIPInfo(ip);
    res.json(ipInfo);
  } catch (error) {
    res.status(500).json({ error: '获取IP信息失败' });
  }
});

// 定义公网IP上报白名单
const ipReportWhitelist = [
  '127.0.0.1', '::1', 'localhost',
  // 可扩展内网段
  /^10\./, /^192\.168\./, /^172\.(1[6-9]|2[0-9]|3[0-1])\./
];

// 公网IP上报专用限流器（默认每分钟15次）
const ipReportLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 15,
  message: { error: 'IP上报过于频繁，请稍后再试' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip || req.socket.remoteAddress || 'unknown',
  skip: (req) => {
    const ip = req.ip || req.socket.remoteAddress || '';
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

// 静态文件服务
const frontendPath = join(__dirname, '../frontend/dist');
if (existsSync(frontendPath)) {
  app.use(express.static(frontendPath));
  // 前端路由
  app.get('*', (req, res) => {
    res.sendFile(join(frontendPath, 'index.html'));
  });
} else {
  logger.warn('Frontend files not found at:', frontendPath);
}

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
  constructor(private maxCalls: number, private period: number) {}

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
    console.error(`获取 IP ${ip} 位置时出错:`, error);
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

// 路由处理
app.get('/ip', async (req, res) => {
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

// 服务器状态
app.get('/server_status', (req, res) => {
  const password = req.query.password as string;

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

// 注册登出接口
registerLogoutRoute(app);

// Start server
const PORT = config.port;
app.listen(Number(PORT), '0.0.0.0', async () => {
  await ensureDirectories();
  logger.info(`服务器运行在 http://0.0.0.0:${PORT}`);
  logger.info(`Audio files directory: ${audioDir}`);
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

export default app; 