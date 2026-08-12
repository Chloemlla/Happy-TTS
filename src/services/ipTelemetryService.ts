import { isIP } from "node:net";
import { appendFile, mkdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import logger from "../utils/logger";

const DATA_DIR = path.join(process.cwd(), "data");
const CLIENT_REPORTED_IP_FILE = path.join(DATA_DIR, "clientReportedIP.jsonl");
const IP_LOCATION_CACHE_FILE = path.join(DATA_DIR, "ipLocationCache.jsonl");
const IP_LOCATION_TIMEOUT_MS = 3000;

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
  try {
    const stats = await stat(IP_LOCATION_CACHE_FILE);
    if (ipLocationCache && ipLocationCache.mtimeMs === stats.mtimeMs) {
      return ipLocationCache.records;
    }

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
  return cache.get(ip) || null;
}

export async function cacheIpLocation(ip: string, location: string): Promise<IpLocationCacheRecord> {
  const record: IpLocationCacheRecord = {
    ip,
    location,
    cachedAt: new Date().toISOString(),
  };

  await appendJsonLine(IP_LOCATION_CACHE_FILE, record);

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
    name: "ip-api.com",
    url: (ip) => `http://ip-api.com/json/${encodeURIComponent(ip)}?lang=zh-CN&fields=status,country,regionName,city,isp`,
    parse: (data) => {
      const d = data as { status?: string; country?: string; regionName?: string; city?: string; isp?: string };
      if (d?.status === "success") {
        return [d.country, d.regionName, d.city].filter(Boolean).join(", ") || null;
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

export async function recordClientReportedIp(record: ClientReportedIpRecord): Promise<void> {
  await appendJsonLine(CLIENT_REPORTED_IP_FILE, record);
}

