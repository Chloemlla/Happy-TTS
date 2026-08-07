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

    // 记录IP访问日志
    console.log(`IP访问: ${realIP || "unknown"} - ${req.method} ${req.path}`);

    // 设置IP到请求对象（使用类型断言）
    if (realIP) {
      (req as any).ip = realIP;
    }

    // 为了测试兼容性，也设置到socket.remoteAddress
    if (realIP) {
      (req.socket as any).remoteAddress = realIP;
    }

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
      logger.log("IP访问通过", { ip: realIP, path: req.path });
      return next();
    }

    // 对于其他IP，使用现有的IP检查服务
    try {
      const ipInfo = await getIPInfo(realIP);
      logger.log("IP信息", { ip: realIP, ipInfo });

      if (!isIPAllowed(realIP)) {
        logger.log("IP不被允许", { ip: realIP, ipInfo });
        return res.status(403).json({ error: "您的 IP 地址未被允许访问此服务" });
      }

      next();
    } catch (error) {
      logger.error("IP检查失败", error);
      // 如果IP检查服务失败，默认允许访问（可以根据需要调整）
      next();
    }
  } catch (error) {
    logger.error("IP中间件错误", error);
    return res.status(500).json({ error: "IP 检查失败" });
  }
}
