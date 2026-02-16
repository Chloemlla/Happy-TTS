import { Request, Response, NextFunction } from 'express';
import rateLimit, { type RateLimitRequestHandler } from 'express-rate-limit';
import logger from '../utils/logger';

// ============ 工厂函数 ============

interface LimiterOptions {
  /** 时间窗口（毫秒），默认 60_000（1 分钟） */
  windowMs?: number;
  /** 窗口内最大请求数 */
  max: number;
  /** 429 响应消息 */
  message?: string;
  /** 自定义 skip 逻辑（会与默认的 isLocalIp 合并） */
  skip?: (req: Request) => boolean;
  /** 自定义 handler（默认只返回 JSON） */
  handler?: (req: Request, res: Response, next: NextFunction) => void;
}

export function createLimiter(opts: LimiterOptions): RateLimitRequestHandler {
  const msg = opts.message || '请求过于频繁，请稍后再试';
  return rateLimit({
    windowMs: opts.windowMs ?? 60_000,
    max: opts.max,
    message: { error: msg },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req: Request) => req.ip || req.socket?.remoteAddress || 'unknown',
    skip: opts.skip ?? ((req: Request): boolean => req.isLocalIp || false),
    ...(opts.handler ? { handler: opts.handler } : {}),
  });
}

// ============ 所有限流器实例（按路由分组） ============

// --- 认证 ---
export const authLimiter = createLimiter({ max: 30, message: '请求过于频繁，请稍后再试' });
export const meEndpointLimiter = createLimiter({ windowMs: 5 * 60_000, max: 300, message: '请求过于频繁，请稍后再试' });

// --- TTS ---
export const ttsLimiter = createLimiter({ max: 10, message: '请求过于频繁，请稍后再试' });
export const historyLimiter = createLimiter({ max: 20, message: '请求过于频繁，请稍后再试' });

// --- 管理 ---
export const adminLimiter = createLimiter({ max: 50, message: '管理员操作过于频繁，请稍后再试' });

// --- 前端静态 ---
export const frontendLimiter = createLimiter({ max: 150, message: '请求过于频繁，请稍后再试' });

// --- 二次验证 ---
export const totpLimiter = createLimiter({ windowMs: 5 * 60_000, max: 20, message: 'TOTP操作过于频繁，请稍后再试' });
export const passkeyLimiter = createLimiter({ windowMs: 5 * 60_000, max: 30, message: 'Passkey操作过于频繁，请稍后再试' });

// --- 防篡改 ---
export const tamperLimiter = createLimiter({ max: 30, message: '防篡改验证请求过于频繁，请稍后再试' });

// --- 命令执行 ---
export const commandLimiter = createLimiter({
  max: 10,
  message: '命令执行请求过于频繁，请稍后再试',
  skip: (req) => {
    if (req.originalUrl?.startsWith('/api/command/status')) return true;
    return req.isLocalIp || false;
  },
  handler: (req, res) => {
    logger.warn(`[限流][commandLimiter] 429: ${req.method} ${req.originalUrl} IP: ${req.ip}`);
    res.status(429).json({ error: '命令执行请求过于频繁，请稍后再试' });
  },
});

// --- LibreChat ---
export const libreChatLimiter = createLimiter({ max: 60, message: 'LibreChat请求过于频繁，请稍后再试' });

// --- 数据收集 ---
export const dataCollectionLimiter = createLimiter({ max: 30, message: '数据收集请求过于频繁，请稍后再试' });

// --- 日志 ---
export const logsLimiter = createLimiter({ max: 20, message: '日志请求过于频繁，请稍后再试' });

// --- IPFS ---
export const ipfsLimiter = createLimiter({ max: 10, message: '上传请求过于频繁，请稍后再试' });

// --- 网络检测 ---
export const networkLimiter = createLimiter({ max: 30, message: '网络检测请求过于频繁，请稍后再试' });

// --- 数据处理 ---
export const dataProcessLimiter = createLimiter({ max: 50, message: '数据处理请求过于频繁，请稍后再试' });

// --- 媒体 ---
export const mediaLimiter = createLimiter({ max: 20, message: '媒体解析请求过于频繁，请稍后再试' });

// --- 社交 ---
export const socialLimiter = createLimiter({ max: 30, message: '社交媒体请求过于频繁，请稍后再试' });

// --- 生活信息 ---
export const lifeLimiter = createLimiter({ max: 40, message: '生活信息请求过于频繁，请稍后再试' });

// --- MiniAPI ---
export const miniapiLimiter = createLimiter({ max: 30, message: 'MiniAPI请求过于频繁，请稍后再试' });

// --- 安踏防伪 ---
export const antaLimiter = createLimiter({ max: 30, message: '安踏防伪查询请求过于频繁，请稍后再试' });

// --- 状态 ---
export const statusLimiter = createLimiter({ max: 60, message: '状态检查请求过于频繁，请稍后再试' });

// --- OpenAPI 文档 ---
export const openapiLimiter = createLimiter({ max: 10, message: '请求过于频繁，请稍后再试' });

// --- 音频文件 ---
export const audioFileLimiter = createLimiter({ max: 50, message: '音频文件请求过于频繁，请稍后再试' });

// --- MOD 列表 ---
export const modlistMountLimiter = createLimiter({ max: 60, message: 'MOD列表请求过于频繁，请稍后再试' });

// --- CDK ---
export const cdkMountLimiter = createLimiter({ max: 60, message: 'CDK 请求过于频繁，请稍后再试' });

// --- GitHub Billing ---
export const githubBillingLimiter = createLimiter({ max: 10, message: 'GitHub Billing请求过于频繁，请稍后再试' });

// --- 完整性检测 ---
export const integrityLimiter = createLimiter({ max: 10, message: '请求过于频繁，请稍后再试' });

// --- 根路由 ---
export const rootLimiter = createLimiter({ max: 100, message: '访问过于频繁，请稍后再试' });

// --- 兼容旧路径 ---
export const lcCompatLimiter = createLimiter({ max: 30, message: '请求过于频繁，请稍后再试' });

// --- IP 查询 ---
export const ipQueryLimiter = createLimiter({ max: 30, message: 'IP查询过于频繁，请稍后再试' });
export const ipLocationLimiter = createLimiter({ max: 20, message: 'IP位置查询过于频繁，请稍后再试' });
export const ipReportLimiter = createLimiter({
  max: 25,
  message: 'IP上报过于频繁，请稍后再试',
  skip: (req) => {
    const ip = req.ip || req.socket?.remoteAddress || '';
    const whitelist: (string | RegExp)[] = [
      '127.0.0.1', '::1', 'localhost',
      /^10\./, /^192\.168\./, /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
    ];
    return whitelist.some(rule => typeof rule === 'string' ? ip === rule : rule.test(ip));
  },
});

// --- 服务器状态 ---
export const serverStatusLimiter = createLimiter({ max: 10, message: '状态查询过于频繁，请稍后再试' });

// --- 静态文件 ---
export const staticFileLimiter = createLimiter({ max: 200, message: '静态文件请求过于频繁，请稍后再试' });

// --- 文档超时上报 ---
export const docsTimeoutLimiter = createLimiter({ max: 5, message: '上报过于频繁，请稍后再试' });

// --- 全局兜底 ---
export const globalDefaultLimiter = createLimiter({
  max: 100,
  message: '请求过于频繁，请稍后再试',
  skip: (req) => {
    if (req.originalUrl?.startsWith('/api/command/status')) return true;
    return req.isLocalIp || false;
  },
  handler: (req, res) => {
    logger.warn(`[限流][globalDefaultLimiter] 429: ${req.method} ${req.originalUrl} IP: ${req.ip}`);
    res.status(429).json({ error: '请求过于频繁，请稍后再试' });
  },
});

// --- 404 ---
export const notFoundLimiter = createLimiter({ max: 50, message: '请求过于频繁，请稍后再试' });
