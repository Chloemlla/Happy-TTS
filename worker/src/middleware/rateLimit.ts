/**
 * 速率限制中间件 - 基于 KV
 */
import type { Context, Next } from 'hono';
import type { Env } from '../types';

interface RateLimitOptions {
  windowMs?: number;
  max?: number;
  message?: string;
  prefix?: string;
}

export function createRateLimiter(options: RateLimitOptions = {}) {
  const {
    windowMs = 60_000,
    max = 60,
    message = '请求过于频繁，请稍后再试',
    prefix = 'rl',
  } = options;

  return async (c: Context<{ Bindings: Env }>, next: Next) => {
    const ip = c.req.header('CF-Connecting-IP') || c.req.header('X-Real-IP') || 'unknown';
    const path = new URL(c.req.url).pathname;
    const key = `${prefix}:${path}:${ip}`;
    const windowSec = Math.ceil(windowMs / 1000);

    try {
      const current = await c.env.RATE_LIMIT_KV.get(key, 'text');
      const count = current ? parseInt(current, 10) : 0;

      if (count >= max) {
        return c.json({ error: message }, 429);
      }

      // 非阻塞写入 - 使用 waitUntil 避免阻塞响应
      const ctx = c.executionCtx;
      ctx.waitUntil(
        c.env.RATE_LIMIT_KV.put(key, String(count + 1), { expirationTtl: windowSec })
      );
    } catch {
      // KV 失败不阻塞请求
    }

    await next();
  };
}

// 预定义限流器
export const authLimiter = createRateLimiter({ windowMs: 15 * 60_000, max: 20, prefix: 'rl:auth' });
export const ttsLimiter = createRateLimiter({ windowMs: 60_000, max: 10, prefix: 'rl:tts' });
export const apiDefaultLimiter = createRateLimiter({ windowMs: 60_000, max: 60, prefix: 'rl:api' });
export const adminLimiter = createRateLimiter({ windowMs: 60_000, max: 30, prefix: 'rl:admin' });
