import { isIP } from "node:net";
import { appendFile, mkdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import logger from "../utils/logger";

const DATA_DIR = path.join(process.cwd(), "data");
const CLIENT_REPORTED_IP_FILE = path.join(DATA_DIR, "clientReportedIP.jsonl");
const IP_LOCATION_CACHE_FILE = path.join(DATA_DIR, "ipLocationCache.jsonl");
const IP_LOCATION_TIMEOUT_MS = 3000;
// G5-17: 归属地缓存 TTL（24h），IP 换归属后不再一直返回旧值。
const IP_LOCATION_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
// G5-17: 客户端上报文件大小上限（约 10MB）。
const CLIENT_REPORTED_IP_MAX_BYTES = 10 * 1024 * 1024;

function truncate(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  return value.slice(0, maxLength);
}

export interface ClientReportedIpRecord {
  clientReportedIP?: string;
  realIP?: string;
  ua: string;
  userAgent?: string;
  url?: string;
  referrer?: string;
  timestamp?: string;
  receivedAt: string;
}

export interface IpLocationCacheRecord {
  ip: string;
  location: string;
  cachedAt: string;
}

/** Location values that indicate a failed/meaningless lookup and must not be shown or cached. */
const FAILED_LOCATION_SENTINELS = new Set(["未知", "未找到位置", "获取位置时出错"]);

export function isMeaningfulLocation(location: string): boolean {
  const trimmed = location.trim();
  return trimmed.length > 0 && !FAILED_LOCATION_SENTINELS.has(trimmed);
}

let ipLocationCache: { mtimeMs: number; records: Map<string, IpLocationCacheRecord> } | null = null;

async function ensureDataDirectory(): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
}

async function appendJsonLine(filePath: string, value: unknown): Promise<void> {
  await ensureDataDirectory();
  await appendFile(filePath, `${JSON.stringify(value)}\n`, "utf-8");
}

export function normalizeIpAddress(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  let candidate = value.split(",")[0]?.trim() || "";
  if (!candidate) {
    return null;
  }

  if (candidate.startsWith("[") && candidate.endsWith("]")) {
    candidate = candidate.slice(1, -1);
  }

  return isIP(candidate) ? candidate : null;
}

async function readIpLocationCache(): Promise<Map<string, IpLocationCacheRecord>> {
  // G5-17: 进程内缓存为权威；只在首次访问（或内存缓存被清空）时全量读文件，
  // 不再每次写入都因 mtime 变化触发整份文件重解析。
  if (ipLocationCache) {
    return ipLocationCache.records;
  }

  try {
    const stats = await stat(IP_LOCATION_CACHE_FILE);
    const records = new Map<string, IpLocationCacheRecord>();
    const content = await readFile(IP_LOCATION_CACHE_FILE, "utf-8");
    for (const line of content.split(/\r?\n/)) {
      if (!line.trim()) {
        continue;
      }

      try {
        const record = JSON.parse(line) as IpLocationCacheRecord;
        if (normalizeIpAddress(record.ip) && isMeaningfulLocation(record.location)) {
          records.set(record.ip, record);
        }
      } catch (error) {
        logger.warn("[IPLocation] Ignored malformed cache line", {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    ipLocationCache = { mtimeMs: stats.mtimeMs, records };
    return records;
  } catch (_error) {
    const records = new Map<string, IpLocationCacheRecord>();
    ipLocationCache = { mtimeMs: 0, records };
    return records;
  }
}

export async function getCachedIpLocation(ip: string): Promise<IpLocationCacheRecord | null> {
  const cache = await readIpLocationCache();
  const record = cache.get(ip);
  if (!record) return null;

  // G5-17: 缓存 TTL 校验，过期即删除并返回 null。
  const cachedAt = new Date(record.cachedAt).getTime();
  if (!Number.isFinite(cachedAt) || Date.now() - cachedAt > IP_LOCATION_CACHE_TTL_MS) {
    cache.delete(ip);
    return null;
  }
  return record;
}

export async function cacheIpLocation(ip: string, location: string): Promise<IpLocationCacheRecord> {
  const record: IpLocationCacheRecord = {
    ip,
    location,
    cachedAt: new Date().toISOString(),
  };

  await appendJsonLine(IP_LOCATION_CACHE_FILE, record);

  // G5-17: 直接更新内存缓存，不做整份文件重解析。
  const cache = await readIpLocationCache();
  cache.set(ip, record);

  return record;
}

interface IpLocationProvider {
  name: string;
  url: (ip: string) => string;
  parse: (data: unknown) => string | null;
}

/** Normalize an IPv4-mapped IPv6 form (::ffff:1.2.3.4) to plain IPv4 for lookup APIs. */
function formatIpLookupTarget(ip: string): string {
  return ip.replace(/^::ffff:/i, "");
}

// Trusted third-party IP geolocation providers, tried in order. Each must embed
// only a validated IP (never a hostname), so requests cannot be redirected to
// arbitrary hosts (SSRF hardening).
// G5-35: 只保留 https 的 provider；ip-api.com 免费版不支持 HTTPS 已移除，避免访客 IP 明文外发。
// 2026-09-06: api.vore.top（对方 Redis MISCONF）与 ipapi.co（Cloudflare 对机房 IP 返人机挑战）
// 从生产机均只回 HTML，已替换为 ipwho.is / freeipapi.com / ipapi.is（生产实测返回 JSON）。
const IP_LOCATION_PROVIDERS: IpLocationProvider[] = [
  {
    name: "ipwho.is",
    url: (ip) => `https://ipwho.is/${encodeURIComponent(ip)}`,
    parse: (data) => {
      const d = data as {
        success?: boolean;
        country?: string;
        region?: string;
        city?: string;
        connection?: { isp?: string };
      };
      if (d?.success === false) return null;
      if (!d?.country) return null;
      return `${d.country}, ${d.region || ""}, ${d.city || ""} 运营商: ${d.connection?.isp || ""}`.trim();
    },
  },
  {
    name: "freeipapi.com",
    url: (ip) => `https://freeipapi.com/api/json/${encodeURIComponent(ip)}`,
    parse: (data) => {
      const d = data as {
        ipAddress?: string;
        countryName?: string;
        regionName?: string | null;
        cityName?: string;
        asnOrganization?: string;
      };
      if (!d?.countryName) return null;
      return `${d.countryName}, ${d.regionName || ""}, ${d.cityName || ""} 运营商: ${d.asnOrganization || ""}`.trim();
    },
  },
  {
    name: "ipapi.is",
    url: (ip) => `https://api.ipapi.is/?q=${encodeURIComponent(ip)}`,
    parse: (data) => {
      const d = data as {
        is_bogon?: boolean;
        country?: string;
        region?: string;
        city?: string;
        company?: string;
      };
      if (d?.is_bogon || !d?.country) return null;
      return `${d.country}, ${d.region || ""}, ${d.city || ""} 运营商: ${d.company || ""}`.trim();
    },
  },
];

// 失败冷却（5 分钟，镜像 ip.ts PROVIDER_COOLDOWN_MS）：provider 失败/非 JSON 响应后进入冷却，
// 冷却期内直接跳过，避免死 provider 在每次 lookup 都被重试并刷 "Provider lookup failed" 告警。
const PROVIDER_COOLDOWN_MS = 5 * 60 * 1000;
const providerFailureUntil = new Map<string, number>();

function isProviderInCooldown(name: string): boolean {
  const until = providerFailureUntil.get(name);
  return until !== undefined && until > Date.now();
}

function markProviderFailure(name: string): void {
  providerFailureUntil.set(name, Date.now() + PROVIDER_COOLDOWN_MS);
}

// 全失败告警节流：高频请求下每 5 分钟最多一条，避免日志被刷屏。
let lastAllFailedWarnAt = 0;
const ALL_FAILED_WARN_INTERVAL_MS = 5 * 60 * 1000;

export async function lookupIpLocation(ip: string, timeoutMs = IP_LOCATION_TIMEOUT_MS): Promise<string> {
  const validIp = normalizeIpAddress(ip);
  if (!validIp) return "未知";

  const targetIp = formatIpLookupTarget(validIp);

  for (const provider of IP_LOCATION_PROVIDERS) {
    if (isProviderInCooldown(provider.name)) {
      continue;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(provider.url(targetIp), { signal: controller.signal });
      if (!response.ok) {
        markProviderFailure(provider.name);
        continue;
      }
      // G5-35: 只解析 JSON 响应。HTML 错误页/人机挑战页直接判 provider 失败进入冷却，
      // 而不是让 JSON.parse 抛 "Unexpected token '<'" 每次查询都告警。
      const contentType = response.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        markProviderFailure(provider.name);
        continue;
      }
      const data = (await response.json()) as unknown;
      const location = provider.parse(data);
      if (location) return location;
    } catch (error) {
      markProviderFailure(provider.name);
      logger.warn("[IPLocation] Provider lookup failed", {
        provider: provider.name,
        ip: targetIp,
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  const now = Date.now();
  if (now - lastAllFailedWarnAt >= ALL_FAILED_WARN_INTERVAL_MS) {
    lastAllFailedWarnAt = now;
    logger.warn("[IPLocation] All IP location providers failed", { ip: targetIp });
  }
  return "未知";
}

// G5-17: 客户端上报按 IP 限流（每 IP 每分钟最多 1 条），防止反复上报大 payload 写满磁盘。
const reportIpThrottle = new Map<string, number>();

export async function recordClientReportedIp(record: ClientReportedIpRecord): Promise<void> {
  // G5-17: 字段截断（UA ≤512、URL ≤1024）。
  const safe: ClientReportedIpRecord = {
    clientReportedIP: truncate(record.clientReportedIP, 64),
    realIP: truncate(record.realIP, 64),
    ua: truncate(record.ua, 512),
    userAgent: truncate(record.userAgent, 512),
    url: truncate(record.url, 1024),
    referrer: truncate(record.referrer, 1024),
    timestamp: truncate(record.timestamp, 80),
    receivedAt: new Date().toISOString(),
  };

  const key = safe.clientReportedIP || safe.realIP || "unknown";
  const now = Date.now();
  const last = reportIpThrottle.get(key);
  if (last && now - last < 60_000) {
    return;
  }
  reportIpThrottle.set(key, now);
  if (reportIpThrottle.size > 10_000) reportIpThrottle.clear();

  // 文件大小上限：超过则丢弃新记录（低频 stat）。
  try {
    const stats = await stat(CLIENT_REPORTED_IP_FILE);
    if (stats.size > CLIENT_REPORTED_IP_MAX_BYTES) {
      logger.warn("[IPTelemetry] 客户端上报文件超过大小上限，丢弃新记录");
      return;
    }
  } catch {
    // 文件不存在则正常追加
  }

  await appendJsonLine(CLIENT_REPORTED_IP_FILE, safe);
}

