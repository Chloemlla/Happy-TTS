import type { NextFunction, Request, Response } from "express";
import { ProxycheckLookupLogModel } from "../models/proxycheckLookupLogModel";
import { ProxycheckProbeReportModel } from "../models/proxycheckProbeReportModel";
import { ProxycheckQuotaModel } from "../models/proxycheckQuotaModel";
import {
  ProxycheckRiskCacheModel,
  type ProxycheckRiskCacheDoc,
} from "../models/proxycheckRiskCacheModel";
import {
  buildIpRiskDecision,
  CACHE_LOOKUP_STATUS,
  type IpRiskCaller,
  type IpRiskDecision,
} from "../services/ipRiskService";
import { mongoose } from "../services/mongoService";
import { currentDayKey, docToParsed, toRiskResult } from "../services/proxycheckParsing";
import {
  DEFAULT_QUOTA_DAYS,
  buildIpMatcher,
  parseLookupQuery,
  parseProbeReportQuery,
  parseQuotaQuery,
  parseRiskCacheQuery,
} from "../services/proxycheckLogQuery";
import { RuntimeConfigService } from "../services/runtimeConfigService";

/**
 * proxycheck.io 集成只读面板的数据源（超级管理员专用，全部 GET）。
 *
 * 四个集合原先只有写入方（lookup_logs / probe_reports 的 model 注释里记着这段历史），
 * 本文件是仓库里唯一的读取方，两个原只写集合也因此补了 { createdAt: -1 } 索引：
 * 面板要回答「上游到底打了哪些请求 / 库里现在存了什么 / 每一项交给前端的决策是什么」。
 *
 * 两条硬约束：
 *   1. 绝不在请求路径 connectMongo()：Mongo 未就绪时回 503，MISSING 就报 MISSING。
 *   2. 四把密钥只经 RuntimeConfigService.getProxycheckSetting()（已 mask）间接暴露，
 *      本文件不读 config.proxycheck 的明文，也不自行拼接任何 key 字段。
 */

// lean() 出来的文档形态由 schema 决定，这里显式声明行形状，不依赖推导。
type LooseDoc = Record<string, unknown>;

const PROXYCHECK_COLLECTIONS = [
  "proxycheck_lookup_logs",
  "proxycheck_risk_cache",
  "proxycheck_probe_reports",
  "proxycheck_daily_quotas",
] as const;

const DAY_MS = 24 * 60 * 60 * 1000;
/** 「近 24 小时」计数的窗口宽度。 */
const RECENT_WINDOW_MS = DAY_MS;
/** 配额历史一次最多取多少行（正常只有 1 行/天，留出多 key slot 的余量）。 */
const MAX_QUOTA_HISTORY_ROWS = 500;

/**
 * 缓存页（risk-cache tab）没有逐行的历史 decision：那里展示的是缓存文档本身，只能按当前阈值重算。
 * caller 固定 "first_visit_gate"：那一页要回答的是「现在有人拿这个 IP 过首访闸门，会被要求验证吗」。
 * 按 api 口径重算的话 action 永远只是「仅上报」，risk 再高也看着像什么都没干（以前就这样误用过）。
 * 当时的真实决策去 proxycheck_lookup_logs 看（含 status=cache 的命中缓存行）。
 */
const CACHE_DERIVED_CALLER: IpRiskCaller = "first_visit_gate";

interface OverviewCounts {
  /** 决策日志总行数（含 status=cache 的命中缓存行与 status=deduped 的 in-flight 合并行）。 */
  lookupLogs: number;
  lookupLogs24h: number;
  /** 真的打到上游的行数（排除命中缓存）：它才与配额、外呼失败对应，不能混在总行数里读。 */
  upstreamCalls: number;
  upstreamCalls24h: number;
  riskCache: number;
  riskCacheActive: number;
  probeReports: number;
  probeReports24h: number;
}

interface TodayQuota {
  dayKey: string;
  apiKeySlot: number;
  count: number;
  limit: number;
  exhausted: boolean;
  exhaustedAt: string | null;
  lastUsedAt: string | null;
}

interface QuotaRow {
  dayKey: string;
  apiKeySlot: number;
  apiKeyHash: string;
  count: number;
  exhausted: boolean;
  exhaustedAt: string | null;
  lastUsedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

interface CollectionIndexInfo {
  name: string;
  indexes: string[];
  exists: boolean;
}

interface LookupLogRow {
  _id: string;
  ip: string;
  apiKeySlot: number;
  apiKeyHash: string;
  status: string;
  ok: boolean;
  risk: number | null;
  deduped: boolean;
  durationMs: number;
  error: string;
  createdAt: string | null;
  /** 旧行没有这个字段（decision 落库是后加的），一律回 null。 */
  decision: IpRiskDecision | null;
}

function isMongoReady(): boolean {
  return mongoose.connection.readyState === 1;
}

/** 与 ipRiskService.ensureMongoIfEnabled 同义：只读探针，绝不在请求路径建连。 */
function respondMongoUnavailable(res: Response): void {
  res.status(503).json({ success: false, message: "数据库未连接，无法读取日志" });
}

function readRawString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function readFiniteNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function readDate(value: unknown): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

function toIso(value: unknown): string | null {
  return readDate(value)?.toISOString() ?? null;
}

function toLooseDocs(docs: unknown): LooseDoc[] {
  return Array.isArray(docs) ? (docs as LooseDoc[]) : [];
}

async function readCounts(): Promise<OverviewCounts> {
  const since = new Date(Date.now() - RECENT_WINDOW_MS);
  const now = new Date();
  const [
    lookupLogs,
    lookupLogs24h,
    upstreamCalls,
    upstreamCalls24h,
    riskCache,
    riskCacheActive,
    probeReports,
    probeReports24h,
  ] = await Promise.all([
    ProxycheckLookupLogModel.countDocuments({}).exec(),
    ProxycheckLookupLogModel.countDocuments({ createdAt: { $gte: since } }).exec(),
    ProxycheckLookupLogModel.countDocuments({ status: { $ne: CACHE_LOOKUP_STATUS } }).exec(),
    ProxycheckLookupLogModel.countDocuments({
      createdAt: { $gte: since },
      status: { $ne: CACHE_LOOKUP_STATUS },
    }).exec(),
    ProxycheckRiskCacheModel.countDocuments({}).exec(),
    ProxycheckRiskCacheModel.countDocuments({ expiresAt: { $gt: now } }).exec(),
    ProxycheckProbeReportModel.countDocuments({}).exec(),
    ProxycheckProbeReportModel.countDocuments({ createdAt: { $gte: since } }).exec(),
  ]);

  return {
    lookupLogs,
    lookupLogs24h,
    upstreamCalls,
    upstreamCalls24h,
    riskCache,
    riskCacheActive,
    probeReports,
    probeReports24h,
  };
}

/** 当日配额：manifest 里槽位恒为 0，多槽位时取最小的那个。 */
async function readTodayQuota(limit: number): Promise<TodayQuota> {
  const dayKey = currentDayKey();
  const doc = (await ProxycheckQuotaModel.findOne({ dayKey })
    .sort({ apiKeySlot: 1 })
    .lean()
    .exec()) as unknown as LooseDoc | null;

  const count = readFiniteNumber(doc?.count, 0);
  const exhaustedAt = toIso(doc?.exhaustedAt);

  return {
    dayKey: readRawString(doc?.dayKey) || dayKey,
    apiKeySlot: readFiniteNumber(doc?.apiKeySlot, 0),
    count,
    limit,
    exhausted: exhaustedAt !== null || count >= limit,
    exhaustedAt,
    lastUsedAt: toIso(doc?.lastUsedAt),
  };
}

function normalizeQuotaRow(doc: LooseDoc, limit: number): QuotaRow {
  const count = readFiniteNumber(doc.count, 0);
  const exhaustedAt = toIso(doc.exhaustedAt);

  return {
    dayKey: readRawString(doc.dayKey),
    apiKeySlot: readFiniteNumber(doc.apiKeySlot, 0),
    apiKeyHash: readRawString(doc.apiKeyHash),
    count,
    exhausted: exhaustedAt !== null || count >= limit,
    exhaustedAt,
    lastUsedAt: toIso(doc.lastUsedAt),
    createdAt: toIso(doc.createdAt),
    updatedAt: toIso(doc.updatedAt),
  };
}

/** dayKey 是 Asia/Shanghai 的 YYYY-MM-DD 字符串，字典序即时间序，可直接 $gte。 */
async function readQuotaHistory(days: number, limit: number): Promise<QuotaRow[]> {
  const fromDayKey = currentDayKey(new Date(Date.now() - (days - 1) * DAY_MS));
  const docs = await ProxycheckQuotaModel.find({ dayKey: { $gte: fromDayKey } })
    .sort({ dayKey: -1, apiKeySlot: 1 })
    .limit(MAX_QUOTA_HISTORY_ROWS)
    .lean()
    .exec();

  return toLooseDocs(docs).map((doc) => normalizeQuotaRow(doc, limit));
}

/**
 * 索引名 + TTL / unique 标记拼成一条人类可读的字符串（面板直接渲染 string[]）。
 * 默认索引名（expiresAt_1）看不出是不是 TTL，运维需要「无 TTL = 不会自动清理」这个信息。
 */
function describeIndex(index: unknown): string {
  const info = (index ?? {}) as Record<string, unknown>;
  const name = readRawString(info.name);
  if (!name) return "";

  const markers: string[] = [];
  const expireAfterSeconds = info.expireAfterSeconds;
  if (typeof expireAfterSeconds === "number") markers.push(`TTL=${expireAfterSeconds}s`);
  if (info.unique === true) markers.push("unique");

  return markers.length ? `${name} (${markers.join(", ")})` : name;
}

/** 集合不存在时 listIndexes() 抛 NamespaceNotFound：收敛成 exists:false + 空索引。 */
async function readCollectionIndexes(): Promise<CollectionIndexInfo[]> {
  const db = mongoose.connection.db;
  if (!db) {
    return PROXYCHECK_COLLECTIONS.map((name) => ({ name, indexes: [], exists: false }));
  }

  const result: CollectionIndexInfo[] = [];
  for (const name of PROXYCHECK_COLLECTIONS) {
    try {
      const indexes = await db.collection(name).listIndexes().toArray();
      result.push({
        name,
        indexes: indexes.map(describeIndex).filter((entry) => entry.length > 0),
        exists: true,
      });
    } catch {
      result.push({ name, indexes: [], exists: false });
    }
  }
  return result;
}

function toLookupLogRow(doc: LooseDoc): LookupLogRow {
  const decision = doc.decision;
  return {
    _id: String(doc._id ?? ""),
    ip: readRawString(doc.ip),
    apiKeySlot: readFiniteNumber(doc.apiKeySlot, 0),
    apiKeyHash: readRawString(doc.apiKeyHash),
    status: readRawString(doc.status),
    ok: doc.ok === true,
    risk: typeof doc.risk === "number" && Number.isFinite(doc.risk) ? doc.risk : null,
    deduped: doc.deduped === true,
    durationMs: readFiniteNumber(doc.durationMs, 0),
    error: readRawString(doc.error),
    createdAt: toIso(doc.createdAt),
    decision: decision && typeof decision === "object" ? (decision as IpRiskDecision) : null,
  };
}

export class IpRiskLogController {
  /** GET /api/admin/proxycheck/overview —— 配置快照 + 四个集合现状 + 配额。 */
  static async getOverview(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!isMongoReady()) {
        respondMongoUnavailable(res);
        return;
      }

      const { setting } = await RuntimeConfigService.getProxycheckSetting();
      const limit = setting.config.dailyQuotaPerKey;
      const [counts, quota, quotaHistory, collections] = await Promise.all([
        readCounts(),
        readTodayQuota(limit),
        readQuotaHistory(DEFAULT_QUOTA_DAYS, limit),
        readCollectionIndexes(),
      ]);

      res.setHeader("Cache-Control", "no-store");
      res.json({ success: true, setting, counts, quota, quotaHistory, collections });
    } catch (error) {
      next(error);
    }
  }

  /** GET /api/admin/proxycheck/lookups —— 风险决策日志（上游外呼 / 命中缓存 / in-flight 合并，含落库的 decision）。 */
  static async listLookups(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!isMongoReady()) {
        respondMongoUnavailable(res);
        return;
      }

      const query = parseLookupQuery(req.query as Record<string, unknown>);
      const filter: Record<string, unknown> = {};
      const ipMatcher = buildIpMatcher(query.ip);
      if (ipMatcher) filter.ip = ipMatcher;
      if (query.status) filter.status = query.status;
      if (query.ok !== null) filter.ok = query.ok;
      if (query.deduped !== null) filter.deduped = query.deduped;

      const [docs, total] = await Promise.all([
        ProxycheckLookupLogModel.find(filter)
          .sort({ createdAt: -1 })
          .skip(query.offset)
          .limit(query.limit)
          .lean()
          .exec(),
        ProxycheckLookupLogModel.countDocuments(filter).exec(),
      ]);

      const logs = toLooseDocs(docs).map(toLookupLogRow);

      res.setHeader("Cache-Control", "no-store");
      res.json({
        success: true,
        logs,
        total,
        limit: query.limit,
        offset: query.offset,
        filters: {
          ip: query.ip || null,
          status: query.status || null,
          ok: query.ok,
          deduped: query.deduped,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /** GET /api/admin/proxycheck/risk-cache —— 数据库已有的风险缓存 + 重算的决策。 */
  static async listRiskCache(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!isMongoReady()) {
        respondMongoUnavailable(res);
        return;
      }

      const query = parseRiskCacheQuery(req.query as Record<string, unknown>);
      const now = new Date();
      const filter: Record<string, unknown> = {};
      // TTL 后台线程最长 60s 才删过期文档，所以 expired 一律按 expiresAt 显式算，不靠索引。
      if (query.state === "active") filter.expiresAt = { $gt: now };
      else if (query.state === "expired") filter.expiresAt = { $lte: now };
      const ipMatcher = buildIpMatcher(query.ip);
      if (ipMatcher) filter.ip = ipMatcher;

      const [docs, total] = await Promise.all([
        ProxycheckRiskCacheModel.find(filter)
          .sort({ expiresAt: -1 })
          .skip(query.offset)
          .limit(query.limit)
          .lean()
          .exec(),
        ProxycheckRiskCacheModel.countDocuments(filter).exec(),
      ]);

      const entries = toLooseDocs(docs).map((doc) => {
        const cached = doc as unknown as ProxycheckRiskCacheDoc;
        const expiresAt = readDate(doc.expiresAt);
        const parsed = docToParsed(cached);

        return {
          ...doc,
          // risk 用解析后的值：旧解析器把真分写成过 0，直读 doc.risk 会让表上一个分、
          // 下面重算的决策又一个分，管理员无从判断哪个是真的。
          risk: parsed.risk,
          expired: expiresAt === null || expiresAt.getTime() <= now.getTime(),
          derivedDecision: buildIpRiskDecision(toRiskResult(parsed, true, "cache"), CACHE_DERIVED_CALLER),
        };
      });

      res.setHeader("Cache-Control", "no-store");
      res.json({
        success: true,
        entries,
        total,
        limit: query.limit,
        offset: query.offset,
        state: query.state,
      });
    } catch (error) {
      next(error);
    }
  }

  /** GET /api/admin/proxycheck/quotas —— 每日配额历史。 */
  static async listQuotas(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!isMongoReady()) {
        respondMongoUnavailable(res);
        return;
      }

      const query = parseQuotaQuery(req.query as Record<string, unknown>);
      const { setting } = await RuntimeConfigService.getProxycheckSetting();
      const limit = setting.config.dailyQuotaPerKey;
      const quotas = await readQuotaHistory(query.days, limit);

      res.setHeader("Cache-Control", "no-store");
      res.json({ success: true, quotas, limit });
    } catch (error) {
      next(error);
    }
  }

  /** GET /api/admin/proxycheck/probe-reports —— 客户端探测上报（服务端判定，不采信自报）。 */
  static async listProbeReports(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!isMongoReady()) {
        respondMongoUnavailable(res);
        return;
      }

      const query = parseProbeReportQuery(req.query as Record<string, unknown>);
      const filter: Record<string, unknown> = {};
      const ipMatcher = buildIpMatcher(query.ip);
      if (ipMatcher) filter.ip = ipMatcher;

      const [docs, total] = await Promise.all([
        ProxycheckProbeReportModel.find(filter)
          .sort({ createdAt: -1 })
          .skip(query.offset)
          .limit(query.limit)
          .lean()
          .exec(),
        ProxycheckProbeReportModel.countDocuments(filter).exec(),
      ]);

      const reports = toLooseDocs(docs).map((doc) => ({ ...doc, createdAt: toIso(doc.createdAt) }));

      res.setHeader("Cache-Control", "no-store");
      res.json({ success: true, reports, total, limit: query.limit, offset: query.offset });
    } catch (error) {
      next(error);
    }
  }
}
