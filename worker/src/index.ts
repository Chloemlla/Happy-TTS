/**
 * Happy-TTS Cloudflare Workers 入口
 *
 * 使用 Hono 框架替代 Express，适配 CF Workers 运行时。
 * 所有 Node.js 特有 API (fs, path, child_process 等) 已替换为
 * CF Workers 兼容方案 (KV, R2, fetch 等)。
 */
import { Hono } from 'hono';
import { logger as honoLogger } from 'hono/logger';
import { prettyJSON } from 'hono/pretty-json';
import type { Env } from './types';
import { createCors } from './middleware/cors';
import { securityHeaders } from './middleware/security';
import { apiDefaultLimiter } from './middleware/rateLimit';
import logger from './lib/logger';

// 路由模块
import authRoutes from './routes/auth';
import ttsRoutes from './routes/tts';
import adminRoutes from './routes/admin';
import statusRoutes from './routes/status';
import turnstileRoutes from './routes/turnstile';
import networkRoutes from './routes/network';
import libreChatRoutes from './routes/libreChat';
import shortUrlRoutes from './routes/shortUrl';

const app = new Hono<{ Bindings: Env }>();

// ========== 全局中间件 ==========

// 请求日志
app.use('*', honoLogger());

// JSON 美化 (开发环境)
app.use('*', prettyJSON());

// 安全头
app.use('*', securityHeaders);

// CORS - 动态读取环境变量
app.use('*', async (c, next) => {
  const corsMiddleware = createCors(c.env);
  return corsMiddleware(c, next);
});

// 请求 ID
app.use('*', async (c, next) => {
  c.header('X-Request-Id', crypto.randomUUID());
  await next();
});

// ========== 短链路由 (需要在 API 路由之前) ==========
app.route('/', shortUrlRoutes);

// ========== API 路由 ==========

// 全局 API 限流
app.use('/api/*', apiDefaultLimiter);

// 路由挂载
app.route('/api/auth', authRoutes);
app.route('/api/tts', ttsRoutes);
app.route('/api/admin', adminRoutes);
app.route('/api/status', statusRoutes);
app.route('/api/turnstile', turnstileRoutes);
app.route('/api/network', networkRoutes);
app.route('/api/libre-chat', libreChatRoutes);

// ========== 音频静态文件 (R2) ==========
app.get('/static/audio/:fileName', async (c) => {
  const fileName = c.req.param('fileName');
  const object = await c.env.AUDIO_BUCKET.get(fileName);

  if (!object) {
    return c.json({ error: '文件不存在' }, 404);
  }

  const headers = new Headers();
  headers.set('Content-Type', object.httpMetadata?.contentType || 'audio/mpeg');
  headers.set('Cache-Control', 'public, max-age=86400');
  headers.set('Cross-Origin-Resource-Policy', 'cross-origin');
  headers.set('Access-Control-Allow-Origin', '*');

  return new Response(object.body, { headers });
});

// ========== 兼容旧路径 ==========

// 根路由
app.get('/', (c) => c.redirect('https://tts.hapxs.com/', 302));

// favicon
app.get('/favicon.ico', (c) =>
  c.redirect('https://png.hapxs.com/i/2025/08/08/68953253d778d.png', 302)
);

// IP 查询
app.get('/ip', async (c) => {
  const ip = c.req.header('CF-Connecting-IP') || c.req.header('X-Real-IP') || 'unknown';
  const country = c.req.header('CF-IPCountry') || 'unknown';
  const cf = (c.req.raw as any).cf || {};

  return c.json({
    ip,
    country,
    city: cf.city || 'unknown',
    region: cf.region || 'unknown',
    asn: cf.asn || 'unknown',
    isp: cf.asOrganization || 'unknown',
  });
});

// 兼容 /lc
app.get('/lc', async (c) => {
  try {
    const { MongoClient } = await import('./lib/mongo');
    const mongo = new MongoClient(c.env);
    const col = mongo.collection('librechat_records');
    const records = await col.find({}, { sort: { updateTime: -1 }, limit: 1 });
    if (records.length > 0) {
      const record = records[0];
      return c.json({
        update_time: record.updateTime,
        image_name: record.imageUrl,
        update_time_shanghai: record.updateTimeShanghai,
      });
    }
    return c.json({ error: 'No data available.' }, 404);
  } catch {
    return c.json({ error: 'Internal Server Error' }, 500);
  }
});

// 前端配置
app.get('/api/frontend-config', (c) => {
  return c.json({ enableFirstVisitVerification: false });
});

// 健康检查
app.get('/health', (c) => c.json({ status: 'ok', runtime: 'cloudflare-workers' }));

// 服务器状态
app.post('/server_status', async (c) => {
  const { password } = await c.req.json();
  if (password === c.env.SERVER_PASSWORD) {
    return c.json({
      boot_time: new Date().toISOString(),
      uptime: 0,
      runtime: 'cloudflare-workers',
      cpu_usage_percent: 0,
      memory_usage: { used: 0, total: 0, percent: 0 },
    });
  }
  // 返回假数据
  return c.json({
    boot_time: '2023-01-01T00:00:00.000Z',
    uptime: Math.floor(Math.random() * 34200) + 1800,
    cpu_usage_percent: Math.floor(Math.random() * 90) + 5,
    memory_usage: {
      used: Math.floor(Math.random() * 7.5 * 1024 * 1024 * 1024) + 500 * 1024 * 1024,
      total: Math.floor(Math.random() * 14 * 1024 * 1024 * 1024) + 2 * 1024 * 1024 * 1024,
      percent: Math.floor(Math.random() * 90) + 5,
    },
  });
});

// ========== 404 ==========
app.notFound((c) => {
  logger.warn(`404: ${c.req.method} ${c.req.url}`);
  return c.json({ error: 'Not Found' }, 404);
});

// ========== 全局错误处理 ==========
app.onError((err, c) => {
  logger.error('Unhandled error', { message: err.message, stack: err.stack });
  return c.json({ error: 'Internal Server Error' }, 500);
});

export default app;
