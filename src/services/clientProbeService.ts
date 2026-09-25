import crypto from "node:crypto";
import type { IncomingMessage } from "node:http";
import { isIP } from "node:net";
import type { Request } from "express";
import { extractRealIP } from "../utils/ipUtils";

/** 探测会话 TTL：10 分钟（与契约 §0 的握手流程一致）。 */
export const PROBE_SESSION_TTL_MS = 10 * 60 * 1000;
/** 会话表上限，超出时按插入顺序淘汰最旧的一条，防止内存放大。 */
export const PROBE_SESSION_MAX = 5000;
/** 惰性清理之外的定时清理间隔。 */
const PROBE_SWEEP_INTERVAL_MS = 60_000;
/** 派生密钥的域分隔前缀，两侧（签发/验签）必须一致。 */
const PROBE_KEY_DERIVATION_PREFIX = "proxycheck-probe:";
/** signPayload 恒产出 sha256 的 64 位小写 hex。 */
const SHA256_HEX_PATTERN = /^[0-9a-f]{64}$/;

interface ProbeSession {
  probeKeyHex: string;
  nonceHex: string;
  primaryIp: string | null;
  createdAt: number;
}

const probeSessions = new Map<string, ProbeSession>();
/** nonce 重放表：nonce -> 过期时刻（TTL 与会话相同）。 */
const usedNonces = new Map<string, number>();
let sweepTimer: ReturnType<typeof setInterval> | null = null;

function sweepExpired(now = Date.now()): void {
  for (const [probeId, session] of probeSessions) {
    if (now - session.createdAt > PROBE_SESSION_TTL_MS) {
      probeSessions.delete(probeId);
    }
  }
  for (const [nonce, expiresAt] of usedNonces) {
    if (expiresAt <= now) {
      usedNonces.delete(nonce);
    }
  }
}

function ensureSweepTimer(): void {
  if (sweepTimer) return;
  sweepTimer = setInterval(() => sweepExpired(), PROBE_SWEEP_INTERVAL_MS);
  // 不让清理定时器拖住进程退出。
  sweepTimer.unref();
}

function getLiveSession(probeId: string, now: number): ProbeSession | undefined {
  const session = probeSessions.get(probeId);
  if (!session) return undefined;
  if (now - session.createdAt > PROBE_SESSION_TTL_MS) {
    probeSessions.delete(probeId);
    return undefined;
  }
  return session;
}

/**
 * 派生每会话探测密钥：HMAC-SHA256(hmacSecret, "proxycheck-probe:" + probeId)。
 *
 * hmacSecret 是服务端主密钥，绝不下发；下发给浏览器的只有这里派生出的 probeKey。
 */
export function deriveProbeKey(masterSecret: string, probeId: string): string {
  return crypto.createHmac("sha256", masterSecret).update(PROBE_KEY_DERIVATION_PREFIX + probeId).digest("hex");
}

export interface ProbeSessionIssue {
  probeId: string;
  probeKey: string;
  nonce: string;
  expiresInSec: number;
}

/** 签发一次探测会话，并把 probeId/nonce 写入内存表。 */
export function createProbeSession(masterSecret: string, primaryIp: string | null): ProbeSessionIssue {
  const now = Date.now();
  const probeId = crypto.randomBytes(16).toString("hex");
  const nonce = crypto.randomBytes(16).toString("hex");
  const probeKey = deriveProbeKey(masterSecret, probeId);

  sweepExpired(now);
  probeSessions.set(probeId, { probeKeyHex: probeKey, nonceHex: nonce, primaryIp, createdAt: now });

  // Map 的迭代顺序即插入顺序，按序列删最旧的一条（刚插入的这条永远最后被考虑）。
  while (probeSessions.size > PROBE_SESSION_MAX) {
    const oldest = probeSessions.keys().next();
    if (oldest.done) break;
    probeSessions.delete(oldest.value);
  }

  ensureSweepTimer();

  return { probeId, probeKey, nonce, expiresInSec: PROBE_SESSION_TTL_MS / 1000 };
}

/**
 * canonical 规则（必须与前端逐字一致）：对象键按 Object.keys().sort() 升序；字符串用
 * JSON.stringify；undefined/null 一律写 null；数组保持顺序；嵌套对象递归。
 * 产出 = JSON.stringify(canonicalize(payload))（UTF-8）
 */
export function canonicalizePayload(value: unknown): string {
  return JSON.stringify(canonicalizeValue(value));
}

function canonicalizeValue(value: unknown): unknown {
  if (value === undefined || value === null) return null;
  if (Array.isArray(value)) return value.map((item) => canonicalizeValue(item));
  if (typeof value === "object") {
    const source = value as Record<string, unknown>;
    const canonical: Record<string, unknown> = {};
    for (const key of Object.keys(source).sort()) {
      canonical[key] = canonicalizeValue(source[key]);
    }
    return canonical;
  }
  return value;
}

/** signature = HMAC-SHA256(probeKey, canonical(payload)) 的 hex。 */
export function signPayload(keyHex: string, payload: unknown): string {
  return crypto.createHmac("sha256", Buffer.from(keyHex, "hex")).update(canonicalizePayload(payload)).digest("hex");
}

export type ProbeVerifyFailure = "probe_session_not_found" | "signature_mismatch" | "nonce_replayed";
export type ProbeVerifyResult = { ok: true } | { ok: false; reason: ProbeVerifyFailure };

/**
 * timingSafeEqual 在长度不等时会抛错，且 Buffer.from(x,"hex") 对非法 hex 会截断，
 * 因此先比长度再校验 hex 形态，最后才做定时安全比较。
 */
function hexEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  if (!SHA256_HEX_PATTERN.test(a) || !SHA256_HEX_PATTERN.test(b)) return false;
  return crypto.timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
}

/**
 * 验签 + 重放校验。会话一次性：验签成功且 nonce 未用过时立即删除会话并登记 nonce。
 * 失败仅返回 reason，不抛错；失败不会消耗会话（否则攻击者可借此打断合法上报）。
 */
export function verifyProbeSignature(
  probeId: string,
  nonce: string,
  payload: unknown,
  signature: unknown,
): ProbeVerifyResult {
  const now = Date.now();
  const session = getLiveSession(probeId, now);
  if (!session) return { ok: false, reason: "probe_session_not_found" };

  // 重放表先于会话绑定校验：否则"换个新会话重放旧 nonce"只会撞上 signature_mismatch，
  // nonce_replayed 这个失败码永远不可达。
  const replayedAt = usedNonces.get(nonce);
  if (replayedAt !== undefined && replayedAt > now) {
    return { ok: false, reason: "nonce_replayed" };
  }

  // nonce 必须与会话绑定的那个一致，否则连"这是哪次会话"都没证明。
  if (session.nonceHex !== nonce) return { ok: false, reason: "signature_mismatch" };

  const expected = signPayload(session.probeKeyHex, payload);
  if (typeof signature !== "string" || !hexEqual(expected, signature)) {
    return { ok: false, reason: "signature_mismatch" };
  }

  probeSessions.delete(probeId);
  usedNonces.set(nonce, now + PROBE_SESSION_TTL_MS);
  return { ok: true };
}

export interface ObservedAddresses {
  ipv4: string | null;
  ipv6: string | null;
  socket: string | null;
  primary: string | null;
  isProxyHeader: boolean;
  headers: {
    cfConnectingIp: string | null;
    xRealIp: string | null;
    xForwardedFor: string | null;
  };
}

function readHeader(headers: IncomingMessage["headers"], name: string): string | null {
  const raw = headers[name];
  if (raw === undefined) return null;
  return Array.isArray(raw) ? raw.join(", ") : raw;
}

/** 剥 IPv4-mapped 前缀；::ffff:a.b.c.d 是 IPv4，不能误报成 IPv6。 */
function stripMappedPrefix(ip: string): string {
  return ip.replace(/^::ffff:/i, "");
}

function normalizeCandidate(value: string | null): { ip: string; version: number } | null {
  if (!value) return null;
  let candidate = value.split(",")[0]?.trim() || "";
  if (!candidate) return null;
  if (candidate.startsWith("[") && candidate.endsWith("]")) {
    candidate = candidate.slice(1, -1);
  }
  const unmapped = stripMappedPrefix(candidate);
  const version = isIP(unmapped);
  if (version !== 4 && version !== 6) return null;
  return { ip: unmapped, version };
}

/**
 * 收集本次连接观测到的出口地址。
 *
 * primary 走 ipUtils.extractRealIP（信任 Express trust-proxy 结果 → cf-connecting-ip →
 * socket.remoteAddress，刻意不信任客户端可伪造的 x-forwarded-for）。三个代理头另外原样
 * 读出放进 headers，仅作展示，不参与判权。
 *
 * 入参同时接受 Express Request（有 req.ip）与 WS 升级的裸 IncomingMessage（无 req.ip，
 * extractRealIP 会自然回退到 cf-connecting-ip / socket.remoteAddress）。
 */
export function collectObservedAddresses(req: Request | IncomingMessage): ObservedAddresses {
  const cfConnectingIp = readHeader(req.headers, "cf-connecting-ip");
  const xRealIp = readHeader(req.headers, "x-real-ip");
  const xForwardedFor = readHeader(req.headers, "x-forwarded-for");

  const rawSocket = req.socket?.remoteAddress ?? null;
  const socket = rawSocket ? stripMappedPrefix(rawSocket) : null;

  const primary = extractRealIP(req as Request) ?? null;

  // 候选顺序：主出口 → socket → 代理头。首个 IPv4 与首个 IPv6 各取一个作为"观测到的出口"。
  const candidates: (string | null)[] = [primary, socket, cfConnectingIp, xRealIp, xForwardedFor];
  let ipv4: string | null = null;
  let ipv6: string | null = null;
  for (const candidate of candidates) {
    if (ipv4 && ipv6) break;
    const normalized = normalizeCandidate(candidate);
    if (!normalized) continue;
    if (normalized.version === 4) {
      if (!ipv4) ipv4 = normalized.ip;
    } else if (!ipv6) {
      ipv6 = normalized.ip;
    }
  }

  const isProxyHeader = Boolean(normalizeCandidate(cfConnectingIp) || normalizeCandidate(xRealIp));

  return { ipv4, ipv6, socket, primary, isProxyHeader, headers: { cfConnectingIp, xRealIp, xForwardedFor } };
}

/** 出口探测的告警项（纯展示，前端自行决定怎么用）。 */
export function buildEchoWarnings(observed: ObservedAddresses): string[] {
  const warnings: string[] = [];
  if (observed.isProxyHeader) warnings.push("proxy_header_present");
  if (!observed.ipv6) warnings.push("no_ipv6");
  // 双栈客户端 v4/v6 出口必然不同：只按 v4 做的规则可被 v6 绕过。
  if (observed.ipv4 && observed.ipv6) warnings.push("ipv4_ipv6_mismatch");
  return warnings;
}
