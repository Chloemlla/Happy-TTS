import { isIP } from "node:net";
import type { Request, Response } from "express";
import { config } from "../config/config";
import {
  ProxycheckProbeReportModel,
  type ProxycheckProbeComparability,
  type ProxycheckProbeMismatch,
} from "../models/proxycheckProbeReportModel";
import {
  buildEchoWarnings,
  collectObservedAddresses,
  createProbeSession,
  verifyProbeSignature,
} from "../services/clientProbeService";
import { getIpRisk as getIpRiskForAddress } from "../services/ipRiskService";
import { IP_PROBE_WS_PATH } from "../services/ipProbeWebSocket";
import { normalizeIpAddress } from "../services/ipTelemetryService";
import { mongoose } from "../services/mongoService";
import { getClientIP } from "../utils/ipUtils";
import logger from "../utils/logger";

/** 上报字段截断上限（客户端可控，必须封顶后再落库）。 */
const MAX_TEXT_LENGTH = 256;
const MAX_USER_AGENT_LENGTH = 512;
const MAX_SCREEN_RES_LENGTH = 32;
const MAX_LANGUAGE_ITEMS = 10;
const MAX_LANGUAGE_LENGTH = 32;

const ECHO_PATH = "/api/ip-risk/echo";
const REPORT_PATH = "/api/ip-risk/report";
const DIRECT_QUERY_BASE_URL = "https://proxycheck.io/v2/{ip}";

function resolveRequestIp(req: Request): string {
  return normalizeIpAddress(getClientIP(req)) || "127.0.0.1";
}

function readText(source: Record<string, unknown>, key: string, maxLength = MAX_TEXT_LENGTH): string | undefined {
  const value = source[key];
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, maxLength);
}

function readNumber(source: Record<string, unknown>, key: string): number | undefined {
  const value = source[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readBoolean(source: Record<string, unknown>, key: string): boolean | undefined {
  const value = source[key];
  return typeof value === "boolean" ? value : undefined;
}

function readLanguages(source: Record<string, unknown>): string[] | undefined {
  const value = source["languages"];
  if (!Array.isArray(value)) return undefined;
  const languages: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") continue;
    const trimmed = item.trim();
    if (!trimmed) continue;
    languages.push(trimmed.slice(0, MAX_LANGUAGE_LENGTH));
    if (languages.length >= MAX_LANGUAGE_ITEMS) break;
  }
  return languages.length ? languages : undefined;
}

interface SanitizedProbePayload {
  httpExitIp?: string;
  wsExitIp?: string;
  ipv6Exit?: string;
  webrtcLeak?: boolean;
  timezone?: string;
  timezoneOffsetMin?: number;
  languages?: string[];
  userAgent?: string;
  uaPlatform?: string;
  hardwareConcurrency?: number;
  deviceMemory?: number;
  screenRes?: string;
  webdriver?: boolean;
  collectedAt?: string;
}

/** 逐字段类型校验 + 截断；类型不符的字段直接丢弃，绝不因脏字段抛错。 */
function sanitizeProbePayload(payload: Record<string, unknown>): SanitizedProbePayload {
  const sanitized: SanitizedProbePayload = {
    httpExitIp: readText(payload, "httpExitIp"),
    wsExitIp: readText(payload, "wsExitIp"),
    ipv6Exit: readText(payload, "ipv6Exit"),
    webrtcLeak: readBoolean(payload, "webrtcLeak"),
    timezone: readText(payload, "timezone"),
    timezoneOffsetMin: readNumber(payload, "timezoneOffsetMin"),
    languages: readLanguages(payload),
    userAgent: readText(payload, "userAgent", MAX_USER_AGENT_LENGTH),
    uaPlatform: readText(payload, "uaPlatform"),
    hardwareConcurrency: readNumber(payload, "hardwareConcurrency"),
    deviceMemory: readNumber(payload, "deviceMemory"),
    screenRes: readText(payload, "screenRes", MAX_SCREEN_RES_LENGTH),
    webdriver: readBoolean(payload, "webdriver"),
    collectedAt: readText(payload, "collectedAt"),
  };
  return sanitized;
}

/**
 * 读 proxycheck 风险缓存里的 timezone，仅用于 timezoneVsGeo 判定。
 *
 * 这里按 §3 契约里的集合名直读，而不 import 组 B 的 model：集合名与字段名是契约固定的，
 * model 的导出名不是，并行开发期用直读可以少一处跨模块命名耦合。
 * 读取侧显式带 expiresAt > now（TTL 后台线程最长 60s 才删除过期文档，不能只依赖索引）。
 * 缓存不可用 / 该 IP 未查询过时返回 null（该字段恒为 false），不让上报因此失败。
 */
async function readCachedGeoTimezone(ip: string): Promise<string | null> {
  try {
    const doc = (await mongoose.connection
      .collection("proxycheck_risk_cache")
      .findOne({ ip, expiresAt: { $gt: new Date() } }, { projection: { timezone: 1 } })) as {
      timezone?: unknown;
    } | null;
    const timezone = doc?.timezone;
    return typeof timezone === "string" && timezone.trim() ? timezone.trim() : null;
  } catch {
    return null;
  }
}

/** IPv4 里不可能是「出口 IP」的段：RFC1918、环回、链路本地 169.254/16、CGNAT 100.64/10。 */
const NON_GLOBAL_IPV4_PATTERN =
  /^(?:10\.|127\.|169\.254\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.|100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.)/;

/** IPv6 里同样不是出口的段：链路本地 fe80::/10、唯一本地 fc00::/7（环回与未指定在上面另判）。 */
const NON_GLOBAL_IPV6_PATTERN = /^(?:fe[89ab]|f[cd])/;

/**
 * 「可比对的出口 IP」：合法 IP 字面量，且是全局地址。
 *
 * 内网 / 环回 / 链路本地地址是基础设施跳，不是任何客户端的出口。经反向代理（含容器化
 * 反代）部署时服务端在部分连接上只能看到这类地址，拿它和另一侧的公网出口对比必然不等，
 * 那是观测层不同、不是出口不一致 —— 必须判为不可比，否则每条上报都是恒真的误报。
 */
function isComparableExitAddress(value: string | undefined): boolean {
  if (!value) return false;
  const candidate = value.trim().replace(/^::ffff:/i, "");
  const version = isIP(candidate);
  if (version === 4) return !NON_GLOBAL_IPV4_PATTERN.test(candidate);
  if (version === 6) return !NON_GLOBAL_IPV6_PATTERN.test(candidate.toLowerCase());
  return false;
}

/**
 * 由服务端自行判定不一致项与标记，不采信客户端自报的结论。
 * 客户端上报的 webrtcLeak / webdriver 只作为"客户端自称"记录进 flags。
 *
 * 每一轴先判「能不能判」（comparability）再判「判成什么」（mismatch）：一侧不具备判定
 * 条件时该轴恒为 false，并由 comparability 告诉前端「不可判定」，不要渲染成「一致」。
 *
 * 关键一条：HTTP 侧与 WS 侧的地址不是同一层观测。HTTP 侧走 Express，req.ip 由 trust proxy
 * 解析（反代后即真实客户端）；WS 升级请求是裸 IncomingMessage、在 Express 中间件栈之外，
 * 拿不到 req.ip，只能回退到 socket.remoteAddress —— 反代或 Docker 网关的内网地址。
 * 因此 ipv4vsWs 只在两侧都是公网出口时才成立。
 */
function computeProbeVerdict(
  report: SanitizedProbePayload,
  geoTimezone: string | null,
): {
  flags: string[];
  mismatch: ProxycheckProbeMismatch;
  comparability: ProxycheckProbeComparability;
} {
  const httpExit = report.httpExitIp;
  const wsExit = report.wsExitIp;
  const ipv6Exit = report.ipv6Exit;
  const clientTimezone = report.timezone;

  const comparability: ProxycheckProbeComparability = {
    ipv4vsWs: isComparableExitAddress(httpExit) && isComparableExitAddress(wsExit),
    ipvEvsV6: isComparableExitAddress(httpExit) && isComparableExitAddress(ipv6Exit),
    timezoneVsGeo: Boolean(geoTimezone && clientTimezone),
  };

  const mismatch: ProxycheckProbeMismatch = {
    ipv4vsWs: comparability.ipv4vsWs && httpExit !== wsExit,
    ipvEvsV6: comparability.ipvEvsV6 && httpExit !== ipv6Exit,
    timezoneVsGeo:
      comparability.timezoneVsGeo &&
      geoTimezone !== null &&
      clientTimezone !== undefined &&
      clientTimezone.toLowerCase() !== geoTimezone.toLowerCase(),
  };

  const flags: string[] = [];
  if (mismatch.ipv4vsWs) flags.push("ipv4_vs_ws_mismatch");
  if (mismatch.ipvEvsV6) flags.push("ipv_vs_v6_mismatch");
  if (mismatch.timezoneVsGeo) flags.push("timezone_vs_geo_mismatch");
  if (report.webrtcLeak === true) flags.push("webrtc_leak_reported");
  if (report.webdriver === true) flags.push("webdriver_reported");

  return { flags, mismatch, comparability };
}

export class IpRiskController {
  /** GET /api/ip-risk —— 返回本次请求来源 IP 的风险结论。 */
  static async getIpRisk(req: Request, res: Response): Promise<void> {
    const ip = resolveRequestIp(req);

    try {
      const data = await getIpRiskForAddress(ip, "api");
      res.json({ success: true, data });
    } catch (error) {
      // 只回中文提示：上游 URL 与内部栈不外泄。
      logger.error("[IpRisk] IP 风险查询失败", {
        ip,
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(502).json({ success: false, message: "IP 风险查询失败，请稍后再试" });
    }
  }

  /** GET /api/ip-risk/echo —— 网络出口 / IPv6 出口探测，并按需签发探测会话。 */
  static async getEcho(req: Request, res: Response): Promise<void> {
    const observed = collectObservedAddresses(req);
    const data = { ...observed, warning: buildEchoWarnings(observed) };

    const hmacSecret = config.proxycheck.hmacSecret;
    if (!hmacSecret) {
      // 未配置主密钥时不签发 probeKey，echo 本身仍可用（不静默降级为不验签）。
      res.json({ success: true, data });
      return;
    }

    const probe = createProbeSession(hmacSecret, observed.primary);
    res.json({ success: true, data, probe });
  }

  /** POST /api/ip-risk/report —— HMAC 验签后的客户端探测上报。 */
  static async reportProbe(req: Request, res: Response): Promise<void> {
    const hmacSecret = config.proxycheck.hmacSecret;
    if (!hmacSecret) {
      res.status(403).json({ success: false, reason: "hmac_not_configured" });
      return;
    }

    const body = (req.body ?? {}) as Record<string, unknown>;
    const probeId = typeof body.probeId === "string" ? body.probeId : "";
    const nonce = typeof body.nonce === "string" ? body.nonce : "";
    const payload = body.payload;
    if (!probeId || !nonce || !payload || typeof payload !== "object" || Array.isArray(payload)) {
      res.status(400).json({ success: false, reason: "invalid_request" });
      return;
    }

    const verified = verifyProbeSignature(probeId, nonce, payload, body.signature);
    if (!verified.ok) {
      const status = verified.reason === "nonce_replayed" ? 409 : 403;
      res.status(status).json({ success: false, reason: verified.reason });
      return;
    }

    const ip = resolveRequestIp(req);
    const report = sanitizeProbePayload(payload as Record<string, unknown>);
    const geoTimezone = await readCachedGeoTimezone(ip);
    const { flags, mismatch, comparability } = computeProbeVerdict(report, geoTimezone);

    let stored = true;
    try {
      await ProxycheckProbeReportModel.create({ ip, ...report, flags, mismatch, comparability, createdAt: new Date() });
    } catch (error) {
      stored = false;
      logger.warn("[IpRisk] 探测上报落库失败", {
        ip,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    res.json({ success: true, data: { stored, flags, mismatch, comparability } });
  }

  /** GET /api/ip-risk/probe-config —— 前端探测组件的运行时开关。 */
  static async getProbeConfig(_req: Request, res: Response): Promise<void> {
    const proxycheck = config.proxycheck;
    // 只下发浏览器专用的 publicApiKey；服务端 apiKey 与 hmacSecret 绝不下发。
    const publicApiKey =
      proxycheck.usePublicKeyForClient && proxycheck.publicApiKey ? proxycheck.publicApiKey : null;

    res.json({
      success: true,
      data: {
        enabled: proxycheck.enabled,
        hmacEnabled: Boolean(proxycheck.hmacSecret),
        echoPath: ECHO_PATH,
        reportPath: REPORT_PATH,
        wsProbePath: IP_PROBE_WS_PATH,
        publicApiKey,
        directQueryUrl: publicApiKey
          ? `${DIRECT_QUERY_BASE_URL}?key=${encodeURIComponent(publicApiKey)}&vpn=1&asn=1&risk=1`
          : null,
      },
    });
  }
}
