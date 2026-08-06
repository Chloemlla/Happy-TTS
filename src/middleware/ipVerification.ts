import type { NextFunction, Request, Response } from "express";
import { config } from "../config/config";
import { shouldBypassSecurityComponent } from "../security/securityPolicy";
import { getClientIP } from "../utils/ipUtils";
import IpVerificationService from "../services/ipVerificationService";

function shouldSkipVerificationEnforcement(req: Request): boolean {
  if (config.enableFirstVisitVerification === false) return true;
  if (!config.ipqs.enabled) return true;
  if (req.method === "OPTIONS") return true;

  const originalUrl = req.originalUrl || req.url || "";
  if (shouldBypassSecurityComponent("ipVerification", originalUrl)) return true;

  const browserLike =
    Boolean(req.headers.origin) || Boolean(req.headers["sec-fetch-mode"]) || Boolean(req.headers["x-fingerprint"]);

  return !browserLike;
}

function resolveIpAddress(req: Request): string {
  return getClientIP(req);
}

export async function ipVerificationMiddleware(req: Request, res: Response, next: NextFunction) {
  if (shouldSkipVerificationEnforcement(req)) {
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
