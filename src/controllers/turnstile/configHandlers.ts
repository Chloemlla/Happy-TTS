import crypto from "node:crypto";
import type { Request, Response } from "express";
import { isAdminRole } from "../../middleware/auth";
import { TurnstileService } from "../../services/turnstileService";
import { firstString } from "../../utils/httpParam";
import logger from "../../utils/logger";
import { getClientIp, requireSuperAdmin } from "./_helpers";

export async function getTurnstileConfig(req: Request, res: Response) {
  try {
    const config = await TurnstileService.getConfig();

    const isAdmin = isAdminRole((req as any).user?.role);

    const maskedSecretKey =
      config.secretKey && config.secretKey.length > 8
        ? `${config.secretKey.slice(0, 2)}***${config.secretKey.slice(-4)}`
        : config.secretKey
          ? "***"
          : null;

    res.json({
      enabled: config.enabled,
      siteKey: config.siteKey,
      ...(isAdmin && { secretKey: maskedSecretKey }),
    });
  } catch (error) {
    console.error("获取Turnstile配置失败:", error);
    res.status(500).json({ error: "获取配置失败" });
  }
}

export async function getPublicConfig(_req: Request, res: Response) {
  try {
    const config = await TurnstileService.getConfig();
    const hcaptchaConfig = await TurnstileService.getHCaptchaConfig();

    res.json({
      enabled: config.enabled,
      siteKey: config.siteKey,
      hcaptchaEnabled: hcaptchaConfig.enabled,
      hcaptchaSiteKey: hcaptchaConfig.siteKey,
    });
  } catch (error) {
    console.error("获取公共配置失败:", error);
    res.status(500).json({ error: "获取配置失败" });
  }
}

export async function getPublicTurnstile(_req: Request, res: Response) {
  try {
    const config = await TurnstileService.getConfig();
    res.json({ enabled: config.enabled, siteKey: config.siteKey });
  } catch (error) {
    console.error("获取Turnstile公共配置失败:", error);
    res.status(500).json({ error: "获取配置失败" });
  }
}

export async function verifyTurnstileToken(req: Request, res: Response) {
  try {
    const { token } = req.body;
    const validatedClientIp = getClientIp(req);

    if (!token || typeof token !== "string") {
      return res.status(400).json({ success: false, error: "token 参数无效" });
    }

    const ok = await TurnstileService.verifyToken(token, validatedClientIp);

    if (ok) {
      return res.json({ success: true, verified: true });
    }

    return res.status(400).json({ success: false, verified: false });
  } catch (error) {
    console.error("验证 Turnstile token 失败:", error);
    res.status(500).json({ success: false, error: "服务器内部错误" });
  }
}

export async function secureCaptchaConfig(_req: Request, res: Response) {
  try {
    // G4-24: 该端点只返回验证码类型与公开 siteKey，无敏感信息。
    // 删除自研 HMAC/AES（密钥全部由客户端值推导，零安全增益，纯安全剧场）与时间戳校验，
    // 只保留按服务端配置随机选择验证码类型的逻辑。
    let captchaType;
    let config;

    const turnstileConfig = await TurnstileService.getConfig();
    const hcaptchaConfig = await TurnstileService.getHCaptchaConfig();

    const candidates: Array<{ type: string; config: { enabled: boolean; siteKey: string | null } }> = [];
    if (turnstileConfig.enabled && turnstileConfig.siteKey) {
      candidates.push({
        type: "turnstile",
        config: { enabled: turnstileConfig.enabled, siteKey: turnstileConfig.siteKey },
      });
    }
    if (hcaptchaConfig.enabled && hcaptchaConfig.siteKey) {
      candidates.push({
        type: "hcaptcha",
        config: { enabled: hcaptchaConfig.enabled, siteKey: hcaptchaConfig.siteKey },
      });
    }

    if (candidates.length === 0) {
      captchaType = "turnstile";
      config = { enabled: false, siteKey: null };
    } else if (candidates.length === 1) {
      captchaType = candidates[0].type;
      config = candidates[0].config;
    } else {
      // G4-24: Node 18+ 始终提供 crypto.randomInt，删除回落到 Math.random 的永不可达死分支
      const index = crypto.randomInt(0, candidates.length);
      captchaType = candidates[index].type;
      config = candidates[index].config;
    }

    logger.debug("后端CAPTCHA选择", {
      type: captchaType,
      selectionMethod: candidates.length > 1 ? "random" : candidates.length === 1 ? "single-available" : "fallback-disabled",
      configEnabled: config.enabled,
      hasSiteKey: !!config.siteKey,
    });

    res.json({ success: true, captchaType, config });
  } catch (error) {
    logger.error("获取安全CAPTCHA配置失败:", error);
    res.status(500).json({ success: false, error: "服务器内部错误" });
  }
}

export async function updateTurnstileConfig(req: Request, res: Response) {
  try {
    if (!requireSuperAdmin(req, res)) return;

    const { key, value } = req.body;

    if (!key || !value || !["TURNSTILE_SECRET_KEY", "TURNSTILE_SITE_KEY"].includes(key)) {
      return res.status(400).json({ success: false, error: "参数无效" });
    }

    const success = await TurnstileService.updateConfig(key as "TURNSTILE_SECRET_KEY" | "TURNSTILE_SITE_KEY", value);

    if (success) {
      res.json({ success: true, message: "配置更新成功" });
    } else {
      res.status(500).json({ success: false, error: "配置更新失败" });
    }
  } catch (error) {
    console.error("更新Turnstile配置失败:", error);
    res.status(500).json({ success: false, error: "服务器内部错误" });
  }
}

export async function deleteTurnstileConfig(req: Request, res: Response) {
  try {
    if (!requireSuperAdmin(req, res)) return;

    const key = firstString(req.params.key);

    if (!key || !["TURNSTILE_SECRET_KEY", "TURNSTILE_SITE_KEY"].includes(key)) {
      return res.status(400).json({ success: false, error: "参数无效" });
    }

    const success = await TurnstileService.deleteConfig(key as "TURNSTILE_SECRET_KEY" | "TURNSTILE_SITE_KEY");

    if (success) {
      res.json({ success: true, message: "配置删除成功" });
    } else {
      res.status(500).json({ success: false, error: "配置删除失败" });
    }
  } catch (error) {
    console.error("删除Turnstile配置失败:", error);
    res.status(500).json({ success: false, error: "服务器内部错误" });
  }
}
