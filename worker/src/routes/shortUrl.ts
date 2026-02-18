/**
 * 短链路由 - /s/:code 和 /api/short-url
 */
import { Hono } from 'hono';
import type { Env } from '../types';
import { MongoClient } from '../lib/mongo';
import { authenticateToken } from '../middleware/auth';
import logger from '../lib/logger';

const shortUrl = new Hono<{ Bindings: Env }>();

// 短链跳转
shortUrl.get('/s/:code', async (c) => {
  const code = c.req.param('code');
  try {
    const mongo = new MongoClient(c.env);
    const col = mongo.collection('short_urls');
    const record = await col.findOne({ code, active: true });

    if (!record) {
      return c.json({ error: '短链不存在或已失效' }, 404);
    }

    // 异步更新访问计数
    c.executionCtx.waitUntil(
      col.updateOne({ code }, { $inc: { clicks: 1 }, $set: { lastAccessedAt: new Date().toISOString() } })
    );

    return c.redirect(record.targetUrl, 302);
  } catch (error) {
    logger.error('短链跳转失败', { code, error: String(error) });
    return c.json({ error: '服务异常' }, 500);
  }
});

// 创建短链
shortUrl.post('/api/short-url', authenticateToken, async (c) => {
  try {
    const { url, customCode } = await c.req.json();
    if (!url) return c.json({ error: '缺少目标 URL' }, 400);

    const code = customCode || crypto.randomUUID().slice(0, 8);
    const mongo = new MongoClient(c.env);
    const col = mongo.collection('short_urls');

    // 检查 code 是否已存在
    if (customCode) {
      const existing = await col.findOne({ code });
      if (existing) return c.json({ error: '自定义短码已被使用' }, 409);
    }

    const payload = c.get('user');
    await col.insertOne({
      code,
      targetUrl: url,
      userId: payload.userId,
      clicks: 0,
      active: true,
      createdAt: new Date().toISOString(),
    });

    return c.json({
      code,
      shortUrl: `${c.env.BASE_URL}/s/${code}`,
    });
  } catch (error) {
    return c.json({ error: '创建短链失败' }, 500);
  }
});

export default shortUrl;
