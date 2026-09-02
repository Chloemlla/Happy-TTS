import type { NextFunction, Request, Response } from "express";
import logger from "../utils/logger";

// G1-30: 认证路径只观测、不改写。凭证数据修复一律走显式入口
// （/api/passkey/credential-id/fix、超管 /admin/data/repair-all），
// 否则任何未认证请求只要带上别人的 username 就能触发对该用户文档的写入。
export const passkeyErrorHandler = (error: any, req: Request, _res: Response, next: NextFunction) => {
  if (!req.path.includes("/passkey/")) {
    return next(error);
  }

  const isPasskeyError =
    error?.message?.includes("验证认证响应失败") ||
    error?.message?.includes("找不到匹配的认证器") ||
    error?.message?.includes("Credential ID") ||
    error?.message?.includes("base64url-encoded");

  if (isPasskeyError) {
    logger.warn("[Passkey错误处理] 检测到凭证数据异常，需人工走显式修复入口", {
      path: req.path,
      method: req.method,
      error: error.message,
    });
  }

  next(error);
};
