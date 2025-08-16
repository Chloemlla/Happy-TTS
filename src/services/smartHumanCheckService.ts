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
    
    // 初始化 nonce 存储
    this.nonceStore = getNonceStore({
      ttlMs: this.ttlMs,
      maxSize: Number(process.env.SMART_HUMAN_CHECK_NONCE_STORE_SIZE || 10000),
      cleanupInterval: Number(process.env.SMART_HUMAN_CHECK_CLEANUP_INTERVAL || 60000)
    });

    if (!opts?.secret && !process.env.SMART_HUMAN_CHECK_SECRET) {
      logger.warn('[SmartHumanCheck] Using default secret. Set SMART_HUMAN_CHECK_SECRET in production.');
    }
  }

  /** 生成带签名的 nonce（短时有效） */
  issueNonce(clientIp?: string, userAgent?: string): NonceResult {
    try {
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
   * 校验前端 token（Base64）
   * - 解包 { payload, salt, sig }
   * - 校验弱签名：sig == sha256(payloadStr + '|' + salt)
   * - 校验 nonce 与时效
   * - 校验 score 与时间偏移
   */
  verifyToken(tokenB64: string, remoteIp?: string): VerifyResult {
    const timestamp = Date.now();
    
    if (!tokenB64) {
      const error = ERROR_CODES.MISSING_TOKEN;
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
    const expectSig = sha256Base64(`${payloadStr}|${salt}`);
    // 弱签名比较（非机密，但可检测基础篡改）
    if (!crypto.timingSafeEqual(Buffer.from(expectSig), Buffer.from(sig))) {
      const error = ERROR_CODES.BAD_TOKEN_SIG;
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

    // 校验得分
    if (typeof payload.sc !== 'number' || payload.sc < this.scoreThreshold) {
      const error = ERROR_CODES.LOW_SCORE;
      return { 
        success: false, 
        reason: 'low_score', 
        score: payload.sc, 
        tokenOk: true, 
        nonceOk: true,
        errorCode: error.code,
        errorMessage: error.message,
        retryable: error.retryable,
        timestamp
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
      });
    } catch {}

    return { 
      success: true, 
      score: payload.sc, 
      tokenOk: true, 
      nonceOk: true,
      timestamp
    };
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
}

export default SmartHumanCheckService;
