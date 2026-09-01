import type { NextFunction, Request, Response } from "express";
import { config } from "../config/config";
import { getIPInfo, isIPAllowed } from "../services/ip";
import { extractRealIP } from "../utils/ipUtils";
import { logger } from "../services/logger";

/**
 * IP地址验证函数
 */
function isValidIP(ip: string): boolean {
  if (!ip) return false;

  // 移除IPv6前缀
  const cleanIP = ip.replace(/^::ffff:/, "");

  // IPv4验证
  const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
  if (ipv4Regex.test(cleanIP)) return true;

  // IPv6验证（简化版）
  const ipv6Regex = /^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$|^::1$|^::$/;
  if (ipv6Regex.test(ip)) return true;

  return false;
}

export async function ipCheckMiddleware(req: Request, res: Response, next: NextFunction) {
  try {
    // 提取真实IP地址（使用 ipUtils 统一实现，优先信任 req.ip 而非 X-Forwarded-For）
    const realIP = extractRealIP(req);

    // G1-16: 不再把 extractRealIP 的结果写回 req.ip / socket.remoteAddress。
    // extractRealIP 会在 req.ip 不可用时回退到客户端可伪造的 CF-Connecting-IP，
    // 覆写后下游（封禁、限流、用量统计）都会以伪造值为准。

    // 如果没有IP信息
    if (!realIP) {
      const sanitizedHeaders: Record<string, string> = {};
      for (const [key, value] of Object.entries(req.headers)) {
        if (key.toLowerCase() === "authorization") {
          sanitizedHeaders[key] = "[REDACTED]";
        } else {
          sanitizedHeaders[key] = String(value);
        }
      }
      logger.error("无法确定客户端IP", { headers: sanitizedHeaders });
      return res.status(400).json({ error: "无法确定客户端IP" });
    }

    // 验证IP地址格式
    if (!isValidIP(realIP)) {
      logger.error("无效的IP地址", { ip: realIP });
      return res.status(400).json({ error: "无效的IP地址" });
    }

    // 检查是否为本地IP（172.16.0.0/12 才是私网段，公共 172.x 不应放行）
    const isLocalIP =
      realIP === "127.0.0.1" ||
      realIP === "::1" ||
      realIP === "localhost" ||
      realIP.startsWith("192.168.") ||
      realIP.startsWith("10.") ||
      /^172\.(1[6-9]|2[0-9]|3[01])\./.test(realIP);

    // 检查是否在白名单中
    const isWhitelisted = config.localIps.includes(realIP);

    // 允许本地IP和白名单IP
    if (isLocalIP || isWhitelisted) {
      return next();
    }

    // G1-16: 访问控制判定（IP_WHITELIST）失败必须 fail-closed，否则白名单可被
    // 一次异常绕过。归属地查询只用于日志富化，失败不影响放行判定。
    let allowed: boolean;
    try {
      allowed = isIPAllowed(realIP);
    } catch (error) {
      logger.error("IP 白名单判定失败，拒绝请求", error);
      return res.status(503).json({ error: "IP 检查暂时不可用，请稍后重试" });
    }

    if (!allowed) {
      logger.warn("IP不被允许", { ip: realIP });
      return res.status(403).json({ error: "您的 IP 地址未被允许访问此服务" });
    }

    getIPInfo(realIP)
      .then((ipInfo) => logger.log("IP信息", { ip: realIP, ipInfo }))
      .catch((error) => logger.error("IP归属地查询失败", error));

    next();
  } catch (error) {
    logger.error("IP中间件错误", error);
    return res.status(500).json({ error: "IP 检查失败" });
  }
}
