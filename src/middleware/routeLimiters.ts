import type { NextFunction, Request, Response } from "express";
import rateLimit, {
  type IncrementResponse,
  type Options,
  type RateLimitRequestHandler,
  type Store,
} from "express-rate-limit";
import logger from "../utils/logger";

// ============ 共享存储（所有限流器使用同一个 Map） ============

/**
 * 单一共享内存存储，替代 35+ 个独立 MemoryStore 实例。
 * 每个限流器通过 prefix 区分 key，共享同一个 Map 和清理定时器。
 */
class SharedMemoryStore implements Store {
  private hits = new Map<string, { totalHits: number; resetTime: Date }>();
  private readonly _prefix: string;
  private readonly windowMs: number;

  // 所有实例共享同一个底层 Map 和清理器
  private static readonly globalMap = new Map<string, { totalHits: number; resetTime: Date }>();
  private static cleanupTimer: ReturnType<typeof setInterval> | null = null;
  private static instanceCount = 0;

  // Store 接口要求 prefix 为 public（可选）
  readonly prefix: string;
  readonly localKeys = true;

  constructor(prefix: string, windowMs: number) {
    this._prefix = prefix;
    this.prefix = prefix;
    this.windowMs = windowMs;
    this.hits = SharedMemoryStore.globalMap;

    SharedMemoryStore.instanceCount++;
    // 只启动一个全局清理定时器（每 60 秒清理过期条目）
    if (!SharedMemoryStore.cleanupTimer) {
      SharedMemoryStore.cleanupTimer = setInterval(() => {
        const now = Date.now();
        for (const [key, val] of SharedMemoryStore.globalMap) {
          if (val.resetTime.getTime() <= now) {
            SharedMemoryStore.globalMap.delete(key);
          }
        }
      }, 60_000);
      // 不阻止进程退出
      if (SharedMemoryStore.cleanupTimer.unref) {
        SharedMemoryStore.cleanupTimer.unref();
      }
    }
  }

  private key(k: string): string {
    return `${this._prefix}:${k}`;
  }

  init(_options: Options): void {
    // no-op
  }

  async increment(key: string): Promise<IncrementResponse> {
    const k = this.key(key);
    const now = Date.now();
    const entry = this.hits.get(k);

    if (entry && entry.resetTime.getTime() > now) {
      entry.totalHits++;
      return { totalHits: entry.totalHits, resetTime: entry.resetTime };
    }

    const resetTime = new Date(now + this.windowMs);
    this.hits.set(k, { totalHits: 1, resetTime });
    return { totalHits: 1, resetTime };
  }

  async decrement(key: string): Promise<void> {
    const k = this.key(key);
    const entry = this.hits.get(k);
    if (entry) {
      entry.totalHits = Math.max(0, entry.totalHits - 1);
    }
  }

  async resetKey(key: string): Promise<void> {
    this.hits.delete(this.key(key));
  }

  async resetAll(): Promise<void> {
    // 只清除本 prefix 的 key
    for (const key of this.hits.keys()) {
      if (key.startsWith(this._prefix + ":")) {
        this.hits.delete(key);
      }
    }
  }
}

// ============ 工厂函数 ============

interface LimiterOptions {
  /** 时间窗口（毫秒），默认 60_000（1 分钟） */
  windowMs?: number;
  /** 窗口内最大请求数 */
  max: number;
  /** 429 响应消息 */
  message?: string;
  /** 限流器名称（用于 store key 前缀和日志） */
  name?: string;
  /** 自定义 skip 逻辑（会与默认的 isLocalIp 合并） */
  skip?: (req: Request) => boolean;
  /** 自定义 handler（默认只返回 JSON） */
  handler?: (req: Request, res: Response, next: NextFunction) => void;
}

let limiterCounter = 0;

export function createLimiter(opts: LimiterOptions): RateLimitRequestHandler {
  const msg = opts.message || "请求过于频繁，请稍后再试";
  const windowMs = opts.windowMs ?? 60_000;
  const prefix = opts.name || `rl_${++limiterCounter}`;

  return rateLimit({
    windowMs,
    max: opts.max,
    message: { error: msg },
    standardHeaders: true,
    legacyHeaders: false,
    store: new SharedMemoryStore(prefix, windowMs),
    validate: { unsharedStore: false },
    keyGenerator: (req: Request) => req.ip || req.socket?.remoteAddress || "unknown",
    skip: opts.skip ?? ((req: Request): boolean => req.isLocalIp || false),
    ...(opts.handler ? { handler: opts.handler } : {}),
  });
}

// ============ 所有限流器实例（按路由分组） ============

// --- 认证 ---
export const authLimiter = createLimiter({ name: "auth", max: 30, message: "请求过于频繁，请稍后再试" });
export const meEndpointLimiter = createLimiter({
  name: "me",
  windowMs: 5 * 60_000,
  max: 300,
  message: "请求过于频繁，请稍后再试",
});

// --- TTS ---
export const ttsLimiter = createLimiter({ name: "tts", max: 10, message: "请求过于频繁，请稍后再试" });
export const historyLimiter = createLimiter({ name: "history", max: 20, message: "请求过于频繁，请稍后再试" });

// --- 管理 ---
export const adminLimiter = createLimiter({ name: "admin", max: 50, message: "管理员操作过于频繁，请稍后再试" });

// --- 前端静态 ---
export const frontendLimiter = createLimiter({ name: "frontend", max: 150, message: "请求过于频繁，请稍后再试" });

// --- 二次验证 ---
export const totpLimiter = createLimiter({
  name: "totp",
  windowMs: 5 * 60_000,
  max: 20,
  message: "TOTP操作过于频繁，请稍后再试",
});
export const passkeyLimiter = createLimiter({
  name: "passkey",
  windowMs: 5 * 60_000,
  max: 30,
  message: "Passkey操作过于频繁，请稍后再试",
});

// --- 防篡改 ---
export const tamperLimiter = createLimiter({ name: "tamper", max: 30, message: "防篡改验证请求过于频繁，请稍后再试" });

// --- 命令执行 ---
export const commandLimiter = createLimiter({
  name: "command",
  max: 10,
  message: "命令执行请求过于频繁，请稍后再试",
  skip: (req) => {
    if (req.originalUrl?.startsWith("/api/command/status")) return true;
    return req.isLocalIp || false;
  },
  handler: (req, res) => {
    logger.warn(`[限流][commandLimiter] 429: ${req.method} ${req.originalUrl} IP: ${req.ip}`);
    res.status(429).json({ error: "命令执行请求过于频繁，请稍后再试" });
  },
});

// --- LibreChat ---
export const libreChatLimiter = createLimiter({
  name: "librechat",
  max: 60,
  message: "LibreChat请求过于频繁，请稍后再试",
});

// --- 数据收集 ---
export const dataCollectionLimiter = createLimiter({
  name: "datacollection",
  max: 30,
  message: "数据收集请求过于频繁，请稍后再试",
});

// --- 日志 ---
export const logsLimiter = createLimiter({ name: "logs", max: 20, message: "日志请求过于频繁，请稍后再试" });

// --- IPFS ---
export const ipfsLimiter = createLimiter({ name: "ipfs", max: 10, message: "上传请求过于频繁，请稍后再试" });

// --- 网络检测 ---
export const networkLimiter = createLimiter({ name: "network", max: 30, message: "网络检测请求过于频繁，请稍后再试" });

// --- 数据处理 ---
export const dataProcessLimiter = createLimiter({
  name: "dataprocess",
  max: 50,
  message: "数据处理请求过于频繁，请稍后再试",
});

// --- 媒体 ---
export const mediaLimiter = createLimiter({ name: "media", max: 20, message: "媒体解析请求过于频繁，请稍后再试" });

// --- 社交 ---
export const socialLimiter = createLimiter({ name: "social", max: 30, message: "社交媒体请求过于频繁，请稍后再试" });

// --- 生活信息 ---
export const lifeLimiter = createLimiter({ name: "life", max: 40, message: "生活信息请求过于频繁，请稍后再试" });

// --- MiniAPI ---
export const miniapiLimiter = createLimiter({ name: "miniapi", max: 30, message: "MiniAPI请求过于频繁，请稍后再试" });

// --- 安踏防伪 ---
export const antaLimiter = createLimiter({ name: "anta", max: 30, message: "安踏防伪查询请求过于频繁，请稍后再试" });

// --- 状态 ---
export const statusLimiter = createLimiter({ name: "status", max: 60, message: "状态检查请求过于频繁，请稍后再试" });

// --- OpenAPI 文档 ---
export const openapiLimiter = createLimiter({ name: "openapi", max: 10, message: "请求过于频繁，请稍后再试" });

// --- 音频文件 ---
export const audioFileLimiter = createLimiter({ name: "audio", max: 50, message: "音频文件请求过于频繁，请稍后再试" });

// --- MOD 列表 ---
export const modlistMountLimiter = createLimiter({
  name: "modlist",
  max: 60,
  message: "MOD列表请求过于频繁，请稍后再试",
});

// --- CDK ---
export const cdkMountLimiter = createLimiter({ name: "cdk", max: 60, message: "CDK 请求过于频繁，请稍后再试" });

// --- GitHub Billing ---
export const githubBillingLimiter = createLimiter({
  name: "ghbilling",
  max: 10,
  message: "GitHub Billing请求过于频繁，请稍后再试",
});

// --- 完整性检测 ---
export const integrityLimiter = createLimiter({ name: "integrity", max: 10, message: "请求过于频繁，请稍后再试" });

// --- 根路由 ---
export const rootLimiter = createLimiter({ name: "root", max: 100, message: "访问过于频繁，请稍后再试" });

// --- 兼容旧路径 ---
export const lcCompatLimiter = createLimiter({ name: "lccompat", max: 30, message: "请求过于频繁，请稍后再试" });

// --- IP 查询 ---
export const ipQueryLimiter = createLimiter({ name: "ipquery", max: 30, message: "IP查询过于频繁，请稍后再试" });
export const ipLocationLimiter = createLimiter({
  name: "iplocation",
  max: 20,
  message: "IP位置查询过于频繁，请稍后再试",
});
export const ipReportLimiter = createLimiter({
  name: "ipreport",
  max: 25,
  message: "IP上报过于频繁，请稍后再试",
  skip: (req) => {
    const ip = req.ip || req.socket?.remoteAddress || "";
    const whitelist: (string | RegExp)[] = [
      "127.0.0.1",
      "::1",
      "localhost",
      /^10\./,
      /^192\.168\./,
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
    ];
    return whitelist.some((rule) => (typeof rule === "string" ? ip === rule : rule.test(ip)));
  },
});

// --- 服务器状态 ---
export const serverStatusLimiter = createLimiter({
  name: "serverstatus",
  max: 10,
  message: "状态查询过于频繁，请稍后再试",
});

// --- 静态文件 ---
export const staticFileLimiter = createLimiter({
  name: "static",
  max: 200,
  message: "静态文件请求过于频繁，请稍后再试",
});

// --- 文档超时上报 ---
export const docsTimeoutLimiter = createLimiter({ name: "docstimeout", max: 5, message: "上报过于频繁，请稍后再试" });

// --- 全局兜底 ---
export const globalDefaultLimiter = createLimiter({
  name: "global",
  max: 100,
  message: "请求过于频繁，请稍后再试",
  skip: (req) => {
    if (req.originalUrl?.startsWith("/api/command/status")) return true;
    return req.isLocalIp || false;
  },
  handler: (req, res) => {
    logger.warn(`[限流][globalDefaultLimiter] 429: ${req.method} ${req.originalUrl} IP: ${req.ip}`);
    res.status(429).json({ error: "请求过于频繁，请稍后再试" });
  },
});

// --- 404 ---
export const notFoundLimiter = createLimiter({ name: "notfound", max: 50, message: "请求过于频繁，请稍后再试" });
