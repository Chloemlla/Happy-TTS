import { existsSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { TamperEventModel } from "../models/tamperEventModel";
import logger from "../utils/logger";
import { mongoose } from "./mongoService";
import type { TamperEvent } from "./tamperService";

export interface TamperEventQuery {
  limit: number;
  offset: number;
  ip?: string;
  tamperType?: string;
}

export interface TamperEventSummary {
  totalEvents: number;
  eventsLastHour: number;
  eventsLast24h: number;
  byType: Record<string, number>;
  bySeverity: Record<string, number>;
  topIPs: Array<{ ip: string; count: number }>;
  recentEvents: TamperEvent[];
}

const DATA_DIR = join(process.cwd(), "data");
const TAMPER_LOG_PATH = join(DATA_DIR, "tamper-events.json");
const FLUSH_DELAY_MS = 1000;

function resolveMaxFileEvents(): number {
  const configured = Number(process.env.TAMPER_MAX_EVENTS);
  if (!Number.isFinite(configured)) return 2000;
  return Math.max(100, Math.floor(configured));
}

function resolveRetentionDays(): number {
  const configured = Number(process.env.TAMPER_EVENT_RETENTION_DAYS);
  if (!Number.isFinite(configured)) return 30;
  return Math.min(365, Math.max(1, Math.floor(configured)));
}

const MAX_FILE_EVENTS = resolveMaxFileEvents();
const RETENTION_MS = resolveRetentionDays() * 24 * 60 * 60 * 1000;

// Mongo 是篡改事件的权威存储；只有连接不可用时（本地开发、连接中断）才退回本地 JSON，
// 行为与迁移前一致，避免在没有 Mongo 的环境里直接丢掉取证数据。
let fileEvents: TamperEvent[] | null = null;
let fileEventsLoading: Promise<void> | null = null;
let fileIpEventTimes: Map<string, number[]> = new Map();
let fileEventsDirty = false;
let flushTimer: NodeJS.Timeout | null = null;
let writeQueue: Promise<void> = Promise.resolve();

function isMongoReady(): boolean {
  return mongoose.connection.readyState === 1;
}

function toTimestampMs(value: string): number {
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function sortByTimestampDesc(events: TamperEvent[]): TamperEvent[] {
  return events.sort((left, right) => toTimestampMs(right.timestamp) - toTimestampMs(left.timestamp));
}

function toDocument(event: TamperEvent) {
  const timestamp = new Date(event.timestamp);
  return {
    eventId: event.id,
    elementId: event.elementId,
    timestamp,
    clientTimestamp: event.clientTimestamp,
    url: event.url,
    ip: event.ip,
    userAgent: event.userAgent,
    eventType: event.eventType,
    tamperType: event.tamperType,
    detectionMethod: event.detectionMethod,
    originalContent: event.originalContent,
    tamperContent: event.tamperContent,
    filePath: event.filePath,
    checksum: event.checksum,
    attempts: event.attempts,
    additionalInfo: event.additionalInfo,
    severity: event.severity,
    signed: event.signed,
    expiresAt: new Date(timestamp.getTime() + RETENTION_MS),
  };
}

function fromDocument(doc: any): TamperEvent {
  return {
    id: doc.eventId,
    elementId: doc.elementId,
    timestamp: doc.timestamp instanceof Date ? doc.timestamp.toISOString() : String(doc.timestamp),
    clientTimestamp: doc.clientTimestamp,
    url: doc.url,
    ip: doc.ip,
    userAgent: doc.userAgent,
    eventType: doc.eventType,
    tamperType: doc.tamperType,
    detectionMethod: doc.detectionMethod,
    originalContent: doc.originalContent,
    tamperContent: doc.tamperContent,
    filePath: doc.filePath,
    checksum: doc.checksum,
    attempts: doc.attempts,
    additionalInfo: doc.additionalInfo,
    severity: doc.severity,
    signed: doc.signed,
  };
}

function trackFileIpEvent(ip: string | undefined, timestamp: string): void {
  if (!ip) return;
  const time = toTimestampMs(timestamp);
  if (!time) return;
  const times = fileIpEventTimes.get(ip);
  if (times) times.push(time);
  else fileIpEventTimes.set(ip, [time]);
}

// 事件被环形窗口淘汰时，只有仍留在队首的那一条才是它对应的时间戳（更早的已被时间裁剪掉）
function untrackFileIpEvent(ip: string | undefined, timestamp: string): void {
  if (!ip) return;
  const times = fileIpEventTimes.get(ip);
  if (!times || times.length === 0) return;
  if (times[0] !== toTimestampMs(timestamp)) return;
  times.shift();
  if (times.length === 0) fileIpEventTimes.delete(ip);
}

async function loadFileEvents(): Promise<void> {
  let retained: TamperEvent[] = [];
  try {
    const parsed = JSON.parse(await readFile(TAMPER_LOG_PATH, "utf-8"));
    if (Array.isArray(parsed)) retained = parsed.slice(-MAX_FILE_EVENTS);
  } catch (_error) {
    retained = [];
  }
  fileEvents = retained;
  fileIpEventTimes = new Map();
  for (const event of retained) {
    trackFileIpEvent(event.ip, event.timestamp);
  }
}

async function ensureFileEventsLoaded(): Promise<TamperEvent[]> {
  if (fileEvents) return fileEvents;
  if (!fileEventsLoading) {
    fileEventsLoading = loadFileEvents();
  }
  await fileEventsLoading;
  return fileEvents ?? [];
}

/** 先写临时文件再 rename，避免整份覆盖写过程中崩溃产生损坏的 JSON。 */
async function writeFileEvents(events: TamperEvent[]): Promise<void> {
  if (!existsSync(DATA_DIR)) {
    await mkdir(DATA_DIR, { recursive: true });
  }
  const tempPath = `${TAMPER_LOG_PATH}.tmp`;
  await writeFile(tempPath, JSON.stringify(events.slice(-MAX_FILE_EVENTS), null, 2));
  await rename(tempPath, TAMPER_LOG_PATH);
}

function scheduleFlush(): void {
  if (flushTimer) return;
  const timer = setTimeout(() => {
    flushTimer = null;
    flushPendingTamperEvents().catch((error) => logger.error("刷新篡改事件失败:", error));
  }, FLUSH_DELAY_MS);
  timer.unref();
  flushTimer = timer;
}

export async function flushPendingTamperEvents(): Promise<void> {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  if (!fileEventsDirty || !fileEvents) return;
  fileEventsDirty = false;
  const snapshot = fileEvents.slice();
  writeQueue = writeQueue.catch(() => {}).then(() => writeFileEvents(snapshot));
  await writeQueue;
}

async function appendFileEvent(event: TamperEvent): Promise<void> {
  const events = await ensureFileEventsLoaded();
  events.push(event);
  trackFileIpEvent(event.ip, event.timestamp);
  while (events.length > MAX_FILE_EVENTS) {
    const evicted = events.shift();
    if (evicted) untrackFileIpEvent(evicted.ip, evicted.timestamp);
  }
  fileEventsDirty = true;
  scheduleFlush();
}

async function countFileEventsForIp(ip: string, since: number): Promise<number> {
  await ensureFileEventsLoaded();
  const times = fileIpEventTimes.get(ip);
  if (!times) return 0;
  while (times.length > 0 && times[0] <= since) times.shift();
  if (times.length === 0) {
    fileIpEventTimes.delete(ip);
    return 0;
  }
  return times.length;
}

async function queryFileEvents(query: TamperEventQuery): Promise<{ total: number; items: TamperEvent[] }> {
  let events = (await ensureFileEventsLoaded()).slice();
  if (query.ip) {
    events = events.filter((event) => event.ip === query.ip);
  }
  if (query.tamperType) {
    events = events.filter((event) => event.tamperType === query.tamperType || event.eventType === query.tamperType);
  }
  sortByTimestampDesc(events);
  return { total: events.length, items: events.slice(query.offset, query.offset + query.limit) };
}

async function summarizeFileEvents(limit: number): Promise<TamperEventSummary> {
  const events = await ensureFileEventsLoaded();
  const now = Date.now();
  const oneHourAgo = now - 60 * 60 * 1000;
  const oneDayAgo = now - 24 * 60 * 60 * 1000;
  const byType: Record<string, number> = {};
  const bySeverity: Record<string, number> = {};
  const ipCounts: Record<string, number> = {};

  for (const event of events) {
    const type = event.tamperType || event.eventType || "unknown";
    byType[type] = (byType[type] || 0) + 1;
    const severity = event.severity || "low";
    bySeverity[severity] = (bySeverity[severity] || 0) + 1;
    if (event.ip) ipCounts[event.ip] = (ipCounts[event.ip] || 0) + 1;
  }

  return {
    totalEvents: events.length,
    eventsLastHour: events.filter((event) => toTimestampMs(event.timestamp) >= oneHourAgo).length,
    eventsLast24h: events.filter((event) => toTimestampMs(event.timestamp) >= oneDayAgo).length,
    byType,
    bySeverity,
    topIPs: Object.entries(ipCounts)
      .map(([ip, count]) => ({ ip, count }))
      .sort((left, right) => right.count - left.count)
      .slice(0, 10),
    recentEvents: sortByTimestampDesc(events.slice()).slice(0, limit),
  };
}

function readFacetCount(rows: unknown): number {
  if (!Array.isArray(rows) || rows.length === 0) return 0;
  return Number((rows[0] as { count?: unknown }).count) || 0;
}

function readGroupCounts(rows: unknown): Record<string, number> {
  const counts: Record<string, number> = {};
  if (!Array.isArray(rows)) return counts;
  for (const row of rows) {
    const key = typeof row?._id === "string" && row._id ? row._id : "unknown";
    counts[key] = Number(row?.count) || 0;
  }
  return counts;
}

export async function appendTamperEvent(event: TamperEvent): Promise<void> {
  if (isMongoReady()) {
    try {
      await TamperEventModel.create(toDocument(event));
      return;
    } catch (error) {
      logger.error("MongoDB 写入篡改事件失败，降级为本地文件:", error);
    }
  }
  await appendFileEvent(event);
}

export async function countTamperEventsForIp(ip: string, since: number): Promise<number> {
  if (isMongoReady()) {
    try {
      return await TamperEventModel.countDocuments({ ip: { $eq: ip }, timestamp: { $gte: new Date(since) } });
    } catch (error) {
      logger.warn("MongoDB 统计篡改事件失败，降级为本地文件:", error);
    }
  }
  return countFileEventsForIp(ip, since);
}

export async function queryTamperEvents(query: TamperEventQuery): Promise<{ total: number; items: TamperEvent[] }> {
  if (isMongoReady()) {
    try {
      // 运行时兜底：过滤值来自 HTTP 查询串，用 $eq 包住，避免查询对象注入
      const filter: Record<string, unknown> = {};
      if (query.ip) filter.ip = { $eq: query.ip };
      if (query.tamperType) {
        filter.$or = [{ tamperType: { $eq: query.tamperType } }, { eventType: { $eq: query.tamperType } }];
      }
      const [docs, total] = await Promise.all([
        TamperEventModel.find(filter).sort({ timestamp: -1 }).skip(query.offset).limit(query.limit).lean(),
        TamperEventModel.countDocuments(filter),
      ]);
      return { total, items: docs.map((doc) => fromDocument(doc)) };
    } catch (error) {
      logger.warn("MongoDB 查询篡改事件失败，降级为本地文件:", error);
    }
  }
  return queryFileEvents(query);
}

export async function summarizeTamperEvents(limit: number): Promise<TamperEventSummary> {
  if (isMongoReady()) {
    try {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const [facet] = await TamperEventModel.aggregate([
        {
          $facet: {
            total: [{ $count: "count" }],
            lastHour: [{ $match: { timestamp: { $gte: oneHourAgo } } }, { $count: "count" }],
            last24h: [{ $match: { timestamp: { $gte: oneDayAgo } } }, { $count: "count" }],
            byType: [
              { $group: { _id: { $ifNull: ["$tamperType", { $ifNull: ["$eventType", "unknown"] }] }, count: { $sum: 1 } } },
            ],
            bySeverity: [{ $group: { _id: { $ifNull: ["$severity", "low"] }, count: { $sum: 1 } } }],
            topIPs: [
              { $match: { ip: { $type: "string" } } },
              { $group: { _id: "$ip", count: { $sum: 1 } } },
              { $sort: { count: -1 } },
              { $limit: 10 },
            ],
            recent: [{ $sort: { timestamp: -1 } }, { $limit: limit }],
          },
        },
      ]);
      return {
        totalEvents: readFacetCount(facet?.total),
        eventsLastHour: readFacetCount(facet?.lastHour),
        eventsLast24h: readFacetCount(facet?.last24h),
        byType: readGroupCounts(facet?.byType),
        bySeverity: readGroupCounts(facet?.bySeverity),
        topIPs: Array.isArray(facet?.topIPs)
          ? facet.topIPs.map((row: any) => ({ ip: String(row?._id || "unknown"), count: Number(row?.count) || 0 }))
          : [],
        recentEvents: Array.isArray(facet?.recent) ? facet.recent.map((doc: any) => fromDocument(doc)) : [],
      };
    } catch (error) {
      logger.warn("MongoDB 汇总篡改事件失败，降级为本地文件:", error);
    }
  }
  return summarizeFileEvents(limit);
}
