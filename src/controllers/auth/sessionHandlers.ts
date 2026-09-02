import type { Request, Response } from "express";
import {
  AuthSessionError,
  listAuthDevices,
  revokeAuthCredential,
  revokeAuthDevice,
} from "../../services/authSessionService";
import type { AuthenticatedRequest } from "../../types/authRequest";
import { clearAuthSessionCookie, getTokenFromRequest, setAuthSessionCookie } from "../../utils/authCookie";
import logger from "../../utils/logger";
import { UserStorage } from "../../utils/userStorage";

export async function getCurrentUser(req: Request, res: Response) {
  try {
    // Credential parsing and current-user validation belong to authenticateToken.
    const authenticatedReq = req as AuthenticatedRequest;
    const user = authenticatedReq.auth?.user ?? authenticatedReq.user;
    if (!user) {
      return res.status(401).json({
        error: "未登录",
      });
    }
    if (user.accountStatus === "suspended") {
      return res.status(403).json({ error: "账户已被封停", code: "ACCOUNT_SUSPENDED", supportEmail: "support@chloemlla.com" });
    }
    const remainingUsage = await UserStorage.getRemainingUsage(user.id);
    // 不返回avatarBase64和敏感认证凭据
    const {
      password: _password,
      passwordHash: _passwordHash,
      passwordCiphertext: _passwordCiphertext,
      passwordIv: _passwordIv,
      passwordTag: _passwordTag,
      passwordKeyVersion: _passwordKeyVersion,
      totpSecret: _totpSecret,
      backupCodes: _backupCodes,
      passkeyCredentials: _passkeyCredentials,
      pendingChallenge: _pendingChallenge,
      currentChallenge: _currentChallenge,
      passkeyVerified: _passkeyVerified,
      token: _token,
      tokenExpiresAt: _tokenExpiresAt,
      ...userWithoutPassword
    } = user as any;
    res.json({
      ...userWithoutPassword,
      remainingUsage,
    });
  } catch (error) {
    logger.error("获取用户信息失败:", error);
    res.status(500).json({ error: "获取用户信息失败" });
  }
}

export async function listSessions(req: Request, res: Response) {
  try {
    const authenticatedReq = req as AuthenticatedRequest;
    const user = authenticatedReq.auth?.user ?? authenticatedReq.user;
    const token = getTokenFromRequest(req);
    if (!user || !token) return res.status(401).json({ error: "未授权" });
    const devices = await listAuthDevices(user.id, token);
    return res.json({ success: true, devices });
  } catch (error) {
    logger.error("获取登录设备失败", error);
    return res.status(500).json({ error: "获取登录设备失败" });
  }
}

export async function revokeSessionDevice(req: Request, res: Response) {
  try {
    const authenticatedReq = req as AuthenticatedRequest;
    const user = authenticatedReq.auth?.user ?? authenticatedReq.user;
    const token = getTokenFromRequest(req);
    const deviceKey = typeof req.params.deviceKey === "string" ? req.params.deviceKey : "";
    if (!user || !token) return res.status(401).json({ error: "未授权" });
    if (!/^[a-f0-9]{40}$/.test(deviceKey)) return res.status(400).json({ error: "设备标识无效" });
    const result = await revokeAuthDevice(user.id, deviceKey, token);
    return res.json({ success: true, ...result });
  } catch (error) {
    if (error instanceof AuthSessionError) {
      const status = error.code === "CURRENT_SESSION_PROTECTED" ? 409 : error.code === "SESSION_NOT_FOUND" ? 404 : 401;
      return res.status(status).json({ error: error.message, code: error.code });
    }
    logger.error("撤销登录设备失败", error);
    return res.status(500).json({ error: "撤销登录设备失败" });
  }
}

export async function establishSession(req: Request, res: Response) {
  const authenticatedReq = req as AuthenticatedRequest;
  const user = authenticatedReq.auth?.user ?? authenticatedReq.user;
  const token = getTokenFromRequest(req);
  if (!user || !token) {
    return res.status(401).json({ error: "未授权" });
  }

  setAuthSessionCookie(req, res, token);
  return res.status(204).send();
}

export async function logoutHandler(req: Request, res: Response) {
  try {
    clearAuthSessionCookie(req, res);
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (token) {
      try {
        // 解码 JWT 拿 userId，随后撤销对应的 auth_sessions 会话。
        const jwt = require("jsonwebtoken");
        const config = require("../../config/config").config;
        const decoded = jwt.verify(token, config.jwtSecret, { algorithms: ["HS256"] }) as { userId?: string };
        if (decoded.userId) {
          await revokeAuthCredential(decoded.userId, token);
        }
      } catch (_jwtError) {
        // token 已失效时无需撤销
      }
      // 兼容旧的 user.token 字段
      const user = await UserStorage.getUserByToken(token);
      if (user) {
        await UserStorage.updateUser(user.id, {
          token: undefined,
          tokenExpiresAt: undefined,
        });
      }
    }
    res.json({ success: true });
  } catch (_error) {
    res.status(500).json({ error: "登出失败" });
  }
}

// 登出接口：保留旧注册函数，路由装配改由 routes/authLogoutRoutes.ts 管理。
export function registerLogoutRoute(app: any) {
  app.post("/api/auth/logout", logoutHandler);
}
