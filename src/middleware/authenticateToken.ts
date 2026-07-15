import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { config } from "../config/config";
import logger from "../utils/logger";
import { type User, UserStorage } from "../utils/userStorage";

type AuthedRequest = Request & {
  apiKey?: unknown;
  oauthToken?: unknown;
  user?: User;
};

type JwtUserPayload = {
  userId?: string;
};

export const authenticateToken = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authedReq = req as AuthedRequest;
    if ((authedReq.apiKey || authedReq.oauthToken) && authedReq.user) {
      return next();
    }

    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return res.status(401).json({ error: "未授权" });
    }
    const token = authHeader.split(" ")[1];
    if (!token) {
      return res.status(401).json({ error: "无效的Token" });
    }

    let userId: string;
    try {
      const decoded = jwt.verify(token, config.jwtSecret) as JwtUserPayload;
      if (!decoded.userId) {
        return res.status(401).json({ error: "Token 无 userId" });
      }
      userId = decoded.userId;
    } catch (_err) {
      return res.status(401).json({ error: "Token 无效或已过期" });
    }

    const user = await UserStorage.getUserById(userId);
    if (!user) {
      return res.status(403).json({ error: "无效的Token" });
    }
    if (user.accountStatus === "suspended") {
      return res.status(403).json({ error: "账户已被封停" });
    }
    authedReq.user = user;
    next();
  } catch (error) {
    logger.error("Token 认证失败:", error);
    res.status(401).json({ error: "认证失败" });
  }
};
