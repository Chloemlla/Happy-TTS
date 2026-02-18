/**
 * 认证中间件 - Hono 版
 */
import type { Context, Next } from 'hono';
import type { Env } from '../types';
import { verifyToken } from '../lib/jwt';

/** Bearer token 简单密码认证 */
export async function authMiddleware(c: Context<{ Bindings: Env }>, next: Next) {
  const authHeader = c.req.header('Authorization');
  if (!authHeader) {
    return c.json({ error: '未提供认证信息' }, 401);
  }

  const [type, token] = authHeader.split(' ');
  if (type !== 'Bearer' || token !== c.env.SERVER_PASSWORD) {
    return c.json({ error: '认证失败' }, 401);
  }

  await next();
}

/** JWT token 认证 */
export async function authenticateToken(c: Context<{ Bindings: Env }>, next: Next) {
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ error: '未提供有效的认证令牌' }, 401);
  }

  const token = authHeader.slice(7);
  try {
    const payload = await verifyToken(token, c.env.JWT_SECRET);
    c.set('user', payload);
    await next();
  } catch {
    return c.json({ error: '令牌无效或已过期' }, 401);
  }
}

/** 管理员认证 */
export async function authenticateAdmin(c: Context<{ Bindings: Env }>, next: Next) {
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ error: '未提供认证信息' }, 401);
  }

  const token = authHeader.slice(7);

  // 方案1: 简单密码
  if (token === c.env.SERVER_PASSWORD || token === c.env.ADMIN_PASSWORD) {
    c.set('user', { userId: 'admin', username: 'admin', role: 'admin' });
    await next();
    return;
  }

  // 方案2: JWT
  try {
    const payload = await verifyToken(token, c.env.JWT_SECRET);
    if (payload.role !== 'admin') {
      return c.json({ error: '需要管理员权限' }, 403);
    }
    c.set('user', payload);
    await next();
  } catch {
    return c.json({ error: '认证失败' }, 401);
  }
}
