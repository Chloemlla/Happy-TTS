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
        if (normalizeIpAddress(record.ip) && typeof record.location === "string") {
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

export async function lookupIpLocation(ip: string, timeoutMs = IP_LOCATION_TIMEOUT_MS): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`https://api.vore.top/api/IPdata?ip=${encodeURIComponent(ip)}`, {
      signal: controller.signal,
    });
    if (!response.ok) {
      return "未找到位置";
    }

    const data = (await response.json()) as IpLocationApiResponse;
    if (data.code === 200 && data.ipdata) {
      const info = data.ipdata;
      return `${info.info1 || ""}, ${info.info2 || ""}, ${info.info3 || ""} 运营商: ${info.isp || ""}`.trim();
    }

    return "未找到位置";
  } catch (error) {
    logger.warn("[IPLocation] Remote lookup failed", {
      ip,
      error: error instanceof Error ? error.message : String(error),
    });
    return "获取位置时出错";
  } finally {
    clearTimeout(timeout);
  }
}

export async function recordClientReportedIp(record: ClientReportedIpRecord): Promise<void> {
  await appendJsonLine(CLIENT_REPORTED_IP_FILE, record);
}

