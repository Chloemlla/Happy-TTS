import type { NextFunction, Request, Response } from "express";
import { recordUsage, validateApiKey } from "../services/apiKeyService";
import logger from "../utils/logger";
import { UserStorage } from "../utils/userStorage";
import { attachApiKeyBillingFinalizer, preauthorizeApiKeyBilling } from "../services/apiKeyBillingService";
import { apiKeyRateLimiter, SharedRateLimitUnavailableError } from "../services/apiKeyRateLimitService";
import { oauthTokenAuth } from "./oauthTokenAuth";
import type { AuthenticatedRequest } from "../types/authRequest";

/**
 * API Key 认证中间件工厂
 * @param requiredPermission 该路由需要的权限标识，如 'tts'
 */
export function apiKeyAuth(requiredPermission: string) {
  const oauthAuth = oauthTokenAuth(requiredPermission, { optional: true });

  return async (req: Request, res: Response, next: NextFunction) => {
    const authReq = req as AuthenticatedRequest;
    // 如果已经通过 JWT 认证（req.user 存在），直接放行
    if (authReq.user) return next();

    const header = req.headers["x-api-key"] as string | undefined;
    if (!header) return oauthAuth(req, res, next); // 没有 API Key 时尝试 OAuth Bearer，仍没有则交给后续链路

    try {
      const doc = await validateApiKey(header);
      if (!doc) {
        return res.status(401).json({ error: "API Key 无效或已过期" });
      }

      const owner = await UserStorage.getUserById(doc.userId);
      if (!owner) {
        return res.status(401).json({ error: "API Key 所属用户不存在" });
      }
      if ((owner as any).disabled || (owner as any).accountStatus === "suspended") {
        return res.status(403).json({ error: "API Key 所属账户不可用" });
      }

      // 权限检查
      if (!doc.permissions.includes(requiredPermission) && !doc.permissions.includes("*")) {
        return res.status(403).json({ error: `此 API Key 无 "${requiredPermission}" 权限` });
      }

      // 使用 Redis/MongoDB 共享计数器，确保多实例对同一 API Key 的动态限额一致。
      // 共享后端均不可用时 fail closed，避免每个进程各自放宽限额。
      const rateLimit = await apiKeyRateLimiter.consume(doc.keyId, doc.rateLimit);
      res.setHeader("RateLimit-Limit", String(rateLimit.limit));
      res.setHeader("RateLimit-Remaining", String(Math.max(0, rateLimit.limit - rateLimit.totalHits)));
      res.setHeader("RateLimit-Reset", String(Math.ceil(rateLimit.resetTime.getTime() / 1000)));
      if (!rateLimit.allowed) {
        return res.status(429).json({ error: "此 API Key 请求过于频繁，请稍后再试" });
      }

      const billingContext = await preauthorizeApiKeyBilling(doc, requiredPermission, req);
      attachApiKeyBillingFinalizer(billingContext, res);

      // 记录使用
      const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.ip || "";
      recordUsage(doc.keyId, ip).catch(() => {}); // fire-and-forget

      // 注入用户信息，使下游中间件/控制器可用
      // API Key 路径历史上不继承管理员角色，保持兼容。
      const apiKeyUser = {
        id: doc.userId,
        username: owner.username || `apikey:${doc.keyId}`,
        role: "user" as const,
      } as typeof owner;
      authReq.user = apiKeyUser;
      authReq.apiKey = doc;
      authReq.auth = { kind: "apiKey", user: apiKeyUser, apiKey: doc };

      next();
    } catch (err) {
      if (err instanceof SharedRateLimitUnavailableError) {
        logger.error("[ApiKeyAuth] 共享限流后端不可用，拒绝 API Key 请求", { error: err.message });
        res.setHeader("Retry-After", "60");
        return res.status(503).json({ error: "API Key 限流服务暂不可用，请稍后再试" });
      }
      const statusCode = typeof (err as any)?.statusCode === "number" ? (err as any).statusCode : 500;
      if (statusCode !== 500) {
        return res.status(statusCode).json({ error: err instanceof Error ? err.message : "API Key 计费失败" });
      }
      logger.error("[ApiKeyAuth] 验证失败", err);
      return res.status(500).json({ error: "API Key 验证失败" });
    }
  };
}
