import { isIP } from "node:net";
import type { NextFunction, Request, Response } from "express";
import rateLimit from "express-rate-limit";
import { LRUCache } from "lru-cache";
import { config } from "../config/config";
import { IpBanModel } from "../models/ipBanModel";
import { securityBypassPolicy } from "../security/securityPolicy";
import logger from "../utils/logger";

// 性能监控指标
interface PerformanceMetrics {
  cacheHits: number;
  cacheMisses: number;
  redisQueries: number;
  mongoQueries: number;
  parallelQueries: number;
  avgResponseTime: number;
  totalRequests: number;
}

const metrics: PerformanceMetrics = {
  cacheHits: 0,
  cacheMisses: 0,
  redisQueries: 0,
  mongoQueries: 0,
  parallelQueries: 0,
  avgResponseTime: 0,
  totalRequests: 0,
};

// 每5分钟重置性能指标
const metricsResetTimer = setInterval(
  () => {
    if (metrics.totalRequests > 0) {
      const hitRate = ((metrics.cacheHits / metrics.totalRequests) * 100).toFixed(2);
      logger.info(
        `📊 IP封禁检查性能指标 [5分钟]: ` +
          `总请求=${metrics.totalRequests}, ` +
          `缓存命中率=${hitRate}%, ` +
          `Redis查询=${metrics.redisQueries}, ` +
          `Mongo查询=${metrics.mongoQueries}, ` +
          `并行查询=${metrics.parallelQueries}, ` +
          `平均响应=${metrics.avgResponseTime.toFixed(2)}ms`,
      );
    }
    // 重置计数器
    Object.keys(metrics).forEach((key) => {
      (metrics as any)[key] = 0;
    });
  },
  5 * 60 * 1000,
);
metricsResetTimer.unref?.();

// 内存缓存配置 - 用于减少数据库查询压力
// 已封禁的IP使用更长的TTL，未封禁的使用较短的TTL
const BANNED_IP_TTL = 10 * 60 * 1000; // 已封禁IP缓存10分钟
const CLEAN_IP_TTL = 2 * 60 * 1000; // 未封禁IP缓存2分钟

const banCache = new LRUCache<
  string,
  { banned: boolean; reason?: string; expiresAt?: Date | number; cachedAt: number }
>({
  max: 10000, // 最多缓存10000个IP
  ttl: CLEAN_IP_TTL, // 默认TTL
  updateAgeOnGet: false, // 不更新访问时间
  updateAgeOnHas: false,
  ttlAutopurge: true, // 自动清理过期项
});

// IP规范化结果缓存 - 避免重复计算
const normalizedIPCache = new LRUCache<string, string>({
  max: 5000,
  ttl: 30 * 60 * 1000, // 30分钟
  updateAgeOnGet: false,
});

// IP段匹配结果缓存 - 缓存IP是否在某个CIDR范围内
const cidrMatchCache = new LRUCache<string, boolean>({
  max: 5000,
  ttl: 5 * 60 * 1000, // 5分钟
  updateAgeOnGet: false,
});

// Redis降级状态跟踪 - 断路器模式
let redisFailureCount = 0;
let redisLastFailureTime = 0;
const REDIS_FAILURE_THRESHOLD = 5; // 连续失败5次后跳过Redis
const REDIS_COOLDOWN_MS = 60000; // 冷却时间1分钟

// Redis服务懒加载缓存
let redisServiceCache: any = null;
let redisServiceLoadPromise: Promise<any> | null = null;

// IP 封禁检查速率限制器 - 防止恶意 IP 频繁查询封禁状态
const ipBanCheckLimiter = rateLimit({
  windowMs: 60 * 1000, // 1分钟
  max: 100, // 每分钟最多100次请求
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false, // 计算所有请求
  skipFailedRequests: true, // 跳过失败的请求（避免攻击者通过失败请求绕过限制）
  keyGenerator: (req: Request) => {
    return getClientIP(req);
  },
  handler: (req: Request, res: Response) => {
    const clientIP = getClientIP(req);
    logger.warn(`⚠️ IP 封禁检查速率限制触发: ${clientIP}`);
    res.status(429).json({
      error: "请求过于频繁，请稍后再试",
      retryAfter: 60,
    });
  },
});

// 白名单路径 - 这些路径不进行IP封禁检查
const WHITELIST_PATHS = [
  ...securityBypassPolicy.ipBan.map((rule) => rule.value),
  // IP查询端点 - 允许客户端查询自己的IP
  "/api/ip",
  // 公告端点 - 允许公开访问
  "/api/admin/announcement",
  // 人机验证相关端点 - 必须放行以允许验证流程
  "/api/turnstile/verify",
  "/api/turnstile/verify-token",
  "/api/turnstile/public-turnstile",
  "/api/turnstile/public-config",
  "/api/turnstile/hcaptcha-verify",
  "/api/turnstile/secure-captcha-config",
  // 指纹相关端点（包括认证和非认证）
  "/api/turnstile/fingerprint/report",
  "/api/turnstile/fingerprint/status",
  "/api/turnstile/fingerprint/dismiss",
  "/api/turnstile/temp-fingerprint",
  "/api/turnstile/verify-temp-fingerprint",
  "/api/turnstile/verify-access-token",
  // 访问令牌和指纹状态查询
  "/api/turnstile/check-access-token",
];

/**
 * 安全地获取客户端真实IP地址
 * 考虑代理、负载均衡器和header伪造的情况
 */
function getClientIP(req: Request): string {
  // 如果Express配置了trust proxy，优先使用req.ip（最可靠）
  if (req.app.get("trust proxy") && req.ip) {
    return normalizeIP(req.ip);
  }

  // 从x-forwarded-for获取第一个IP（最左边是真实客户端IP）
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) {
    const ips = (Array.isArray(forwarded) ? forwarded[0] : forwarded)
      .split(",")
      .map((ip) => ip.trim())
      .filter((ip) => ip);
    if (ips.length > 0) {
      return normalizeIP(ips[0]);
    }
  }

  // 备选方案：x-real-ip header
  const realIP = req.headers["x-real-ip"];
  if (realIP && typeof realIP === "string") {
    return normalizeIP(realIP);
  }

  // 最后使用socket地址
  return normalizeIP(req.socket.remoteAddress || "unknown");
}

/**
 * 规范化IP地址（带缓存优化）
 * 处理IPv6映射的IPv4地址和IPv6地址压缩
 */
function normalizeIP(ip: string): string {
  if (!ip) {
    return "unknown";
  }

  // 快速路径：检查缓存
  const cached = normalizedIPCache.get(ip);
  if (cached !== undefined) {
    return cached;
  }

  let cleaned = ip.trim();

  // 快速路径：常见的IPv4地址格式（无需额外处理）
  const ipv4Pattern = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;
  if (ipv4Pattern.test(cleaned)) {
    normalizedIPCache.set(ip, cleaned);
    return cleaned;
  }

  if (cleaned.startsWith("[") && cleaned.endsWith("]")) {
    cleaned = cleaned.slice(1, -1);
  }

  const zoneIndex = cleaned.indexOf("%");
  if (zoneIndex !== -1) {
    cleaned = cleaned.slice(0, zoneIndex);
  }

  // 处理IPv6映射的IPv4地址 (::ffff:192.168.1.1 -> 192.168.1.1)
  cleaned = cleaned.replace(/^::ffff:/i, "");

  const ipType = isIP(cleaned);

  let result: string;
  if (ipType === 4) {
    result = cleaned;
  } else if (ipType === 6) {
    result = normalizeIPv6(cleaned);
  } else {
    result = cleaned.toLowerCase();
  }

  // 缓存结果
  normalizedIPCache.set(ip, result);
  return result;
}

function normalizeIPv6(address: string): string {
  const lower = address.toLowerCase();
  const expandedSegments = expandIPv6(lower);
  return compressIPv6(expandedSegments);
}

function expandIPv6(address: string): string[] {
  let working = address;

  // 处理嵌入的IPv4地址（如 ::ffff:192.0.2.128 或 2001:db8::1.2.3.4）
  if (working.includes(".")) {
    const lastColon = working.lastIndexOf(":");
    if (lastColon !== -1) {
      const ipv4Part = working.slice(lastColon + 1);
      if (isIP(ipv4Part) === 4) {
        const octets = ipv4Part.split(".").map((part) => Number(part));
        if (octets.length === 4 && octets.every((octet) => Number.isInteger(octet) && octet >= 0 && octet <= 255)) {
          const hextets = [
            ((octets[0] << 8) | octets[1]).toString(16).padStart(4, "0"),
            ((octets[2] << 8) | octets[3]).toString(16).padStart(4, "0"),
          ];
          working = `${working.slice(0, lastColon)}:${hextets[0]}:${hextets[1]}`;
        }
      }
    }
  }

  const parts = working.split("::");
  const headParts = parts[0] ? parts[0].split(":").filter(Boolean) : [];
  const tailParts = parts.length > 1 ? parts[1].split(":").filter(Boolean) : [];

  const normalizedHead = headParts.map((part) => part.padStart(4, "0"));
  const normalizedTail = tailParts.map((part) => part.padStart(4, "0"));

  const missingSegments = 8 - (normalizedHead.length + normalizedTail.length);
  const zeros = new Array(Math.max(missingSegments, 0)).fill("0000");

  return [...normalizedHead, ...zeros, ...normalizedTail].slice(0, 8);
}

function compressIPv6(segments: string[]): string {
  const simplified = segments.map((segment) => {
    const trimmed = segment.replace(/^0+/, "");
    return trimmed === "" ? "0" : trimmed;
  });

  let bestStart = -1;
  let bestLength = 0;
  let currentStart = -1;
  let currentLength = 0;

  simplified.forEach((segment, index) => {
    if (segment === "0") {
      if (currentStart === -1) {
        currentStart = index;
        currentLength = 1;
      } else {
        currentLength += 1;
      }
    } else {
      if (currentLength > bestLength) {
        bestStart = currentStart;
        bestLength = currentLength;
      }
      currentStart = -1;
      currentLength = 0;
    }
  });

  if (currentLength > bestLength) {
    bestStart = currentStart;
    bestLength = currentLength;
  }

  if (bestLength <= 1) {
    return simplified.join(":");
  }

  const before = simplified.slice(0, bestStart).join(":");
  const after = simplified.slice(bestStart + bestLength).join(":");

  if (!before && !after) {
    return "::";
  }

  if (!before) {
    return `::${after}`;
  }

  if (!after) {
    return `${before}::`;
  }

  return `${before}::${after}`;
}

/**
 * 解析CIDR表示法（支持IPv4和IPv6）
 * 返回网络地址和前缀长度
 */
function parseCIDR(cidr: string): { network: string; prefixLength: number; isIPv6: boolean } | null {
  const parts = cidr.split("/");
  if (parts.length !== 2) {
    return null;
  }

  const network = normalizeIP(parts[0]);
  const prefixLength = parseInt(parts[1], 10);

  const ipType = isIP(network);
  if (ipType === 0) {
    return null;
  }

  const isIPv6 = ipType === 6;
  const maxPrefix = isIPv6 ? 128 : 32;

  if (Number.isNaN(prefixLength) || prefixLength < 0 || prefixLength > maxPrefix) {
    return null;
  }

  return { network, prefixLength, isIPv6 };
}

/**
 * 将IPv4地址转换为32位整数
 */
function ipv4ToInt(ip: string): number {
  const parts = ip.split(".");
  if (parts.length !== 4) {
    return 0;
  }

  return (
    parts.reduce((acc, octet) => {
      const num = parseInt(octet, 10);
      return (acc << 8) | num;
    }, 0) >>> 0
  ); // 使用无符号右移确保为正数
}

/**
 * 将IPv6地址转换为BigInt
 */
function ipv6ToBigInt(ip: string): bigint {
  const expanded = expandIPv6(ip);
  let result = 0n;

  for (const segment of expanded) {
    const value = parseInt(segment, 16);
    result = (result << 16n) | BigInt(value);
  }

  return result;
}

/**
 * 检查IP是否在CIDR范围内（支持IPv4和IPv6）
 */
function isIPInCIDR(ip: string, cidr: string): boolean {
  // 检查缓存
  const cacheKey = `${ip}:${cidr}`;
  const cached = cidrMatchCache.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }

  const parsed = parseCIDR(cidr);
  if (!parsed) {
    cidrMatchCache.set(cacheKey, false);
    return false;
  }

  const { network, prefixLength, isIPv6 } = parsed;
  const normalizedIP = normalizeIP(ip);

  // 检查IP类型是否匹配
  const ipType = isIP(normalizedIP);
  if ((isIPv6 && ipType !== 6) || (!isIPv6 && ipType !== 4)) {
    cidrMatchCache.set(cacheKey, false);
    return false;
  }

  let result: boolean;

  if (isIPv6) {
    // IPv6 CIDR匹配
    const ipBigInt = ipv6ToBigInt(normalizedIP);
    const networkBigInt = ipv6ToBigInt(network);
    const mask = (1n << BigInt(128 - prefixLength)) - 1n;
    const invertedMask = ~mask & ((1n << 128n) - 1n);

    result = (ipBigInt & invertedMask) === (networkBigInt & invertedMask);
  } else {
    // IPv4 CIDR匹配
    const ipInt = ipv4ToInt(normalizedIP);
    const networkInt = ipv4ToInt(network);
    const mask = (0xffffffff << (32 - prefixLength)) >>> 0;

    result = (ipInt & mask) === (networkInt & mask);
  }

  // 缓存结果
  cidrMatchCache.set(cacheKey, result);
  return result;
}

/**
 * 检查路径是否在白名单中
 * 使用精确匹配和安全的前缀匹配
 */
function isWhitelistedPath(path: string): boolean {
  return WHITELIST_PATHS.some((whitelistPath) => {
    // 精确匹配
    if (path === whitelistPath) {
      return true;
    }
    // 前缀匹配（确保后面跟着斜杠，避免误匹配）
    if (path.startsWith(`${whitelistPath}/`)) {
      return true;
    }
    return false;
  });
}

/**
 * 检查Redis是否应该被跳过（断路器模式）
 */
function shouldSkipRedis(): boolean {
  const now = Date.now();

  // 如果在冷却期内且失败次数超过阈值，跳过Redis
  if (redisFailureCount >= REDIS_FAILURE_THRESHOLD) {
    if (now - redisLastFailureTime < REDIS_COOLDOWN_MS) {
      return true;
    }
    // 冷却期结束，重置计数器
    redisFailureCount = 0;
  }

  return false;
}

/**
 * 记录Redis失败
 */
function recordRedisFailure(): void {
  redisFailureCount++;
  redisLastFailureTime = Date.now();

  if (redisFailureCount === REDIS_FAILURE_THRESHOLD) {
    logger.error(
      `🔴 Redis连续失败${REDIS_FAILURE_THRESHOLD}次，启动断路器，${REDIS_COOLDOWN_MS / 1000}秒内跳过Redis检查`,
    );
  }
}

/**
 * 懒加载Redis服务（避免启动时阻塞）
 */
async function getRedisService(): Promise<any> {
  if (redisServiceCache) {
    return redisServiceCache;
  }

  // 如果正在加载，等待加载完成
  if (redisServiceLoadPromise) {
    return redisServiceLoadPromise;
  }

  // 开始加载
  redisServiceLoadPromise = import("../services/redisService.js")
    .then((module) => {
      redisServiceCache = module.redisService;
      redisServiceLoadPromise = null;
      return redisServiceCache;
    })
    .catch((error) => {
      redisServiceLoadPromise = null;
      throw error;
    });

  return redisServiceLoadPromise;
}

// CIDR 封禁列表缓存（避免每次请求都做 $regex 全表扫描）
let cachedCIDRBans: any[] | null = null;
let cidrBansCacheTime = 0;
let cidrBansLoadPromise: Promise<any[]> | null = null;
const CIDR_CACHE_TTL = 2 * 60 * 1000; // 2 分钟

async function getCachedCIDRBans(): Promise<any[]> {
  const now = Date.now();
  if (cachedCIDRBans && now - cidrBansCacheTime < CIDR_CACHE_TTL) {
    return cachedCIDRBans;
  }

  if (cidrBansLoadPromise) {
    return cidrBansLoadPromise;
  }

  cidrBansLoadPromise = IpBanModel.find({
    ipAddress: { $regex: /\//, $options: "" },
    expiresAt: { $gt: new Date() },
  })
    .select("ipAddress reason expiresAt")
    .lean()
    .then((bans) => {
      cachedCIDRBans = bans;
      cidrBansCacheTime = Date.now();
      return bans;
    })
    .finally(() => {
      cidrBansLoadPromise = null;
    });

  return cidrBansLoadPromise;
}

/**
 * 并行查询Redis和MongoDB（竞速模式）
 * 返回最快的结果，提高响应速度
 * 支持精确IP匹配和CIDR IP段匹配
 */
async function parallelBanCheck(normalizedIP: string): Promise<{
  bannedInfo: { reason: string; expiresAt: Date } | null;
  source: "redis" | "mongodb" | "none";
}> {
  const promises: Promise<any>[] = [];
  const sources: string[] = [];

  // Redis查询（精确匹配）
  if (config.ipBanStorage === "redis" && !shouldSkipRedis()) {
    promises.push(
      getRedisService()
        .then((redisService) => redisService.checkIPBan(normalizedIP))
        .then((result) => ({ result, source: "redis" }))
        .catch((error) => {
          recordRedisFailure();
          logger.warn(`⚠️ Redis并行查询失败:`, error);
          return { result: null, source: "redis", error: true };
        }),
    );
    sources.push("redis");
  }

  // MongoDB查询 - 精确匹配
  promises.push(
    IpBanModel.findOne({
      ipAddress: normalizedIP,
      expiresAt: { $gt: new Date() },
    })
      .select("reason expiresAt")
      .lean() // 使用lean()提高查询性能
      .then((result) => ({ result, source: "mongodb-exact" }))
      .catch((error) => {
        logger.error("🔴 MongoDB精确查询失败:", error);
        return { result: null, source: "mongodb-exact", error: true };
      }),
  );
  sources.push("mongodb-exact");

  // MongoDB查询 - CIDR IP段匹配
  // 使用内存缓存的 CIDR 列表避免每次请求都做 $regex 全表扫描
  promises.push(
    (async () => {
      try {
        // 优先使用缓存的 CIDR 列表（每 2 分钟刷新一次）
        const cidrBans = await getCachedCIDRBans();
        const match = cidrBans?.find((ban) => isIPInCIDR(normalizedIP, ban.ipAddress));
        return { result: match || null, source: "mongodb-cidr" };
      } catch (error) {
        logger.error("🔴 MongoDB CIDR查询失败:", error);
        return { result: null, source: "mongodb-cidr", error: true };
      }
    })(),
  );
  sources.push("mongodb-cidr");

  metrics.parallelQueries++;

  try {
    // 使用Promise.race获取最快的成功结果
    // 但我们需要等待所有promise，因为我们想要任何一个成功的结果
    const results = await Promise.allSettled(promises);

    // 优先使用Redis结果（如果成功）
    for (const result of results) {
      if (result.status === "fulfilled" && result.value && !result.value.error) {
        const { result: data, source } = result.value;

        if (data) {
          const bannedInfo = {
            reason: data.reason,
            expiresAt: new Date(data.expiresAt),
          };

          // Redis成功，重置失败计数
          if (source === "redis" && redisFailureCount > 0) {
            redisFailureCount = 0;
            logger.info("✅ Redis恢复正常");
          }

          if (source === "redis") {
            metrics.redisQueries++;
          } else if (source === "mongodb-exact" || source === "mongodb-cidr") {
            metrics.mongoQueries++;
          }

          // 记录CIDR匹配
          if (source === "mongodb-cidr") {
            logger.info(`🎯 CIDR IP段匹配: ${normalizedIP} 在 ${data.ipAddress} 范围内`);
          }

          return { bannedInfo, source: source as "redis" | "mongodb" };
        }
      }
    }

    // 没有找到封禁记录，返回null
    // 统计实际执行的查询
    results.forEach((result, index) => {
      if (result.status === "fulfilled" && !result.value?.error) {
        if (sources[index] === "redis") {
          metrics.redisQueries++;
        } else if (sources[index] === "mongodb-exact" || sources[index] === "mongodb-cidr") {
          metrics.mongoQueries++;
        }
      }
    });

    return { bannedInfo: null, source: "none" };
  } catch (error) {
    logger.error("🔴 并行查询发生严重错误:", error);
    throw error;
  }
}

/**
 * 缓存预热：启动时加载最近的封禁IP
 */
export async function warmupBanCache(): Promise<void> {
  try {
    logger.info("🔥 开始预热IP封禁缓存...");

    // 从MongoDB加载最近100个活跃的封禁记录
    const recentBans = await IpBanModel.find({
      expiresAt: { $gt: new Date() },
    })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    recentBans.forEach((ban) => {
      const normalizedIP = normalizeIP(ban.ipAddress);
      banCache.set(
        normalizedIP,
        {
          banned: true,
          reason: ban.reason,
          expiresAt: ban.expiresAt,
          cachedAt: Date.now(),
        },
        { ttl: BANNED_IP_TTL },
      );
    });

    logger.info(`✅ IP封禁缓存预热完成，加载了 ${recentBans.length} 条记录`);
  } catch (error) {
    logger.error("⚠️ IP封禁缓存预热失败:", error);
    // 预热失败不应该影响系统启动
  }
}

/**
 * 获取性能指标（用于监控）
 */
export function getPerformanceMetrics(): PerformanceMetrics {
  return { ...metrics };
}

/**
 * 清空所有缓存（用于管理）
 */
export function clearAllCaches(): void {
  banCache.clear();
  normalizedIPCache.clear();
  cachedCIDRBans = null;
  cidrBansCacheTime = 0;
  logger.info("🗑️ 已清空所有IP封禁缓存");
}

/**
 * IP封禁检查中间件
 * 检查请求IP是否在封禁列表中，如果是则直接拒绝请求
 * 包含多层缓存和降级策略以确保高可用性
 */
export const ipBanCheckMiddleware = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const startTime = Date.now();

  try {
    metrics.totalRequests++;

    // 快速路径1：检查是否是白名单路径
    if (isWhitelistedPath(req.path)) {
      next();
      return;
    }

    // 获取并规范化客户端IP（带缓存优化）
    const normalizedIP = getClientIP(req);

    // 快速路径2：检查内存缓存
    const cached = banCache.get(normalizedIP);
    if (cached !== undefined) {
      metrics.cacheHits++;

      // 检查缓存是否过期（对于已封禁的IP，检查expiresAt）
      if (cached.banned && cached.expiresAt) {
        const expiresAt = cached.expiresAt instanceof Date ? cached.expiresAt : new Date(cached.expiresAt);
        if (expiresAt <= new Date()) {
          // 封禁已过期，从缓存中删除
          banCache.delete(normalizedIP);
          metrics.cacheMisses++; // 转为缓存未命中
          // 继续执行数据库查询
        } else {
          // 封禁仍有效
          logger.warn(
            `🚫 [缓存命中] 封禁IP尝试访问: ${normalizedIP}, ` +
              `路径: ${req.method} ${req.path}, ` +
              `原因: ${cached.reason}`,
          );

          const responseTime = Date.now() - startTime;
          metrics.avgResponseTime =
            (metrics.avgResponseTime * (metrics.totalRequests - 1) + responseTime) / metrics.totalRequests;

          res.status(403).json({
            error: "您的IP地址已被封禁，无法访问此服务",
            reason: cached.reason,
            expiresAt: cached.expiresAt,
          });
          return;
        }
      } else if (!cached.banned) {
        // 缓存显示未封禁，直接放行
        const responseTime = Date.now() - startTime;
        metrics.avgResponseTime =
          (metrics.avgResponseTime * (metrics.totalRequests - 1) + responseTime) / metrics.totalRequests;

        next();
        return;
      }
    } else {
      metrics.cacheMisses++;
    }

    // 第二层：并行查询Redis和MongoDB（性能优化）
    const { bannedInfo, source: checkSource } = await parallelBanCheck(normalizedIP);

    // 如果IP被封禁，拒绝请求并缓存结果
    if (bannedInfo) {
      // 缓存封禁结果（使用较长的TTL）
      banCache.set(
        normalizedIP,
        {
          banned: true,
          reason: bannedInfo.reason,
          expiresAt: bannedInfo.expiresAt,
          cachedAt: Date.now(),
        },
        { ttl: BANNED_IP_TTL }, // 已封禁IP使用更长的TTL
      );

      logger.warn(
        `🚫 [${checkSource.toUpperCase()}] 封禁IP尝试访问: ${normalizedIP}, ` +
          `路径: ${req.method} ${req.path}, ` +
          `原因: ${bannedInfo.reason}, ` +
          `到期时间: ${bannedInfo.expiresAt}`,
      );

      const responseTime = Date.now() - startTime;
      metrics.avgResponseTime =
        (metrics.avgResponseTime * (metrics.totalRequests - 1) + responseTime) / metrics.totalRequests;

      res.status(403).json({
        error: "您的IP地址已被封禁，无法访问此服务",
        reason: bannedInfo.reason,
        expiresAt: bannedInfo.expiresAt,
      });
      return;
    }

    // IP未被封禁，缓存结果（使用较短的TTL）
    banCache.set(
      normalizedIP,
      {
        banned: false,
        cachedAt: Date.now(),
      },
      { ttl: CLEAN_IP_TTL }, // 未封禁IP使用较短的TTL
    );

    const responseTime = Date.now() - startTime;
    metrics.avgResponseTime =
      (metrics.avgResponseTime * (metrics.totalRequests - 1) + responseTime) / metrics.totalRequests;

    // IP未被封禁，继续处理请求
    next();
  } catch (error) {
    // 区分错误类型进行处理
    const normalizedIP = getClientIP(req);

    if (error instanceof Error) {
      // 数据库连接错误 - 这是严重问题
      if (error.message.includes("connect") || error.message.includes("timeout")) {
        logger.error("🔴 数据库连接失败，IP封禁检查不可用:", error.message);

        // 检查是否有缓存的封禁信息（即使过期也使用）
        const staleCache = banCache.get(normalizedIP);
        if (staleCache?.banned) {
          logger.warn(`⚠️ 使用过期缓存拒绝可能被封禁的IP: ${normalizedIP}`);
          res.status(403).json({
            error: "您的IP地址已被封禁，无法访问此服务",
            reason: staleCache.reason || "系统维护中",
            expiresAt: staleCache.expiresAt,
          });
          return;
        }

        // 无缓存信息，返回503表示服务暂时不可用
        logger.error(`⚠️ 无法验证IP ${normalizedIP} 的封禁状态，返回503`);
        res.status(503).json({
          error: "服务暂时不可用，请稍后重试",
          retryAfter: 30,
        });
        return;
      }
    }

    // 其他错误 - 记录但允许请求继续（避免误伤）
    logger.error("⚠️ IP封禁检查发生未知错误，允许请求继续:", error);
    next();
  }
};

/**
 * 带速率限制的 IP 封禁检查中间件（推荐使用）
 * 组合了速率限制和 IP 封禁检查，提供更好的安全保护
 */
export const ipBanCheckWithRateLimit = [ipBanCheckLimiter, ipBanCheckMiddleware];

/**
 * 清除指定IP的所有相关缓存
 * 用于IP解封后立即生效，避免缓存导致的延迟
 * @param ipAddress IP地址（原始格式或CIDR格式）
 */
export function clearIPBanCache(ipAddress: string): void {
  try {
    // 1. 规范化IP地址
    const normalizedIP = normalizeIP(ipAddress);

    // 2. 清除封禁缓存
    if (banCache.has(normalizedIP)) {
      banCache.delete(normalizedIP);
      logger.info(`🗑️ 已清除IP封禁缓存: ${normalizedIP}`);
    }

    // 3. 清除IP规范化缓存
    if (normalizedIPCache.has(ipAddress)) {
      normalizedIPCache.delete(ipAddress);
    }
    if (ipAddress !== normalizedIP && normalizedIPCache.has(normalizedIP)) {
      normalizedIPCache.delete(normalizedIP);
    }

    // 4. 清除CIDR匹配缓存 - 清除所有与该IP相关的CIDR匹配结果
    // 由于无法直接遍历LRU缓存的所有键，我们清除包含该IP的缓存项
    // 注意：这只能清除以该IP作为key前缀的项
    const cidrKeys: string[] = [];
    cidrMatchCache.forEach((_value, key) => {
      if (key.startsWith(`${normalizedIP}:`)) {
        cidrKeys.push(key);
      }
    });

    cidrKeys.forEach((key) => {
      cidrMatchCache.delete(key);
    });

    if (cidrKeys.length > 0) {
      logger.info(`🗑️ 已清除${cidrKeys.length}个CIDR匹配缓存项`);
    }

    logger.info(`✅ 成功清除IP ${ipAddress} 的所有相关缓存`);
  } catch (error) {
    logger.error(`清除IP缓存失败: ${ipAddress}`, error);
  }
}

/**
 * 清除所有IP封禁相关缓存
 * 用于批量操作或系统维护
 */
export function clearAllIPBanCache(): void {
  try {
    const banCacheSize = banCache.size;
    const normalizedCacheSize = normalizedIPCache.size;
    const cidrCacheSize = cidrMatchCache.size;

    banCache.clear();
    normalizedIPCache.clear();
    cidrMatchCache.clear();

    logger.info(
      `🗑️ 已清除所有IP封禁缓存: ` +
        `封禁缓存=${banCacheSize}, ` +
        `规范化缓存=${normalizedCacheSize}, ` +
        `CIDR缓存=${cidrCacheSize}`,
    );
  } catch (error) {
    logger.error("清除所有IP缓存失败", error);
  }
}
