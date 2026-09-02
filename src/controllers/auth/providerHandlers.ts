import type { Request, Response } from "express";
import { bindProviderIdentityToUser } from "../../services/accountIdentityService";
import { getAuthSessionMetadata } from "../../services/authSessionService";
import {
  getGoogleAuthConfigSummary,
  isGoogleAuthEnabled,
  startGoogleBindSession,
  verifyGoogleIdToken,
} from "../../services/googleAuthService";
import { getLinuxDoConfigSummary } from "../../services/linuxDoAuthService";
import { consumeProfileVerificationSession } from "../../services/profileUpdateVerificationService";
import {
  confirmProviderBindSession,
  getProviderBindSessionView,
} from "../../services/providerBindSessionService";
import { getClientIP } from "../../utils/ipUtils";
import logger from "../../utils/logger";
import type { User } from "../../utils/userStorage";

export function getGoogleAuthConfig(req: Request, res: Response) {
  const target =
    req.query.client === "synapse-android" || req.query.platform === "android"
      ? "synapse-android"
      : "web";
  res.json(getGoogleAuthConfigSummary(target));
}

export function getAuthProvidersPublicConfig(_req: Request, res: Response) {
  res.json({
    google: getGoogleAuthConfigSummary("web"),
    linuxdo: getLinuxDoConfigSummary(),
  });
}

export async function googleAuth(req: Request, res: Response) {
  try {
    if (!isGoogleAuthEnabled()) {
      return res.status(503).json({ error: "Google 登录未配置" });
    }

    const idToken = typeof req.body?.idToken === "string" ? req.body.idToken : "";
    if (!idToken) {
      return res.status(400).json({ error: "缺少 Google idToken" });
    }

    // G2-03: 未绑定的 Google 身份不再按邮箱静默并号，一律返回 requiresBinding，
    // 由前端引导用户验密绑定后再登录。
    const payload = await startGoogleBindSession({
      idToken,
      clientIp: getClientIP(req),
      sessionMetadata: getAuthSessionMetadata(req, { ipAddress: getClientIP(req) }),
    });

    return res.json(payload);
  } catch (error) {
    logger.error("[Google Auth] Login failed", error);
    return res.status(400).json({
      error: error instanceof Error ? error.message : "Google 登录失败",
    });
  }
}

export async function googleBindSession(req: Request, res: Response) {
  try {
    if (!isGoogleAuthEnabled()) {
      return res.status(503).json({ error: "Google 登录未配置" });
    }

    const idToken = typeof req.body?.idToken === "string" ? req.body.idToken : "";
    if (!idToken) {
      return res.status(400).json({ error: "缺少 Google idToken" });
    }

    const result = await startGoogleBindSession({
      idToken,
      clientIp: getClientIP(req),
      sessionMetadata: getAuthSessionMetadata(req, { ipAddress: getClientIP(req) }),
    });

    return res.json(result);
  } catch (error) {
    logger.error("[Google Auth] Bind session failed", error);
    return res.status(400).json({
      error: error instanceof Error ? error.message : "Google 登录失败",
    });
  }
}

export function getProviderBindSession(req: Request, res: Response) {
  const sessionToken = typeof req.body?.sessionToken === "string" ? req.body.sessionToken : "";
  if (!sessionToken) {
    return res.status(400).json({ error: "缺少第三方登录绑定会话" });
  }

  const session = getProviderBindSessionView(sessionToken);
  if (!session) {
    return res.status(404).json({ error: "第三方登录绑定会话已过期，请返回登录页重试" });
  }

  return res.json({ success: true, session });
}

export async function confirmProviderBind(req: Request, res: Response) {
  try {
    const syncProfileInput =
      req.body?.syncProfile && typeof req.body.syncProfile === "object" ? req.body.syncProfile : {};
    const result = await confirmProviderBindSession({
      sessionToken: typeof req.body?.sessionToken === "string" ? req.body.sessionToken : "",
      identifier: typeof req.body?.identifier === "string" ? req.body.identifier : "",
      password: typeof req.body?.password === "string" ? req.body.password : "",
      acceptedTerms: req.body?.acceptedTerms === true,
      syncProfile: {
        username: syncProfileInput.username === true,
        avatar: syncProfileInput.avatar !== false,
      },
      clientIp: getClientIP(req),
      userAgent: String(req.headers["user-agent"] || ""),
      path: req.originalUrl || req.path,
      method: req.method,
      requestId: typeof (req as any).requestId === "string" ? (req as any).requestId : undefined,
    });

    if (result.status === "conflict") {
      return res.status(409).json(result);
    }

    return res.json(result);
  } catch (error) {
    logger.error("[Auth] Provider bind confirm failed", error);
    const message = error instanceof Error ? error.message : "第三方登录绑定失败";
    const status =
      message.includes("用户名/邮箱或密码错误")
        ? 401
        : message.includes("已封停")
          ? 403
          : message.includes("已过期")
            ? 410
            : 400;

    return res.status(status).json({ error: message });
  }
}

export async function googleBind(req: Request, res: Response) {
  try {
    if (!isGoogleAuthEnabled()) {
      return res.status(503).json({ error: "Google 登录未配置" });
    }

    const currentUser = (req as any).user as User | undefined;
    if (!currentUser?.id) {
      return res.status(401).json({ error: "未登录" });
    }

    const idToken = typeof req.body?.idToken === "string" ? req.body.idToken : "";
    const verificationToken = typeof req.body?.verificationToken === "string" ? req.body.verificationToken : "";
    if (!idToken) {
      return res.status(400).json({ error: "缺少 Google idToken" });
    }
    if (!verificationToken || !consumeProfileVerificationSession(currentUser.id, verificationToken)) {
      return res.status(401).json({ error: "请先完成身份验证" });
    }

    const profile = await verifyGoogleIdToken(idToken);
    const result = await bindProviderIdentityToUser({
      targetUser: currentUser,
      profile: {
        provider: "google",
        providerUserId: profile.id,
        providerEmail: profile.email,
        providerUsername: profile.name,
        avatarUrl: profile.avatarUrl,
      },
      actor: {
        userId: currentUser.id,
        username: currentUser.username,
        role: currentUser.role,
        ip: getClientIP(req),
        userAgent: String(req.headers["user-agent"] || ""),
        path: req.originalUrl || req.path,
        method: req.method,
        requestId: typeof (req as any).requestId === "string" ? (req as any).requestId : undefined,
      },
    });

    return res.json(result);
  } catch (error) {
    logger.error("[Google Auth] Bind failed", error);
    return res.status(400).json({
      error: error instanceof Error ? error.message : "Google 绑定失败",
    });
  }
}
