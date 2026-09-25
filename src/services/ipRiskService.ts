import crypto from "node:crypto";
import { config } from "../config/config";
import { ProxycheckLookupLogModel } from "../models/proxycheckLookupLogModel";
import { ProxycheckQuotaModel } from "../models/proxycheckQuotaModel";
import { ProxycheckRiskCacheModel } from "../models/proxycheckRiskCacheModel";
import { isLocalIP } from "../utils/ipUtils";
import logger from "../utils/logger";
import { mongoose } from "./mongoService";
import { BATCH_MAX_IPS, extractIpResult, requestBatchLookup, requestSingleLookup } from "./proxycheckHttp";
import {
  type IpRiskLevel,
  type IpRiskResult,
  type ParsedRisk,
  currentDayKey,
  daysWindowFromTtl,
  docToParsed,
  normalizeIp,
  parseV3Result,
  redactSecret,
  safePositiveNumber,
  toNullableNumber,
  toRiskResult,
  toScore,
  unavailableResult,
} from "./proxycheckParsing";

/**
 * proxycheck.io 风险查询服务。
 *
 * 核心约束（用户需求）：同一 IP 只向上游发起一次请求。依次由三层拦截保证：
 *   1. Mongo 去重缓存（proxycheck_risk_cache，TTL 到期即失效）
 *   2. 进程内 in-flight Promise 合并（同 IP 并发请求共享同一个 Promise）
 *   3. 每日配额（proxycheck_daily_quotas，按 Asia/Shanghai 日切）
 *
 * proxycheck_lookup_logs 记的是「每一次交给调用方的决策」，不是「每一次外呼」：
 * 上面第 1、2 层拦下来的请求也各落一行（status=cache / status=deduped）。
 * 早先命中缓存一行都不写，于是上游一挂，整张表只剩 status=failed 的行，
 * 管理面板读起来就是「闸门一直在上游失败」，而真实判据一直是缓存里那份结论 —— 记录与事实相反。
 */

// proxycheck 的 key 可复用同一把，不照 IPQS 做多 key 轮换；slot 恒为 0，保留字段是为了
// 将来支持多 key 时不用改 schema。
const PROXYCHECK_API_KEY_SLOT = 0;
const IN_FLIGHT_MAX_ENTRIES = 10000;
const DEFAULT_TIMEOUT_MS = 8000;
const DEFAULT_CACHE_TTL_HOURS = 24;
const DEFAULT_DAILY_QUOTA_PER_KEY = 1000;
const DEFAULT_CHALLENGE_RISK_SCORE = 66;

// 命中缓存的行用的 status 与 apiKeyHash 哨兵：这次判定零外呼、零配额，但决策照样交付了出去。
// 与真实外呼行（ok / failed）分开，管理端才能把「上游挂了」和「走缓存」区分开。
// 导出去是为了让概览计数能把「真的打到上游」与「命中缓存」分开数（ipRiskLogController）。
export const CACHE_LOOKUP_STATUS = "cache";
const CACHE_API_KEY_HASH = "cache";

// 只有这三类检测单独触发验证：hosting 对机房出口过于常见，risk 分里已经体现其权重。
const CHALLENGE_FLAGS = ["vpn", "proxy", "tor"] as const;

export type { IpRiskDetections, IpRiskLevel, IpRiskResult } from "./proxycheckParsing";

export interface IpRiskEvaluation {
  ok: boolean;
  risk: number;
  level: IpRiskLevel;
  flags: string[];
  shouldChallenge: boolean;
  reason: string;
}

/** 这一次决策是谁问的：闸门 / 公开 API / 批量路径。 */
export type IpRiskCaller = "api" | "first_visit_gate" | "batch";

/** 实际交给前端的动作。`report` 只上报结论、不拦截（GET /api/ip-risk 就是这种）。 */
export type IpRiskDecisionAction = "report" | "challenge" | "allow" | "fail_open" | "fail_closed";

/**
 * 「这次查询交给前端的决策」的完整快照，用于落库供管理端日志面板展示。
 * threshold / failOpen / closedOnFailure 一并记下，是因为配置随时会变：只有把当时的
 * 生效值存下来，事后才解释得清这一行为什么这么判。
 */
export interface IpRiskDecision {
  caller: IpRiskCaller;
  action: IpRiskDecisionAction;
  shouldChallenge: boolean;
  reason: string;
  risk: number;
  level: IpRiskLevel;
  flags: string[];
  source: "cache" | "proxycheck" | "unavailable";
  threshold: number;
  failOpen: boolean;
  closedOnFailure: boolean;
}

/**
 * 决策的唯一产出点：闸门判定（evaluateIpRisk）与落库日志都取这里的返回值，
 * 不允许两处各写一遍判据 —— 否则日志里记的和真正回给前端的话会悄悄分叉。
 *
 * shouldChallenge 判据：上游给出了结论，且 risk >= challengeRiskScore，或命中 vpn/proxy/tor
 * 三类明确检测之一（hosting 单独命中不触发，机房出口太常见）。source 为 unavailable
 * （开关关闭 / 非法或内网地址 / 上游失败降级）时一律不挑战，只在 failOpen=false 时失败关闭。
 */
export function buildIpRiskDecision(result: IpRiskResult, caller: IpRiskCaller): IpRiskDecision {
  const threshold = toScore(config.proxycheck.challengeRiskScore, DEFAULT_CHALLENGE_RISK_SCORE);
  const failOpen = config.proxycheck.failOpen;
  const flagged = CHALLENGE_FLAGS.some((flag) => result.detections[flag]);
  const hasVerdict = result.source !== "unavailable";
  // failOpen=false 时拿不到结论 = 失败关闭：挑战而非放行（对齐 ipVerificationService 的 decision:"error"）。
  const closedOnFailure = !hasVerdict && !failOpen;
  const shouldChallenge = hasVerdict ? result.risk >= threshold || flagged : closedOnFailure;

  return {
    caller,
    action: hasVerdict
      ? caller === "api"
        ? "report"
        : shouldChallenge
          ? "challenge"
          : "allow"
      : failOpen
        ? "fail_open"
        : "fail_closed",
    shouldChallenge,
    reason: hasVerdict ? `proxycheck_risk_${result.level}` : "proxycheck_unavailable",
    risk: result.risk,
    level: result.level,
    flags: result.flags,
    source: result.source,
    threshold,
    failOpen,
    closedOnFailure,
  };
}

interface LookupLogInput {
  ip: string;
  apiKeyHash: string;
  status: string;
  ok: boolean;
  risk: number | null;
  deduped: boolean;
  durationMs: number;
  error?: string;
  /** 交给前端的决策。未知（如 in-flight 合并的 promise 最终被拒）时留空，不写库。 */
  decision?: IpRiskDecision;
}

/**
 * 只读探针，与 ipVerificationService 一致：绝不在请求路径里 connectMongo()。
 * 建连职责属于启动流程。
 */
function ensureMongoIfEnabled(): boolean {
  return mongoose.connection.readyState === 1;
}

/**
 * 上游够不着时的统一收口。与 ipVerificationService 的 failOpen 语义保持一致：
 * **绝不抛错**（抛错会把 /api/ip-risk 打成 500，并让闸门路径变成未捕获异常），
 * 而是回一个 source="unavailable" 的结果，由 evaluateIpRisk 决定是否失败关闭。
 */
function settleFailure(ip: string, reason: string): IpRiskResult {
  logger.debug("[IpRisk] degrade to unavailable", { ip, reason, failOpen: config.proxycheck.failOpen });
  return unavailableResult(ip);
}

async function logLookup(input: LookupLogInput): Promise<void> {
  try {
    if (!ensureMongoIfEnabled()) return;
    await ProxycheckLookupLogModel.create({
      ip: input.ip,
      apiKeySlot: PROXYCHECK_API_KEY_SLOT,
      apiKeyHash: input.apiKeyHash,
      status: input.status,
      ok: input.ok,
      risk: input.risk,
      deduped: input.deduped,
      durationMs: input.durationMs,
      error: input.error || "",
      decision: input.decision,
      createdAt: new Date(),
    });
  } catch (error) {
    // 日志是写放大路径：写失败不能把已经拿到的结论（或降级结论）丢掉。
    logger.warn("[IpRisk] Failed to persist proxycheck lookup log", {
      ip: input.ip,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function readCachedRisk(ip: string): Promise<IpRiskResult | null> {
  const doc = await ProxycheckRiskCacheModel.findOne({ ip, expiresAt: { $gt: new Date() } })
    .lean()
    .exec();
  if (!doc) return null;
  return toRiskResult(docToParsed(doc), true, "cache");
}

/**
 * 把「本次判定走的是缓存里那份结论」落成一条决策日志。
 *
 * 零外呼、零配额，但 shouldChallenge / risk / threshold 这些当时算给调用方的字段必须存下来：
 * 否则面板里只能看到真的外呼过的那几次，缓存命中这主路完全隐形。
 * apiKeyHash 用 "cache" 哨兵，以免被误读成「这把 key 查过上游」。
 */
async function logCachedLookup(
  result: IpRiskResult,
  caller: IpRiskCaller,
  durationMs: number,
): Promise<void> {
  await logLookup({
    ip: result.ip,
    apiKeyHash: CACHE_API_KEY_HASH,
    status: CACHE_LOOKUP_STATUS,
    ok: true,
    risk: result.risk,
    deduped: false,
    durationMs,
    decision: buildIpRiskDecision(result, caller),
  });
}

/** 缓存决策落库不能把判定卡在门外：写失败只记日志，不向上冒。 */
function recordCachedLookup(result: IpRiskResult, caller: IpRiskCaller, durationMs: number): void {
  void logCachedLookup(result, caller, durationMs).catch((error: unknown) => {
    logger.warn("[IpRisk] Failed to record proxycheck cache decision", {
      ip: result.ip,
      error: error instanceof Error ? error.message : String(error),
    });
  });
}

async function persistRiskCache(parsed: ParsedRisk, cacheTtlHours: number): Promise<void> {
  try {
    const expiresAt = new Date(parsed.queriedAt.getTime() + cacheTtlHours * 3_600_000);
    await ProxycheckRiskCacheModel.findOneAndUpdate(
      { ip: parsed.ip },
      {
        $set: {
          risk: parsed.risk,
          ...parsed.detections,
          networkType: parsed.networkType,
          provider: parsed.provider,
          asn: parsed.asn,
          range: parsed.range,
          organisation: parsed.organisation,
          hostname: parsed.hostname,
          continent: parsed.continent,
          country: parsed.country,
          isocode: parsed.isocode,
          region: parsed.region,
          city: parsed.city,
          latitude: parsed.latitude,
          longitude: parsed.longitude,
          timezone: parsed.timezone,
          detectionsRaw: parsed.detectionsRaw,
          lastUpdated: parsed.lastUpdated,
          queriedAt: parsed.queriedAt,
          expiresAt,
          source: "proxycheck",
        },
      },
      { upsert: true, returnDocument: "after" },
    )
      .lean()
      .exec();
  } catch (error) {
    // 上游已经答了：落缓存失败只降级「去重能力」，不能把拿到的风险结论丢掉。
    logger.warn("[IpRisk] Failed to persist proxycheck risk cache", {
      ip: parsed.ip,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function incrementQuota(dayKey: string, apiKey: string, dailyQuotaPerKey: number): Promise<void> {
  try {
    const updated = await ProxycheckQuotaModel.findOneAndUpdate(
      { dayKey, apiKeySlot: PROXYCHECK_API_KEY_SLOT },
      {
        $setOnInsert: { apiKeyHash: hashApiKeyForLog(apiKey) },
        $inc: { count: 1 },
        $set: { lastUsedAt: new Date() },
      },
      { upsert: true, returnDocument: "after" },
    )
      .lean()
      .exec();

    if ((toNullableNumber(updated?.count) ?? 0) >= dailyQuotaPerKey) {
      await ProxycheckQuotaModel.updateOne(
        { dayKey, apiKeySlot: PROXYCHECK_API_KEY_SLOT },
        { $set: { exhaustedAt: new Date() } },
      ).exec();
    }
  } catch (error) {
    // 同 persistRiskCache：计数失败不能把已经拿到的结论丢掉。
    logger.warn("[IpRisk] Failed to increment proxycheck daily quota", {
      dayKey,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function isQuotaExhausted(dayKey: string, dailyQuotaPerKey: number): Promise<boolean> {
  const doc = await ProxycheckQuotaModel.findOne({ dayKey, apiKeySlot: PROXYCHECK_API_KEY_SLOT })
    .lean()
    .exec();
  return (toNullableNumber(doc?.count) ?? 0) >= dailyQuotaPerKey;
}

/**
 * proxycheck 官方的响应验签密钥（API Payload Verification Key）。空串 = 未配置、不验签；
 * 非空但长度不是 64 由 HTTP 层在发请求前拦下（否则每一次验签都必然失败）。
 */
function proxycheckVerificationKey(): string {
  const value = config.proxycheck.payloadVerificationKey;
  return typeof value === "string" ? value.trim() : "";
}

/** 真正发起上游的那一次调用。走到这里说明缓存与 in-flight 都没拦住。 */
async function performLookup(ip: string, caller: IpRiskCaller): Promise<IpRiskResult> {
  const startedAt = Date.now();
  const pc = config.proxycheck;
  const apiKey = typeof pc.apiKey === "string" ? pc.apiKey.trim() : "";
  const timeoutMs = safePositiveNumber(pc.timeoutMs, DEFAULT_TIMEOUT_MS);
  const cacheTtlHours = safePositiveNumber(pc.cacheTtlHours, DEFAULT_CACHE_TTL_HOURS);
  const dailyQuotaPerKey = safePositiveNumber(pc.dailyQuotaPerKey, DEFAULT_DAILY_QUOTA_PER_KEY);

  if (!ensureMongoIfEnabled()) {
    logger.warn("[IpRisk] Mongo 未连接，跳过 proxycheck 外呼", { ip });
    return settleFailure(ip, "database_unavailable");
  }

  if (!apiKey) {
    const result = settleFailure(ip, "not_configured");
    await logLookup({
      ip,
      apiKeyHash: "not-configured",
      status: "not_configured",
      ok: false,
      risk: null,
      deduped: false,
      durationMs: Date.now() - startedAt,
      error: "proxycheck_api_key_missing",
      decision: buildIpRiskDecision(result, caller),
    });
    return result;
  }

  const dayKey = currentDayKey();
  if (await isQuotaExhausted(dayKey, dailyQuotaPerKey)) {
    const result = settleFailure(ip, "quota_exhausted");
    await logLookup({
      ip,
      apiKeyHash: hashApiKeyForLog(apiKey),
      status: "quota_exhausted",
      ok: false,
      risk: null,
      deduped: false,
      durationMs: Date.now() - startedAt,
      error: "proxycheck_daily_quota_exhausted",
      decision: buildIpRiskDecision(result, caller),
    });
    logger.warn("[IpRisk] proxycheck 每日配额已用尽，本次不外呼", { dayKey, dailyQuotaPerKey });
    return result;
  }

  const queriedAt = new Date();
  let parsed: ParsedRisk;
  try {
    const raw = await requestSingleLookup(ip, {
      apiKey,
      verificationKey: proxycheckVerificationKey(),
      timeoutMs,
      days: daysWindowFromTtl(cacheTtlHours),
    });
    if (!raw) throw new Error("proxycheck_response_missing_ip_result");
    parsed = parseV3Result(ip, raw, queriedAt);
  } catch (error) {
    const message = redactSecret(error instanceof Error ? error.message : String(error), apiKey);
    const result = settleFailure(ip, "lookup_failed");
    await logLookup({
      ip,
      apiKeyHash: hashApiKeyForLog(apiKey),
      status: "failed",
      ok: false,
      risk: null,
      deduped: false,
      durationMs: Date.now() - startedAt,
      error: message,
      decision: buildIpRiskDecision(result, caller),
    });
    logger.warn("[IpRisk] proxycheck lookup failed", { ip, error: message, failOpen: pc.failOpen });
    return result;
  }

  await incrementQuota(dayKey, apiKey, dailyQuotaPerKey);
  await persistRiskCache(parsed, cacheTtlHours);
  const result = toRiskResult(parsed, false, "proxycheck");
  await logLookup({
    ip,
    apiKeyHash: hashApiKeyForLog(apiKey),
    status: "ok",
    ok: true,
    risk: parsed.risk,
    deduped: false,
    durationMs: Date.now() - startedAt,
    decision: buildIpRiskDecision(result, caller),
  });
  logger.info("[IpRisk] proxycheck lookup completed", {
    ip,
    risk: parsed.risk,
    level: parsed.level,
    flags: parsed.flags,
  });
  return result;
}

const inFlightLookups = new Map<string, Promise<IpRiskResult>>();

function trackInFlight(ip: string, promise: Promise<IpRiskResult>): void {
  if (inFlightLookups.size >= IN_FLIGHT_MAX_ENTRIES) {
    // Map 保持插入顺序，淘汰最老的一项即可；被淘汰的等待者仍持有自己的 Promise。
    const oldest = inFlightLookups.keys().next();
    if (!oldest.done) inFlightLookups.delete(oldest.value);
  }
  inFlightLookups.set(ip, promise);
}

/**
 * in-flight 合并命中的日志。合并不改结论，但决策要等被合并的那个 promise 落定才有值，
 * 所以这条日志由 getIpRisk 挂到 joined 上后写，这里的 decision 允许缺省。
 */
function logDedupedLookup(ip: string, decision?: IpRiskDecision): Promise<void> {
  return logLookup({
    ip,
    apiKeyHash: "deduped",
    status: "deduped",
    ok: true,
    risk: null,
    deduped: true,
    durationMs: 0,
    decision,
  });
}

/** 同 IP 单飞：并发同 IP 只打一次上游。 */
export async function getIpRisk(ip: string, caller: IpRiskCaller): Promise<IpRiskResult> {
  const normalized = normalizeIp(ip);
  if (!normalized) return unavailableResult(typeof ip === "string" ? ip.trim() : "");

  const pc = config.proxycheck;
  if (!pc.enabled) return unavailableResult(normalized);

  // 内网/回环地址外呼没有意义，只会白烧配额并把自己内网地址发出去。
  if (isLocalIP(normalized)) return unavailableResult(normalized);

  if (ensureMongoIfEnabled()) {
    const cacheReadStartedAt = Date.now();
    const cached = await readCachedRisk(normalized);
    if (cached) {
      // 命中缓存也是一次真实交付：先记下「已走缓存」这一行，再返回结论（不 await，见 helper）。
      recordCachedLookup(cached, caller, Date.now() - cacheReadStartedAt);
      return cached;
    }
  }

  const joined = inFlightLookups.get(normalized);
  if (joined) {
    // 落库仍然非阻塞：调用方只 await joined，不等这次写日志。
    // 必须挂 catch：joined 被拒时调用方那边的 await 是一条独立链路，这里不接住就是 unhandled rejection。
    void joined
      .then((result) => logDedupedLookup(normalized, buildIpRiskDecision(result, caller)))
      .catch((error: unknown) => {
        // 被拒 = 这次合并根本没产出结论（调用方拿到的是异常而非决策），所以只补回原本就有的那行
        // 日志、不写 decision，不伪造一个没交付出去的决策。
        logger.warn("[IpRisk] In-flight proxycheck lookup rejected, dedup log written without decision", {
          ip: normalized,
          error: error instanceof Error ? error.message : String(error),
        });
        return logDedupedLookup(normalized);
      });
    logger.debug("[IpRisk] Joined in-flight proxycheck lookup", { ip: normalized });
    return joined;
  }

  const pending = performLookup(normalized, caller);
  trackInFlight(normalized, pending);
  try {
    return await pending;
  } finally {
    // 只由创建者清理自己的表项：期间若被淘汰又插入了新 Promise，不能误删后来者。
    if (inFlightLookups.get(normalized) === pending) {
      inFlightLookups.delete(normalized);
    }
  }
}

async function resolveBatchFromUpstream(
  ips: string[],
  resolved: Map<string, IpRiskResult>,
  caller: IpRiskCaller,
): Promise<void> {
  if (ips.length === 0) return;

  const pc = config.proxycheck;
  const apiKey = typeof pc.apiKey === "string" ? pc.apiKey.trim() : "";
  if (!apiKey) throw new Error("proxycheck_api_key_missing");

  const timeoutMs = safePositiveNumber(pc.timeoutMs, DEFAULT_TIMEOUT_MS);
  const cacheTtlHours = safePositiveNumber(pc.cacheTtlHours, DEFAULT_CACHE_TTL_HOURS);
  const dailyQuotaPerKey = safePositiveNumber(pc.dailyQuotaPerKey, DEFAULT_DAILY_QUOTA_PER_KEY);
  const days = daysWindowFromTtl(cacheTtlHours);
  const dayKey = currentDayKey();

  const lookupable: string[] = [];
  for (const ip of ips) {
    if (isLocalIP(ip)) {
      resolved.set(ip, unavailableResult(ip));
    } else {
      lookupable.push(ip);
    }
  }

  for (let index = 0; index < lookupable.length; index += BATCH_MAX_IPS) {
    const chunk = lookupable.slice(index, index + BATCH_MAX_IPS);
    if (await isQuotaExhausted(dayKey, dailyQuotaPerKey)) {
      for (const ip of chunk) resolved.set(ip, settleFailure(ip, "quota_exhausted"));
      continue;
    }

    const startedAt = Date.now();
    const payload = await requestBatchLookup(chunk, {
      apiKey,
      verificationKey: proxycheckVerificationKey(),
      timeoutMs,
      days,
    });
    const queriedAt = new Date();
    // 配额按上游 HTTP 请求计（一次批量算一次），不是按 IP 数计。
    await incrementQuota(dayKey, apiKey, dailyQuotaPerKey);

    for (const ip of chunk) {
      const raw = extractIpResult(payload, ip);
      if (!raw) {
        const result = settleFailure(ip, "lookup_failed");
        await logLookup({
          ip,
          apiKeyHash: hashApiKeyForLog(apiKey),
          status: "failed",
          ok: false,
          risk: null,
          deduped: false,
          durationMs: Date.now() - startedAt,
          error: "proxycheck_response_missing_ip_result",
          decision: buildIpRiskDecision(result, caller),
        });
        resolved.set(ip, result);
        continue;
      }

      const parsed = parseV3Result(ip, raw, queriedAt);
      await persistRiskCache(parsed, cacheTtlHours);
      const result = toRiskResult(parsed, false, "proxycheck");
      await logLookup({
        ip,
        apiKeyHash: hashApiKeyForLog(apiKey),
        status: "ok",
        ok: true,
        risk: parsed.risk,
        deduped: false,
        durationMs: Date.now() - startedAt,
        decision: buildIpRiskDecision(result, caller),
      });
      resolved.set(ip, result);
    }
  }
}

/**
 * 批量查询（proxycheck POST /v3/ 支持一次 <= 1000 个 IP）。结果与入参顺序一一对应。
 * 注意：批量路径不参与 getIpRisk 的 in-flight 合并表。
 */
export async function getIpRiskBatch(ips: string[], caller: IpRiskCaller): Promise<IpRiskResult[]> {
  const requested = Array.isArray(ips) ? ips : [];
  const normalized = requested.map((item) => normalizeIp(item));
  const unique = Array.from(new Set(normalized.filter((item): item is string => item !== null)));
  const resolved = new Map<string, IpRiskResult>();
  const pc = config.proxycheck;

  if (pc.enabled && unique.length > 0) {
    try {
      if (!ensureMongoIfEnabled()) throw new Error("proxycheck_database_unavailable");

      const cached = await ProxycheckRiskCacheModel.find({
        ip: { $in: unique },
        expiresAt: { $gt: new Date() },
      })
        .lean()
        .exec();
      for (const doc of cached) {
        const result = toRiskResult(docToParsed(doc), true, "cache");
        resolved.set(doc.ip, result);
        // 批量路径同样要能看出「这一条是缓存给的」，不是真的向上游查了 N 个地址。
        recordCachedLookup(result, caller, 0);
      }

      const missing = unique.filter((ip) => !resolved.has(ip));
      await resolveBatchFromUpstream(missing, resolved, caller);
    } catch (error) {
      const apiKey = typeof pc.apiKey === "string" ? pc.apiKey.trim() : "";
      const message = redactSecret(error instanceof Error ? error.message : String(error), apiKey);
      logger.warn("[IpRisk] proxycheck batch lookup failed", {
        count: unique.length,
        error: message,
        failOpen: pc.failOpen,
      });
      // 不抛错：未解析的 IP 由下方的 fallback 统一回 unavailableResult，
      // 调用方靠 source === "unavailable" 判定（与新 settleFailure 的语义一致）。
    }
  }

  return normalized.map((ip) => (ip === null ? unavailableResult("") : resolved.get(ip) ?? unavailableResult(ip)));
}

/**
 * 闸门用的轻量判定。判据一律取自 buildIpRiskDecision，本函数不再自己算一遍：
 * 日志里记的决策与这里回给闸门的结论必须同源，否则改判据时两处会悄悄分叉。
 * 返回值与改动前逐字段相同（decision 的 caller 记 "first_visit_gate"）。
 */
export async function evaluateIpRisk(ip: string): Promise<IpRiskEvaluation> {
  const result = await getIpRisk(ip, "first_visit_gate");
  const decision = buildIpRiskDecision(result, "first_visit_gate");

  return {
    ok: result.source !== "unavailable",
    risk: result.risk,
    level: result.level,
    flags: result.flags,
    shouldChallenge: decision.shouldChallenge,
    reason: decision.reason,
  };
}

export function hashApiKeyForLog(apiKey: string): string {
  // 该哈希只用于给配额/日志打「这是哪把 key」的标识，不需要口令级 KDF。
  const secret = config.jwtSecret || process.env.JWT_SECRET || "proxycheck-test-secret";
  // codeql[js/insufficient-password-hash] HMAC identifier digest (server-secret keyed) of a server-generated high-entropy apiKey, not a password hash
  return crypto.createHmac("sha256", secret).update(`proxycheck:${apiKey}`).digest("hex").slice(0, 32);
}
