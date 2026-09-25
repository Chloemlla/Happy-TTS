/**
 * proxycheck 只读日志面板的查询参数解析（纯函数，不碰 Mongo、不发请求）。
 *
 * 与 crashReportQuery 的差别：这是运维排障用的只读视图，非法参数一律「忽略」并回落到默认值，
 * 绝不 400、绝不抛错 —— 一个手滑的 URL 不该让整个面板白屏。
 * `ip` 只做前缀匹配（`^escaped`），因此这里不能复用 normalizeIp（它要求完整合法 IP）。
 */

export const DEFAULT_LIMIT = 50;
export const MAX_LIMIT = 200;
export const MAX_IP_LENGTH = 45;
export const DEFAULT_QUOTA_DAYS = 30;
export const MAX_QUOTA_DAYS = 90;

export const LOOKUP_STATUSES = [
  "ok",
  "failed",
  "deduped",
  "quota_exhausted",
  "not_configured",
] as const;
export type LookupStatus = (typeof LOOKUP_STATUSES)[number];

export const RISK_CACHE_STATES = ["active", "expired", "all"] as const;
export type RiskCacheState = (typeof RISK_CACHE_STATES)[number];

/** IP 字面量允许出现的字符（IPv4 点分十进制 / IPv6 冒号十六进制）。 */
const IP_PREFIX_PATTERN = /^[0-9A-Fa-f.:]+$/;

/** express 的 query 值可能是数组（`?ip=a&ip=b`），只取第一个。 */
function readRaw(value: unknown): unknown {
  return Array.isArray(value) ? value[0] : value;
}

function readBoundedInt(value: unknown, fallback: number, min: number, max: number): number {
  const raw = readRaw(value);
  const parsed =
    typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw.trim()) : Number.NaN;
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.trunc(parsed), min), max);
}

function readBool(value: unknown): boolean | null {
  const raw = readRaw(value);
  if (typeof raw === "boolean") return raw;
  if (typeof raw !== "string") return null;
  const normalized = raw.trim().toLowerCase();
  if (normalized === "true" || normalized === "1") return true;
  if (normalized === "false" || normalized === "0") return false;
  return null;
}

/** 截到 45 字符后校验字符集；空串或含非 IP 字符一律当作「未提供」。 */
function readIpPrefix(value: unknown): string {
  const raw = readRaw(value);
  if (typeof raw !== "string") return "";
  const trimmed = raw.trim().slice(0, MAX_IP_LENGTH);
  if (!trimmed || !IP_PREFIX_PATTERN.test(trimmed)) return "";
  return trimmed;
}

export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * 前缀正则锚定 `^` 以便索引可用（区分大小写：存储侧是规范化后的 IP 字面量，
 * 加 `$options: "i"` 会让 proxycheck_risk_cache.ip 的唯一索引失效）。
 */
export function buildIpMatcher(ip: string): Record<string, unknown> | null {
  if (!ip) return null;
  return { $regex: `^${escapeRegex(ip)}` };
}

export interface ParsedLookupQuery {
  limit: number;
  offset: number;
  ip: string;
  status: LookupStatus | "";
  ok: boolean | null;
  deduped: boolean | null;
}

export function parseLookupQuery(query: Record<string, unknown>): ParsedLookupQuery {
  const status = readRaw(query.status);
  const normalizedStatus = typeof status === "string" ? status.trim().toLowerCase() : "";

  return {
    limit: readBoundedInt(query.limit, DEFAULT_LIMIT, 1, MAX_LIMIT),
    offset: readBoundedInt(query.offset, 0, 0, Number.MAX_SAFE_INTEGER),
    ip: readIpPrefix(query.ip),
    status: LOOKUP_STATUSES.includes(normalizedStatus as LookupStatus)
      ? (normalizedStatus as LookupStatus)
      : "",
    ok: readBool(query.ok),
    deduped: readBool(query.deduped),
  };
}

export interface ParsedRiskCacheQuery {
  limit: number;
  offset: number;
  ip: string;
  state: RiskCacheState;
}

export function parseRiskCacheQuery(query: Record<string, unknown>): ParsedRiskCacheQuery {
  const state = readRaw(query.state);
  const normalizedState = typeof state === "string" ? state.trim().toLowerCase() : "";

  return {
    limit: readBoundedInt(query.limit, DEFAULT_LIMIT, 1, MAX_LIMIT),
    offset: readBoundedInt(query.offset, 0, 0, Number.MAX_SAFE_INTEGER),
    ip: readIpPrefix(query.ip),
    state: RISK_CACHE_STATES.includes(normalizedState as RiskCacheState)
      ? (normalizedState as RiskCacheState)
      : "active",
  };
}

export interface ParsedQuotaQuery {
  days: number;
}

export function parseQuotaQuery(query: Record<string, unknown>): ParsedQuotaQuery {
  return { days: readBoundedInt(query.days, DEFAULT_QUOTA_DAYS, 1, MAX_QUOTA_DAYS) };
}

export interface ParsedProbeReportQuery {
  limit: number;
  offset: number;
  ip: string;
}

export function parseProbeReportQuery(query: Record<string, unknown>): ParsedProbeReportQuery {
  return {
    limit: readBoundedInt(query.limit, DEFAULT_LIMIT, 1, MAX_LIMIT),
    offset: readBoundedInt(query.offset, 0, 0, Number.MAX_SAFE_INTEGER),
    ip: readIpPrefix(query.ip),
  };
}
