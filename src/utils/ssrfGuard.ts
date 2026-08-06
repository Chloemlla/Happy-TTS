import dns from "node:dns/promises";
import { isIP } from "node:net";

const PRIVATE_IPV4_PATTERNS = [
  /^0\./, // 0.0.0.0/8
  /^10\./, // 10.0.0.0/8
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./, // 100.64.0.0/10 (CGNAT)
  /^127\./, // 127.0.0.0/8 (loopback)
  /^169\.254\./, // 169.254.0.0/16 (link-local)
  /^172\.(1[6-9]|2\d|3[01])\./, // 172.16.0.0/12
  /^192\.0\.0\./, // 192.0.0.0/24
  /^192\.0\.2\./, // 192.0.2.0/24 (documentation)
  /^192\.168\./, // 192.168.0.0/16
  /^198\.18\./, // 198.18.0.0/15 (benchmarking)
  /^198\.51\.100\./, // 198.51.100.0/24 (documentation)
  /^203\.0\.113\./, // 203.0.113.0/24 (documentation)
  /^224\./, // 224.0.0.0/4 (multicast)
  /^240\./, // 240.0.0.0/4 (reserved)
  /^255\.255\.255\.255/, // broadcast
];

function isPrivateIpv4(ip: string): boolean {
  return PRIVATE_IPV4_PATTERNS.some((pattern) => pattern.test(ip));
}

function isPrivateIpv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  return (
    lower === "::" ||
    lower === "::1" ||
    lower.startsWith("::ffff:") || // IPv4-mapped (handled separately, but be safe)
    lower.startsWith("fc") || // fc00::/7 (ULA)
    lower.startsWith("fd") ||
    lower.startsWith("fe8") || // fe80::/10 (link-local)
    lower.startsWith("fe9") ||
    lower.startsWith("fea") ||
    lower.startsWith("feb") ||
    lower.startsWith("2001:db8") // documentation
  );
}

/**
 * 判断 IP 是否为内网/环回/保留/危险地址（SSRF 防护）。
 */
export function isBlockedAddress(ip: string): boolean {
  const clean = ip.replace(/^::ffff:/, "").toLowerCase();
  const family = isIP(clean);
  if (family === 4) return isPrivateIpv4(clean);
  if (family === 6) return isPrivateIpv6(clean);
  // 无法识别为合法 IP 视为不安全
  return true;
}

async function resolveAddresses(host: string): Promise<string[]> {
  try {
    const records = await dns.lookup(host, { all: true, verbatim: true });
    return records.map((record) => record.address);
  } catch {
    return [];
  }
}

/**
 * 校验目标主机（IP 或域名）是否为可访问的公网目标。
 * 字面 IP 直接检查；域名解析全部地址，任一为内网/保留地址即拒绝。
 */
export async function isTargetPublic(host: string): Promise<boolean> {
  const trimmed = host.trim();
  if (!trimmed || trimmed.length > 253) return false;

  // 避免将 IP 当作域名解析
  if (isIP(trimmed)) {
    return !isBlockedAddress(trimmed);
  }

  const addresses = await resolveAddresses(trimmed);
  if (addresses.length === 0) return false;
  return addresses.every((addr) => !isBlockedAddress(addr));
}

/**
 * 校验用户提供的 URL 仅指向公网 http(s) 目标（防间接 SSRF）。
 */
export async function validatePublicUrl(
  rawUrl: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { ok: false, error: "URL 格式不正确" };
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, error: "仅支持 http/https 协议" };
  }

  if (!parsed.hostname) {
    return { ok: false, error: "URL 缺少主机名" };
  }

  const publicTarget = await isTargetPublic(parsed.hostname);
  if (!publicTarget) {
    return { ok: false, error: "目标地址指向内网或保留地址，已拒绝" };
  }

  return { ok: true };
}

/**
 * 校验用户提供的主机/IP 参数（端口探测、连接检测等）仅指向公网目标。
 */
export async function validatePublicHost(
  host: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const trimmed = host.trim();
  if (!trimmed) {
    return { ok: false, error: "目标地址不能为空" };
  }
  if (trimmed.length > 253) {
    return { ok: false, error: "目标地址过长" };
  }

  const publicTarget = await isTargetPublic(trimmed);
  if (!publicTarget) {
    return { ok: false, error: "目标地址指向内网或保留地址，已拒绝" };
  }

  return { ok: true };
}
