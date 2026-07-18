import type { Request } from "express";
import { adminLimiter as sharedAdminLimiter, createLimiter } from "../../middleware/routeLimiters";

export const publicLimiter = createLimiter({
  name: "turnstilePublic",
  profile: "burst",
  category: "public-api",
  max: 120,
  message: "请求过于频繁，请稍后再试",
  handler: (_req, res) => {
    res.status(429).json({ error: "请求过于频繁，请稍后再试", retryAfter: 60 });
  },
});

export const fingerprintLimiter = createLimiter({
  name: "turnstileFingerprint",
  profile: "verification",
  category: "verification",
  message: "指纹验证请求过于频繁，请稍后再试",
  handler: (_req, res) => {
    res.status(429).json({ error: "指纹验证请求过于频繁，请稍后再试", retryAfter: 60 });
  },
});

export const authenticatedFingerprintLimiter = createLimiter({
  name: "turnstileAuthenticatedFingerprint",
  profile: "sensitive",
  category: "verification",
  message: "指纹上报请求过于频繁，请稍后再试",
  keyGenerator: (req: Request) => {
    const userId = (req as any).user?.id || "anonymous";
    const ip = req.ip || req.socket.remoteAddress || "unknown";
    return `${userId}:${ip}`;
  },
  handler: (_req, res) => {
    res.status(429).json({ error: "指纹上报请求过于频繁，请稍后再试", retryAfter: 60 });
  },
});

export const adminLimiter = sharedAdminLimiter;

export const configLimiter = createLimiter({
  name: "turnstileConfig",
  profile: "burst",
  category: "admin",
  windowMs: 5 * 60 * 1000,
  max: 120,
  message: "配置操作过于频繁，请稍后再试",
  handler: (_req, res) => {
    res.status(429).json({ error: "配置操作过于频繁，请稍后再试", retryAfter: 300 });
  },
});
