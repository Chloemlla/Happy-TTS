import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { config as appConfig } from "../config/config";
import logger from "../utils/logger";
import { UserStorage } from "../utils/userStorage";

export const authMiddleware = async (req: Request & { user?: any }, res: Response, next: NextFunction) => {
  try {
    if (((req as any).apiKey || (req as any).oauthToken) && req.user) {
      return next();
    }

    const authHeader = req.headers.authorization || "";
    const [type, token] = authHeader.split(" ");

    if (type !== "Bearer" || !token) {
      return res.status(401).json({ error: "未提供认证信息" });
    }

    const decoded: any = jwt.verify(token, appConfig.jwtSecret);
    const userId = decoded.userId || decoded.sub;
    if (!userId) {
      return res.status(401).json({ error: "认证失败" });
    }

    const user = await UserStorage.getUserById(userId);
    if (!user) {
      return res.status(401).json({ error: "用户不存在" });
    }
    if ((user as any).accountStatus === "suspended") {
      return res.status(403).json({ error: "账户已被封停" });
    }

    req.user = user;
    next();
  } catch (error) {
    logger.warn("认证失败", {
      ip: req.ip,
      error: error instanceof Error ? error.message : String(error),
    });
    return res.status(401).json({ error: "认证失败" });
  }
};

export const authenticateAdmin = async (req: Request & { user?: any }, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      await authMiddleware(req, res, () => undefined);
      if (!req.user) {
        return;
      }
    }

    const user = req.user;
    if (!user?.role || user.role !== "admin") {
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
