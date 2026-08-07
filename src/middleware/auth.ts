import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { config } from "../config/config";
import logger, { safeLog } from "../utils/logger";
import { getTokenFromRequest } from "../utils/authCookie";
import { UserStorage } from "../utils/userStorage";
import { assertActiveAuthSession, touchAuthSession } from "../services/authSessionService";
import { getClientIP } from "../utils/ipUtils";

// 管理员角色集合：admin（只读业务）与 superadmin（系统级写操作）均视为管理员
export const ADMIN_ROLES = new Set(["admin", "superadmin"]);

/** 任意管理员角色（admin 或 superadmin）。用于只读端点与 OAuth 管理例外。 */
export function isAdminRole(role?: string | null): boolean {
  return typeof role === "string" && ADMIN_ROLES.has(role);
}

/** 仅超级管理员。用于系统变更与所有写操作（OAuth 管理例外除外）。 */
export function isSuperAdmin(req: Request): boolean {
  return (req as any).user?.role === "superadmin";
}

// 扩展Request类型以包含用户信息
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        username: string;
        role: string;
      };
    }
  }
}

/**
 * V1 auth middleware — unified to delegate to authMiddlewareV2.
 *
 * V1 historically read only the `Authorization: Bearer <token>` header while V2
 * also accepted the `synapse_token` HttpOnly cookie and enforced both `disabled`
 * and `suspended` account states. Keeping two parallel JWT verification paths
 * risks drift (e.g. one enforcing session checks and the other not). V2 is a
 * strict superset of V1's checks, so V1 now delegates to a single enforcement
 * path. Kept for backward compatibility with existing call sites; new routes
 * must use authMiddlewareV2 directly.
 */
export const authMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  await authMiddlewareV2(req, res, next);
};

/**
 * Admin guard that first authenticates the request (V2 authMiddleware) and then
 * verifies the authenticated user has the `admin` role.
 */
export const authenticateAdmin = async (req: Request & { user?: any }, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      await authMiddlewareV2(req, res, () => undefined);
      if (!req.user) {
        return;
      }
    }

    const user = req.user;
    if (!isAdminRole(user?.role)) {
      logger.warn("管理员认证失败：非管理员用户", {
        userId: user?.id,
        username: user?.username,
        role: user?.role,
        ip: req.ip,
      });
      return res.status(403).json({ message: "权限不足，仅限管理员访问" });
    }

    next();
  } catch (error) {
    logger.error("管理员认证过程中发生错误:", error);
    return res.status(401).json({ message: "认证失败，请重新登录" });
  }
};

/**
 * Super-admin guard: authenticates the request (V2) then verifies the user
 * holds the `superadmin` role. Required for all system changes and write
 * operations (the OAuth management endpoints are the documented exception,
 * gated by `authenticateAdmin` instead).
 */
export const authenticateSuperAdmin = async (req: Request & { user?: any }, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      await authMiddlewareV2(req, res, () => undefined);
      if (!req.user) {
        return;
      }
    }

    const user = req.user;
    if (user?.role !== "superadmin") {
      logger.warn("超级管理员认证失败：非超级管理员用户", {
        userId: user?.id,
        username: user?.username,
        role: user?.role,
        ip: req.ip,
      });
      return res.status(403).json({ message: "权限不足，仅限超级管理员访问" });
    }

    next();
  } catch (error) {
    logger.error("超级管理员认证过程中发生错误:", error);
    return res.status(401).json({ message: "认证失败，请重新登录" });
  }
};

/**
 * V2 auth middleware: Cookie/Bearer-aware JWT authentication.
 * Reads the token from the `Authorization: Bearer <token>` header or the
 * `synapse_token` HttpOnly cookie and checks both `disabled` and `suspended`
 * account states. (Login attempt lockout lives in authController, keyed by ip:identifier.)
 */
export const authMiddlewareV2 = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (((req as any).apiKey || (req as any).oauthToken) && req.user) {
      return next();
    }

    const token = getTokenFromRequest(req);

    if (!token) {
      return res.status(401).json({ error: "未提供认证令牌" });
    }

    // 验证JWT令牌
    const decoded = jwt.verify(token, config.jwtSecret, { algorithms: ["HS256"] }) as any;

    // 检查令牌是否过期
    if (decoded.exp && Date.now() >= decoded.exp * 1000) {
      return res.status(401).json({ error: "令牌已过期" });
    }

    // 获取用户信息
    const user = await UserStorage.getUserById(decoded.userId);
    if (!user) {
      return res.status(401).json({ error: "用户不存在" });
    }

    // 检查用户状态
    if ((user as any).disabled) {
      return res.status(403).json({ error: "账户已被禁用" });
    }
    if ((user as any).accountStatus === "suspended") {
      return res.status(403).json({ error: "账户已被封停", code: "ACCOUNT_SUSPENDED", supportEmail: "support@chloemlla.com" });
    }

    await assertActiveAuthSession(user.id, token);
    await touchAuthSession(user.id, token, {
      ipAddress: getClientIP(req),
      userAgent: String(req.headers["user-agent"] || "unknown"),
    });

    // 添加用户信息到请求对象
    req.user = user;

    // 记录访问日志（脱敏）
    safeLog("info", `用户访问: ${user.username}`, {
      path: req.path,
      method: req.method,
      ip: req.ip,
    });

    next();
  } catch (error: any) {
    if (error?.name === "AuthSessionError" || error?.message?.includes("会话不存在或已撤销")) {
      return res.status(401).json({ error: "会话不存在或已撤销" });
    }
    if (error instanceof jwt.JsonWebTokenError) {
      return res.status(401).json({ error: "无效的认证令牌" });
    }
    if (error instanceof jwt.TokenExpiredError) {
      return res.status(401).json({ error: "令牌已过期" });
    }

    safeLog("error", "认证中间件错误", { error: error.message });
    return res.status(500).json({ error: "认证服务错误" });
  }
};

// 管理员权限检查中间件
export const adminAuthMiddleware = (req: Request, res: Response, next: NextFunction) => {
  if (!req.user) {
    return res.status(401).json({ error: "未认证" });
  }

  if (!isAdminRole(req.user.role)) {
    safeLog("warn", "非管理员尝试访问管理员功能", {
      username: req.user.username,
      path: req.path,
    });
    return res.status(403).json({ error: "需要管理员权限" });
  }

  next();
};
