import type { Request, Response } from "express";
import { TurnstileService } from "../../services/turnstileService";
import { firstString } from "../../utils/httpParam";
import { getClientIp, requireAdmin } from "./_helpers";

export async function getHCaptchaConfig(req: Request, res: Response) {
  try {
    if (!requireAdmin(req, res)) return;

    const config = await TurnstileService.getHCaptchaConfig();

    res.json({
      enabled: config.enabled,
      siteKey: config.siteKey,
      secretKey: config.secretKey ? "***已设置***" : null,
    });
  } catch (error) {
    console.error("获取hCaptcha配置失败:", error);
    res.status(500).json({ success: false, error: "服务器内部错误" });
  }
}

export async function updateHCaptchaConfig(req: Request, res: Response) {
  try {
    if (!requireAdmin(req, res)) return;

    const { key, value } = req.body;

    if (!key || !value || !["HCAPTCHA_SECRET_KEY", "HCAPTCHA_SITE_KEY"].includes(key)) {
      return res.status(400).json({ success: false, error: "参数无效" });
    }

    const success = await TurnstileService.updateHCaptchaConfig(
      key as "HCAPTCHA_SECRET_KEY" | "HCAPTCHA_SITE_KEY",
      value,
    );

    if (success) {
      res.json({ success: true, message: "配置更新成功" });
    } else {
      res.status(500).json({ success: false, error: "配置更新失败" });
    }
  } catch (error) {
    console.error("更新hCaptcha配置失败:", error);
    res.status(500).json({ success: false, error: "服务器内部错误" });
  }
}

export async function deleteHCaptchaConfig(req: Request, res: Response) {
  try {
    if (!requireAdmin(req, res)) return;

    const key = firstString(req.params.key);

    if (!key || !["HCAPTCHA_SECRET_KEY", "HCAPTCHA_SITE_KEY"].includes(key)) {
      return res.status(400).json({ success: false, error: "参数无效" });
    }

    const success = await TurnstileService.deleteHCaptchaConfig(key as "HCAPTCHA_SECRET_KEY" | "HCAPTCHA_SITE_KEY");

    if (success) {
      res.json({ success: true, message: "配置删除成功" });
    } else {
      res.status(500).json({ success: false, error: "配置删除失败" });
    }
  } catch (error) {
    console.error("删除hCaptcha配置失败:", error);
    res.status(500).json({ success: false, error: "服务器内部错误" });
  }
}

export async function verifyHCaptcha(req: Request, res: Response) {
  try {
    const { token, timestamp, fingerprint } = req.body;
    const validatedClientIp = getClientIp(req);

    if (!token || typeof token !== "string") {
      return res.status(400).json({
        success: false,
        message: "验证令牌无效",
        timestamp: new Date().toISOString(),
      });
    }

    const banStatus = await TurnstileService.isIpBanned(validatedClientIp);
    if (banStatus.banned) {
      return res.status(403).json({
        success: false,
        message: "IP已被封禁",
        details: { reason: banStatus.reason, expiresAt: banStatus.expiresAt },
        timestamp: new Date().toISOString(),
      });
    }

    const isValid = await TurnstileService.verifyHCaptchaToken(token, validatedClientIp);

    if (isValid) {
      let accessToken: string | null = null;

      if (fingerprint && typeof fingerprint === "string") {
        try {
          accessToken = await TurnstileService.generateAccessToken(fingerprint, validatedClientIp);
        } catch (error) {
          console.warn("生成访问令牌失败，但hCaptcha验证成功", error);
        }
      }

      console.log("✅ hCaptcha验证成功，直接通过", {
        ip: validatedClientIp,
        token: `${token.substring(0, 8)}...`,
        accessToken: accessToken ? `${accessToken.substring(0, 8)}...` : "null",
      });

      res.json({
        success: true,
        message: "验证成功",
        timestamp: new Date().toISOString(),
        verified: true,
        accessToken,
        details: {
          hostname: req.hostname,
          challenge_ts: timestamp || new Date().toISOString(),
        },
      });
    } else {
      res.status(400).json({
        success: false,
        message: "验证失败，请重试",
        timestamp: new Date().toISOString(),
        details: { error_codes: ["verification-failed"] },
      });
    }
  } catch (error) {
    console.error("hCaptcha验证失败:", error);
    res.status(500).json({
      success: false,
      message: "服务器内部错误",
      timestamp: new Date().toISOString(),
    });
  }
}
