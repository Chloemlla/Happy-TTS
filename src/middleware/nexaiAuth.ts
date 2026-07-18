/**
 * NexAI 专用 JWT 鉴权中间件
 * 与原系统 authenticateToken 完全独立，使用独立的 JWT secret 和用户数据源
 */
import type { NextFunction, Request, Response } from "express";
import { NexaiUserModel } from "../models/nexaiUserModel";
import { NexaiAuthService } from "../services/nexaiAuthService";
import { sendNexaiError } from "./nexaiRequestSignature";
import logger from "../utils/logger";

function extractBearerToken(authHeader: string | undefined): string | null {
  if (!authHeader) return null;
  const trimmed = authHeader.trimStart();
  if (trimmed.length < 7) return null;
  if (trimmed.slice(0, 6).toLowerCase() !== "bearer") return null;
  const sep = trimmed.charCodeAt(6);
  if (sep !== 0x20 && sep !== 0x09) return null;
  const token = trimmed.slice(7).trim();
  return token || null;
}

// 扩展 Request 类型
declare global {
  namespace Express {
    interface Request {
      nexaiUser?: {
        id: string;
        username: string;
        email: string;
        role: string;
        provider: string;
      };
    }
  }
}

/**
 * NexAI 必需鉴权中间件
 * 要求请求必须携带有效的 NexAI JWT Token
 */
export const nexaiAuthRequired = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    const token = extractBearerToken(authHeader);
    if (!token) {
      return sendNexaiError(res, 401, {
        error: "未授权",
        message: "请提供有效的访问令牌",
        code: "NEXAI_AUTH_REQUIRED",
        stage: "server_auth",
      });
    }

    // 验证 NexAI JWT
    let decoded: any;
    try {
      decoded = NexaiAuthService.verifyToken(token);
    } catch (err: any) {
      const isExpired = err.name === "TokenExpiredError";
      return sendNexaiError(res, 401, {
        error: isExpired ? "Token 已过期" : "Token 无效",
        code: isExpired ? "NEXAI_TOKEN_EXPIRED" : "NEXAI_TOKEN_INVALID",
        message: isExpired ? "请使用 refreshToken 刷新访问令牌" : "请重新登录",
        stage: "server_auth",
      });
    }

    if (!decoded.userId) {
      return sendNexaiError(res, 401, {
        error: "Token 内容无效",
        code: "NEXAI_TOKEN_MALFORMED",
        stage: "server_auth",
      });
    }

    // 验证用户是否仍然存在
    const user = await NexaiUserModel.findOne({ id: decoded.userId })
      .select("id username email role authProvider")
      .lean();

    if (!user) {
      return sendNexaiError(res, 403, {
        error: "用户不存在或已被删除",
        code: "NEXAI_USER_NOT_FOUND",
        stage: "server_auth",
      });
    }

    // 注入用户信息到 request
    req.nexaiUser = {
      id: decoded.userId,
      username: decoded.username,
      email: decoded.email,
      role: decoded.role || "user",
      provider: decoded.provider || "local",
    };

    next();
  } catch (error) {
    logger.error("[NexAI Auth] 鉴权失败:", error);
    return sendNexaiError(res, 401, {
      error: "认证失败",
      code: "NEXAI_AUTH_ERROR",
      stage: "server_auth",
    });
  }
};

/**
 * NexAI 可选鉴权中间件
 * 如果提供了 Token 则解析用户信息，未提供则继续（nexaiUser 为 undefined）
 */
export const nexaiAuthOptional = async (req: Request, _res: Response, next: NextFunction) => {
  try {
    const token = extractBearerToken(req.headers.authorization);
    if (!token) {
      return next();
    }

    try {
      const decoded = NexaiAuthService.verifyToken(token);
      if (decoded.userId) {
        req.nexaiUser = {
          id: decoded.userId,
          username: decoded.username,
          email: decoded.email,
          role: decoded.role || "user",
          provider: decoded.provider || "local",
        };
      }
    } catch (_) {
      // Token 无效时不阻塞请求
    }

    next();
  } catch (_error) {
    next();
  }
};

/**
 * NexAI 管理员鉴权中间件
 * 要求用户具有 admin 角色
 */
export const nexaiAdminRequired = async (req: Request, res: Response, next: NextFunction) => {
  // 先走普通鉴权
  await nexaiAuthRequired(req, res, () => {
    if (!req.nexaiUser) return; // nexaiAuthRequired 已经返回了 401

    if (req.nexaiUser.role !== "admin") {
      return sendNexaiError(res, 403, {
        error: "权限不足",
        message: "此操作需要管理员权限",
        code: "NEXAI_ADMIN_REQUIRED",
        stage: "server_auth",
      });
    }

    next();
  });
};
