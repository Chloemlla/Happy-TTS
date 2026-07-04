import type { Request, Response } from "express";
import {
  approveMobileLoginChallenge,
  createMobileLoginChallenge,
  exchangeClientLoginToken,
  issueClientLoginToken,
  markMobileLoginChallengeScanned,
  pollMobileLoginChallenge,
  resolveMobileLoginUser,
  revokeClientLoginToken,
} from "../services/mobileLoginService";
import { getClientIP } from "../utils/ipUtils";
import logger from "../utils/logger";
import type { User } from "../utils/userStorage";

function getApiBaseUrl(req: Request): string {
  const forwardedProto = String(req.headers["x-forwarded-proto"] || "").split(",")[0]?.trim();
  const proto = forwardedProto || req.protocol || "https";
  const host = req.get("host") || "tts.chloemlla.com";
  return `${proto}://${host}`;
}

function getUserAgent(req: Request): string {
  return String(req.headers["user-agent"] || "unknown");
}

function errorStatus(message: string): number {
  if (message.includes("封停")) return 403;
  if (message.includes("过期") || message.includes("无效")) return 401;
  if (message.includes("不匹配")) return 403;
  return 400;
}

export class MobileLoginController {
  public static createChallenge(req: Request, res: Response) {
    try {
      const challenge = createMobileLoginChallenge({
        apiBaseUrl: getApiBaseUrl(req),
        browserIp: getClientIP(req),
        browserUserAgent: getUserAgent(req),
      });
      return res.json({ success: true, ...challenge });
    } catch (error) {
      logger.error("[MobileLogin] Create challenge failed", {
        error: error instanceof Error ? error.message : String(error),
      });
      return res.status(500).json({ error: "创建扫码登录会话失败" });
    }
  }

  public static scanChallenge(req: Request, res: Response) {
    const sessionId = typeof req.body?.sessionId === "string" ? req.body.sessionId : "";
    const scanToken = typeof req.body?.scanToken === "string" ? req.body.scanToken : "";
    if (!sessionId || !scanToken) {
      return res.status(400).json({ error: "缺少扫码登录会话参数" });
    }

    const result = markMobileLoginChallengeScanned({
      sessionId,
      scanToken,
      mobileIp: getClientIP(req),
      mobileUserAgent: getUserAgent(req),
    });
    if (!result.ok) {
      return res.status(errorStatus(result.error || "扫码登录会话无效")).json(result);
    }
    return res.json({ success: true, ...result });
  }

  public static async confirmChallenge(req: Request, res: Response) {
    try {
      const sessionId = typeof req.body?.sessionId === "string" ? req.body.sessionId : "";
      const scanToken = typeof req.body?.scanToken === "string" ? req.body.scanToken : "";
      if (!sessionId || !scanToken) {
        return res.status(400).json({ error: "缺少扫码登录会话参数" });
      }

      const user = await resolveMobileLoginUser(req);
      if (!user) {
        return res.status(401).json({ error: "请先在安卓客户端登录" });
      }

      const result = await approveMobileLoginChallenge({
        sessionId,
        scanToken,
        user,
        mobileIp: getClientIP(req),
        mobileUserAgent: getUserAgent(req),
      });
      if (!result.ok) {
        return res.status(errorStatus(result.error || "扫码登录确认失败")).json(result);
      }
      return res.json({ success: true, ...result });
    } catch (error) {
      const message = error instanceof Error ? error.message : "扫码登录确认失败";
      logger.warn("[MobileLogin] Confirm challenge failed", {
        error: message,
        sessionId: req.body?.sessionId,
      });
      return res.status(errorStatus(message)).json({ error: message });
    }
  }

  public static async pollChallenge(req: Request, res: Response) {
    try {
      const sessionId = typeof req.body?.sessionId === "string" ? req.body.sessionId : "";
      const pollToken = typeof req.body?.pollToken === "string" ? req.body.pollToken : "";
      if (!sessionId || !pollToken) {
        return res.status(400).json({ error: "缺少扫码登录轮询参数" });
      }

      const result = await pollMobileLoginChallenge({
        sessionId,
        pollToken,
        browserIp: getClientIP(req),
      });
      return res.json({ success: true, ...result });
    } catch (error) {
      const message = error instanceof Error ? error.message : "扫码登录轮询失败";
      return res.status(errorStatus(message)).json({ error: message });
    }
  }

  public static async issueClientToken(req: Request, res: Response) {
    try {
      const user = (req as any).user as User | undefined;
      if (!user?.id) {
        return res.status(401).json({ error: "未登录" });
      }

      const result = await issueClientLoginToken({
        user,
        deviceId: typeof req.body?.deviceId === "string" ? req.body.deviceId : undefined,
        deviceName: typeof req.body?.deviceName === "string" ? req.body.deviceName : undefined,
      });
      return res.json({ success: true, ...result });
    } catch (error) {
      const message = error instanceof Error ? error.message : "签发客户端登录令牌失败";
      return res.status(errorStatus(message)).json({ error: message });
    }
  }

  public static async exchangeClientToken(req: Request, res: Response) {
    try {
      const clientLoginToken = typeof req.body?.clientLoginToken === "string" ? req.body.clientLoginToken : "";
      if (!clientLoginToken) {
        return res.status(400).json({ error: "缺少客户端登录令牌" });
      }

      const payload = await exchangeClientLoginToken({
        clientLoginToken,
        deviceId: typeof req.body?.deviceId === "string" ? req.body.deviceId : undefined,
        ip: getClientIP(req),
      });
      return res.json({ success: true, ...payload });
    } catch (error) {
      const message = error instanceof Error ? error.message : "客户端登录令牌兑换失败";
      return res.status(errorStatus(message)).json({ error: message });
    }
  }

  public static async revokeClientToken(req: Request, res: Response) {
    try {
      const user = (req as any).user as User | undefined;
      if (!user?.id) {
        return res.status(401).json({ error: "未登录" });
      }
      const clientLoginToken = typeof req.body?.clientLoginToken === "string" ? req.body.clientLoginToken : "";
      if (!clientLoginToken) {
        return res.status(400).json({ error: "缺少客户端登录令牌" });
      }
      const result = await revokeClientLoginToken({ clientLoginToken, userId: user.id });
      return res.json({ success: true, ...result });
    } catch (error) {
      const message = error instanceof Error ? error.message : "撤销客户端登录令牌失败";
      return res.status(errorStatus(message)).json({ error: message });
    }
  }
}
