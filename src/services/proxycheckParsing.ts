import { isIP } from "node:net";
import type { ProxycheckRiskCacheDoc } from "../models/proxycheckRiskCacheModel";

/**
 * proxycheck.io 响应解析与字段归一化。
 *
 * 纯函数层：不发请求、不碰 Mongo，只把「上游返回的任意 JSON」和「缓存文档」收敛成
 * ipRiskService 需要的稳定形态。字段一律按 unknown 处理并防御缺失（上游 v2/v3
 * 的检测字段既有布尔也有 "yes"/"no" 字符串）。
 */

const DETECTION_FLAGS = ["anonymous", "proxy", "vpn", "tor", "hosting", "scraper", "compromised"] as const;

export type IpRiskLevel = "low" | "medium" | "high" | "critical";

export interface IpRiskDetections {
  anonymous: boolean;
  proxy: boolean;
  vpn: boolean;
  tor: boolean;
  hosting: boolean;
  scraper: boolean;
  compromised: boolean;
  confidence: number;
}

export interface IpRiskResult {
  ip: string;
  risk: number;
  level: IpRiskLevel;
  detections: IpRiskDetections;
  flags: string[];
  networkType: string;
  provider: string;
  organisation: string;
  asn: string;
  country: string;
  isocode: string;
  city: string;
  queriedAt: string;
  lastUpdated: string | null;
  cached: boolean;
  source: "cache" | "proxycheck" | "unavailable";
}

/** 内部形态：既够生成 IpRiskResult，也够写 proxycheck_risk_cache 文档。 */
export interface ParsedRisk {
  ip: string;
  risk: number;
  level: IpRiskLevel;
  detections: IpRiskDetections;
  flags: string[];
  networkType: string;
  provider: string;
  organisation: string;
  asn: string;
  range: string;
  hostname: string;
  continent: string;
  country: string;
  isocode: string;
  region: string;
  city: string;
  latitude: number | null;
  longitude: number | null;
  timezone: string;
  detectionsRaw?: Record<string, unknown>;
  lastUpdated: Date | null;
  queriedAt: Date;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function toStringField(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function toNullableNumber(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

export function toScore(value: unknown, fallback = 0): number {
  const parsed = toNullableNumber(value);
  if (parsed === null) return fallback;
  return Math.min(100, Math.max(0, Math.round(parsed)));
}

/** v2 的检测字段是 "yes"/"no" 字符串，v3 是布尔；两种形态都吃，缺失按 false。 */
function toDetectionFlag(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return normalized === "yes" || normalized === "true" || normalized === "1";
  }
  return false;
}

function toDate(value: unknown): Date | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    const parsed = new Date(value > 1e12 ? value : value * 1000);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  const text = toStringField(value);
  if (!text) return null;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** 剥掉 IPv4-mapped IPv6 前缀，保证同一出口在去重键上只有一种写法。 */
export function normalizeIp(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const candidate = trimmed.replace(/^::ffff:/i, "");
  return isIP(candidate) ? candidate : null;
}

const SHANGHAI_DAY_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Shanghai",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** 配额按 Asia/Shanghai 的 YYYY-MM-DD 日切（app.ts 已把进程时区钉在 Asia/Shanghai）。 */
export function currentDayKey(now = new Date()): string {
  const parts = SHANGHAI_DAY_FORMATTER.formatToParts(now);
  const pick = (type: string) => parts.find((part) => part.type === type)?.value || "";
  return `${pick("year")}-${pick("month")}-${pick("day")}`;
}

/** 配置来自 DB（管理员可改），AbortSignal.timeout 与 TTL 算术都要求正有限数。 */
export function safePositiveNumber(value: unknown, fallback: number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/** 防御「异常/上游文本里回显了请求 URL（含 key）」这一类泄露。 */
export function redactSecret(text: string, secret: string): string {
  if (!secret || !text.includes(secret)) return text;
  return text.split(secret).join("[redacted]");
}

export function levelFromRisk(risk: number): IpRiskLevel {
  if (risk >= 85) return "critical";
  if (risk >= 66) return "high";
  if (risk >= 33) return "medium";
  return "low";
}

function flagsFromDetections(detections: IpRiskDetections): string[] {
  return DETECTION_FLAGS.filter((flag) => detections[flag]);
}

/** node=1 的节点历史窗口：跟去重缓存窗口对齐，避免拉取用不到的历史。 */
export function daysWindowFromTtl(cacheTtlHours: number): number {
  return Math.min(90, Math.max(1, Math.ceil(cacheTtlHours / 24)));
}

export function unavailableResult(ip: string): IpRiskResult {
  return {
    ip,
    risk: 0,
    level: "low",
    detections: {
      anonymous: false,
      proxy: false,
      vpn: false,
      tor: false,
      hosting: false,
      scraper: false,
      compromised: false,
      confidence: 0,
    },
    flags: [],
    networkType: "",
    provider: "",
    organisation: "",
    asn: "",
    country: "",
    isocode: "",
    city: "",
    queriedAt: new Date().toISOString(),
    lastUpdated: null,
    cached: false,
    source: "unavailable",
  };
}

export function toRiskResult(parsed: ParsedRisk, cached: boolean, source: "cache" | "proxycheck"): IpRiskResult {
  return {
    ip: parsed.ip,
    risk: parsed.risk,
    level: parsed.level,
    detections: parsed.detections,
    flags: parsed.flags,
    networkType: parsed.networkType,
    provider: parsed.provider,
    organisation: parsed.organisation,
    asn: parsed.asn,
    country: parsed.country,
    isocode: parsed.isocode,
    city: parsed.city,
    queriedAt: parsed.queriedAt.toISOString(),
    lastUpdated: parsed.lastUpdated ? parsed.lastUpdated.toISOString() : null,
    cached,
    source,
  };
}

/** raw 是响应里该地址键下的对象：{ risk, network{...}, location{...}, detections{...}, last_updated }。 */
export function parseV3Result(ip: string, raw: Record<string, unknown>, queriedAt: Date): ParsedRisk {
  const network = isRecord(raw.network) ? raw.network : {};
  const location = isRecord(raw.location) ? raw.location : {};
  const detectionsRaw = isRecord(raw.detections) ? raw.detections : undefined;

  const detections: IpRiskDetections = {
    anonymous: toDetectionFlag(detectionsRaw?.anonymous),
    proxy: toDetectionFlag(detectionsRaw?.proxy),
    vpn: toDetectionFlag(detectionsRaw?.vpn),
    tor: toDetectionFlag(detectionsRaw?.tor),
    hosting: toDetectionFlag(detectionsRaw?.hosting),
    scraper: toDetectionFlag(detectionsRaw?.scraper),
    compromised: toDetectionFlag(detectionsRaw?.compromised),
    confidence: toScore(detectionsRaw?.confidence),
  };
  const risk = toScore(raw.risk);

  return {
    ip,
    risk,
    level: levelFromRisk(risk),
    detections,
    flags: flagsFromDetections(detections),
    networkType: toStringField(network.type),
    provider: toStringField(network.provider),
    organisation: toStringField(network.organisation),
    asn: toStringField(network.asn),
    range: toStringField(network.range),
    hostname: toStringField(network.hostname),
    continent: toStringField(location.continent),
    country: toStringField(location.country),
    isocode: toStringField(location.isocode),
    region: toStringField(location.region),
    city: toStringField(location.city),
    latitude: toNullableNumber(location.latitude),
    longitude: toNullableNumber(location.longitude),
    timezone: toStringField(location.timezone),
    detectionsRaw,
    lastUpdated: toDate(raw.last_updated),
    queriedAt,
  };
}

export function docToParsed(doc: ProxycheckRiskCacheDoc): ParsedRisk {
  const detections: IpRiskDetections = {
    anonymous: Boolean(doc.anonymous),
    proxy: Boolean(doc.proxy),
    vpn: Boolean(doc.vpn),
    tor: Boolean(doc.tor),
    hosting: Boolean(doc.hosting),
    scraper: Boolean(doc.scraper),
    compromised: Boolean(doc.compromised),
    confidence: toScore(doc.confidence),
  };
  const risk = toScore(doc.risk);

  return {
    ip: doc.ip,
    risk,
    level: levelFromRisk(risk),
    detections,
    flags: flagsFromDetections(detections),
    networkType: doc.networkType || "",
    provider: doc.provider || "",
    organisation: doc.organisation || "",
    asn: doc.asn || "",
    range: doc.range || "",
    hostname: doc.hostname || "",
    continent: doc.continent || "",
    country: doc.country || "",
    isocode: doc.isocode || "",
    region: doc.region || "",
    city: doc.city || "",
    latitude: toNullableNumber(doc.latitude),
    longitude: toNullableNumber(doc.longitude),
    timezone: doc.timezone || "",
    detectionsRaw: doc.detectionsRaw,
    lastUpdated: doc.lastUpdated ?? null,
    queriedAt: doc.queriedAt ?? new Date(),
  };
}
