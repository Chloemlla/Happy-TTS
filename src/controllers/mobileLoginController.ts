import type { Request, Response } from "express";
import {
  approveMobileLoginChallenge,
  createMobileLoginChallenge,
  exchangeClientLoginToken,
  issueClientLoginToken,
  markMobileLoginChallengeScanned,
  MobileTokenError,
  pollMobileLoginChallenge,
  resolveClientTokenIdentity,
  resolveMobileLoginUser,
  revokeClientLoginToken,
  rotateClientLoginToken,
} from "../services/mobileLoginService";
import { isIntegrityActive, issueIntegrityNonce } from "../services/mobileIntegrityService";
import { getClientIP } from "../utils/ipUtils";
import { getAuthSessionMetadata } from "../services/authSessionService";
import logger from "../utils/logger";
import type { User } from "../utils/userStorage";

function getApiBaseUrl(req: Request): string {
  const forwardedProto = String(req.headers["x-forwarded-proto"] || "").split(",")[0]?.trim();
  const proto = forwardedProto || req.protocol || "https";
  const host = req.get("host") || "chloemlla.com";
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

/**
 * 令牌相关的失败带自己的 HTTP 状态、错误码与可选 retryAfterSeconds，
 * 不再靠“文案里有没有某个词”猜状态码；其它错误回退到旧的文案判定。
 */
function respondError(res: Response, error: unknown, fallbackMessage: string) {
  const message = error instanceof Error && error.message ? error.message : fallbackMessage;
  if (error instanceof MobileTokenError) {
    const body: Record<string, unknown> = { success: false, error: message, errorCode: error.errorCode };
    if (error.retryAfterSeconds !== undefined) {
      body.retryAfterSeconds = error.retryAfterSeconds;
    }
    return res.status(error.status).json(body);
  }
  return res.status(errorStatus(message)).json({ error: message });
}

function getFingerprint(req: Request): string | undefined {
  const value = req.headers["x-fingerprint"];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
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
        integrityToken: typeof req.body?.integrityToken === "string" ? req.body.integrityToken : undefined,
        integrityNonce: typeof req.body?.integrityNonce === "string" ? req.body.integrityNonce : undefined,
        metadata: getAuthSessionMetadata(req, { ipAddress: getClientIP(req) }),
      });
      return res.json({ success: true, ...result });
    } catch (error) {
      return respondError(res, error, "签发客户端登录令牌失败");
    }
  }

  /**
   * 申请设备证明挑战（P2）：客户端拿 nonce 去 Play Integrity SDK 换 integrity token，
   * 再把它连同 nonce 一起带回 rotate / issue。
   * 身份可以是 JWT（首次签发）或 sml_ 令牌（轮换），不要求两者同时存在。
   */
  public static async createIntegrityChallenge(req: Request, res: Response) {
    try {
      if (!isIntegrityActive()) {
        // 本层没启用就别让客户端白跑一次 Google：原地告诉它不需要证明。
        return res.json({ success: true, required: false });
      }
      const identity = await resolveClientTokenIdentity({
        authHeader: req.headers.authorization,
        clientLoginToken: typeof req.body?.clientLoginToken === "string" ? req.body.clientLoginToken : undefined,
        deviceId: typeof req.body?.deviceId === "string" ? req.body.deviceId : undefined,
        ip: getClientIP(req),
      });
      const challenge = issueIntegrityNonce({ userId: identity.userId, deviceId: identity.deviceId });
      return res.json({ success: true, required: true, ...challenge });
    } catch (error) {
      return respondError(res, error, "申请设备证明失败");
    }
  }

  /**
   * 轮换客户端登录令牌（sml_）：用令牌本身作凭证，不要求 JWT；
   * 频率由服务端的轮换间隔与每日配额控制，手动与定时走同一个入口径。
   */
  public static async rotateClientToken(req: Request, res: Response) {
    try {
      const clientLoginToken = typeof req.body?.clientLoginToken === "string" ? req.body.clientLoginToken : "";
      if (!clientLoginToken.trim()) {
        return res.status(400).json({ success: false, error: "缺少客户端登录令牌", errorCode: "MISSING_CLIENT_TOKEN" });
      }

      const result = await rotateClientLoginToken({
        clientLoginToken,
        deviceId: typeof req.body?.deviceId === "string" ? req.body.deviceId : undefined,
        ip: getClientIP(req),
        fingerprint: getFingerprint(req),
        integrityToken: typeof req.body?.integrityToken === "string" ? req.body.integrityToken : undefined,
        integrityNonce: typeof req.body?.integrityNonce === "string" ? req.body.integrityNonce : undefined,
        metadata: getAuthSessionMetadata(req, { ipAddress: getClientIP(req) }),
      });
      logger.info("[MobileLogin] 客户端令牌轮换完成", {
        rotationIndex: result.rotationIndex,
        ip: getClientIP(req),
        reason: typeof req.body?.reason === "string" ? req.body.reason : "scheduled",
      });
      return res.json({ success: true, rotated: true, ...result });
    } catch (error) {
      return respondError(res, error, "客户端登录令牌轮换失败");
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
        metadata: getAuthSessionMetadata(req, { ipAddress: getClientIP(req) }),
      });
      return res.json({ success: true, ...payload });
    } catch (error) {
      return respondError(res, error, "客户端登录令牌兑换失败");
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
      return respondError(res, error, "撤销客户端登录令牌失败");
    }
  }
}
