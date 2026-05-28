import type { Request, Response } from "express";
import { TurnstileService } from "../../services/turnstileService";
import { firstString } from "../../utils/httpParam";
import { getClientIp } from "./_helpers";

export async function reportFingerprint(req: Request, res: Response) {
  try {
    const { fingerprint, deviceSignals } = req.body;
    const validatedClientIp = getClientIp(req);
    const userId = (req as any).user?.id;
    const userAgent = req.headers["user-agent"] || "unknown";

    console.log("🔍 收到指纹上报请求:", {
      fingerprint: fingerprint ? `${fingerprint.substring(0, 8)}...` : "null",
      clientIp: validatedClientIp,
      userId,
      userAgent: `${userAgent.substring(0, 50)}...`,
      hasDeviceSignals: !!deviceSignals,
      deviceSignalsPreview: deviceSignals
        ? {
            screen: deviceSignals.screen,
            timezone: deviceSignals.timezone,
            navigatorKeys: deviceSignals.navigator ? Object.keys(deviceSignals.navigator) : [],
            window: deviceSignals.window ? "present" : "missing",
          }
        : null,
    });

    if (!fingerprint || typeof fingerprint !== "string") {
      console.warn("❌ 指纹参数无效:", { fingerprint });
      return res.status(400).json({ success: false, error: "指纹参数无效" });
    }

    const banStatus = await TurnstileService.isIpBanned(validatedClientIp);
    if (banStatus.banned) {
      console.warn("🚫 IP已被封禁:", {
        ip: validatedClientIp,
        reason: banStatus.reason,
        expiresAt: banStatus.expiresAt,
      });
      return res.status(403).json({
        success: false,
        error: "IP已被封禁",
        reason: banStatus.reason,
        expiresAt: banStatus.expiresAt,
      });
    }

    try {
      const { updateUser, getUserById } = require("../../services/userService");
      const current = await getUserById(userId);
      const existing = (current && (current as any).fingerprints) || [];

      console.log("🔧 调试: deviceSignals 原始值:", deviceSignals);
      console.log("🔧 调试: deviceSignals 类型:", typeof deviceSignals);
      console.log("🔧 调试: deviceSignals JSON:", JSON.stringify(deviceSignals, null, 2));

      const fingerprintRecord = {
        id: fingerprint,
        ts: Date.now(),
        ua: String(userAgent),
        ip: String(validatedClientIp),
        deviceInfo: typeof deviceSignals === "object" && deviceSignals !== null ? deviceSignals : null,
      };

      console.log("🔧 调试: 即将保存的指纹记录:", fingerprintRecord);

      const next = [fingerprintRecord, ...existing].slice(0, 20);

      await updateUser(userId, {
        fingerprints: next,
        requireFingerprint: false,
        requireFingerprintAt: 0,
      } as any);

      console.log("✅ 指纹上报并保存成功:", {
        fingerprint: `${fingerprint.substring(0, 8)}...`,
        userId,
        clientIp: validatedClientIp,
        timestamp: new Date().toISOString(),
      });

      try {
        const { wsService } = require("../../services/wsService");
        wsService.notifyFingerprintAck(userId);
      } catch (_wsErr) {
        // WS 推送失败不影响主流程
      }
    } catch (saveError) {
      console.error("❌ 保存指纹到用户记录失败:", saveError);
    }

    res.json({ success: true, message: "指纹上报成功", timestamp: new Date().toISOString() });
  } catch (error) {
    console.error("❌ 指纹上报失败:", error);
    res.status(500).json({ success: false, error: "服务器内部错误" });
  }
}

export async function reportTempFingerprint(req: Request, res: Response) {
  try {
    const { fingerprint } = req.body;
    const validatedClientIp = getClientIp(req);

    if (!fingerprint || typeof fingerprint !== "string") {
      return res.status(400).json({ success: false, error: "指纹参数无效" });
    }

    const banStatus = await TurnstileService.isIpBanned(validatedClientIp);
    if (banStatus.banned) {
      return res.status(403).json({
        success: false,
        error: "IP已被封禁",
        reason: banStatus.reason,
        expiresAt: banStatus.expiresAt,
      });
    }

    const result = await TurnstileService.reportTempFingerprint(fingerprint, validatedClientIp);

    res.json({ success: true, isFirstVisit: result.isFirstVisit, verified: result.verified });
  } catch (error) {
    console.error("临时指纹上报失败:", error);
    res.status(500).json({ success: false, error: "服务器内部错误" });
  }
}

export async function verifyTempFingerprint(req: Request, res: Response) {
  try {
    const { fingerprint, cfToken, userAgent, captchaType } = req.body;
    const validatedClientIp = getClientIp(req);
    const clientUserAgent = userAgent || req.headers["user-agent"] || "unknown";

    if (!fingerprint || typeof fingerprint !== "string") {
      return res.status(400).json({ success: false, error: "指纹参数无效" });
    }

    if (!cfToken || typeof cfToken !== "string") {
      return res.status(400).json({ success: false, error: "验证令牌无效" });
    }

    const banStatus = await TurnstileService.isIpBanned(validatedClientIp);
    if (banStatus.banned) {
      return res.status(403).json({
        success: false,
        error: "IP已被封禁",
        reason: banStatus.reason,
        expiresAt: banStatus.expiresAt,
      });
    }

    const result = await TurnstileService.verifyTempFingerprint(
      fingerprint,
      cfToken,
      validatedClientIp,
      clientUserAgent,
      captchaType || "turnstile",
    );

    if (!result.success) {
      return res.status(400).json({ success: false, error: "验证失败" });
    }

    const serviceName = captchaType === "hcaptcha" ? "hCaptcha" : "Turnstile";
    console.log(`✅ ${serviceName}验证成功，直接通过`, {
      fingerprint: `${fingerprint.substring(0, 8)}...`,
      ip: validatedClientIp,
      accessToken: result.accessToken ? `${result.accessToken.substring(0, 8)}...` : "null",
    });

    res.json({ success: true, verified: true, accessToken: result.accessToken });
  } catch (error) {
    console.error("验证临时指纹失败:", error);
    res.status(500).json({ success: false, error: "服务器内部错误" });
  }
}

export async function verifyAccessToken(req: Request, res: Response) {
  try {
    const { token, fingerprint } = req.body;
    const clientIp = getClientIp(req);

    if (!token || typeof token !== "string") {
      return res.status(400).json({ success: false, error: "访问密钥无效" });
    }

    if (!fingerprint || typeof fingerprint !== "string") {
      return res.status(400).json({ success: false, error: "指纹参数无效" });
    }

    const banStatus = await TurnstileService.isIpBanned(clientIp);
    if (banStatus.banned) {
      return res.status(403).json({
        success: false,
        error: "IP已被封禁",
        reason: banStatus.reason,
        expiresAt: banStatus.expiresAt,
      });
    }

    const isValid = await TurnstileService.verifyAccessToken(token, fingerprint, clientIp);

    if (!isValid) {
      return res.status(400).json({ success: false, error: "访问密钥无效或已过期" });
    }

    res.json({ success: true, valid: true });
  } catch (error) {
    console.error("验证访问密钥失败:", error);
    res.status(500).json({ success: false, error: "服务器内部错误" });
  }
}

export async function checkAccessToken(req: Request, res: Response) {
  try {
    const fingerprint = firstString(req.params.fingerprint);
    const validatedClientIp = getClientIp(req);

    if (!fingerprint) {
      return res.status(400).json({ success: false, error: "指纹参数无效" });
    }

    const banStatus = await TurnstileService.isIpBanned(validatedClientIp);
    if (banStatus.banned) {
      return res.status(403).json({
        success: false,
        error: "IP已被封禁",
        reason: banStatus.reason,
        expiresAt: banStatus.expiresAt,
      });
    }

    const hasValidToken = await TurnstileService.hasValidAccessToken(fingerprint, validatedClientIp);

    res.json({ success: true, hasValidToken });
  } catch (error) {
    console.error("检查访问密钥失败:", error);
    res.status(500).json({ success: false, error: "服务器内部错误" });
  }
}

export async function checkTempFingerprintStatus(req: Request, res: Response) {
  try {
    const fingerprint = firstString(req.params.fingerprint);
    const validatedClientIp = getClientIp(req);

    if (!fingerprint) {
      return res.status(400).json({ success: false, error: "指纹参数无效" });
    }

    const banStatus = await TurnstileService.isIpBanned(validatedClientIp);
    if (banStatus.banned) {
      return res.status(403).json({
        success: false,
        error: "IP已被封禁",
        reason: banStatus.reason,
        expiresAt: banStatus.expiresAt,
      });
    }

    const status = await TurnstileService.checkTempFingerprintStatus(fingerprint);

    res.json({ success: true, exists: status.exists, verified: status.verified });
  } catch (error) {
    console.error("检查临时指纹状态失败:", error);
    res.status(500).json({ success: false, error: "服务器内部错误" });
  }
}
