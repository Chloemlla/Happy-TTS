import type { NextFunction, Request, Response } from "express";
import rateLimit, { type RateLimitRequestHandler } from "express-rate-limit";
import { createSharedRateLimitStore } from "../services/sharedRateLimitStore";
import logger from "../utils/logger";

type LimiterCategory =
  | "auth"
  | "login"
  | "register"
  | "tts"
  | "tts-history"
  | "admin"
  | "verification"
  | "command"
  | "ticket"
  | "public-api"
  | "status"
  | "static"
  | "cloudflare-challenge"
  | "global";

type RateProfileName =
  | "login"
  | "register"
  | "auth"
  | "authRead"
  | "ttsGenerate"
  | "ttsHistory"
  | "admin"
  | "verification"
  | "sensitive"
  | "ticketRead"
  | "ticketWrite"
  | "standard"
  | "relaxed"
  | "burst"
  | "static"
  | "global";

interface RateProfile {
  windowMs: number;
  max: number;
}

interface LimiterOptions {
  max?: number;
  windowMs?: number;
  message?: string;
  name?: string;
  category?: LimiterCategory;
  profile?: RateProfileName;
  keyGenerator?: (req: Request) => string;
  skip?: (req: Request) => boolean;
  handler?: (req: Request, res: Response, next: NextFunction) => void;
  skipFailedRequests?: boolean;
  skipSuccessfulRequests?: boolean;
}

interface LimiterDefinition {
  profile: RateProfileName;
  category: LimiterCategory;
  message: string;
  max?: number;
  windowMs?: number;
  keyGenerator?: (req: Request) => string;
  skip?: (req: Request) => boolean;
  handler?: (req: Request, res: Response, next: NextFunction) => void;
}

interface RateLimitMetricRecord {
  limiter: string;
  category: LimiterCategory;
  ip: string;
  route: string;
}

interface RateLimitMetricsSnapshot {
  total429Hits: number;
  byLimiter: Record<string, number>;
  byCategory: Record<string, number>;
  hotIps: Array<{ ip: string; hits: number }>;
  hotRoutes: Array<{ route: string; hits: number }>;
}

const RATE_PROFILES: Record<RateProfileName, RateProfile> = {
  login: { windowMs: 15 * 60_000, max: 10 },
  register: { windowMs: 60 * 60_000, max: 5 },
  auth: { windowMs: 60_000, max: 30 },
  authRead: { windowMs: 5 * 60_000, max: 300 },
  ttsGenerate: { windowMs: 60_000, max: 10 },
  ttsHistory: { windowMs: 60_000, max: 20 },
  admin: { windowMs: 60_000, max: 50 },
  verification: { windowMs: 5 * 60_000, max: 20 },
  sensitive: { windowMs: 60_000, max: 10 },
  ticketRead: { windowMs: 60_000, max: 60 },
  ticketWrite: { windowMs: 60_000, max: 10 },
  standard: { windowMs: 60_000, max: 30 },
  relaxed: { windowMs: 60_000, max: 60 },
  burst: { windowMs: 60_000, max: 600 },
  static: { windowMs: 60_000, max: 5000 },
  global: { windowMs: 60_000, max: 100 },
};

const isLocalRequest = (req: Request): boolean => req.isLocalIp || false;

const skipLocalAndStatusPoll = (req: Request): boolean => {
  if (req.originalUrl?.startsWith("/api/command/status")) return true;
  return isLocalRequest(req);
};

const skipLocalAndAuthSpecific = (req: Request): boolean => {
  const url = req.originalUrl?.split("?")[0] || "";
  if (url === "/api/auth/login" || url === "/api/auth/register" || url === "/api/auth/me") {
    return true;
  }
  return isLocalRequest(req);
};

const skipPrivateIpReport = (req: Request): boolean => {
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
};

class RateLimitMetricsRegistry {
  private total429Hits = 0;
  private readonly byLimiter = new Map<string, number>();
  private readonly byCategory = new Map<string, number>();
  private readonly byIp = new Map<string, number>();
  private readonly byRoute = new Map<string, number>();

  record(record: RateLimitMetricRecord): void {
    this.total429Hits += 1;
    this.bump(this.byLimiter, record.limiter);
    this.bump(this.byCategory, record.category);
    this.bump(this.byIp, record.ip);
    this.bump(this.byRoute, record.route);
  }

  snapshot(limit = 10): RateLimitMetricsSnapshot {
    return {
      total429Hits: this.total429Hits,
      byLimiter: Object.fromEntries(this.byLimiter),
      byCategory: Object.fromEntries(this.byCategory),
      hotIps: this.topEntries(this.byIp, limit).map(([ip, hits]) => ({ ip, hits })),
      hotRoutes: this.topEntries(this.byRoute, limit).map(([route, hits]) => ({ route, hits })),
    };
  }

  private bump(map: Map<string, number>, key: string): void {
    map.set(key, (map.get(key) || 0) + 1);
  }

  private topEntries(map: Map<string, number>, limit: number): Array<[string, number]> {
    return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit);
  }
}

const rateLimitMetricsRegistry = new RateLimitMetricsRegistry();

export function getRateLimitMetricsSnapshot(limit = 10): RateLimitMetricsSnapshot {
  return rateLimitMetricsRegistry.snapshot(limit);
}

function createStore(prefix: string, windowMs: number) {
  return createSharedRateLimitStore(prefix, windowMs);
}

function getClientIp(req: Request): string {
  return req.ip || req.socket?.remoteAddress || "unknown";
}

function getRouteHotspotKey(req: Request): string {
  const path = req.originalUrl?.split("?")[0] || req.baseUrl || req.path || "unknown";
  return `${req.method} ${path}`;
}

function buildDefaultHandler(name: string, category: LimiterCategory, message: string) {
  return (req: Request, res: Response) => {
    const ip = getClientIp(req);
    const route = getRouteHotspotKey(req);

    rateLimitMetricsRegistry.record({
      limiter: name,
      category,
      ip,
      route,
    });

    logger.warn(`[RateLimit] 429 ${name}`, {
      category,
      ip,
      route,
      metrics: getRateLimitMetricsSnapshot(5),
    });

    res.status(429).json({ error: message });
  };
}

let limiterCounter = 0;

export function createLimiter(opts: LimiterOptions): RateLimitRequestHandler {
  const name = opts.name || `rl_${++limiterCounter}`;
  const profile = RATE_PROFILES[opts.profile || "standard"];
  const category = opts.category || "public-api";
  const message = opts.message || "请求过于频繁，请稍后再试";
  const windowMs = opts.windowMs ?? profile.windowMs;
  const max = opts.max ?? profile.max;

  return rateLimit({
    windowMs,
    max,
    message: { error: message },
    standardHeaders: true,
    legacyHeaders: false,
    store: createStore(name, windowMs),
    validate: { unsharedStore: false },
    keyGenerator: opts.keyGenerator || ((req: Request) => getClientIp(req)),
    skip: opts.skip ?? ((req: Request): boolean => isLocalRequest(req)),
    handler: opts.handler || buildDefaultHandler(name, category, message),
    ...(opts.skipFailedRequests !== undefined ? { skipFailedRequests: opts.skipFailedRequests } : {}),
    ...(opts.skipSuccessfulRequests !== undefined ? { skipSuccessfulRequests: opts.skipSuccessfulRequests } : {}),
  });
}

const LIMITER_DEFINITIONS = {
  authLogin: {
    profile: "login",
    category: "login",
    message: "登录请求过于频繁，请稍后再试",
  },
  authRegister: {
    profile: "register",
    category: "register",
    message: "注册请求过于频繁，请稍后再试",
  },
  auth: {
    profile: "auth",
    category: "auth",
    message: "请求过于频繁，请稍后再试",
    skip: skipLocalAndAuthSpecific,
  },
  me: {
    profile: "authRead",
    category: "auth",
    message: "请求过于频繁，请稍后再试",
  },
  ttsGenerate: {
    profile: "ttsGenerate",
    category: "tts",
    message: "请求过于频繁，请稍后再试",
  },
  ttsHistory: {
    profile: "ttsHistory",
    category: "tts-history",
    message: "请求过于频繁，请稍后再试",
  },
  admin: {
    profile: "admin",
    category: "admin",
    message: "管理员操作过于频繁，请稍后再试",
  },
  frontend: {
    profile: "static",
    category: "static",
    message: "请求过于频繁，请稍后再试",
  },
  totp: {
    profile: "verification",
    category: "verification",
    message: "TOTP操作过于频繁，请稍后再试",
  },
  passkey: {
    profile: "verification",
    category: "verification",
    max: 30,
    message: "Passkey操作过于频繁，请稍后再试",
  },
  tamper: {
    profile: "standard",
    category: "public-api",
    message: "防篡改验证请求过于频繁，请稍后再试",
  },
  command: {
    profile: "sensitive",
    category: "command",
    message: "命令执行请求过于频繁，请稍后再试",
    skip: skipLocalAndStatusPoll,
  },
  ticketRead: {
    profile: "ticketRead",
    category: "ticket",
    message: "工单查询请求过于频繁，请稍后再试",
  },
  ticketWrite: {
    profile: "ticketWrite",
    category: "ticket",
    message: "工单写入请求过于频繁，请稍后再试",
  },
  ticketAdmin: {
    profile: "admin",
    category: "ticket",
    message: "工单管理请求过于频繁，请稍后再试",
  },
  librechat: {
    profile: "standard",
    category: "public-api",
    message: "LibreChat请求过于频繁，请稍后再试",
  },
  datacollection: {
    profile: "standard",
    category: "public-api",
    message: "数据收集请求过于频繁，请稍后再试",
  },
  logs: {
    profile: "verification",
    category: "public-api",
    message: "日志请求过于频繁，请稍后再试",
  },
  ipfs: {
    profile: "sensitive",
    category: "public-api",
    message: "上传请求过于频繁，请稍后再试",
  },
  network: {
    profile: "standard",
    category: "public-api",
    message: "网络检测请求过于频繁，请稍后再试",
  },
  dataprocess: {
    profile: "admin",
    category: "public-api",
    message: "数据处理请求过于频繁，请稍后再试",
  },
  media: {
    profile: "verification",
    category: "public-api",
    message: "媒体解析请求过于频繁，请稍后再试",
  },
  social: {
    profile: "standard",
    category: "public-api",
    message: "社交媒体请求过于频繁，请稍后再试",
  },
  life: {
    profile: "standard",
    category: "public-api",
    max: 40,
    message: "生活信息请求过于频繁，请稍后再试",
  },
  miniapi: {
    profile: "standard",
    category: "public-api",
    message: "MiniAPI请求过于频繁，请稍后再试",
  },
  anta: {
    profile: "standard",
    category: "public-api",
    message: "安踏防伪查询请求过于频繁，请稍后再试",
  },
  status: {
    profile: "relaxed",
    category: "status",
    message: "状态检查请求过于频繁，请稍后再试",
  },
  openapi: {
    profile: "sensitive",
    category: "public-api",
    message: "请求过于频繁，请稍后再试",
  },
  oauth: {
    profile: "auth",
    category: "auth",
    message: "OAuth 请求过于频繁，请稍后再试",
  },
  audio: {
    profile: "admin",
    category: "static",
    message: "音频文件请求过于频繁，请稍后再试",
  },
  modlist: {
    profile: "relaxed",
    category: "public-api",
    message: "MOD列表请求过于频繁，请稍后再试",
  },
  cdk: {
    profile: "relaxed",
    category: "public-api",
    message: "CDK 请求过于频繁，请稍后再试",
  },
  ghbilling: {
    profile: "sensitive",
    category: "public-api",
    message: "GitHub Billing请求过于频繁，请稍后再试",
  },
  linuxdocredit: {
    profile: "sensitive",
    category: "public-api",
    message: "LINUX DO Credit 请求过于频繁，请稍后再试",
  },
  deeplx: {
    profile: "verification",
    category: "public-api",
    message: "翻译请求过于频繁，请稍后再试",
  },
  deeplxPublic: {
    profile: "burst",
    category: "public-api",
    max: 300,
    message: "公共翻译 API 请求过于频繁，请稍后再试",
  },
  integrity: {
    profile: "sensitive",
    category: "public-api",
    message: "请求过于频繁，请稍后再试",
  },
  nexaisecurity: {
    profile: "relaxed",
    category: "public-api",
    message: "安全请求过于频繁，请稍后再试",
  },
  root: {
    profile: "burst",
    category: "public-api",
    message: "访问过于频繁，请稍后再试",
  },
  lccompat: {
    profile: "standard",
    category: "public-api",
    message: "请求过于频繁，请稍后再试",
  },
  ipquery: {
    profile: "relaxed",
    category: "public-api",
    max: 180,
    message: "IP查询过于频繁，请稍后再试",
  },
  iplocation: {
    profile: "verification",
    category: "public-api",
    message: "IP位置查询过于频繁，请稍后再试",
  },
  ipreport: {
    profile: "standard",
    category: "public-api",
    max: 25,
    message: "IP上报过于频繁，请稍后再试",
    skip: skipPrivateIpReport,
  },
  serverstatus: {
    profile: "sensitive",
    category: "status",
    message: "状态查询过于频繁，请稍后再试",
  },
  static: {
    profile: "static",
    category: "static",
    max: 5000,
    message: "静态文件请求过于频繁，请稍后再试",
  },
  docstimeout: {
    profile: "sensitive",
    category: "public-api",
    max: 5,
    message: "上报过于频繁，请稍后再试",
  },
  cloudflareChallenge: {
    profile: "verification",
    category: "cloudflare-challenge",
    max: 120,
    message: "验证请求过于频繁，请稍后再试",
  },
  global: {
    profile: "global",
    category: "global",
    message: "请求过于频繁，请稍后再试",
    skip: skipLocalAndStatusPoll,
  },
  notfound: {
    profile: "admin",
    category: "public-api",
    message: "请求过于频繁，请稍后再试",
  },
} as const satisfies Record<string, LimiterDefinition>;

function limiterFromDefinition(name: keyof typeof LIMITER_DEFINITIONS): RateLimitRequestHandler {
  const definition: LimiterDefinition = LIMITER_DEFINITIONS[name];
  return createLimiter({
    name,
    profile: definition.profile,
    category: definition.category,
    message: definition.message,
    windowMs: definition.windowMs,
    max: definition.max,
    keyGenerator: definition.keyGenerator,
    skip: definition.skip,
    handler: definition.handler,
  });
}

export const loginLimiter = limiterFromDefinition("authLogin");
export const registerLimiter = limiterFromDefinition("authRegister");
export const authLimiter = limiterFromDefinition("auth");
export const meEndpointLimiter = limiterFromDefinition("me");
export const ttsLimiter = limiterFromDefinition("ttsGenerate");
export const historyLimiter = limiterFromDefinition("ttsHistory");
export const adminLimiter = limiterFromDefinition("admin");
export const frontendLimiter = limiterFromDefinition("frontend");
export const totpLimiter = limiterFromDefinition("totp");
export const passkeyLimiter = limiterFromDefinition("passkey");
export const tamperLimiter = limiterFromDefinition("tamper");
export const commandLimiter = limiterFromDefinition("command");
export const ticketReadLimiter = limiterFromDefinition("ticketRead");
export const ticketWriteLimiter = limiterFromDefinition("ticketWrite");
export const ticketAdminLimiter = limiterFromDefinition("ticketAdmin");
export const libreChatLimiter = limiterFromDefinition("librechat");
export const dataCollectionLimiter = limiterFromDefinition("datacollection");
export const logsLimiter = limiterFromDefinition("logs");
export const ipfsLimiter = limiterFromDefinition("ipfs");
export const networkLimiter = limiterFromDefinition("network");
export const dataProcessLimiter = limiterFromDefinition("dataprocess");
export const mediaLimiter = limiterFromDefinition("media");
export const socialLimiter = limiterFromDefinition("social");
export const lifeLimiter = limiterFromDefinition("life");
export const miniapiLimiter = limiterFromDefinition("miniapi");
export const antaLimiter = limiterFromDefinition("anta");
export const statusLimiter = limiterFromDefinition("status");
export const openapiLimiter = limiterFromDefinition("openapi");
export const oauthLimiter = limiterFromDefinition("oauth");
export const audioFileLimiter = limiterFromDefinition("audio");
export const modlistMountLimiter = limiterFromDefinition("modlist");
export const cdkMountLimiter = limiterFromDefinition("cdk");
export const githubBillingLimiter = limiterFromDefinition("ghbilling");
export const linuxDoCreditLimiter = limiterFromDefinition("linuxdocredit");
export const deeplxLimiter = limiterFromDefinition("deeplx");
export const deeplxPublicLimiter = limiterFromDefinition("deeplxPublic");
export const integrityLimiter = limiterFromDefinition("integrity");
export const nexaiSecurityLimiter = limiterFromDefinition("nexaisecurity");
export const rootLimiter = limiterFromDefinition("root");
export const lcCompatLimiter = limiterFromDefinition("lccompat");
export const ipQueryLimiter = limiterFromDefinition("ipquery");
export const ipLocationLimiter = limiterFromDefinition("iplocation");
export const ipReportLimiter = limiterFromDefinition("ipreport");
export const serverStatusLimiter = limiterFromDefinition("serverstatus");
export const staticFileLimiter = limiterFromDefinition("static");
export const docsTimeoutLimiter = limiterFromDefinition("docstimeout");
export const cloudflareChallengeLimiter = limiterFromDefinition("cloudflareChallenge");
export const globalDefaultLimiter = limiterFromDefinition("global");
export const notFoundLimiter = limiterFromDefinition("notfound");
