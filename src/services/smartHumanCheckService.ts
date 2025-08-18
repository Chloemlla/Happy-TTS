import crypto from 'crypto';
import logger from '../utils/logger';
import { getNonceStore, NonceStore } from './nonceStore';

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
  errorCode?: string;
  errorMessage?: string;
  retryable?: boolean;
  timestamp?: number;
  // Risk assessment
  riskScore?: number; // 0..1, higher means riskier
  riskLevel?: 'low' | 'medium' | 'high';
  riskReasons?: string[];
  // Optional: server threshold used for comparison (for debugging/telemetry)
  threshold?: number;
  // Observability fields for dynamic policy
  thresholdBase?: number;
  thresholdUsed?: number;
  passRateIp?: number;
  passRateUa?: number;
  challengeRequired?: boolean;
  policy?: string;
}

export interface NonceResult {
  success: boolean;
  nonce?: string;
  error?: string;
  errorCode?: string;
  errorMessage?: string;
  retryable?: boolean;
  timestamp?: number;
}

const DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 分钟
const DEFAULT_MAX_SKEW_MS = 2 * 60 * 1000; // 客户端时钟允许偏移 2 分钟
const DEFAULT_SCORE_THRESHOLD = 0.62; // 与前端一致，降低误判

// 错误代码和消息映射
const ERROR_CODES = {
  // Nonce 相关错误
  MISSING_NONCE: {
    code: 'MISSING_NONCE',
    message: '缺少验证码',
    retryable: true
  },
  BAD_NONCE_FORMAT: {
    code: 'BAD_NONCE_FORMAT',
    message: '验证码格式错误',
    retryable: true
  },
  INCOMPLETE_NONCE: {
    code: 'INCOMPLETE_NONCE',
    message: '验证码数据不完整',
    retryable: true
  },
  BAD_NONCE_SIG: {
    code: 'BAD_NONCE_SIG',
    message: '验证码签名无效',
    retryable: true
  },
  NONCE_EXPIRED: {
    code: 'NONCE_EXPIRED',
    message: '验证码已过期',
    retryable: true
  },
  
  // Token 相关错误
  MISSING_TOKEN: {
    code: 'MISSING_TOKEN',
    message: '缺少验证令牌',
    retryable: false
  },
  BAD_TOKEN_FORMAT: {
    code: 'BAD_TOKEN_FORMAT',
    message: '验证令牌格式错误',
    retryable: false
  },
  INCOMPLETE_TOKEN: {
    code: 'INCOMPLETE_TOKEN',
    message: '验证令牌数据不完整',
    retryable: false
  },
  BAD_TOKEN_SIG: {
    code: 'BAD_TOKEN_SIG',
    message: '验证令牌签名无效',
    retryable: false
  },
  
  // 验证相关错误
  CLIENT_TIME_SKEW: {
    code: 'CLIENT_TIME_SKEW',
    message: '客户端时间偏差过大',
    retryable: true
  },
  LOW_SCORE: {
    code: 'LOW_SCORE',
    message: '行为评分过低',
    retryable: false
  },
  
  // 系统错误
  SERVER_ERROR: {
    code: 'SERVER_ERROR',
    message: '服务器内部错误',
    retryable: true
  },
  RATE_LIMITED: {
    code: 'RATE_LIMITED',
    message: '请求过于频繁',
    retryable: true
  },
  ABUSE_BANNED: {
    code: 'ABUSE_BANNED',
    message: '检测到滥用，已暂时封禁',
    retryable: true
  },
  HIGH_RISK: {
    code: 'HIGH_RISK',
    message: '检测到高风险行为',
    retryable: false
  },
  CHALLENGE_REQUIRED: {
    code: 'CHALLENGE_REQUIRED',
    message: '需要完成验证码验证',
    retryable: true
  }
} as const;

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
  private readonly nonceStore: NonceStore;

  // In-service rate limiting and abuse prevention (per-IP sliding windows)
  private readonly rlWindowMs: number;
  private readonly nonceLimitPerWindow: number;
  private readonly verifyLimitPerWindow: number;
  private readonly abuseWindowMs: number;
  private readonly abuseThreshold: number;
  private readonly banDurationMs: number;
  private issueTimestampsByIp = new Map<string, number[]>();
  private verifyTimestampsByIp = new Map<string, number[]>();
  private abuseTimestampsByIp = new Map<string, number[]>();
  private bannedUntilByIp = new Map<string, number>();
  // Automated pattern detection
  private patternWindowMs: number;
  private patternTimestampsByKey = new Map<string, number[]>();
  private patternBanThresholds = new Map<string, number>();
  // Pass-rate / dynamic policy tracking
  private prWindowMs: number;
  private prMinSamplesIp: number;
  private prMinSamplesUa: number;
  private prAllByIp = new Map<string, number[]>();
  private prSuccessByIp = new Map<string, number[]>();
  private prAllByUa = new Map<string, number[]>();
  private prSuccessByUa = new Map<string, number[]>();

  constructor(opts?: {
    secret?: string;
    ttlMs?: number;
    maxSkewMs?: number;
    scoreThreshold?: number;
  }) {
    // 自动生成高复杂度密钥的逻辑
    let secret = opts?.secret || process.env.SMART_HUMAN_CHECK_SECRET;
    
    if (!secret) {
      if (process.env.NODE_ENV === 'production') {
        // 生产环境：生成高复杂度密钥
        const randomBytes = crypto.randomBytes(64); // 512位随机数据
        const timestamp = Date.now().toString();
        const processId = process.pid.toString();
        const hostname = require('os').hostname();
        
        // 组合多个熵源生成密钥
        const entropySources = [
          randomBytes.toString('base64'),
          timestamp,
          processId,
          hostname,
          Math.random().toString(),
          crypto.randomUUID()
        ];
        
        secret = crypto.createHash('sha512')
          .update(entropySources.join('|'))
          .digest('base64');
        
        logger.info('[SmartHumanCheck] Auto-generated high-entropy secret for production environment', {
          secretLength: secret.length,
          entropySources: entropySources.length,
          timestamp: new Date().toISOString()
        });
      } else {
        // 开发环境：使用默认密钥
        secret = 'change-me-in-prod';
        logger.warn('[SmartHumanCheck] Using default secret for development. Set SMART_HUMAN_CHECK_SECRET in production.');
      }
    }
    
    this.secret = secret;
    this.ttlMs = opts?.ttlMs ?? Number(process.env.SMART_HUMAN_CHECK_TTL_MS || DEFAULT_TTL_MS);
    this.maxSkewMs = opts?.maxSkewMs ?? Number(process.env.SMART_HUMAN_CHECK_SKEW_MS || DEFAULT_MAX_SKEW_MS);
    this.scoreThreshold = opts?.scoreThreshold ?? Number(process.env.SMART_HUMAN_CHECK_SCORE || DEFAULT_SCORE_THRESHOLD);
    
    // 初始化 nonce 存储
    this.nonceStore = getNonceStore({
      ttlMs: this.ttlMs,
      maxSize: Number(process.env.SMART_HUMAN_CHECK_NONCE_STORE_SIZE || 10000),
      cleanupInterval: Number(process.env.SMART_HUMAN_CHECK_CLEANUP_INTERVAL || 60000)
    });

    // Rate-limit & abuse thresholds (env overridable)
    this.rlWindowMs = Number(process.env.SMART_HUMAN_CHECK_RL_WINDOW_MS || 60_000);
    this.nonceLimitPerWindow = Number(process.env.SMART_HUMAN_CHECK_NONCE_LIMIT || 30);
    this.verifyLimitPerWindow = Number(process.env.SMART_HUMAN_CHECK_VERIFY_LIMIT || 60);
    this.abuseWindowMs = Number(process.env.SMART_HUMAN_CHECK_ABUSE_WINDOW_MS || 5 * 60_000);
    this.abuseThreshold = Number(process.env.SMART_HUMAN_CHECK_ABUSE_THRESHOLD || 6);
    this.banDurationMs = Number(process.env.SMART_HUMAN_CHECK_BAN_MS || 15 * 60_000);
    // Pattern detection window and thresholds (can be tuned via env in future)
    this.patternWindowMs = Number(process.env.SMART_HUMAN_CHECK_PATTERN_WINDOW_MS || this.abuseWindowMs);
    // Fine-grained automated attack patterns
    this.patternBanThresholds.set('bad_token_sig', 4);
    this.patternBanThresholds.set('bad_token_format', 6);
    this.patternBanThresholds.set('incomplete_token', 6);
    this.patternBanThresholds.set('missing_token', 10);
    this.patternBanThresholds.set('client_time_skew', 8);
    this.patternBanThresholds.set('ua_suspicious', 12);
    // Pass-rate window and minimum samples for dynamic thresholding
    this.prWindowMs = Number(process.env.SMART_HUMAN_CHECK_PR_WINDOW_MS || 10 * 60_000);
    this.prMinSamplesIp = Number(process.env.SMART_HUMAN_CHECK_PR_MIN_IP || 10);
    this.prMinSamplesUa = Number(process.env.SMART_HUMAN_CHECK_PR_MIN_UA || 30);

    // 密钥初始化完成后的日志
    if (process.env.NODE_ENV === 'production' && !opts?.secret && !process.env.SMART_HUMAN_CHECK_SECRET) {
      logger.info('[SmartHumanCheck] Using auto-generated secret in production environment');
    }
  }

  /** Normalize UA for keys */
  private getUaKey(ua?: string): string {
    if (!ua) return 'unknown';
    const s = ua.trim();
    return s.slice(0, 160);
  }

  /** Append timestamp and prune by window */
  private pushAndPrune(bucket: Map<string, number[]>, key: string, ts: number, windowMs: number) {
    const arr = bucket.get(key) || [];
    const cutoff = ts - windowMs;
    const fresh = arr.filter(t => t > cutoff);
    fresh.push(ts);
    bucket.set(key, fresh);
  }

  /** Record verification outcome for pass-rate computation */
  private recordOutcome(ip: string, ua: string | undefined, success: boolean, now: number) {
    const uaKey = this.getUaKey(ua);
    // All attempts
    this.pushAndPrune(this.prAllByIp, ip, now, this.prWindowMs);
    this.pushAndPrune(this.prAllByUa, uaKey, now, this.prWindowMs);
    // Successes
    if (success) {
      this.pushAndPrune(this.prSuccessByIp, ip, now, this.prWindowMs);
      this.pushAndPrune(this.prSuccessByUa, uaKey, now, this.prWindowMs);
    }
  }

  /** Get pass rate (0..1) and total count for a key */
  private getPassRate(allMap: Map<string, number[]>, okMap: Map<string, number[]>, key: string, now: number): { rate?: number; total: number } {
    const all = (allMap.get(key) || []).filter(t => t > now - this.prWindowMs);
    const ok = (okMap.get(key) || []).filter(t => t > now - this.prWindowMs);
    const total = all.length;
    if (total === 0) return { total: 0 };
    const rate = ok.length / total;
    return { rate, total };
  }

  /** Quick UA suspicion check */
  private isSuspiciousUA(ua?: string): boolean {
    if (!ua) return true;
    const s = ua.toLowerCase();
    return (
      s.includes('headless') ||
      s.includes('phantomjs') ||
      s.includes('electron') ||
      s.includes('puppeteer') ||
      s.includes('playwright') ||
      s.includes('spider') ||
      s.includes('crawler') ||
      s.includes('bot') ||
      s.includes('curl') ||
      s.includes('wget') ||
      s.includes('httpclient')
    );
  }

  /** Compute dynamic threshold based on IP/UA pass-rate and current risk */
  private computeDynamicThreshold(base: number, ip: string, ua: string | undefined, riskLevel: 'low'|'medium'|'high', now: number): { used: number; passRateIp?: number; passRateUa?: number; policy: string } {
    let used = base;
    const uaKey = this.getUaKey(ua);
    const { rate: ipRate, total: ipTotal } = this.getPassRate(this.prAllByIp, this.prSuccessByIp, ip, now);
    const { rate: uaRate, total: uaTotal } = this.getPassRate(this.prAllByUa, this.prSuccessByUa, uaKey, now);
    const policies: string[] = [];

    // UA suspicion
    if (this.isSuspiciousUA(ua)) {
      used += 0.15; policies.push('ua_suspicious(+0.15)');
    }
    // Risk level adjustment
    if (riskLevel === 'medium') { used += 0.05; policies.push('risk_medium(+0.05)'); }
    if (riskLevel === 'high')   { used += 0.20; policies.push('risk_high(+0.20)'); }

    // Historical pass rates (only if enough samples)
    if (typeof ipRate === 'number' && ipTotal >= this.prMinSamplesIp) {
      if (ipRate < 0.4) { used += 0.10; policies.push('ip_pass_rate_lt_0.4(+0.10)'); }
      else if (ipRate < 0.6) { used += 0.05; policies.push('ip_pass_rate_lt_0.6(+0.05)'); }
    }
    if (typeof uaRate === 'number' && uaTotal >= this.prMinSamplesUa) {
      if (uaRate < 0.4) { used += 0.10; policies.push('ua_pass_rate_lt_0.4(+0.10)'); }
      else if (uaRate < 0.6) { used += 0.05; policies.push('ua_pass_rate_lt_0.6(+0.05)'); }
    }

    // Clamp
    used = Math.max(base, Math.min(0.98, used));
    return { used, passRateIp: ipRate, passRateUa: uaRate, policy: policies.join(',') };
  }

  /** 生成带签名的 nonce（短时有效） */
  issueNonce(clientIp?: string, userAgent?: string): NonceResult {
    try {
      const ip = clientIp || 'unknown';
      const now = Date.now();
      // Ban check
      const banUntil = this.bannedUntilByIp.get(ip) || 0;
      if (banUntil > now) {
        const error = ERROR_CODES.ABUSE_BANNED;
        return {
          success: false,
          error: error.message,
          errorCode: error.code,
          errorMessage: error.message,
          retryable: error.retryable,
          timestamp: now
        };
      }
      // Rate limit check for nonce issuance
      if (this.isRateLimited(ip, this.issueTimestampsByIp, this.nonceLimitPerWindow, this.rlWindowMs, now)) {
        // 触发速率限制也视为滥用信号之一（更快触达临时封禁）
        this.recordAbuse(ip);
        const error = ERROR_CODES.RATE_LIMITED;
        return {
          success: false,
          error: error.message,
          errorCode: error.code,
          errorMessage: error.message,
          retryable: error.retryable,
          timestamp: now
        };
      }

      const nBytes = crypto.randomBytes(16); // 128-bit 随机数
      const n = nBytes.toString('base64');
      const ts = Date.now();
      const sig = hmacSha256Base64(`${n}|${ts}`, this.secret);
      const payload: SmartNoncePayload = { n, ts, sig };
      const nonce = base64EncodeJson(payload);
      
      // 生成唯一的 nonce ID 用于跟踪
      const nonceId = crypto.createHash('sha256').update(nonce).digest('hex');
      
      // 存储 nonce 到存储系统
      this.nonceStore.storeNonce(nonceId, clientIp, userAgent);
      
      // 如果 UA 可疑，记录模式但不阻断发号
      try {
        if (this.isSuspiciousUA(userAgent)) {
          this.recordPattern(ip, 'ua_suspicious');
        }
      } catch {}

      logger.debug('[SmartHumanCheck] Issued nonce', { 
        nonceId: nonceId.slice(0, 8) + '...', 
        clientIp,
        timestamp: ts 
      });
      
      return {
        success: true,
        nonce,
        timestamp: ts
      };
    } catch (error) {
      logger.error('[SmartHumanCheck] Failed to generate nonce', error);
      return {
        success: false,
        error: ERROR_CODES.SERVER_ERROR.message,
        errorCode: ERROR_CODES.SERVER_ERROR.code,
        errorMessage: ERROR_CODES.SERVER_ERROR.message,
        retryable: ERROR_CODES.SERVER_ERROR.retryable,
        timestamp: Date.now()
      };
    }
  }

  /** 验证 nonce（签名与有效期） */
  private verifyNonceInternal(nonceB64: string | null): { ok: boolean; reason?: string; errorInfo?: any } {
    if (!nonceB64) {
      return { 
        ok: false, 
        reason: 'missing_nonce',
        errorInfo: ERROR_CODES.MISSING_NONCE
      };
    }
    
    let decoded: SmartNoncePayload;
    try {
      decoded = base64DecodeJson<SmartNoncePayload>(nonceB64);
    } catch {
      return { 
        ok: false, 
        reason: 'bad_nonce_format',
        errorInfo: ERROR_CODES.BAD_NONCE_FORMAT
      };
    }
    
    const { n, ts, sig } = decoded || {} as SmartNoncePayload;
    if (!n || !ts || !sig) {
      return { 
        ok: false, 
        reason: 'incomplete_nonce',
        errorInfo: ERROR_CODES.INCOMPLETE_NONCE
      };
    }

    // 验证签名
    const expect = hmacSha256Base64(`${n}|${ts}`, this.secret);
    if (!crypto.timingSafeEqual(Buffer.from(expect), Buffer.from(sig))) {
      return { 
        ok: false, 
        reason: 'bad_nonce_sig',
        errorInfo: ERROR_CODES.BAD_NONCE_SIG
      };
    }
    
    // 验证时间有效性
    const now = Date.now();
    if (now - ts > this.ttlMs) {
      return { 
        ok: false, 
        reason: 'nonce_expired',
        errorInfo: ERROR_CODES.NONCE_EXPIRED
      };
    }
    
    // 检查 nonce 是否已被消费
    const nonceId = crypto.createHash('sha256').update(nonceB64).digest('hex');
    const consumeResult = this.nonceStore.consume(nonceId);
    
    if (!consumeResult.success) {
      let errorInfo;
      switch (consumeResult.reason) {
        case 'nonce_not_found':
          errorInfo = ERROR_CODES.BAD_NONCE_SIG; // 可能是伪造的 nonce
          break;
        case 'nonce_expired':
          errorInfo = ERROR_CODES.NONCE_EXPIRED;
          break;
        case 'nonce_already_consumed':
          errorInfo = {
            code: 'NONCE_REUSED',
            message: '验证码已被使用',
            retryable: true
          };
          break;
        default:
          errorInfo = ERROR_CODES.BAD_NONCE_FORMAT;
      }
      
      return { 
        ok: false, 
        reason: consumeResult.reason,
        errorInfo
      };
    }
    
    logger.debug('[SmartHumanCheck] Nonce verified and consumed', { 
      nonceId: nonceId.slice(0, 8) + '...',
      issuedAt: consumeResult.record?.issuedAt,
      consumedAt: consumeResult.record?.consumedAt
    });
    
    return { ok: true };
  }

  /**
   * 评估风险分数（0..1 越高风险越大）并返回风险因素
   * 注意：这是启发式评估，非严格判定。
   */
  private assessRisk(payload: SmartClientPayload, remoteIp?: string): { score: number; level: 'low'|'medium'|'high'; reasons: string[] } {
    const reasons: string[] = [];
    let risk = 0;
    const st: any = payload.st || {};

    // 1) 明确作弊信号：蜜罐触发
    if (st.trapTriggered === true) {
      risk += 0.7;
      reasons.push('trap_triggered');
    }

    // 2) 键盘节奏异常（过于均匀或过快）
    if (typeof st.avgKeyInterval === 'number') {
      const avg = st.avgKeyInterval;
      if (avg > 0 && avg < 40) { // 极快
        risk += 0.15; reasons.push('keys_too_fast');
      }
    }
    if (typeof st.keyPressVariance === 'number' && st.keyPressVariance < 100) { // 过于稳定
      risk += 0.1; reasons.push('key_variance_low');
    }

    // 3) 鼠标轨迹异常：速度方差过低，方向改变极少但移动次数很多
    if (typeof st.mouseMoves === 'number' && st.mouseMoves > 200) {
      if (typeof st.speedVariance === 'number' && st.speedVariance < 1e-3) {
        risk += 0.12; reasons.push('mouse_speed_uniform');
      }
      if (typeof st.directionChanges === 'number' && st.directionChanges < 5) {
        risk += 0.12; reasons.push('direction_changes_low');
      }
    }

    // 4) 速度过快或极值异常
    if (typeof st.avgSpeed === 'number' && st.avgSpeed > 3000) {
      risk += 0.1; reasons.push('avg_speed_extreme');
    }
    if (typeof st.maxSpeed === 'number' && st.maxSpeed > 15000) {
      risk += 0.1; reasons.push('max_speed_extreme');
    }

    // 5) 时间模式可疑：极短会话却大量交互，或 idleTime 为 0
    if (typeof st.sessionDuration === 'number' && st.sessionDuration > 0 && st.sessionDuration < 2000) {
      if (typeof st.mouseMoves === 'number' && st.mouseMoves > 50) {
        risk += 0.1; reasons.push('too_many_actions_in_short_session');
      }
    }
    if (typeof st.idleTime === 'number' && st.idleTime === 0) {
      risk += 0.05; reasons.push('no_idle_time');
    }

    // 6) 画布熵异常（过短）
    if (!payload.ce || payload.ce.length < 8) {
      risk += 0.05; reasons.push('canvas_entropy_short');
    }

    // 7) 综合行为分数（前端）转换为风险（越低越高风险）
    if (typeof payload.sc === 'number') {
      const behaviorRisk = Math.max(0, 1 - payload.sc); // sc=1 => 0 风险，sc=0 => 1 风险
      risk += behaviorRisk * 0.2; // 控制权重
      if (behaviorRisk > 0.5) reasons.push('low_behavior_score');
    }

    // 裁剪风险分数到 [0,1]
    risk = Math.max(0, Math.min(1, risk));
    const level: 'low'|'medium'|'high' = risk >= 0.7 ? 'high' : risk >= 0.4 ? 'medium' : 'low';
    return { score: risk, level, reasons };
  }

  /**
   * 校验前端 token（Base64）
   * - 解包 { payload, salt, sig }
   * - 校验弱签名：sig == sha256(payloadStr + '|' + salt)
   * - 校验 nonce 与时效
   * - 校验 score 与时间偏移
   */
  verifyToken(tokenB64: string, remoteIp?: string): VerifyResult {
    const timestamp = Date.now();
    const ip = remoteIp || 'unknown';
    // Ban & rate limit check for verify endpoint
    const banUntil = this.bannedUntilByIp.get(ip) || 0;
    if (banUntil > timestamp) {
      const err = ERROR_CODES.ABUSE_BANNED;
      return {
        success: false,
        reason: 'abuse_banned',
        tokenOk: false,
        nonceOk: false,
        errorCode: err.code,
        errorMessage: err.message,
        retryable: err.retryable,
        timestamp
      };
    }
    if (this.isRateLimited(ip, this.verifyTimestampsByIp, this.verifyLimitPerWindow, this.rlWindowMs, timestamp)) {
      // 触发速率限制也视为滥用信号之一（更快触达临时封禁）
      this.recordAbuse(ip);
      const err = ERROR_CODES.RATE_LIMITED;
      return {
        success: false,
        reason: 'rate_limited',
        tokenOk: false,
        nonceOk: false,
        errorCode: err.code,
        errorMessage: err.message,
        retryable: err.retryable,
        timestamp
      };
    }
    
    if (!tokenB64) {
      const error = ERROR_CODES.MISSING_TOKEN;
      // 记录模式：缺失 token
      this.recordPattern(ip, 'missing_token');
      this.recordAbuse(ip);
      return { 
        success: false, 
        reason: 'missing_token',
        errorCode: error.code,
        errorMessage: error.message,
        retryable: error.retryable,
        timestamp
      };
    }

    let tokenObj: { payload: SmartClientPayload; salt: string; sig: string };
    try {
      tokenObj = base64DecodeJson(tokenB64);
    } catch {
      const error = ERROR_CODES.BAD_TOKEN_FORMAT;
      this.recordPattern(ip, 'bad_token_format');
      this.recordAbuse(ip);
      return { 
        success: false, 
        reason: 'bad_token_format',
        errorCode: error.code,
        errorMessage: error.message,
        retryable: error.retryable,
        timestamp
      };
    }

    const { payload, salt, sig } = tokenObj || ({} as any);
    if (!payload || typeof salt !== 'string' || typeof sig !== 'string') {
      const error = ERROR_CODES.INCOMPLETE_TOKEN;
      this.recordPattern(ip, 'incomplete_token');
      this.recordAbuse(ip);
      return { 
        success: false, 
        reason: 'incomplete_token',
        errorCode: error.code,
        errorMessage: error.message,
        retryable: error.retryable,
        timestamp
      };
    }

    const payloadStr = JSON.stringify(payload);
    const inputStr = `${payloadStr}|${salt}`;
    const expectSig = sha256Base64(inputStr);
    // 可选调试日志（仅在显式开启时输出）
    if (process.env.SMART_HUMAN_CHECK_DEBUG === '1') {
      try {
        logger.debug('[SmartHumanCheck] sig-debug', {
          inputLen: inputStr.length,
          payloadLen: payloadStr.length,
          salt,
          expectSig,
          gotSig: sig,
          equal: expectSig === sig,
        });
      } catch {}
    }
    // 弱签名比较（非机密，但可检测基础篡改）——显式使用 utf8，且在长度不等时避免抛错
    let sigMatch = false;
    try {
      const a = Buffer.from(expectSig, 'utf8');
      const b = Buffer.from(sig, 'utf8');
      sigMatch = a.length === b.length && crypto.timingSafeEqual(a, b);
    } catch {
      sigMatch = false;
    }
    if (!sigMatch) {
      const error = ERROR_CODES.BAD_TOKEN_SIG;
      this.recordAbuse(ip); // 篡改/伪造迹象
      this.recordPattern(ip, 'bad_token_sig');
      return { 
        success: false, 
        reason: 'bad_token_sig', 
        tokenOk: false,
        errorCode: error.code,
        errorMessage: error.message,
        retryable: error.retryable,
        timestamp
      };
    }

    // 校验 nonce（推荐启用）
    const nonceRes = this.verifyNonceInternal(payload.cn);
    if (!nonceRes.ok) {
      const errorInfo = nonceRes.errorInfo || ERROR_CODES.BAD_NONCE_FORMAT;
      // 非法/重复/过期 nonce 视为潜在滥用
      this.recordAbuse(ip);
      this.recordPattern(ip, `nonce_invalid`);
      return { 
        success: false, 
        reason: `nonce_invalid:${nonceRes.reason}`, 
        nonceOk: false,
        errorCode: errorInfo.code,
        errorMessage: errorInfo.message,
        retryable: errorInfo.retryable,
        timestamp
      };
    }

    // 校验客户端时间偏移
    const now = Date.now();
    if (Math.abs(now - payload.ts) > this.maxSkewMs) {
      const error = ERROR_CODES.CLIENT_TIME_SKEW;
      this.recordPattern(ip, 'client_time_skew');
      this.recordAbuse(ip);
      return { 
        success: false, 
        reason: 'client_time_skew', 
        tokenOk: true, 
        nonceOk: true,
        errorCode: error.code,
        errorMessage: error.message,
        retryable: error.retryable,
        timestamp
      };
    }

    // 预评估风险（用于动态阈值计算）
    const risk = this.assessRisk(payload, remoteIp);
    const ua = payload.ua;
    // 记录可疑 UA 模式（不直接拒绝）
    try {
      if (this.isSuspiciousUA(ua)) {
        this.recordPattern(ip, 'ua_suspicious');
      }
    } catch {}
    const baseThreshold = this.scoreThreshold;
    const dyn = this.computeDynamicThreshold(baseThreshold, ip, ua, risk.level, now);

    // 校验得分（动态阈值）
    if (typeof payload.sc !== 'number' || payload.sc < dyn.used) {
      const stepUp = typeof payload.sc === 'number' && payload.sc >= baseThreshold && dyn.used > baseThreshold;
      const error = stepUp ? ERROR_CODES.CHALLENGE_REQUIRED : ERROR_CODES.LOW_SCORE;
      if (process.env.SMART_HUMAN_CHECK_DEBUG === '1') {
        try {
          logger.debug('[SmartHumanCheck] score-check', {
            gotScore: payload.sc,
            baseThreshold,
            thresholdUsed: dyn.used,
            stepUp,
            policy: dyn.policy,
            passRateIp: dyn.passRateIp,
            passRateUa: dyn.passRateUa,
          });
        } catch {}
      }
      // 记录失败
      this.recordOutcome(ip, ua, false, now);
      return { 
        success: false, 
        reason: stepUp ? 'step_up_required' : 'low_score', 
        score: payload.sc, 
        tokenOk: true, 
        nonceOk: true,
        errorCode: error.code,
        errorMessage: error.message,
        retryable: true,
        timestamp,
        threshold: baseThreshold,
        thresholdBase: baseThreshold,
        thresholdUsed: dyn.used,
        passRateIp: dyn.passRateIp,
        passRateUa: dyn.passRateUa,
        challengeRequired: stepUp,
        policy: dyn.policy,
        riskScore: risk.score,
        riskLevel: risk.level,
        riskReasons: risk.reasons
      };
    }

    // 综合风险评估（已计算）
    if (risk.level === 'high') {
      const error = ERROR_CODES.HIGH_RISK;
      this.recordAbuse(ip); // 高风险计入滥用
      // 记录失败
      this.recordOutcome(ip, payload.ua, false, now);
      return {
        success: false,
        reason: 'high_risk',
        score: payload.sc,
        tokenOk: true,
        nonceOk: true,
        errorCode: error.code,
        errorMessage: error.message,
        retryable: error.retryable,
        timestamp,
        riskScore: risk.score,
        riskLevel: risk.level,
        riskReasons: risk.reasons,
        challengeRequired: true
      };
    }

    // 记录风控信息（可落库）
    try {
      logger.info('[SmartHumanCheck] pass', {
        ip: remoteIp,
        ua: payload.ua?.slice(0, 160),
        score: payload.sc,
        tz: payload.tz,
        ce: payload.ce?.slice(0, 16),
        riskScore: risk.score,
        riskLevel: risk.level,
        riskReasons: risk.reasons?.slice(0, 6)
      });
    } catch {}

    // 记录成功
    this.recordOutcome(ip, payload.ua, true, now);
    return { 
      success: true, 
      score: payload.sc, 
      tokenOk: true, 
      nonceOk: true,
      timestamp,
      riskScore: risk.score,
      riskLevel: risk.level,
      riskReasons: risk.reasons,
      threshold: this.scoreThreshold,
      thresholdBase: baseThreshold,
      thresholdUsed: dyn.used,
      passRateIp: dyn.passRateIp,
      passRateUa: dyn.passRateUa,
      policy: dyn.policy,
    };
  }

  // ---- Rate limit & abuse helpers ----
  private recordPattern(ip: string, pattern: string) {
    const now = Date.now();
    const key = `${pattern}|${ip}`;
    const arr = this.patternTimestampsByKey.get(key) || [];
    const cutoff = now - this.patternWindowMs;
    const fresh = arr.filter(t => t > cutoff);
    fresh.push(now);
    this.patternTimestampsByKey.set(key, fresh);
    const threshold = this.patternBanThresholds.get(pattern) || 0;
    if (threshold > 0 && fresh.length >= threshold) {
      const until = now + this.banDurationMs;
      this.bannedUntilByIp.set(ip, until);
      try {
        logger.warn('[SmartHumanCheck] IP temporarily banned due to pattern', { ip, pattern, until, count: fresh.length });
      } catch {}
    }
  }

  /** 查询 IP 是否在临时封禁中 */
  public isIpBanned(ip: string): boolean {
    const now = Date.now();
    return (this.bannedUntilByIp.get(ip) || 0) > now;
    }

  /** 剩余封禁毫秒（未封禁则为 0） */
  public getBanRemainingMs(ip: string): number {
    const now = Date.now();
    const until = this.bannedUntilByIp.get(ip) || 0;
    return Math.max(0, until - now);
  }
  private isRateLimited(ip: string, bucket: Map<string, number[]>, limit: number, windowMs: number, now: number): boolean {
    const arr = bucket.get(ip) || [];
    const cutoff = now - windowMs;
    const fresh = arr.filter(t => t > cutoff);
    fresh.push(now);
    bucket.set(ip, fresh);
    return fresh.length > limit;
  }

  private recordAbuse(ip: string) {
    const now = Date.now();
    // Respect existing ban
    const banUntil = this.bannedUntilByIp.get(ip) || 0;
    if (banUntil > now) return;
    const arr = this.abuseTimestampsByIp.get(ip) || [];
    const cutoff = now - this.abuseWindowMs;
    const fresh = arr.filter(t => t > cutoff);
    fresh.push(now);
    this.abuseTimestampsByIp.set(ip, fresh);
    if (fresh.length >= this.abuseThreshold) {
      const until = now + this.banDurationMs;
      this.bannedUntilByIp.set(ip, until);
      try {
        logger.warn('[SmartHumanCheck] IP temporarily banned due to abuse', { ip, until });
      } catch {}
    }
  }

  /**
   * 获取 nonce 存储统计信息
   */
  getStats() {
    return this.nonceStore.getStats();
  }

  /**
   * 手动清理过期的 nonce
   */
  cleanupExpiredNonces(): number {
    return this.nonceStore.cleanup();
  }

  /**
   * 获取密钥信息（用于调试和监控，不暴露完整密钥）
   */
  getSecretInfo(): {
    isAutoGenerated: boolean;
    length: number;
    environment: string;
    hasCustomSecret: boolean;
  } {
    const hasCustomSecret = !!(process.env.SMART_HUMAN_CHECK_SECRET);
    return {
      isAutoGenerated: !hasCustomSecret && process.env.NODE_ENV === 'production',
      length: this.secret.length,
      environment: process.env.NODE_ENV || 'development',
      hasCustomSecret
    };
  }
}

export default SmartHumanCheckService;
