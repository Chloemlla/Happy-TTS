import type { NextFunction, Request, Response } from "express";
import { sendIpBlockResponse } from "../security/ipBlockPage";
import { tamperService } from "../services/tamperService";
import logger from "../utils/logger";

export async function tamperProtectionMiddleware(req: Request, res: Response, next: NextFunction) {
  const ip = req.ip || req.connection.remoteAddress || "unknown";

  // 检查 IP 是否被封禁
  if (tamperService.isIPBlocked(ip)) {
    const details = tamperService.getBlockDetails(ip);
    logger.warn(`Blocked IP ${ip} attempted to access the site`);
    // 与 ipBanCheck 共用同一套封禁响应：浏览器导航拿到阻断页，接口拿到带
    // banned / errorCode 的 JSON（前端据此弹邮件申诉，而不是给一条提交不了的工单）。
    sendIpBlockResponse(req, res, {
      reason: details?.reason || "您的 IP 已被封禁",
      expiresAt: details?.expiresAt,
      ip,
    });
    return;
  }

  // 继续处理请求
  next();
}
