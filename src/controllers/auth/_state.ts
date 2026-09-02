import { TurnstileService } from "../../services/turnstileService";
import logger from "../../utils/logger";

// 登录失败尝试次数限制
export const LOGIN_ATTEMPT_LIMIT = 5;
// 多次登录失败预警阈值（低于锁定阈值）
export const LOGIN_FAILURE_ALERT_THRESHOLD = 3;
export const LOGIN_LOCKOUT_DURATION = 15 * 60 * 1000; // 15分钟
export const loginAttempts = new Map<string, { count: number; lastAttempt: number; lockedUntil?: number }>();

export function getLoginRetrySeconds(lockedUntil: number): number {
  return Math.max(1, Math.ceil((lockedUntil - Date.now()) / 1000));
}

// 支持的主流邮箱后缀
const allowedDomains = [
  "gmail.com",
  "outlook.com",
  "qq.com",
  "163.com",
  "126.com",
  "hotmail.com",
  "yahoo.com",
  "icloud.com",
  "foxmail.com",
  "chloemlla.com",
];
export const emailPattern = new RegExp(`^[\\w.-]+@(${allowedDomains.map((d) => d.replace(".", "\\.")).join("|")})$`);

// 临时存储验证码和注册信息
export const emailCodeMap = new Map<string, { code: string; time: number; regInfo: any; attempts: number }>(); // email -> { code, time, regInfo, attempts }
// 临时存储密码重置验证码（含设备指纹和IP用于验证一致性）
export const resetPasswordCodeMap = new Map<
  string,
  { code: string; time: number; userId: string; attempts: number; fingerprint?: string; ipAddress?: string }
>(); // email -> { code, time, userId, attempts, fingerprint, ipAddress }

// G2-20: 给模块级认证状态 Map 加 TTL 清理 + 容量上限，避免攻击者用随机 identifier 持续放大内存。
const AUTH_STATE_CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
const LOGIN_ATTEMPTS_MAX_ENTRIES = 20_000;
const CODE_MAP_MAX_ENTRIES = 5_000;

function cleanupLoginAttempts(now = Date.now()): void {
  if (loginAttempts.size <= LOGIN_ATTEMPTS_MAX_ENTRIES) {
    // 仍然清理已过锁定期的条目
    for (const [key, value] of loginAttempts) {
      if (!value.lockedUntil || value.lockedUntil <= now) {
        if (!value.lockedUntil && now - value.lastAttempt > 24 * 60 * 60 * 1000) {
          loginAttempts.delete(key);
        } else if (value.lockedUntil && value.lockedUntil <= now) {
          loginAttempts.delete(key);
        }
      }
    }
    return;
  }
  // 超上限：整体清空（保守兜底，防止内存无限增长）
  loginAttempts.clear();
}

function cleanupCodeMap<K>(map: Map<K, { time: number }>, maxEntries: number, ttlMs: number, now = Date.now()): void {
  if (map.size <= maxEntries) {
    for (const [key, value] of map) {
      if (now - value.time > ttlMs) {
        map.delete(key);
      }
    }
    return;
  }
  // 超上限：先按时间排序淘汰最旧的，直到回落到上限
  const ordered = [...map.entries()].sort((a, b) => a[1].time - b[1].time);
  const excess = map.size - maxEntries;
  for (const [key] of ordered.slice(0, excess)) {
    map.delete(key);
  }
}

setInterval(() => {
  try {
    cleanupLoginAttempts();
    cleanupCodeMap(emailCodeMap, CODE_MAP_MAX_ENTRIES, 10 * 60 * 1000);
    cleanupCodeMap(resetPasswordCodeMap, CODE_MAP_MAX_ENTRIES, 10 * 60 * 1000);
  } catch (error) {
    logger.warn("[Auth] 认证状态清理异常", { error: error instanceof Error ? error.message : String(error) });
  }
}, AUTH_STATE_CLEANUP_INTERVAL_MS).unref();

// 最大验证码失败次数（防暴力枚举）
export const MAX_CODE_ATTEMPTS = 5;

// 获取前端基础URL
export function getFrontendBaseUrl(): string {
  return process.env.FRONTEND_URL || "https://tts.chloemlla.com";
}

export async function verifyRequiredTurnstile(
  token: unknown,
  ip: string,
  logTag: string,
  subject?: string,
): Promise<string | null> {
  const turnstileConfig = await TurnstileService.getConfig();
  if (!turnstileConfig.enabled) {
    return null;
  }

  if (typeof token !== "string" || token.length === 0) {
    logger.warn(`[${logTag}] 缺少 Turnstile 令牌`, { subject, ip });
    return "请先完成人机验证";
  }

  const isValid = await TurnstileService.verifyToken(token, ip);
  if (!isValid) {
    logger.warn(`[${logTag}] Turnstile 验证失败`, { subject, ip });
    return "人机验证失败，请重试";
  }

  return null;
}
