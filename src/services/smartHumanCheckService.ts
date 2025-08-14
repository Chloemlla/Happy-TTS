import crypto from 'crypto';
import logger from '../utils/logger';

/**
 * SmartHumanCheckService
 * - issueNonce(): 生成带有服务端签名与过期控制的 nonce（短时有效）
 * - verifyToken(token): 校验前端 SmartHumanCheck 组件返回的 token
 *
 * 设计要点：
 * 1) Nonce 由服务端 HMAC-SHA256(secret) 签名，包含随机数与时间戳，避免伪造；
 * 2) Token 校验：
 *    - 解析 Base64 JSON: { payload, salt, sig }
 *    - 重算弱签名 sig' = SHA256(payloadStr + '|' + salt)，与 sig 比对 => 防止前端 payload 被篡改；
 *    - 校验 payload.cn(=nonce) 的服务器签名与时效；
 *    - 校验 payload.ts 与当前时间的最大偏移；
 *    - 校验行为评分 payload.sc >= 阈值；
 *    - 可选记录 stats、UA、IP 等用于风控日志。
 */

export interface SmartNoncePayload {
  n: string; // 随机串（base64）
  ts: number; // 签发时间戳(ms)
  sig: string; // HMAC-SHA256(base64)
}

export interface SmartClientPayload {
  v: number;
  ts: number; // 客户端生成时间(ms)
  tz: string;
  ua: string;
  ce: string; // canvas entropy (hash)
  sc: number; // score 0..1
  st: any;    // behavior stats
  cn: string | null; // 服务端下发的 nonce（推荐）
}

export interface VerifyResult {
  success: boolean;
  reason?: string;
  score?: number;
  nonceOk?: boolean;
  tokenOk?: boolean;
}

const DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 分钟
const DEFAULT_MAX_SKEW_MS = 2 * 60 * 1000; // 客户端时钟允许偏移 2 分钟
const DEFAULT_SCORE_THRESHOLD = 0.62; // 与前端一致，降低误判

function base64EncodeJson(obj: unknown): string {
  const s = JSON.stringify(obj);
  return Buffer.from(s, 'utf8').toString('base64');
}

function base64DecodeJson<T = any>(b64: string): T {
  const buf = Buffer.from(b64, 'base64');
  const s = buf.toString('utf8');
  return JSON.parse(s) as T;
}

function hmacSha256Base64(input: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(input).digest('base64');
}

function sha256Base64(input: string): string {
  return crypto.createHash('sha256').update(input).digest('base64');
}

export class SmartHumanCheckService {
  private readonly secret: string;
  private readonly ttlMs: number;
  private readonly maxSkewMs: number;
  private readonly scoreThreshold: number;

  constructor(opts?: {
    secret?: string;
    ttlMs?: number;
    maxSkewMs?: number;
    scoreThreshold?: number;
  }) {
    this.secret = opts?.secret || process.env.SMART_HUMAN_CHECK_SECRET || 'change-me-in-prod';
    this.ttlMs = opts?.ttlMs ?? Number(process.env.SMART_HUMAN_CHECK_TTL_MS || DEFAULT_TTL_MS);
    this.maxSkewMs = opts?.maxSkewMs ?? Number(process.env.SMART_HUMAN_CHECK_SKEW_MS || DEFAULT_MAX_SKEW_MS);
    this.scoreThreshold = opts?.scoreThreshold ?? Number(process.env.SMART_HUMAN_CHECK_SCORE || DEFAULT_SCORE_THRESHOLD);

    if (!opts?.secret && !process.env.SMART_HUMAN_CHECK_SECRET) {
      logger.warn('[SmartHumanCheck] Using default secret. Set SMART_HUMAN_CHECK_SECRET in production.');
    }
  }

  /** 生成带签名的 nonce（短时有效） */
  issueNonce(): string {
    const nBytes = crypto.randomBytes(16); // 128-bit 随机数
    const n = nBytes.toString('base64');
    const ts = Date.now();
    const sig = hmacSha256Base64(`${n}|${ts}`, this.secret);
    const payload: SmartNoncePayload = { n, ts, sig };
    return base64EncodeJson(payload);
  }

  /** 验证 nonce（签名与有效期） */
  private verifyNonceInternal(nonceB64: string | null): { ok: boolean; reason?: string } {
    if (!nonceB64) return { ok: false, reason: 'missing_nonce' };
    let decoded: SmartNoncePayload;
    try {
      decoded = base64DecodeJson<SmartNoncePayload>(nonceB64);
    } catch {
      return { ok: false, reason: 'bad_nonce_format' };
    }
    const { n, ts, sig } = decoded || {} as SmartNoncePayload;
    if (!n || !ts || !sig) return { ok: false, reason: 'incomplete_nonce' };

    const expect = hmacSha256Base64(`${n}|${ts}`, this.secret);
    if (!crypto.timingSafeEqual(Buffer.from(expect), Buffer.from(sig))) {
      return { ok: false, reason: 'bad_nonce_sig' };
    }
    const now = Date.now();
    if (now - ts > this.ttlMs) return { ok: false, reason: 'nonce_expired' };
    return { ok: true };
  }

  /**
   * 校验前端 token（Base64）
   * - 解包 { payload, salt, sig }
   * - 校验弱签名：sig == sha256(payloadStr + '|' + salt)
   * - 校验 nonce 与时效
   * - 校验 score 与时间偏移
   */
  verifyToken(tokenB64: string, remoteIp?: string): VerifyResult {
    if (!tokenB64) return { success: false, reason: 'missing_token' };

    let tokenObj: { payload: SmartClientPayload; salt: string; sig: string };
    try {
      tokenObj = base64DecodeJson(tokenB64);
    } catch {
      return { success: false, reason: 'bad_token_format' };
    }

    const { payload, salt, sig } = tokenObj || ({} as any);
    if (!payload || typeof salt !== 'string' || typeof sig !== 'string') {
      return { success: false, reason: 'incomplete_token' };
    }

    const payloadStr = JSON.stringify(payload);
    const expectSig = sha256Base64(`${payloadStr}|${salt}`);
    // 弱签名比较（非机密，但可检测基础篡改）
    if (!crypto.timingSafeEqual(Buffer.from(expectSig), Buffer.from(sig))) {
      return { success: false, reason: 'bad_token_sig', tokenOk: false };
    }

    // 校验 nonce（推荐启用）
    const nonceRes = this.verifyNonceInternal(payload.cn);
    if (!nonceRes.ok) {
      return { success: false, reason: `nonce_invalid:${nonceRes.reason}`, nonceOk: false };
    }

    // 校验客户端时间偏移
    const now = Date.now();
    if (Math.abs(now - payload.ts) > this.maxSkewMs) {
      return { success: false, reason: 'client_time_skew', tokenOk: true, nonceOk: true };
    }

    // 校验得分
    if (typeof payload.sc !== 'number' || payload.sc < this.scoreThreshold) {
      return { success: false, reason: 'low_score', score: payload.sc, tokenOk: true, nonceOk: true };
    }

    // 记录风控信息（可落库）
    try {
      logger.info('[SmartHumanCheck] pass', {
        ip: remoteIp,
        ua: payload.ua?.slice(0, 160),
        score: payload.sc,
        tz: payload.tz,
        ce: payload.ce?.slice(0, 16),
      });
    } catch {}

    return { success: true, score: payload.sc, tokenOk: true, nonceOk: true };
  }
}

export default SmartHumanCheckService;
