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

interface IpLocationApiResponse {
  code?: number;
  ipdata?: {
    info1?: string;
    info2?: string;
    info3?: string;
    isp?: string;
  };
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
const IP_LOCATION_PROVIDERS: IpLocationProvider[] = [
  {
    name: "api.vore.top",
    url: (ip) => `https://api.vore.top/api/IPdata?ip=${encodeURIComponent(ip)}`,
    parse: (data) => {
      const d = data as IpLocationApiResponse;
      if (d?.code === 200 && d.ipdata) {
        const info = d.ipdata;
        return `${info.info1 || ""}, ${info.info2 || ""}, ${info.info3 || ""} 运营商: ${info.isp || ""}`.trim();
      }
      return null;
    },
  },
  {
    name: "ipapi.co",
    url: (ip) => `https://ipapi.co/${encodeURIComponent(ip)}/json/`,
    parse: (data) => {
      const d = data as { error?: boolean; country_name?: string; region?: string; city?: string };
      if (d?.error) return null;
      return [d.country_name, d.region, d.city].filter(Boolean).join(", ") || null;
    },
  },
];

export async function lookupIpLocation(ip: string, timeoutMs = IP_LOCATION_TIMEOUT_MS): Promise<string> {
  const validIp = normalizeIpAddress(ip);
  if (!validIp) return "未知";

  const targetIp = formatIpLookupTarget(validIp);

  for (const provider of IP_LOCATION_PROVIDERS) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(provider.url(targetIp), { signal: controller.signal });
      if (!response.ok) continue;
      const data = (await response.json()) as unknown;
      const location = provider.parse(data);
      if (location) return location;
    } catch (error) {
      logger.warn("[IPLocation] Provider lookup failed", {
        provider: provider.name,
        ip: targetIp,
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  logger.warn("[IPLocation] All IP location providers failed", { ip: targetIp });
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

