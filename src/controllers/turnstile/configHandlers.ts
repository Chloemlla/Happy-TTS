import type { Request, Response } from "express";
import { TurnstileService } from "../../services/turnstileService";
import { firstString } from "../../utils/httpParam";
import { getClientIp, requireAdmin } from "./_helpers";

export async function getTurnstileConfig(req: Request, res: Response) {
  try {
    const config = await TurnstileService.getConfig();

    const userRole = (req as any).user?.role;
    const isAdmin = userRole === "admin" || userRole === "administrator";

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

export async function secureCaptchaConfig(req: Request, res: Response) {
  try {
    const { encryptedData, timestamp, hash, fingerprint } = req.body;

    if (!encryptedData || !timestamp || !hash || !fingerprint) {
      return res.status(400).json({ success: false, error: "请求参数不完整" });
    }

    const now = Date.now();
    const timeDiff = now - timestamp;
    const timeWindowMs = 2 * 60 * 1000;

    console.log("=== 时间戳验证调试 ===");
    console.log("客户端时间戳:", timestamp);
    console.log("服务器当前时间:", now);
    console.log("时间差 (ms):", timeDiff);
    console.log("时间差 (分钟):", Math.round((timeDiff / 60000) * 100) / 100);
    console.log("客户端时间 (上海):", new Date(timestamp).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" }));
    console.log("服务器时间 (上海):", new Date(now).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" }));
    console.log("允许的最大时间差:", timeWindowMs, "ms (2分钟)");
    console.log("时间戳是否过期:", Math.abs(timeDiff) > timeWindowMs);
    console.log("========================");

    if (Math.abs(timeDiff) > timeWindowMs) {
      console.log("时间戳验证失败 - 请求被拒绝");
      return res.status(400).json({
        success: false,
        error: "请求已过期",
        debug: {
          clientTimestamp: timestamp,
          serverTimestamp: now,
          timeDiff,
          timeDiffMinutes: Math.round((timeDiff / 60000) * 100) / 100,
          clientTime: new Date(timestamp).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" }),
          serverTime: new Date(now).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" }),
        },
      });
    }

    const expectedHashData = `${encryptedData}_${timestamp}_${fingerprint}`;
    const crypto = require("node:crypto");
    const expectedHash = crypto.createHash("sha256").update(expectedHashData).digest("hex");

    if (hash !== expectedHash) {
      return res.status(400).json({ success: false, error: "请求完整性验证失败" });
    }

    const keyMaterial = `${fingerprint}_${Math.floor(timestamp / 60000)}`;
    const decryptionKey = crypto.createHash("sha256").update(keyMaterial).digest("hex");

    let decryptedSelection;
    try {
      const CryptoJS = require("crypto-js");
      const decryptedBytes = CryptoJS.AES.decrypt(encryptedData, decryptionKey);
      const decryptedText = decryptedBytes.toString(CryptoJS.enc.Utf8);

      if (!decryptedText) {
        throw new Error("解密结果为空");
      }

      decryptedSelection = JSON.parse(decryptedText);
    } catch (decryptError) {
      console.error("解密CAPTCHA选择失败:", decryptError);
      return res.status(400).json({ success: false, error: "解密失败" });
    }

    if (decryptedSelection.timestamp !== timestamp || decryptedSelection.fingerprint !== fingerprint) {
      return res.status(400).json({ success: false, error: "解密数据不一致" });
    }

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
      let index;
      try {
        if (typeof crypto.randomInt === "function") {
          index = crypto.randomInt(0, candidates.length);
        } else {
          throw new Error("crypto.randomInt not available");
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.warn("crypto.randomInt failed, falling back to Math.random:", errorMessage);
        index = Math.floor(Math.random() * candidates.length);
      }
      captchaType = candidates[index].type;
      config = candidates[index].config;
    }

    console.log("后端CAPTCHA选择:", {
      type: captchaType,
      selectionMethod:
        candidates.length > 1 ? "random" : candidates.length === 1 ? "single-available" : "fallback-disabled",
      fingerprint: `${fingerprint.substring(0, 8)}...`,
      timestamp: new Date(timestamp).toISOString(),
      clientIp: req.ip || "unknown",
      configEnabled: config.enabled,
      hasSiteKey: !!config.siteKey,
    });

    res.json({ success: true, captchaType, config });
  } catch (error) {
    console.error("获取安全CAPTCHA配置失败:", error);
    res.status(500).json({ success: false, error: "服务器内部错误" });
  }
}

export async function updateTurnstileConfig(req: Request, res: Response) {
  try {
    if (!requireAdmin(req, res)) return;

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
    if (!requireAdmin(req, res)) return;

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
