import crypto from "node:crypto";
import logger from "../utils/logger";
import { getNonceStore, type NonceStore, type NonceRecord } from "./nonceStore";

/**
 * SmartHumanCheckService v2 - Cloudflare-grade design
 *
 * 关键变更（相对 v1）：
 * 1. Token / Nonce 全部改为 AES-256-GCM 不透明信封；客户端无法读写绑定字段。
 * 2. HKDF-SHA256 派生分离用途密钥（nonce 加密 / 行为 HMAC binding / PoW 盐）。
 * 3. 服务端权威评分：忽略客户端自报 sc，仅基于 raw 信号 (st) 由后端打分。
 * 4. 绑定签发上下文：action + origin/host hash + IP class hash + UA hash + iat/exp。
 *    verify 时所有绑定必须一致，缓解跨站重用、UA 切换、Origin 冒充。
 * 5. 一次性消费：nonceStore 原子 consume，杜绝重放。
 * 6. 可选 Proof-of-Work（Hashcash 风格）：高风险路径可提高难度。
 * 7. 强制 SMART_HUMAN_CHECK_SECRET，缺失即抛错；杜绝重启换密钥导致大面积失败。
 * 8. 常量时间比较前先核对长度，避免 timingSafeEqual 抛出。
 * 9. AAD 绑定信封到 (version + action + host)，篡改 AAD 即触发解密失败。
 */

// ----------------------- 公开类型 -----------------------

export interface IssueContext {
  ip?: string;
  ua?: string;
  /** Origin 优先；缺失则用 Host */
  origin?: string;
  /** 默认 default-action；可自定义业务域，例如 login / register / tts */
  action?: string;
  /** PoW 难度（前 N bit 为 0），0 表示禁用，默认 0 */
  difficulty?: number;
}

export interface IssueResult {
  success: boolean;
  /** 不透明字符串（base64url），客户端不应解析 */
  nonce?: string;
  /** 客户端用于 v2 token AES-GCM + HMAC 的临时密钥（base64） */
  key?: string;
  /** PoW 挑战 salt（base64），仅当 difficulty>0 返回 */
  powSalt?: string;
  /** PoW 难度（前 N bit 为 0） */
  difficulty?: number;
  /** 服务端建议的提交动作；前端原样回传 */
  action?: string;
  expiresAt?: number;
  timestamp?: number;
  error?: string;
  errorCode?: string;
  errorMessage?: string;
  retryable?: boolean;
  retryAfter?: number;
  banUntil?: number;
}

export interface VerifyContext {
  ip?: string;
  ua?: string;
  /** Origin 优先；缺失则用 Host */
  origin?: string;
  /** 与 issue 时一致的 action；不匹配将拒绝 */
  action?: string;
}

export interface SmartClientPayload {
  v: number;
  ts: number;
  tz?: string;
  ua?: string;
  ce?: string; // canvas entropy
  st: BehaviorSignals;
  /** Issue 阶段返回的 nonce 字段，verify 时回传 */
  cn: string;
}

export interface BehaviorSignals {
  mouseMoves?: number;
  keyPresses?: number;
  totalDistance?: number;
  uniquePathPoints?: number;
  avgSpeed?: number;
  maxSpeed?: number;
  minSpeed?: number;
  speedVariance?: number;
  focusTimeMs?: number;
  visibilityChanges?: number;
  trapTriggered?: boolean;
  keyTimings?: number[];
  avgKeyInterval?: number;
  keyPressVariance?: number;
  mouseAcceleration?: number;
  directionChanges?: number;
  pauseCount?: number;
  clickCount?: number;
  screenResolution?: string;
  devicePixelRatio?: number;
  touchSupport?: boolean;
  sessionDuration?: number;
  idleTime?: number;
  hardwareConcurrency?: number;
  deviceMemory?: number;
  connectionType?: string;
  webdriver?: boolean;
  sliderCompleted?: boolean;
  proofInteractionMs?: number;
}

export interface VerifyResult {
  success: boolean;
  reason?: string;
  /** 服务端权威计算的 0..1 评分 */
  score?: number;
  /** 兼容旧字段 */
  nonceOk?: boolean;
  tokenOk?: boolean;
  errorCode?: string;
  errorMessage?: string;
  retryable?: boolean;
  retryAfter?: number;
  banUntil?: number;
  timestamp?: number;
  riskScore?: number;
  riskLevel?: "low" | "medium" | "high";
  riskReasons?: string[];
  threshold?: number;
  thresholdBase?: number;
  thresholdUsed?: number;
  passRateIp?: number;
  passRateUa?: number;
  challengeRequired?: boolean;
  policy?: string;
  action?: string;
}

// 兼容旧导出
export type NonceResult = IssueResult;

// ----------------------- 常量 -----------------------

const ENVELOPE_VERSION = 0x02;
const IV_LEN = 12;
const TAG_LEN = 16;
const HKDF_SALT = Buffer.from("shc-v2-salt-2026", "utf8");
const DEFAULT_TTL_MS = 5 * 60 * 1000;
const DEFAULT_MAX_SKEW_MS = 2 * 60 * 1000;
const DEFAULT_SCORE_THRESHOLD = 0.62;
const MAX_PAYLOAD_BYTES = 8 * 1024; // 8 KB 上限，避免被塞入巨型 st
const MAX_POW_DIFFICULTY = 24;
const POW_HARD_TIMEOUT_MS = 2_500;

const ERROR_CODES = {
  MISSING_NONCE: { code: "MISSING_NONCE", message: "缺少验证码", retryable: true },
  BAD_NONCE_FORMAT: { code: "BAD_NONCE_FORMAT", message: "验证码格式错误", retryable: true },
  NONCE_EXPIRED: { code: "NONCE_EXPIRED", message: "验证码已过期", retryable: true },
  NONCE_REUSED: { code: "NONCE_REUSED", message: "验证码已被使用", retryable: true },
  MISSING_TOKEN: { code: "MISSING_TOKEN", message: "缺少验证令牌", retryable: false },
  BAD_TOKEN_FORMAT: { code: "BAD_TOKEN_FORMAT", message: "验证令牌格式错误", retryable: false },
  INCOMPLETE_TOKEN: { code: "INCOMPLETE_TOKEN", message: "验证令牌数据不完整", retryable: false },
  PAYLOAD_TOO_LARGE: { code: "PAYLOAD_TOO_LARGE", message: "提交数据超出限制", retryable: false },
  BAD_TOKEN_SIG: { code: "BAD_TOKEN_SIG", message: "验证令牌签名无效", retryable: false },
  BAD_BINDING_ACTION: { code: "BAD_BINDING_ACTION", message: "动作绑定不匹配", retryable: false },
  BAD_BINDING_HOST: { code: "BAD_BINDING_HOST", message: "来源绑定不匹配", retryable: false },
  BAD_BINDING_IP: { code: "BAD_BINDING_IP", message: "客户端绑定不匹配", retryable: false },
  BAD_BINDING_UA: { code: "BAD_BINDING_UA", message: "浏览器绑定不匹配", retryable: false },
  BAD_BINDING_NONCE: { code: "BAD_BINDING_NONCE", message: "令牌与验证码不匹配", retryable: false },
  BAD_POW: { code: "BAD_POW", message: "工作量证明无效", retryable: true },
  CLIENT_TIME_SKEW: { code: "CLIENT_TIME_SKEW", message: "客户端时间偏差过大", retryable: true },
  LOW_SCORE: { code: "LOW_SCORE", message: "行为评分过低", retryable: false },
  SERVER_ERROR: { code: "SERVER_ERROR", message: "服务器内部错误", retryable: true },
  RATE_LIMITED: { code: "RATE_LIMITED", message: "请求过于频繁", retryable: true },
  ABUSE_BANNED: { code: "ABUSE_BANNED", message: "检测到滥用，已暂时封禁", retryable: true },
  HIGH_RISK: { code: "HIGH_RISK", message: "检测到高风险行为", retryable: false },
  CHALLENGE_REQUIRED: { code: "CHALLENGE_REQUIRED", message: "需要完成验证码验证", retryable: true },
  CONFIG_MISSING: {
    code: "CONFIG_MISSING",
    message: "服务未配置 SMART_HUMAN_CHECK_SECRET",
    retryable: false,
  },
} as const;

// ----------------------- 加解密辅助 -----------------------

function toBuffer(input: string | Buffer): Buffer {
  return Buffer.isBuffer(input) ? input : Buffer.from(input, "utf8");
}

function hkdf(masterKey: Buffer, info: string, length = 32): Buffer {
  // crypto.hkdfSync 在 Node 16+ 可用，签名为 (digest, ikm, salt, info, length)
  const arr = crypto.hkdfSync("sha256", masterKey, HKDF_SALT, Buffer.from(info, "utf8"), length);
  return Buffer.from(arr);
}

function aeadEncrypt(key: Buffer, plaintext: Buffer, aad: Buffer): string {
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  if (aad.length) cipher.setAAD(aad);
  const ct = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([Buffer.from([ENVELOPE_VERSION]), iv, ct, tag]).toString("base64url");
}

function aeadDecrypt(key: Buffer, envelopeB64: string, aad: Buffer): Buffer {
  const buf = Buffer.from(envelopeB64, "base64url");
  if (buf.length < 1 + IV_LEN + TAG_LEN) throw new Error("envelope_too_short");
  const version = buf[0];
  if (version !== ENVELOPE_VERSION) throw new Error("bad_version");
  const iv = buf.subarray(1, 1 + IV_LEN);
  const tag = buf.subarray(buf.length - TAG_LEN);
  const ct = buf.subarray(1 + IV_LEN, buf.length - TAG_LEN);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  if (aad.length) decipher.setAAD(aad);
  return Buffer.concat([decipher.update(ct), decipher.final()]);
}

function aeadDecryptBytes(key: Buffer, iv: Buffer, ciphertextWithTag: Buffer, aad: Buffer): Buffer {
  if (iv.length !== IV_LEN || ciphertextWithTag.length < TAG_LEN) throw new Error("token_envelope_malformed");
  const tag = ciphertextWithTag.subarray(ciphertextWithTag.length - TAG_LEN);
  const ct = ciphertextWithTag.subarray(0, ciphertextWithTag.length - TAG_LEN);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  if (aad.length) decipher.setAAD(aad);
  return Buffer.concat([decipher.update(ct), decipher.final()]);
}

function deriveEphemeralSubkey(ephemeralKey: Buffer, purpose: "token.enc" | "token.mac"): Buffer {
  return crypto.createHmac("sha256", ephemeralKey).update(`shc.v2.${purpose}`).digest();
}

function tokenAad(nonce: string): Buffer {
  return Buffer.from(`shc.v2.token|${nonce}`, "utf8");
}

function parseTokenEnvelope(tokenB64: string): ParsedTokenEnvelope {
  const buf = Buffer.from(tokenB64, "base64url");
  const minLen = 1 + 2 + 1 + IV_LEN + TAG_LEN + 32;
  if (buf.length < minLen) throw new Error("token_too_short");
  if (buf[0] !== ENVELOPE_VERSION) throw new Error("bad_token_version");

  const nonceLen = buf.readUInt16BE(1);
  if (nonceLen <= 0 || nonceLen > 2048) throw new Error("bad_nonce_len");

  const nonceStart = 3;
  const nonceEnd = nonceStart + nonceLen;
  const ivStart = nonceEnd;
  const ivEnd = ivStart + IV_LEN;
  const macStart = buf.length - 32;

  if (nonceEnd > buf.length || ivEnd > macStart || macStart <= ivEnd + TAG_LEN) {
    throw new Error("token_bounds");
  }

  return {
    nonce: buf.subarray(nonceStart, nonceEnd).toString("utf8"),
    iv: buf.subarray(ivStart, ivEnd),
    ciphertext: buf.subarray(ivEnd, macStart),
    mac: buf.subarray(macStart),
    macInput: buf.subarray(0, macStart),
  };
}

function timingSafeStrEq(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ba.length !== bb.length) return false;
  try {
    return crypto.timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

function timingSafeBufEq(a: Buffer, b: Buffer): boolean {
  if (a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/** 稳定排序的 JSON 序列化（前后端都用同一规则计算 HMAC） */
function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return "[" + value.map((v) => canonicalize(v)).join(",") + "]";
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  const parts = keys.map((k) => JSON.stringify(k) + ":" + canonicalize(obj[k]));
  return "{" + parts.join(",") + "}";
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasUnsafeJsonKey(value: unknown, depth = 0): boolean {
  if (depth > 20) return true;
  if (Array.isArray(value)) return value.some((item) => hasUnsafeJsonKey(item, depth + 1));
  if (!isPlainRecord(value)) return false;

  for (const key of Object.keys(value)) {
    if (key === "__proto__" || key === "constructor" || key === "prototype") return true;
    if (hasUnsafeJsonKey(value[key], depth + 1)) return true;
  }
  return false;
}

function sha256Hex(input: string | Buffer): string {
  return crypto.createHash("sha256").update(toBuffer(input)).digest("hex");
}

function normalizeOrigin(o?: string): string {
  if (!o) return "";
  try {
    // 仅保留 scheme://host（端口可选），剥离路径与查询
    const u = new URL(o);
    return `${u.protocol}//${u.host}`.toLowerCase();
  } catch {
    return o.toLowerCase().slice(0, 256);
  }
}

function ipClassKey(ip?: string): string {
  if (!ip) return "unknown";
  const v6 = ip.includes(":");
  const trimmed = ip.split("%")[0]; // 去除 zone id
  if (v6) {
    // 取前 4 段 (64 bit) 作为分组
    const parts = trimmed.split(":");
    return parts.slice(0, 4).join(":") + "::/64";
  }
  const parts = trimmed.split(".");
  if (parts.length === 4) return `${parts[0]}.${parts[1]}.${parts[2]}.0/24`;
  return trimmed;
}

function uaKey(ua?: string): string {
  if (!ua) return "unknown";
  return ua.trim().slice(0, 256);
}

// ----------------------- 服务端权威评分 -----------------------

interface ScoreBreakdown {
  score: number;
  riskScore: number;
  riskLevel: "low" | "medium" | "high";
  riskReasons: string[];
}

/**
 * 基于客户端原始信号 (st) 与上下文，由服务端计算行为分与风险评估。
 * 不信任客户端提交的 sc 字段。
 */
function evaluateBehavior(payload: SmartClientPayload, ctx: VerifyContext): ScoreBreakdown {
  const st: BehaviorSignals = payload.st || {};
  const reasons: string[] = [];

  // ---- 基础特征 ----
  const mouseMoves = Number(st.mouseMoves || 0);
  const keyPresses = Number(st.keyPresses || 0);
  const totalDistance = Number(st.totalDistance || 0);
  const uniquePathPoints = Number(st.uniquePathPoints || 0);
  const focusTimeMs = Number(st.focusTimeMs || 0);
  const visibilityChanges = Number(st.visibilityChanges || 0);
  const speedVariance = Number(st.speedVariance || 0);
  const directionChanges = Number(st.directionChanges || 0);
  const pauseCount = Number(st.pauseCount || 0);
  const clickCount = Number(st.clickCount || 0);
  const keyVar = Number(st.keyPressVariance || 0);
  const avgKey = Number(st.avgKeyInterval || 0);
  const sessionDuration = Number(st.sessionDuration || 0);
  const idleTime = Number(st.idleTime || 0);

  // 各子分数，0..1，越大越像人
  const sub = {
    mouseActivity: Math.min(1, Math.log10(1 + mouseMoves) / 2.5),
    keyboardActivity: Math.min(1, Math.log10(1 + keyPresses) / 2.2),
    movementDistance: Math.min(1, Math.log10(1 + totalDistance) / 3.2),
    pathComplexity: Math.min(1, uniquePathPoints / 200),
    focusEngagement: Math.min(1, focusTimeMs / 4000),
    speedConsistency: speedVariance > 0 ? Math.min(1, 1 / (1 + speedVariance * 0.1)) : 0.5,
    directionVariability: directionChanges > 0 ? Math.min(1, Math.log10(1 + directionChanges) / 2.0) : 0,
    pausePattern: pauseCount > 0 ? Math.min(1, Math.log10(1 + pauseCount) / 1.8) : 0,
    clickPattern: clickCount > 0 ? Math.min(1, Math.log10(1 + clickCount) / 1.5) : 0,
    keyTimingNaturalness: keyVar > 0 ? Math.min(1, 1 / (1 + Math.abs(keyVar - 150) * 0.01)) : 0.5,
    keyRhythm: avgKey > 0 && avgKey < 2000 ? Math.min(1, 1 / (1 + Math.abs(avgKey - 200) * 0.005)) : 0.3,
    sessionEngagement: Math.min(1, sessionDuration / 10000),
    activityConsistency: idleTime < 5000 ? 1 : Math.max(0, 1 - (idleTime - 5000) / 15000),
  };

  const weights = {
    mouseActivity: 0.12,
    keyboardActivity: 0.1,
    movementDistance: 0.12,
    pathComplexity: 0.12,
    focusEngagement: 0.15,
    speedConsistency: 0.08,
    directionVariability: 0.06,
    pausePattern: 0.05,
    clickPattern: 0.04,
    keyTimingNaturalness: 0.06,
    keyRhythm: 0.04,
    sessionEngagement: 0.04,
    activityConsistency: 0.02,
  };

  let baseScore = 0;
  for (const k of Object.keys(weights) as Array<keyof typeof weights>) {
    baseScore += sub[k] * weights[k];
  }
  if (st.sliderCompleted && (mouseMoves > 5 || clickCount > 0 || Boolean(st.touchSupport))) {
    baseScore = Math.min(1, baseScore + 0.12);
  }
  if (Number(st.proofInteractionMs || 0) > 500) {
    baseScore = Math.min(1, baseScore + 0.04);
  }

  // 触摸设备略降基础（更易被自动化），存在 webdriver 直接重罚
  const touchPenalty = st.touchSupport ? 0.92 : 1.0;
  const webdriverPenalty = st.webdriver ? 0.1 : 1.0;
  const visibilityPenalty = Math.max(0.3, 1 - visibilityChanges * 0.1);
  const trapPenalty = st.trapTriggered ? 0.05 : 1;

  const score = Math.max(0, Math.min(1, baseScore * touchPenalty * webdriverPenalty * visibilityPenalty * trapPenalty));

  // ---- 风险评估 ----
  let risk = 0;
  if (st.trapTriggered) {
    risk += 0.7;
    reasons.push("trap_triggered");
  }
  if (st.webdriver) {
    risk += 0.8;
    reasons.push("webdriver_detected");
  }
  if (avgKey > 0 && avgKey < 40) {
    risk += 0.15;
    reasons.push("keys_too_fast");
  }
  if (keyVar > 0 && keyVar < 100) {
    risk += 0.1;
    reasons.push("key_variance_low");
  }
  if (mouseMoves > 200 && speedVariance < 1e-3) {
    risk += 0.12;
    reasons.push("mouse_speed_uniform");
  }
  if (mouseMoves > 200 && directionChanges < 5) {
    risk += 0.12;
    reasons.push("direction_changes_low");
  }
  if ((st.avgSpeed || 0) > 3000) {
    risk += 0.1;
    reasons.push("avg_speed_extreme");
  }
  if ((st.maxSpeed || 0) > 15000) {
    risk += 0.1;
    reasons.push("max_speed_extreme");
  }
  if (sessionDuration > 0 && sessionDuration < 2000 && mouseMoves > 50) {
    risk += 0.1;
    reasons.push("too_many_actions_in_short_session");
  }
  if (idleTime === 0 && mouseMoves > 0) {
    risk += 0.05;
    reasons.push("no_idle_time");
  }
  if (!payload.ce || payload.ce.length < 8) {
    risk += 0.05;
    reasons.push("canvas_entropy_short");
  }
  if (ctx.ua && /headless|phantomjs|electron|puppeteer|playwright|spider|crawler|\bbot\b|curl|wget|httpclient/i.test(ctx.ua)) {
    risk += 0.2;
    reasons.push("ua_suspicious");
  }
  // 综合行为分越低，风险越高
  const behaviorRisk = Math.max(0, 1 - score);
  risk += behaviorRisk * 0.2;
  if (behaviorRisk > 0.5) reasons.push("low_behavior_score");

  risk = Math.max(0, Math.min(1, risk));
  const riskLevel: "low" | "medium" | "high" = risk >= 0.7 ? "high" : risk >= 0.4 ? "medium" : "low";
  return { score, riskScore: risk, riskLevel, riskReasons: reasons };
}

// ----------------------- 主服务 -----------------------

export class SmartHumanCheckService {
  private readonly masterKey: Buffer;
  private readonly nonceEncKey: Buffer;
  private readonly powSaltKey: Buffer;
  private readonly bindingHmacKey: Buffer;
  private readonly ttlMs: number;
  private readonly maxSkewMs: number;
  private readonly scoreThreshold: number;
  private readonly defaultAction: string;
  private readonly nonceStore: NonceStore;

  // 限流 / 滥用 / 通过率统计
  private readonly rlWindowMs: number;
  private readonly nonceLimitPerWindow: number;
  private readonly verifyLimitPerWindow: number;
  private readonly abuseWindowMs: number;
  private readonly abuseThreshold: number;
  private readonly banDurationMs: number;
  private readonly patternWindowMs: number;
  private readonly prWindowMs: number;
  private readonly prMinSamplesIp: number;
  private readonly prMinSamplesUa: number;

  private readonly issueTimestampsByIp = new Map<string, number[]>();
  private readonly verifyTimestampsByIp = new Map<string, number[]>();
  private readonly abuseTimestampsByIp = new Map<string, number[]>();
  private readonly bannedUntilByIp = new Map<string, number>();
  private readonly patternTimestampsByKey = new Map<string, number[]>();
  private readonly patternBanThresholds = new Map<string, number>();
  private readonly prAllByIp = new Map<string, number[]>();
  private readonly prSuccessByIp = new Map<string, number[]>();
  private readonly prAllByUa = new Map<string, number[]>();
  private readonly prSuccessByUa = new Map<string, number[]>();

  constructor(opts?: {
    secret?: string;
    ttlMs?: number;
    maxSkewMs?: number;
    scoreThreshold?: number;
    defaultAction?: string;
  }) {
    const supplied = opts?.secret ?? process.env.SMART_HUMAN_CHECK_SECRET;
    if (!supplied || supplied.trim().length < 16) {
      // 强制要求显式配置；缺失即抛错，避免悄悄使用弱默认密钥
      const reason = !supplied ? "未设置" : "长度不足 16";
      throw new Error(
        `[SmartHumanCheck] 拒绝启动：环境变量 SMART_HUMAN_CHECK_SECRET ${reason}。请在生产/开发环境显式设置长度 ≥16 的高熵密钥。`,
      );
    }
    this.masterKey = toBuffer(supplied);
    this.nonceEncKey = hkdf(this.masterKey, "shc.v2.nonce.aead");
    this.powSaltKey = hkdf(this.masterKey, "shc.v2.pow.salt");
    this.bindingHmacKey = hkdf(this.masterKey, "shc.v2.binding.hmac");

    this.ttlMs = opts?.ttlMs ?? Number(process.env.SMART_HUMAN_CHECK_TTL_MS || DEFAULT_TTL_MS);
    this.maxSkewMs = opts?.maxSkewMs ?? Number(process.env.SMART_HUMAN_CHECK_SKEW_MS || DEFAULT_MAX_SKEW_MS);
    this.scoreThreshold =
      opts?.scoreThreshold ?? Number(process.env.SMART_HUMAN_CHECK_SCORE || DEFAULT_SCORE_THRESHOLD);
    this.defaultAction = opts?.defaultAction ?? process.env.SMART_HUMAN_CHECK_DEFAULT_ACTION ?? "default";

    this.nonceStore = getNonceStore({
      namespace: "smart-human-check",
      redisPrefix: process.env.SMART_HUMAN_CHECK_REDIS_PREFIX || "shc:nonce",
      redisEnabled: process.env.SMART_HUMAN_CHECK_NONCE_STORE !== "memory",
      ttlMs: this.ttlMs,
      maxSize: Number(process.env.SMART_HUMAN_CHECK_NONCE_STORE_SIZE || 10000),
      cleanupInterval: Number(process.env.SMART_HUMAN_CHECK_CLEANUP_INTERVAL || 60000),
    });

    this.rlWindowMs = Number(process.env.SMART_HUMAN_CHECK_RL_WINDOW_MS || 60_000);
    this.nonceLimitPerWindow = Number(process.env.SMART_HUMAN_CHECK_NONCE_LIMIT || 30);
    this.verifyLimitPerWindow = Number(process.env.SMART_HUMAN_CHECK_VERIFY_LIMIT || 60);
    this.abuseWindowMs = Number(process.env.SMART_HUMAN_CHECK_ABUSE_WINDOW_MS || 5 * 60_000);
    this.abuseThreshold = Number(process.env.SMART_HUMAN_CHECK_ABUSE_THRESHOLD || 6);
    this.banDurationMs = Number(process.env.SMART_HUMAN_CHECK_BAN_MS || 15 * 60_000);
    this.patternWindowMs = Number(process.env.SMART_HUMAN_CHECK_PATTERN_WINDOW_MS || this.abuseWindowMs);
    this.prWindowMs = Number(process.env.SMART_HUMAN_CHECK_PR_WINDOW_MS || 10 * 60_000);
    this.prMinSamplesIp = Number(process.env.SMART_HUMAN_CHECK_PR_MIN_IP || 10);
    this.prMinSamplesUa = Number(process.env.SMART_HUMAN_CHECK_PR_MIN_UA || 30);

    this.patternBanThresholds.set("bad_token_sig", 4);
    this.patternBanThresholds.set("bad_token_format", 6);
    this.patternBanThresholds.set("incomplete_token", 6);
    this.patternBanThresholds.set("missing_token", 10);
    this.patternBanThresholds.set("client_time_skew", 8);
    this.patternBanThresholds.set("ua_suspicious", 12);
    this.patternBanThresholds.set("nonce_invalid", 8);
    this.patternBanThresholds.set("bad_binding", 4);
    this.patternBanThresholds.set("payload_too_large", 4);
  }

  // ---------- 公共 API ----------

  async issueNonce(ctxOrIp?: IssueContext | string, ua?: string): Promise<IssueResult> {
    // 兼容旧位置参数 issueNonce(ip, ua)
    const ctx: IssueContext =
      typeof ctxOrIp === "string" || typeof ctxOrIp === "undefined"
        ? { ip: ctxOrIp, ua }
        : { ...ctxOrIp };

    const now = Date.now();
    const ip = ctx.ip || "unknown";

    try {
      const banUntil = this.bannedUntilByIp.get(ip) || 0;
      if (banUntil > now) {
        return this.buildIssueError(ERROR_CODES.ABUSE_BANNED, now, { banUntil });
      }
      if (this.isRateLimited(ip, this.issueTimestampsByIp, this.nonceLimitPerWindow, this.rlWindowMs, now)) {
        this.recordAbuse(ip, now);
        return this.buildIssueError(ERROR_CODES.RATE_LIMITED, now, { retryAfter: Math.ceil(this.rlWindowMs / 1000) });
      }

      const action = (ctx.action || this.defaultAction).slice(0, 64);
      const origin = normalizeOrigin(ctx.origin);
      const hostHash = sha256Hex("host|" + origin);
      const ipcHash = sha256Hex("ipc|" + ipClassKey(ip));
      const uaHash = sha256Hex("ua|" + uaKey(ctx.ua));

      const nid = crypto.randomBytes(16).toString("hex");
      const ephemeralKey = crypto.randomBytes(32);
      const exp = now + this.ttlMs;
      const difficulty = Math.max(0, Math.min(MAX_POW_DIFFICULTY, ctx.difficulty || 0));

      // PoW salt 与 nid 绑定，避免预计算
      const powSalt = difficulty > 0 ? this.derivePowSalt(nid) : undefined;

      const plaintext: NonceEnvelopePlain = {
        nid,
        k: ephemeralKey.toString("base64"),
        act: action,
        h: hostHash,
        ipc: ipcHash,
        uah: uaHash,
        iat: now,
        exp,
        d: difficulty,
      };
      const aad = Buffer.from([ENVELOPE_VERSION, ...Buffer.from(action, "utf8"), 0x00, ...Buffer.from(hostHash, "utf8")]);
      const nonce = aeadEncrypt(this.nonceEncKey, Buffer.from(canonicalize(plaintext), "utf8"), aad);

      const nonceId = sha256Hex(nonce);
      await this.nonceStore.storeNonceAsync(nonceId, ip, ctx.ua, {
        action,
        hostHash,
        ipcHash,
        uaHash,
        expiresAt: exp,
        difficulty,
      });

      if (isSuspiciousUA(ctx.ua)) this.recordPattern(ip, "ua_suspicious", now);

      logger.debug("[SmartHumanCheck] issued nonce", {
        nidHead: nid.slice(0, 8),
        action,
        ipPrefix: ipClassKey(ip),
        difficulty,
        ttlMs: this.ttlMs,
      });

      return {
        success: true,
        nonce,
        key: ephemeralKey.toString("base64"),
        action,
        difficulty: difficulty > 0 ? difficulty : undefined,
        powSalt,
        expiresAt: exp,
        timestamp: now,
      };
    } catch (err) {
      logger.error("[SmartHumanCheck] issueNonce error", err);
      return this.buildIssueError(ERROR_CODES.SERVER_ERROR, Date.now());
    }
  }

  async verifyToken(tokenB64: string, ctxOrIp?: VerifyContext | string): Promise<VerifyResult> {
    const ctx: VerifyContext =
      typeof ctxOrIp === "string" || typeof ctxOrIp === "undefined"
        ? { ip: ctxOrIp }
        : { ...ctxOrIp };
    const now = Date.now();
    const ip = ctx.ip || "unknown";

    try {
      const banUntil = this.bannedUntilByIp.get(ip) || 0;
      if (banUntil > now) {
        return this.buildVerifyError(ERROR_CODES.ABUSE_BANNED, now, "abuse_banned", { banUntil });
      }
      if (this.isRateLimited(ip, this.verifyTimestampsByIp, this.verifyLimitPerWindow, this.rlWindowMs, now)) {
        this.recordAbuse(ip, now);
        return this.buildVerifyError(ERROR_CODES.RATE_LIMITED, now, "rate_limited", {
          retryAfter: Math.ceil(this.rlWindowMs / 1000),
        });
      }

      if (!tokenB64 || typeof tokenB64 !== "string") {
        this.recordPattern(ip, "missing_token", now);
        this.recordAbuse(ip, now);
        return this.buildVerifyError(ERROR_CODES.MISSING_TOKEN, now, "missing_token");
      }
      if (tokenB64.length > MAX_PAYLOAD_BYTES * 2) {
        this.recordPattern(ip, "payload_too_large", now);
        return this.buildVerifyError(ERROR_CODES.PAYLOAD_TOO_LARGE, now, "payload_too_large");
      }

      // 解码 v2 token 外壳：base64url(binary(version + nonce + AES-GCM(payload) + HMAC))
      let tokenEnvelope: ParsedTokenEnvelope;
      try {
        tokenEnvelope = parseTokenEnvelope(tokenB64);
      } catch {
        this.recordPattern(ip, "bad_token_format", now);
        this.recordAbuse(ip, now);
        return this.buildVerifyError(ERROR_CODES.BAD_TOKEN_FORMAT, now, "bad_token_format");
      }

      const { nonce } = tokenEnvelope;
      if (!nonce || typeof nonce !== "string") {
        this.recordPattern(ip, "incomplete_token", now);
        this.recordAbuse(ip, now);
        return this.buildVerifyError(ERROR_CODES.INCOMPLETE_TOKEN, now, "incomplete_token");
      }

      // 解密 nonce 信封
      const expectedAction = (ctx.action || this.defaultAction).slice(0, 64);
      const expectedHostHash = sha256Hex("host|" + normalizeOrigin(ctx.origin));
      let plain: NonceEnvelopePlain;
      try {
        const aad = Buffer.from([
          ENVELOPE_VERSION,
          ...Buffer.from(expectedAction, "utf8"),
          0x00,
          ...Buffer.from(expectedHostHash, "utf8"),
        ]);
        plain = JSON.parse(aeadDecrypt(this.nonceEncKey, nonce, aad).toString("utf8")) as NonceEnvelopePlain;
      } catch (err) {
        // AAD 不匹配或解密失败：可能是 action/host 不一致或伪造
        this.recordPattern(ip, "nonce_invalid", now);
        this.recordAbuse(ip, now);
        return this.buildVerifyError(ERROR_CODES.BAD_NONCE_FORMAT, now, "nonce_invalid:aead");
      }

      if (!plain || !plain.nid || !plain.k) {
        this.recordPattern(ip, "nonce_invalid", now);
        return this.buildVerifyError(ERROR_CODES.BAD_NONCE_FORMAT, now, "nonce_invalid:shape");
      }
      if (plain.exp < now) {
        return this.buildVerifyError(ERROR_CODES.NONCE_EXPIRED, now, "nonce_expired");
      }

      // 一致性绑定校验（即使 AAD 已绑定 action+host，也再次显式比对）
      if (!timingSafeStrEq(plain.act, expectedAction)) {
        this.recordPattern(ip, "bad_binding", now);
        return this.buildVerifyError(ERROR_CODES.BAD_BINDING_ACTION, now, "bad_binding:action");
      }
      if (!timingSafeStrEq(plain.h, expectedHostHash)) {
        this.recordPattern(ip, "bad_binding", now);
        return this.buildVerifyError(ERROR_CODES.BAD_BINDING_HOST, now, "bad_binding:host");
      }
      const currentIpcHash = sha256Hex("ipc|" + ipClassKey(ip));
      if (!timingSafeStrEq(plain.ipc, currentIpcHash)) {
        this.recordPattern(ip, "bad_binding", now);
        return this.buildVerifyError(ERROR_CODES.BAD_BINDING_IP, now, "bad_binding:ip");
      }
      const currentUaHash = sha256Hex("ua|" + uaKey(ctx.ua));
      if (!timingSafeStrEq(plain.uah, currentUaHash)) {
        this.recordPattern(ip, "bad_binding", now);
        return this.buildVerifyError(ERROR_CODES.BAD_BINDING_UA, now, "bad_binding:ua");
      }

      // 原子消费 nonce
      const nonceId = sha256Hex(nonce);
      const consume = await this.nonceStore.consumeAsync(nonceId);
      if (!consume.success) {
        const map: Record<string, keyof typeof ERROR_CODES> = {
          nonce_not_found: "BAD_NONCE_FORMAT",
          nonce_expired: "NONCE_EXPIRED",
          nonce_already_consumed: "NONCE_REUSED",
        };
        const which = map[consume.reason || ""] || "BAD_NONCE_FORMAT";
        this.recordPattern(ip, "nonce_invalid", now);
        if (which === "NONCE_REUSED") this.recordAbuse(ip, now);
        return this.buildVerifyError(ERROR_CODES[which], now, `nonce_invalid:${consume.reason}`);
      }

      // Token HMAC + AES-GCM：使用 nonce 内部的临时密钥派生独立子密钥
      const ephemeralKey = Buffer.from(plain.k, "base64");
      const tokenMacKey = deriveEphemeralSubkey(ephemeralKey, "token.mac");
      const computedMac = crypto.createHmac("sha256", tokenMacKey).update(tokenEnvelope.macInput).digest();
      if (!timingSafeBufEq(computedMac, tokenEnvelope.mac)) {
        this.recordPattern(ip, "bad_token_sig", now);
        this.recordAbuse(ip, now);
        return this.buildVerifyError(ERROR_CODES.BAD_TOKEN_SIG, now, "bad_token_sig");
      }

      let submit: SubmitEnvelopePlain;
      try {
        const tokenEncKey = deriveEphemeralSubkey(ephemeralKey, "token.enc");
        const raw = aeadDecryptBytes(tokenEncKey, tokenEnvelope.iv, tokenEnvelope.ciphertext, tokenAad(nonce));
        if (raw.length > MAX_PAYLOAD_BYTES) {
          this.recordPattern(ip, "payload_too_large", now);
          return this.buildVerifyError(ERROR_CODES.PAYLOAD_TOO_LARGE, now, "payload_too_large");
        }
        const parsed = JSON.parse(raw.toString("utf8"));
        if (!isPlainRecord(parsed) || hasUnsafeJsonKey(parsed)) throw new Error("unsafe_json");
        submit = parsed as unknown as SubmitEnvelopePlain;
      } catch {
        this.recordPattern(ip, "bad_token_format", now);
        this.recordAbuse(ip, now);
        return this.buildVerifyError(ERROR_CODES.BAD_TOKEN_FORMAT, now, "bad_token_format");
      }

      const { payload, pow } = submit;
      if (!payload || !isPlainRecord(payload) || !isPlainRecord(payload.st)) {
        this.recordPattern(ip, "incomplete_token", now);
        this.recordAbuse(ip, now);
        return this.buildVerifyError(ERROR_CODES.INCOMPLETE_TOKEN, now, "incomplete_token");
      }
      if (!timingSafeStrEq(payload.cn, nonce)) {
        this.recordPattern(ip, "bad_binding", now);
        return this.buildVerifyError(ERROR_CODES.BAD_BINDING_NONCE, now, "bad_binding:nonce");
      }

      // 限制 payload 体积，并在后续评分中只使用服务端解密出的 payload
      const payloadStr = canonicalize(payload);
      if (Buffer.byteLength(payloadStr, "utf8") > MAX_PAYLOAD_BYTES) {
        this.recordPattern(ip, "payload_too_large", now);
        return this.buildVerifyError(ERROR_CODES.PAYLOAD_TOO_LARGE, now, "payload_too_large");
      }

      // PoW 校验（如启用）
      if (plain.d > 0) {
        if (!pow || typeof pow.nonce !== "string") {
          this.recordPattern(ip, "bad_pow", now);
          return this.buildVerifyError(ERROR_CODES.BAD_POW, now, "bad_pow:missing");
        }
        const powSalt = this.derivePowSalt(plain.nid);
        if (!verifyPow(powSalt, pow.nonce, plain.d)) {
          this.recordPattern(ip, "bad_pow", now);
          this.recordAbuse(ip, now);
          return this.buildVerifyError(ERROR_CODES.BAD_POW, now, "bad_pow:invalid");
        }
      }

      // 时间偏移
      if (typeof payload.ts === "number" && Math.abs(now - payload.ts) > this.maxSkewMs) {
        this.recordPattern(ip, "client_time_skew", now);
        this.recordAbuse(ip, now);
        return this.buildVerifyError(ERROR_CODES.CLIENT_TIME_SKEW, now, "client_time_skew");
      }

      // 服务端权威评分
      const evalResult = evaluateBehavior(payload, ctx);
      const dyn = this.computeDynamicThreshold(this.scoreThreshold, ip, ctx.ua, evalResult.riskLevel, now);

      if (evalResult.riskLevel === "high") {
        this.recordAbuse(ip, now);
        this.recordOutcome(ip, ctx.ua, false, now);
        return {
          success: false,
          reason: "high_risk",
          score: evalResult.score,
          tokenOk: true,
          nonceOk: true,
          errorCode: ERROR_CODES.HIGH_RISK.code,
          errorMessage: ERROR_CODES.HIGH_RISK.message,
          retryable: ERROR_CODES.HIGH_RISK.retryable,
          timestamp: now,
          riskScore: evalResult.riskScore,
          riskLevel: evalResult.riskLevel,
          riskReasons: evalResult.riskReasons,
          challengeRequired: true,
          threshold: this.scoreThreshold,
          thresholdBase: this.scoreThreshold,
          thresholdUsed: dyn.used,
          action: plain.act,
        };
      }

      if (evalResult.score < dyn.used) {
        const stepUp = evalResult.score >= this.scoreThreshold && dyn.used > this.scoreThreshold;
        this.recordOutcome(ip, ctx.ua, false, now);
        const err = stepUp ? ERROR_CODES.CHALLENGE_REQUIRED : ERROR_CODES.LOW_SCORE;
        return {
          success: false,
          reason: stepUp ? "step_up_required" : "low_score",
          score: evalResult.score,
          tokenOk: true,
          nonceOk: true,
          errorCode: err.code,
          errorMessage: err.message,
          retryable: true,
          timestamp: now,
          threshold: this.scoreThreshold,
          thresholdBase: this.scoreThreshold,
          thresholdUsed: dyn.used,
          passRateIp: dyn.passRateIp,
          passRateUa: dyn.passRateUa,
          challengeRequired: stepUp,
          policy: dyn.policy,
          riskScore: evalResult.riskScore,
          riskLevel: evalResult.riskLevel,
          riskReasons: evalResult.riskReasons,
          action: plain.act,
        };
      }

      this.recordOutcome(ip, ctx.ua, true, now);
      logger.info("[SmartHumanCheck] pass", {
        action: plain.act,
        ipPrefix: ipClassKey(ip),
        score: Number(evalResult.score.toFixed(3)),
        risk: evalResult.riskLevel,
        thresholdUsed: Number(dyn.used.toFixed(3)),
      });

      return {
        success: true,
        score: evalResult.score,
        tokenOk: true,
        nonceOk: true,
        timestamp: now,
        riskScore: evalResult.riskScore,
        riskLevel: evalResult.riskLevel,
        riskReasons: evalResult.riskReasons,
        threshold: this.scoreThreshold,
        thresholdBase: this.scoreThreshold,
        thresholdUsed: dyn.used,
        passRateIp: dyn.passRateIp,
        passRateUa: dyn.passRateUa,
        policy: dyn.policy,
        action: plain.act,
      };
    } catch (err) {
      logger.error("[SmartHumanCheck] verifyToken error", err);
      return this.buildVerifyError(ERROR_CODES.SERVER_ERROR, Date.now(), "server_error");
    }
  }

  // ---------- 观察性 / 兼容 ----------

  async getStats() {
    return this.nonceStore.getStatsAsync();
  }

  async cleanupExpiredNonces(): Promise<number> {
    return this.nonceStore.cleanupAsync();
  }

  isIpBanned(ip: string): boolean {
    return (this.bannedUntilByIp.get(ip) || 0) > Date.now();
  }

  getBanRemainingMs(ip: string): number {
    return Math.max(0, (this.bannedUntilByIp.get(ip) || 0) - Date.now());
  }

  getSecretInfo() {
    return {
      isAutoGenerated: false,
      length: this.masterKey.length,
      environment: process.env.NODE_ENV || "development",
      hasCustomSecret: true,
    };
  }

  // ---------- 内部工具 ----------

  private derivePowSalt(nid: string): string {
    return crypto.createHmac("sha256", this.powSaltKey).update("pow|" + nid).digest("base64").slice(0, 22);
  }

  private buildIssueError(
    info: { code: string; message: string; retryable: boolean },
    ts: number,
    extra?: Partial<IssueResult>,
  ): IssueResult {
    return {
      success: false,
      error: info.message,
      errorCode: info.code,
      errorMessage: info.message,
      retryable: info.retryable,
      timestamp: ts,
      ...extra,
    };
  }

  private buildVerifyError(
    info: { code: string; message: string; retryable: boolean },
    ts: number,
    reason: string,
    extra?: Partial<VerifyResult>,
  ): VerifyResult {
    return {
      success: false,
      reason,
      tokenOk: false,
      nonceOk: false,
      errorCode: info.code,
      errorMessage: info.message,
      retryable: info.retryable,
      timestamp: ts,
      ...extra,
    };
  }

  private isRateLimited(
    ip: string,
    bucket: Map<string, number[]>,
    limit: number,
    windowMs: number,
    now: number,
  ): boolean {
    const arr = bucket.get(ip) || [];
    const cutoff = now - windowMs;
    const fresh = arr.filter((t) => t > cutoff);
    fresh.push(now);
    bucket.set(ip, fresh);
    return fresh.length > limit;
  }

  private recordAbuse(ip: string, now: number) {
    const banUntil = this.bannedUntilByIp.get(ip) || 0;
    if (banUntil > now) return;
    const arr = this.abuseTimestampsByIp.get(ip) || [];
    const cutoff = now - this.abuseWindowMs;
    const fresh = arr.filter((t) => t > cutoff);
    fresh.push(now);
    this.abuseTimestampsByIp.set(ip, fresh);
    if (fresh.length >= this.abuseThreshold) {
      const until = now + this.banDurationMs;
      this.bannedUntilByIp.set(ip, until);
      logger.warn("[SmartHumanCheck] IP 因滥用被临时封禁", { ip, until });
    }
  }

  private recordPattern(ip: string, pattern: string, now: number) {
    const key = pattern + "|" + ip;
    const arr = this.patternTimestampsByKey.get(key) || [];
    const cutoff = now - this.patternWindowMs;
    const fresh = arr.filter((t) => t > cutoff);
    fresh.push(now);
    this.patternTimestampsByKey.set(key, fresh);
    const threshold = this.patternBanThresholds.get(pattern) || 0;
    if (threshold > 0 && fresh.length >= threshold) {
      const until = now + this.banDurationMs;
      this.bannedUntilByIp.set(ip, until);
      logger.warn("[SmartHumanCheck] IP 因异常模式被临时封禁", { ip, pattern, until, count: fresh.length });
    }
  }

  private recordOutcome(ip: string, ua: string | undefined, success: boolean, now: number) {
    const uaK = uaKey(ua);
    pushAndPrune(this.prAllByIp, ip, now, this.prWindowMs);
    pushAndPrune(this.prAllByUa, uaK, now, this.prWindowMs);
    if (success) {
      pushAndPrune(this.prSuccessByIp, ip, now, this.prWindowMs);
      pushAndPrune(this.prSuccessByUa, uaK, now, this.prWindowMs);
    }
  }

  private computeDynamicThreshold(
    base: number,
    ip: string,
    ua: string | undefined,
    riskLevel: "low" | "medium" | "high",
    now: number,
  ): { used: number; passRateIp?: number; passRateUa?: number; policy: string } {
    let used = base;
    const uaK = uaKey(ua);
    const ipStat = getPassRate(this.prAllByIp, this.prSuccessByIp, ip, now, this.prWindowMs);
    const uaStat = getPassRate(this.prAllByUa, this.prSuccessByUa, uaK, now, this.prWindowMs);
    const policies: string[] = [];

    if (isSuspiciousUA(ua)) {
      used += 0.15;
      policies.push("ua_suspicious(+0.15)");
    }
    if (riskLevel === "medium") {
      used += 0.05;
      policies.push("risk_medium(+0.05)");
    }
    if (riskLevel === "high") {
      used += 0.2;
      policies.push("risk_high(+0.20)");
    }
    if (typeof ipStat.rate === "number" && ipStat.total >= this.prMinSamplesIp) {
      if (ipStat.rate < 0.4) {
        used += 0.1;
        policies.push("ip_pass_rate_lt_0.4(+0.10)");
      } else if (ipStat.rate < 0.6) {
        used += 0.05;
        policies.push("ip_pass_rate_lt_0.6(+0.05)");
      }
    }
    if (typeof uaStat.rate === "number" && uaStat.total >= this.prMinSamplesUa) {
      if (uaStat.rate < 0.4) {
        used += 0.1;
        policies.push("ua_pass_rate_lt_0.4(+0.10)");
      } else if (uaStat.rate < 0.6) {
        used += 0.05;
        policies.push("ua_pass_rate_lt_0.6(+0.05)");
      }
    }
    used = Math.max(base, Math.min(0.98, used));
    return { used, passRateIp: ipStat.rate, passRateUa: uaStat.rate, policy: policies.join(",") };
  }
}

// ----------------------- 内部辅助 -----------------------

interface NonceEnvelopePlain {
  nid: string;
  k: string;
  act: string;
  h: string;
  ipc: string;
  uah: string;
  iat: number;
  exp: number;
  d: number;
}

interface ParsedTokenEnvelope {
  nonce: string;
  iv: Buffer;
  ciphertext: Buffer;
  mac: Buffer;
  macInput: Buffer;
}

interface SubmitEnvelopePlain {
  payload: SmartClientPayload;
  pow?: { nonce: string };
}

function pushAndPrune(bucket: Map<string, number[]>, key: string, ts: number, windowMs: number) {
  const arr = bucket.get(key) || [];
  const cutoff = ts - windowMs;
  const fresh = arr.filter((t) => t > cutoff);
  fresh.push(ts);
  bucket.set(key, fresh);
}

function getPassRate(
  allMap: Map<string, number[]>,
  okMap: Map<string, number[]>,
  key: string,
  now: number,
  windowMs: number,
): { rate?: number; total: number } {
  const all = (allMap.get(key) || []).filter((t) => t > now - windowMs);
  const ok = (okMap.get(key) || []).filter((t) => t > now - windowMs);
  if (all.length === 0) return { total: 0 };
  return { rate: ok.length / all.length, total: all.length };
}

function isSuspiciousUA(ua?: string): boolean {
  if (!ua) return true;
  return /headless|phantomjs|electron|puppeteer|playwright|spider|crawler|\bbot\b|curl|wget|httpclient/i.test(ua);
}

function verifyPow(seed: string, candidate: string, difficulty: number): boolean {
  if (difficulty <= 0) return true;
  if (typeof candidate !== "string" || candidate.length > 64) return false;
  const t0 = Date.now();
  const digest = crypto.createHash("sha256").update(seed + ":" + candidate).digest();
  if (Date.now() - t0 > POW_HARD_TIMEOUT_MS) return false;
  return countLeadingZeroBits(digest) >= difficulty;
}

function countLeadingZeroBits(buf: Buffer): number {
  let count = 0;
  for (let i = 0; i < buf.length; i++) {
    const b = buf[i];
    if (b === 0) {
      count += 8;
      continue;
    }
    let mask = 0x80;
    while (mask > 0) {
      if ((b & mask) === 0) {
        count += 1;
        mask >>= 1;
      } else break;
    }
    break;
  }
  return count;
}

// ----------------------- 旧 NonceRecord 字段类型补充 -----------------------

// 重新导出，便于 controller 引用
export type { NonceRecord };

export default SmartHumanCheckService;
