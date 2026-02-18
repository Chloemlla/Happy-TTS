/**
 * Turnstile 验证路由 - /api/turnstile
 */
import { Hono } from 'hono';
import type { Env } from '../types';
import logger from '../lib/logger';

const turnstile = new Hono<{ Bindings: Env }>();

// 获取 Turnstile 配置 (公开)
turnstile.get('/config', async (c) => {
  return c.json({
    siteKey: c.env.TURNSTILE_SITE_KEY || '',
    enabled: !!(c.env.TURNSTILE_SECRET_KEY && c.env.TURNSTILE_SITE_KEY),
  });
});

// 验证 Turnstile token
turnstile.post('/verify', async (c) => {
  try {
    const { token } = await c.req.json();
    if (!token) {
      return c.json({ success: false, error: '缺少验证令牌' }, 400);
    }

    if (!c.env.TURNSTILE_SECRET_KEY) {
      // 未配置则跳过验证
      return c.json({ success: true, message: 'Turnstile 未配置，跳过验证' });
    }

    const ip = c.req.header('CF-Connecting-IP') || '';
    const formData = new FormData();
    formData.append('secret', c.env.TURNSTILE_SECRET_KEY);
    formData.append('response', token);
    if (ip) formData.append('remoteip', ip);

    const result = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: formData,
    });

    const outcome = await result.json() as { success: boolean; 'error-codes'?: string[] };

    if (outcome.success) {
      return c.json({ success: true });
    }

    return c.json({
      success: false,
      error: '验证失败',
      codes: outcome['error-codes'],
    }, 403);
  } catch (error) {
    logger.error('Turnstile 验证异常', { error: String(error) });
    return c.json({ success: false, error: '验证服务异常' }, 500);
  }
});

export default turnstile;
