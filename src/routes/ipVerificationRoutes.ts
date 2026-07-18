import express from "express";
import IpVerificationService from "../services/ipVerificationService";
import { createLimiter } from "../middleware/routeLimiters";

const router = express.Router();

const sessionLimiter = createLimiter({
  name: "ipVerificationSession",
  profile: "standard",
  category: "verification",
  message: "Too many verification requests",
});

function resolveIpAddress(req: express.Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (Array.isArray(forwarded) && forwarded.length > 0) return forwarded[0].split(",")[0].trim();
  if (typeof forwarded === "string" && forwarded.trim()) return forwarded.split(",")[0].trim();
  return req.ip || req.socket.remoteAddress || "unknown";
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
