import express from "express";
import IpVerificationService from "../services/ipVerificationService";
import { createLimiter } from "../middleware/routeLimiters";
import { getClientIP } from "../utils/ipUtils";

const router = express.Router();

const sessionLimiter = createLimiter({
  name: "ipVerificationSession",
  profile: "standard",
  category: "verification",
  message: "Too many verification requests",
});

function resolveIpAddress(req: express.Request): string {
  return getClientIP(req);
}

router.post("/session", sessionLimiter, async (req, res) => {
  try {
    const fingerprint = typeof req.body?.fingerprint === "string" ? req.body.fingerprint : "";
    const result = await IpVerificationService.initializeSession({
      fingerprint,
      ipAddress: resolveIpAddress(req),
      userAgent: typeof req.headers["user-agent"] === "string" ? req.headers["user-agent"] : undefined,
      userLanguage: typeof req.headers["accept-language"] === "string" ? req.headers["accept-language"] : undefined,
    });

    if (result.banned) {
      // 形状与 ipBanCheck 的封禁响应对齐：前端 ipVerification.ts 按 error==="IP已被封禁"
      // 读出 banData，首访闸门据此直接渲染阻断页（与首访验闸同一套设计语言）。
      return res.status(403).json({
        error: "IP已被封禁",
        reason: result.banReason || "IP 风险过高，已自动拦截",
        expiresAt: result.banExpiresAt,
      });
    }

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      verified: false,
      requiresVerification: true,
      error: error instanceof Error ? error.message : "Failed to initialize verification session",
      tokenTtlMinutes: 40,
    });
  }
});

router.post("/complete", sessionLimiter, async (req, res) => {
  try {
    const fingerprint = typeof req.body?.fingerprint === "string" ? req.body.fingerprint : "";
    const captchaToken = typeof req.body?.captchaToken === "string" ? req.body.captchaToken : "";
    const captchaType = req.body?.captchaType === "hcaptcha" ? "hcaptcha" : "turnstile";

    const result = await IpVerificationService.completeVerification(
      fingerprint,
      resolveIpAddress(req),
      captchaToken,
      typeof req.headers["user-agent"] === "string" ? req.headers["user-agent"] : undefined,
      captchaType,
    );

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      verified: false,
      requiresVerification: true,
      error: error instanceof Error ? error.message : "Failed to complete verification",
      tokenTtlMinutes: 40,
    });
  }
});

export default router;
