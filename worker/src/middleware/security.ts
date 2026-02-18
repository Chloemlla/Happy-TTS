/**
 * 安全头中间件 - 替代 helmet
 */
import type { Context, Next } from 'hono';

export async function securityHeaders(c: Context, next: Next) {
  await next();

  // 等价于 helmet 的安全头
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('X-Frame-Options', 'DENY');
  c.header('X-XSS-Protection', '1; mode=block');
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  c.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  c.header('Content-Security-Policy', [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com https://*.cloudflare.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob: https:",
    "connect-src 'self' https://api.openai.com",
    "frame-src 'self' https://challenges.cloudflare.com",
    "object-src 'none'",
  ].join('; '));

  // 移除泄露信息的头
  c.res.headers.delete('X-Powered-By');
  c.res.headers.delete('Server');
}
