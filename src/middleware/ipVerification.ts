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

  // 不再以浏览器特征头豁免非浏览器请求：脚本客户端可以轻易省略
  // Origin/Sec-Fetch-Mode/x-fingerprint 从而绕过 IP 验证。功能一旦启用，
  // 除显式 bypass 路径外，所有请求都必须携带有效的验证令牌。
  return false;
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
