import type { Request, Response } from "express";
import rateLimit from "express-rate-limit";
import { config } from "../config/config";
import { sanitizeLogValue } from "../utils/requestLogSanitizer";
import logger from "../utils/logger";

// G1-29: 限流的规范系统是 routeLimiters.ts（profile + 共享 store + 429 指标）。
// 这里保留第二个 createLimiter 只因为它的 429 体额外带 retryAfter/routeName/code/stage，
// NexAI 等客户端按这些字段弹窗；直接合并会改掉这些路由的响应契约。
// 注意：本工厂用的是 express-rate-limit 默认内存 store，多实例部署下配额是「每进程」的。

// IP白名单配置
const whitelistedIPs = new Set<string>([
  ...(config.localIps || []),
  // 可以从配置文件添加更多白名单IP
]);

// 检查IP是否在白名单中
const isWhitelisted = (ip: string): boolean => {
  const localIps = config.localIps || [];
  return (
    whitelistedIPs.has(ip) ||
    localIps.some((pattern: string | RegExp) => {
      if (typeof pattern === "string") return ip === pattern;
      if (pattern instanceof RegExp) return pattern.test(ip);
      return false;
    })
  );
};

// 创建基础速率限制器
export const createLimiter = (options: {
  windowMs?: number;
  max?: number;
  message?: string;
  routeName?: string; // 添加路由名称用于日志
  /** Optional stable machine code for client dialogs (e.g. NEXAI_RATE_LIMIT). */
  code?: string;
  /** Optional pipeline stage for client dialogs (e.g. rate_limit). */
  stage?: string;
}) => {
  const windowMs = options.windowMs || 15 * 60 * 1000; // 默认15分钟
  const routeName = options.routeName || "未知路由";
  const errorMessage = options.message || "请求过于频繁，请稍后再试";
  const payload = {
    success: false as const,
    error: errorMessage,
    retryAfter: windowMs / 1000,
    routeName,
    ...(options.code ? { code: options.code } : {}),
    ...(options.stage ? { stage: options.stage } : {}),
  };

  return rateLimit({
    windowMs: windowMs,
    max: options.max || 100, // 默认限制100次
    message: payload,
    standardHeaders: true, // 返回 RateLimit-* 头
    legacyHeaders: false,
    skip: (req: Request): boolean => {
      const ip = req.ip || req.socket.remoteAddress || "unknown";
      return isWhitelisted(ip);
    },
    handler: (req: Request, res: Response) => {
      const ip = req.ip || req.socket.remoteAddress || "unknown";
      logger.warn(`速率限制超出: ${routeName} - IP: ${ip} - ${req.method} ${req.url}`, {
        ip,
        route: routeName,
        method: req.method,
        url: req.url,
        headers: sanitizeLogValue(req.headers),
        timestamp: new Date().toISOString(),
      });
      res.status(429).json(payload);
    },
    keyGenerator: (req: Request): string => {
      return req.ip || req.socket.remoteAddress || "unknown";
    },
  });
};

// 资源管理相关的速率限制器
export const resourceLimiter = {
  // 获取资源统计
  stats: createLimiter({
    windowMs: 1 * 60 * 1000, // 1分钟
    max: 30,
    routeName: "resource.stats",
    message: "资源统计查询过于频繁，请稍后再试",
  }),

  // 创建资源
  create: createLimiter({
    windowMs: 5 * 60 * 1000, // 5分钟
    max: 20,
    routeName: "resource.create",
    message: "资源创建请求过于频繁，请稍后再试",
  }),

  // 初始化测试资源
  initTest: createLimiter({
    windowMs: 10 * 60 * 1000, // 10分钟
    max: 5,
    routeName: "resource.initTest",
    message: "测试资源初始化请求过于频繁，请稍后再试",
  }),

  // 获取单个资源
  getById: createLimiter({
    windowMs: 1 * 60 * 1000, // 1分钟
    max: 60,
    routeName: "resource.getById",
    message: "资源查询请求过于频繁，请稍后再试",
  }),

  // 更新资源
  update: createLimiter({
    windowMs: 5 * 60 * 1000, // 5分钟
    max: 30,
    routeName: "resource.update",
    message: "资源更新请求过于频繁，请稍后再试",
  }),

  // 删除资源
  delete: createLimiter({
    windowMs: 5 * 60 * 1000, // 5分钟
    max: 20,
    routeName: "resource.delete",
    message: "资源删除请求过于频繁，请稍后再试",
  }),

  // 获取资源列表
  getResources: createLimiter({
    windowMs: 1 * 60 * 1000, // 1分钟
    max: 100,
    routeName: "resource.getResources",
    message: "资源列表查询过于频繁，请稍后再试",
  }),

  // 获取分类列表
  getCategories: createLimiter({
    windowMs: 1 * 60 * 1000, // 1分钟
    max: 60,
    routeName: "resource.getCategories",
    message: "分类查询过于频繁，请稍后再试",
  }),
};
