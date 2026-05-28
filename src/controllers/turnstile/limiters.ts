import rateLimit from "express-rate-limit";

export const publicLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "请求过于频繁，请稍后再试" },
  keyGenerator: (req) => req.ip || req.socket.remoteAddress || "unknown",
  handler: (_req, res) => {
    res.status(429).json({ error: "请求过于频繁，请稍后再试", retryAfter: 60 });
  },
});

export const fingerprintLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "指纹验证请求过于频繁，请稍后再试" },
  keyGenerator: (req) => req.ip || req.socket.remoteAddress || "unknown",
  handler: (_req, res) => {
    res.status(429).json({ error: "指纹验证请求过于频繁，请稍后再试", retryAfter: 60 });
  },
});

export const authenticatedFingerprintLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "指纹上报请求过于频繁，请稍后再试" },
  keyGenerator: (req) => {
    const userId = (req as any).user?.id || "anonymous";
    const ip = req.ip || req.socket.remoteAddress || "unknown";
    return `${userId}:${ip}`;
  },
  handler: (_req, res) => {
    res.status(429).json({ error: "指纹上报请求过于频繁，请稍后再试", retryAfter: 60 });
  },
});

export const adminLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "管理员操作过于频繁，请稍后再试" },
  keyGenerator: (req) => req.ip || req.socket.remoteAddress || "unknown",
  handler: (_req, res) => {
    res.status(429).json({ error: "管理员操作过于频繁，请稍后再试", retryAfter: 60 });
  },
});

export const configLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "配置操作过于频繁，请稍后再试" },
  keyGenerator: (req) => req.ip || req.socket.remoteAddress || "unknown",
  handler: (_req, res) => {
    res.status(429).json({ error: "配置操作过于频繁，请稍后再试", retryAfter: 300 });
  },
});
