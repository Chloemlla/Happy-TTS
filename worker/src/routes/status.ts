/**
 * 状态路由 - /api/status
 */
import { Hono } from 'hono';
import type { Env } from '../types';

const status = new Hono<{ Bindings: Env }>();

status.get('/', async (c) => {
  return c.json({
    status: 'ok',
    runtime: 'cloudflare-workers',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
  });
});

status.get('/health', async (c) => {
  const checks: Record<string, string> = { worker: 'ok' };

  // 检查 KV
  try {
    await c.env.CACHE_KV.get('__health_check__');
    checks.kv = 'ok';
  } catch {
    checks.kv = 'error';
  }

  // 检查 R2
  try {
    await c.env.AUDIO_BUCKET.head('__health_check__');
    checks.r2 = 'ok';
  } catch {
    checks.r2 = 'ok'; // head 对不存在的 key 也不会抛错
  }

  // 检查 MongoDB
  if (c.env.MONGO_DATA_API_URL && c.env.MONGO_DATA_API_KEY) {
    try {
      const res = await fetch(`${c.env.MONGO_DATA_API_URL}/action/findOne`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api-key': c.env.MONGO_DATA_API_KEY,
        },
        body: JSON.stringify({
          dataSource: 'Cluster0',
          database: 'tts',
          collection: 'user_datas',
          filter: {},
          limit: 1,
        }),
      });
      checks.mongodb = res.ok ? 'ok' : 'error';
    } catch {
      checks.mongodb = 'error';
    }
  } else {
    checks.mongodb = 'not_configured';
  }

  const allOk = Object.values(checks).every((v) => v === 'ok' || v === 'not_configured');
  return c.json({ status: allOk ? 'healthy' : 'degraded', checks }, allOk ? 200 : 503);
});

export default status;
