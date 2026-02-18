import type { Request } from "express";

/**
 * IP地址验证函数
 */
export function isValidIP(ip: string): boolean {
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

/**
 * 从请求中提取真实IP地址
 */
export function extractRealIP(req: Request): string | undefined {
  // 检查X-Forwarded-For头（代理/负载均衡器）
  const xForwardedFor = req.headers["x-forwarded-for"];
  if (xForwardedFor) {
    const ips = Array.isArray(xForwardedFor) ? xForwardedFor[0] : xForwardedFor;
    const firstIP = ips.split(",")[0].trim();
    if (isValidIP(firstIP)) {
      return firstIP;
    }
  }

  // 检查X-Real-IP头（Nginx代理）
  const xRealIP = req.headers["x-real-ip"];
  if (xRealIP && typeof xRealIP === "string" && isValidIP(xRealIP)) {
    return xRealIP;
  }

  // 检查CF-Connecting-IP头（Cloudflare）
  const cfConnectingIP = req.headers["cf-connecting-ip"];
  if (cfConnectingIP && typeof cfConnectingIP === "string" && isValidIP(cfConnectingIP)) {
    return cfConnectingIP;
  }

  // 检查X-Client-IP头
  const xClientIP = req.headers["x-client-ip"];
  if (xClientIP && typeof xClientIP === "string" && isValidIP(xClientIP)) {
    return xClientIP;
  }

  // 检查X-Cluster-Client-IP头
  const xClusterClientIP = req.headers["x-cluster-client-ip"];
  if (xClusterClientIP && typeof xClusterClientIP === "string" && isValidIP(xClusterClientIP)) {
    return xClusterClientIP;
  }

  // 最后使用连接的远程地址
  const remoteAddress = req.connection?.remoteAddress || req.socket?.remoteAddress;
  if (remoteAddress && isValidIP(remoteAddress)) {
    return remoteAddress.replace(/^::ffff:/, ""); // 移除IPv6前缀
  }

  return undefined;
}

/**
 * 获取客户端IP地址（主要函数）
 */
export function getClientIP(req: Request): string {
  const realIP = extractRealIP(req);

  // 如果无法获取真实IP，返回默认值
  if (!realIP) {
    return "127.0.0.1"; // 本地回环地址作为默认值
  }

  return realIP;
}

/**
 * 检查IP是否为本地地址
 */
export function isLocalIP(ip: string): boolean {
  if (!ip) return false;

  const cleanIP = ip.replace(/^::ffff:/, "");

  // 本地回环地址
  if (cleanIP === "127.0.0.1" || cleanIP === "::1") return true;

  // 私有网络地址
  const privateRanges = [
    /^10\./, // 10.0.0.0/8
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./, // 172.16.0.0/12
    /^192\.168\./, // 192.168.0.0/16
    /^169\.254\./, // 169.254.0.0/16 (链路本地)
  ];

  return privateRanges.some((range) => range.test(cleanIP));
}

/**
 * 格式化IP地址用于显示
 */
export function formatIPForDisplay(ip: string): string {
  if (!ip) return "Unknown";

  const cleanIP = ip.replace(/^::ffff:/, "");

  // 如果是本地IP，添加标识
  if (isLocalIP(cleanIP)) {
    return `${cleanIP} (Local)`;
  }

  return cleanIP;
}

/**
 * 检查IP是否在指定的CIDR范围内
 */
export function isIPInCIDR(ip: string, cidr: string): boolean {
  try {
    const [network, prefixLength] = cidr.split("/");
    const prefix = parseInt(prefixLength, 10);

    if (isNaN(prefix) || prefix < 0 || prefix > 32) {
      return false;
    }

    const ipNum = ipToNumber(ip);
    const networkNum = ipToNumber(network);
    const mask = (0xffffffff << (32 - prefix)) >>> 0;

    return (ipNum & mask) === (networkNum & mask);
  } catch (error) {
    return false;
  }
}

/**
 * 将IP地址转换为数字
 */
function ipToNumber(ip: string): number {
  const cleanIP = ip.replace(/^::ffff:/, "");
  const parts = cleanIP.split(".");

  if (parts.length !== 4) {
    throw new Error("Invalid IP address format");
  }

  return (
    parts.reduce((acc, part) => {
      const num = parseInt(part, 10);
      if (isNaN(num) || num < 0 || num > 255) {
        throw new Error("Invalid IP address part");
      }
      return (acc << 8) + num;
    }, 0) >>> 0
  ); // 无符号右移确保结果为正数
}
