import express from 'express';
import { WebhookController } from '../controllers/webhookController';
import { createLimiter } from '../middleware/rateLimiter';

const router = express.Router();

// Resend webhooks require RAW body for signature verification
// Add a gentle rate limiter to prevent abuse while allowing provider retries
const webhookLimiter = createLimiter({
  windowMs: 60 * 1000,
  max: 120,
  routeName: 'webhooks-resend',
  message: 'Webhook requests are too frequent, please retry later.'
});

// 默认路由（使用基础密钥 RESEND_WEBHOOK_SECRET / WEBHOOK_SECRET)
router.post(
  '/resend',
  webhookLimiter,
  express.raw({ type: 'application/json' }),
  WebhookController.handleResendWebhook
);

// 动态多路由：根据环境变量自动注册 /resend-<key>
// 支持：RESEND_WEBHOOK_SECRET_<KEY> 或 WEBHOOK_SECRET_<KEY>
const env = process.env;
const keys = new Set<string>();
for (const name of Object.keys(env)) {
  if (!name) continue;
  const m1 = name.match(/^RESEND_WEBHOOK_SECRET_(.+)$/i);
  const m2 = name.match(/^WEBHOOK_SECRET_(.+)$/i);
  const match = m1 || m2;
  if (match && env[name] && String(env[name]).trim()) {
    const key = match[1].toLowerCase();
    if (key) keys.add(key);
  }
}

for (const key of keys) {
  const path = `/resend-${key}`;
  // 使用 param 形式以便 controller 读取 req.params.key
  router.post(
    path,
    webhookLimiter,
    express.raw({ type: 'application/json' }),
    // 将 key 注入到 req.params 兼容 controller（Express 路由本身无 params，这里包一层）
    (req, _res, next) => { (req as any).params = { ...(req as any).params, key }; next(); },
    WebhookController.handleResendWebhook
  );
}

export default router;
