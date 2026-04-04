import type { NextFunction, Request, Response } from "express";
import { config } from "../config/config";
import IpVerificationService from "../services/ipVerificationService";

const EXEMPT_PREFIXES = [
  "/api/ip-verification",
  "/api/turnstile",
  "/api/human-check",
  "/api/status",
  "/api/frontend-config",
  "/api/auth/linuxdo/",
];

function shouldBypass(req: Request): boolean {
  if (!config.ipqs.enabled) return true;
  if (req.method === "OPTIONS") return true;

  const originalUrl = req.originalUrl || req.url || "";
  if (EXEMPT_PREFIXES.some((prefix) => originalUrl.startsWith(prefix))) return true;

  const browserLike =
    Boolean(req.headers.origin) ||
    Boolean(req.headers["sec-fetch-mode"]) ||
    Boolean(req.headers["x-fingerprint"]);

  return !browserLike;
}

function resolveIpAddress(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (Array.isArray(forwarded) && forwarded.length > 0) return forwarded[0].split(",")[0].trim();
  if (typeof forwarded === "string" && forwarded.trim()) return forwarded.split(",")[0].trim();
  return req.ip || req.socket.remoteAddress || "unknown";
}

export async function ipVerificationMiddleware(req: Request, res: Response, next: NextFunction) {
  if (shouldBypass(req)) {
    next();
    return;
  }

  const fingerprint = req.headers["x-fingerprint"] as string | undefined;
  const token = req.headers["x-ip-verification-token"] as string | undefined;
  const ipAddress = resolveIpAddress(req);

  if (!fingerprint || !token) {
    res.status(403).json({
      success: false,
      error: "IP verification required",
      errorCode: "IP_VERIFICATION_REQUIRED",
      requiresVerification: true,
      reason: "missing_verification_headers",
    });
    return;
  }

  const valid = await IpVerificationService.verifyRequestToken(token, fingerprint, ipAddress);
  if (!valid) {
    res.status(403).json({
      success: false,
      error: "IP verification required",
      errorCode: "IP_VERIFICATION_REQUIRED",
      requiresVerification: true,
      reason: "invalid_or_expired_verification_token",
    });
    return;
  }

  next();
}

export default ipVerificationMiddleware;
