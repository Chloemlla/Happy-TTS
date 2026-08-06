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
 *
 * 优先使用 Express 的 req.ip（由 trust proxy 配置解析代理链），
 * 仅在 req.ip 不可用时回退到 socket.remoteAddress。
 * 不信任客户端直接设置的 X-Forwarded-For 等头部，避免 IP 伪造。
 */
export function extractRealIP(req: Request): string | undefined {
  // Express req.ip 已根据 trust proxy 配置解析了代理链。
  // 当 trust proxy 未启用时，req.ip === req.socket.remoteAddress（TCP 层真实 IP）。
  if (req.ip && isValidIP(req.ip)) {
    return req.ip.replace(/^::ffff:/, "");
  }

  // 仅在 req.ip 不可用时，检查受信任的反向代理头部（Cloudflare 等）。
  // 注意：CF-Connecting-IP 由 Cloudflare 边缘设置，仅当请求经过 CF 时可信。
  const cfConnectingIP = req.headers["cf-connecting-ip"];
  if (cfConnectingIP && typeof cfConnectingIP === "string" && isValidIP(cfConnectingIP)) {
    return cfConnectingIP;
  }

  // 最后使用连接的远程地址
  const remoteAddress = req.socket?.remoteAddress;
  if (remoteAddress && isValidIP(remoteAddress)) {
    return remoteAddress.replace(/^::ffff:/, "");
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

    if (Number.isNaN(prefix) || prefix < 0 || prefix > 32) {
      return false;
    }

    const ipNum = ipToNumber(ip);
    const networkNum = ipToNumber(network);
    const mask = (0xffffffff << (32 - prefix)) >>> 0;

    return (ipNum & mask) === (networkNum & mask);
  } catch (_error) {
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
      if (Number.isNaN(num) || num < 0 || num > 255) {
        throw new Error("Invalid IP address part");
      }
      return (acc << 8) + num;
    }, 0) >>> 0
  ); // 无符号右移确保结果为正数
}
