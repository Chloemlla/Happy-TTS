import { ApiError } from "../../services/lumen/errors.js";

export type CrashSource = "sdk" | "app";
export type CrashRisk = "high" | "medium" | "low";
export type GroupSortKey = "lastSeenAt" | "count" | "affectedUsers" | "versionCode" | "risk";

export const MAX_LIMIT = 100;
export const DEFAULT_LIMIT = 25;
export const MAX_REPORT_LIMIT = 200;
export const DEFAULT_REPORT_LIMIT = 50;
export const MAX_SEARCH_LENGTH = 120;

const GROUP_SORT_KEYS: readonly GroupSortKey[] = [
  "lastSeenAt",
  "count",
  "affectedUsers",
  "versionCode",
  "risk",
];
const RISKS: readonly CrashRisk[] = ["high", "medium", "low"];

export interface ParsedGroupQuery {
  limit: number;
  offset: number;
  source: CrashSource | "";
  risk: CrashRisk | "";
  versionCode: number | null;
  search: string;
  sort: GroupSortKey;
  order: 1 | -1;
}

export interface ParsedReportQuery {
  limit: number;
  offset: number;
}

/** Search terms reach Mongo as a regex, so every metacharacter must be inert. */
export const escapeRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const readString = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

const readBoundedInt = (value: unknown, fallback: number, min: number, max: number, label: string) => {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw ApiError.badRequest(`${label} 必须为数字`);
  return Math.min(Math.max(Math.trunc(parsed), min), max);
};

export function parseGroupQuery(query: Record<string, unknown>): ParsedGroupQuery {
  const source = readString(query.source).toLowerCase();
  if (source && source !== "sdk" && source !== "app") {
    throw ApiError.badRequest('source 必须为 "sdk" 或 "app"');
  }

  const risk = readString(query.risk).toLowerCase();
  if (risk && !RISKS.includes(risk as CrashRisk)) {
    throw ApiError.badRequest('risk 必须为 "high"、"medium" 或 "low"');
  }

  const sort = readString(query.sort) || "lastSeenAt";
  if (!GROUP_SORT_KEYS.includes(sort as GroupSortKey)) {
    throw ApiError.badRequest(`sort 必须为 ${GROUP_SORT_KEYS.join("、")} 之一`);
  }

  const order = readString(query.order).toLowerCase();
  if (order && order !== "asc" && order !== "desc") {
    throw ApiError.badRequest('order 必须为 "asc" 或 "desc"');
  }

  const search = readString(query.search).slice(0, MAX_SEARCH_LENGTH);

  let versionCode: number | null = null;
  if (query.versionCode !== undefined && readString(query.versionCode) !== "") {
    const parsed = Number(query.versionCode);
    if (!Number.isFinite(parsed)) throw ApiError.badRequest("versionCode 必须为数字");
    versionCode = Math.trunc(parsed);
  }

  return {
    limit: readBoundedInt(query.limit, DEFAULT_LIMIT, 1, MAX_LIMIT, "limit"),
    offset: readBoundedInt(query.offset, 0, 0, Number.MAX_SAFE_INTEGER, "offset"),
    source: source as CrashSource | "",
    risk: risk as CrashRisk | "",
    versionCode,
    search,
    sort: sort as GroupSortKey,
    order: order === "asc" ? 1 : -1,
  };
}

export function parseReportQuery(query: Record<string, unknown>): ParsedReportQuery {
  return {
    limit: readBoundedInt(query.limit, DEFAULT_REPORT_LIMIT, 1, MAX_REPORT_LIMIT, "limit"),
    offset: readBoundedInt(query.offset, 0, 0, Number.MAX_SAFE_INTEGER, "offset"),
  };
}

/**
 * Group-level filter. `groupKeys` is only supplied when a source filter needs
 * the pre-resolved key set, so the common unfiltered path stays index-only.
 */
export function buildGroupFilter(
  parsed: ParsedGroupQuery,
  groupKeys?: string[],
): Record<string, unknown> {
  const filter: Record<string, unknown> = {};
  if (groupKeys) filter.groupKey = { $in: groupKeys };
  if (parsed.risk) filter.risk = parsed.risk;
  if (parsed.versionCode !== null) filter.versionCode = parsed.versionCode;
  if (parsed.search) {
    const pattern = new RegExp(escapeRegex(parsed.search), "i");
    filter.$or = [{ groupKey: pattern }, { cleanStack: pattern }];
  }
  return filter;
}

/** `risk` is stored as a label, so ordering it needs the numeric weight field. */
export function buildGroupSort(parsed: ParsedGroupQuery): Record<string, 1 | -1> {
  if (parsed.sort === "risk") return { riskWeight: parsed.order, lastSeenAt: -1 };
  if (parsed.sort === "lastSeenAt") return { lastSeenAt: parsed.order };
  return { [parsed.sort]: parsed.order, lastSeenAt: -1 };
}
