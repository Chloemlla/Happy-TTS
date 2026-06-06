import type { NextFunction, Request, Response } from "express";
import {
  isOAuthAccessTokenValue,
  OAuthError,
  recordOAuthTokenUsage,
  validateOAuthAccessToken,
} from "../services/oauthService";
import logger from "../utils/logger";

const oauthRateBuckets = new Map<string, { count: number; resetAt: number }>();

function getBearerToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.substring(7).trim();
  return token || null;
}

function resolveIp(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (Array.isArray(forwarded) && forwarded.length > 0) return forwarded[0].split(",")[0].trim();
  if (typeof forwarded === "string" && forwarded.trim()) return forwarded.split(",")[0].trim();
  return req.ip || req.socket.remoteAddress || "unknown";
}

function checkTokenRateLimit(tokenId: string, maxPerMinute: number): boolean {
  const now = Date.now();
  const bucketKey = `oauth:${tokenId}`;
  let bucket = oauthRateBuckets.get(bucketKey);
  if (!bucket || now > bucket.resetAt) {
    bucket = { count: 0, resetAt: now + 60_000 };
    oauthRateBuckets.set(bucketKey, bucket);
  }

  bucket.count += 1;
  return bucket.count <= maxPerMinute;
}

function sendOAuthAuthError(res: Response, error: unknown): Response {
  if (error instanceof OAuthError) {
    if (error.errorCode === "insufficient_scope") {
      res.set("WWW-Authenticate", `Bearer error="insufficient_scope", error_description="${error.errorDescription}"`);
    } else {
      res.set("WWW-Authenticate", `Bearer error="${error.errorCode}", error_description="${error.errorDescription}"`);
    }
    return res.status(error.statusCode).json({
      error: error.errorDescription,
      oauthError: error.errorCode,
    });
  }

  logger.error("[OAuthTokenAuth] 验证失败", error);
  return res.status(500).json({ error: "OAuth token 验证失败" });
}

export function oauthTokenAuth(requiredScope?: string, opts: { optional?: boolean } = {}) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if ((req as any).user && (req as any).oauthToken) return next();

    const token = getBearerToken(req);
    if (!token) {
      if (opts.optional) return next();
      return res.status(401).json({ error: "缺少 OAuth access token" });
    }

    if (!isOAuthAccessTokenValue(token)) {
      if (opts.optional) return next();
      return res.status(401).json({ error: "无效的 OAuth access token" });
    }

    try {
      const context = await validateOAuthAccessToken(token, requiredScope);
      if (!checkTokenRateLimit(context.token.tokenId, context.client.rateLimitPerMinute || 120)) {
        return res.status(429).json({ error: "OAuth token 请求过于频繁，请稍后再试" });
      }

      (req as any).user = context.user;
      (req as any).oauthToken = {
        tokenId: context.token.tokenId,
        clientId: context.client.clientId,
        scopes: context.scopes,
        grantId: context.grant.grantId,
      };
      (req as any).oauthContext = context;

      recordOAuthTokenUsage(context, resolveIp(req)).catch((error) => {
        logger.warn("[OAuthTokenAuth] 记录 token 使用失败", {
          tokenId: context.token.tokenId,
          error: error instanceof Error ? error.message : String(error),
        });
      });

      return next();
    } catch (error) {
      return sendOAuthAuthError(res, error);
    }
  };
}
