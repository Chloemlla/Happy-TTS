/**
 * CORS 中间件 - Hono 版
 */
import { cors } from 'hono/cors';
import type { Env } from '../types';

export function createCors(env: Env) {
  const allowedOrigins = (env.ALLOWED_ORIGINS || '').split(',').filter(Boolean);

  return cors({
    origin: (origin) => {
      if (!origin) return '*';
      if (allowedOrigins.includes(origin)) return origin;
      // 开发环境放行 localhost
      if (env.NODE_ENV !== 'production' && origin.includes('localhost')) return origin;
      return '';
    },
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Fingerprint', 'X-Turnstile-Token'],
    exposeHeaders: ['Content-Length', 'X-Request-Id'],
    credentials: true,
    maxAge: 86400,
  });
}
