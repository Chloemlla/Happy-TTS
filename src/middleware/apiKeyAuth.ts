import type { NextFunction, Request, Response } from "express";
import { recordUsage, validateApiKey } from "../services/apiKeyService";
import logger from "../utils/logger";

// 简易内存滑动窗口限流
const windowMap = new Map<string, { count: number; resetAt: number }>();

/**
 * API Key 认证中间件工厂
 * @param requiredPermission 该路由需要的权限标识，如 'tts'
 */
export function apiKeyAuth(requiredPermission: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    // 如果已经通过 JWT 认证（req.user 存在），直接放行
    if ((req as any).user) return next();

    const header = req.headers["x-api-key"] as string | undefined;
    if (!header) return next(); // 没有 API Key header，交给后续 JWT 中间件处理

    try {
      const doc = await validateApiKey(header);
      if (!doc) {
        return res.status(401).json({ error: "API Key 无效或已过期" });
      }

      // 权限检查
      if (!doc.permissions.includes(requiredPermission) && !doc.permissions.includes("*")) {
        return res.status(403).json({ error: `此 API Key 无 "${requiredPermission}" 权限` });
      }

      // 限流检查
      const now = Date.now();
      const windowKey = `apikey:${doc.keyId}`;
      let bucket = windowMap.get(windowKey);
      if (!bucket || now > bucket.resetAt) {
        bucket = { count: 0, resetAt: now + 60_000 };
        windowMap.set(windowKey, bucket);
      }
      bucket.count++;
      if (bucket.count > doc.rateLimit) {
        return res.status(429).json({ error: "此 API Key 请求过于频繁，请稍后再试" });
      }

      // 记录使用
      const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.ip || "";
      recordUsage(doc.keyId, ip).catch(() => {}); // fire-and-forget

      // 注入用户信息，使下游中间件/控制器可用
      (req as any).user = { id: doc.userId, username: `apikey:${doc.keyId}`, role: "user" };
      (req as any).apiKey = doc;

      next();
    } catch (err) {
      logger.error("[ApiKeyAuth] 验证失败", err);
      return res.status(500).json({ error: "API Key 验证失败" });
    }
  };
}
