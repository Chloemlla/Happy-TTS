import type { NextFunction, Request, Response } from "express";
import {
  isOAuthAccessTokenValue,
  OAuthError,
  recordOAuthTokenUsage,
  validateOAuthAccessToken,
} from "../services/oauthService";
import logger from "../utils/logger";
import type { AuthenticatedRequest, OAuthRequestContext } from "../types/authRequest";

const oauthRateBuckets = new Map<string, { count: number; resetAt: number }>();
const OAUTH_RATE_BUCKET_CLEANUP_INTERVAL_MS = 60_000;
const MAX_OAUTH_RATE_BUCKETS = 50_000;
let oauthRateBucketCleanupTimer: ReturnType<typeof setInterval> | null = null;

function getBearerToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (!authHeader) return null;
  const trimmed = authHeader.trimStart();
  const scheme = "Bearer";
  if (trimmed.length <= scheme.length) return null;
  const separator = trimmed.charCodeAt(scheme.length);
  const hasSeparator = separator === 0x20 || separator === 0x09;
  if (!hasSeparator || trimmed.slice(0, scheme.length).toLowerCase() !== scheme.toLowerCase()) {
    return null;
  }
  return trimmed.slice(scheme.length).trim() || null;
}

function resolveIp(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (Array.isArray(forwarded) && forwarded.length > 0) return forwarded[0].split(",")[0].trim();
  if (typeof forwarded === "string" && forwarded.trim()) return forwarded.split(",")[0].trim();
  return req.ip || req.socket.remoteAddress || "unknown";
}

function checkTokenRateLimit(tokenId: string, maxPerMinute: number): boolean {
  ensureOAuthRateBucketCleanup();
  if (oauthRateBuckets.size > MAX_OAUTH_RATE_BUCKETS) {
    cleanupExpiredOAuthRateBuckets();
  }

  const now = Date.now();
  const bucketKey = `oauth:${tokenId}`;
  let bucket = oauthRateBuckets.get(bucketKey);
  if (!bucket || now > bucket.resetAt) {
    bucket = { count: 0, resetAt: now + 60_000 };
    oauthRateBuckets.set(bucketKey, bucket);
  }

  bucket.count += 1;
  const effectiveMaxPerMinute = Math.max(1, Math.floor(Number(maxPerMinute) || 120));
  return bucket.count <= effectiveMaxPerMinute;
}

function cleanupExpiredOAuthRateBuckets(now = Date.now()): void {
  for (const [key, bucket] of oauthRateBuckets.entries()) {
    if (bucket.resetAt <= now) {
      oauthRateBuckets.delete(key);
    }
  }
}

function ensureOAuthRateBucketCleanup(): void {
  if (oauthRateBucketCleanupTimer) return;

  oauthRateBucketCleanupTimer = setInterval(cleanupExpiredOAuthRateBuckets, OAUTH_RATE_BUCKET_CLEANUP_INTERVAL_MS);
  oauthRateBucketCleanupTimer.unref?.();
}

function buildBearerChallenge(errorCode?: string): string {
  if (!errorCode) return "Bearer";
  const safeCode = errorCode.replace(/[^A-Za-z0-9._~-]/g, "_").slice(0, 128) || "invalid_token";
  return `Bearer error="${safeCode}"`;
}

function sendOAuthAuthError(res: Response, error: unknown): Response {
  if (error instanceof OAuthError) {
    res.set("WWW-Authenticate", buildBearerChallenge(error.errorCode));
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
    const authReq = req as AuthenticatedRequest;
    if (authReq.user && authReq.oauthToken) return next();

    const token = getBearerToken(req);
    if (!token) {
      if (opts.optional) return next();
      res.set("WWW-Authenticate", buildBearerChallenge());
      return res.status(401).json({ error: "缺少 OAuth access token" });
    }

    if (!isOAuthAccessTokenValue(token)) {
      if (opts.optional) return next();
      res.set("WWW-Authenticate", buildBearerChallenge("invalid_token"));
      return res.status(401).json({ error: "无效的 OAuth access token" });
    }

    try {
      const context = await validateOAuthAccessToken(token, requiredScope);
      if (!checkTokenRateLimit(context.token.tokenId, context.client.rateLimitPerMinute || 120)) {
        return res.status(429).json({ error: "OAuth token 请求过于频繁，请稍后再试" });
      }

      const clientId = context.client.clientId;
      const tokenId = context.token.tokenId;
      const scopes = context.scopes;
      const grantId = context.grant.grantId;

      const oauthContext: OAuthRequestContext = {
        tokenId,
        clientId,
        scopes,
        grantId,
      };
      authReq.user = context.user;
      authReq.oauthToken = oauthContext;
      // Keep a narrow public context on the request; avoid attaching full auth material for logging paths.
      authReq.oauthContext = oauthContext;
      authReq.auth = { kind: "oauth", user: context.user, oauth: oauthContext };

      recordOAuthTokenUsage(context, resolveIp(req)).catch((error) => {
        logger.warn("[OAuthTokenAuth] 记录 token 使用失败", {
          clientId,
          error: error instanceof Error ? error.message : String(error),
        });
      });

      return next();
    } catch (error) {
      return sendOAuthAuthError(res, error);
    }
  };
}
