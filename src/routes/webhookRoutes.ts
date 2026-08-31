import express from "express";
import { WebhookController } from "../controllers/webhookController";
import { createLimiter } from "../middleware/rateLimiter";

const router = express.Router();

// 通用限流
const webhookLimiter = createLimiter({
  windowMs: 60 * 1000,
  max: 120,
  routeName: "webhooks",
  message: "Webhook requests are too frequent, please retry later.",
});

// ========== Resend Webhook 端点（Svix 签名验证） ==========
// 默认路由（使用基础密钥 RESEND_WEBHOOK_SECRET / WEBHOOK_SECRET)
router.post(
  "/resend",
  webhookLimiter,
  express.raw({ type: "application/json" }),
  WebhookController.handleResendWebhook,
);

// 参数化路由：/resend-:key（无需预扫描环境变量即可支持 WEBHOOK_SECRET_<KEY> 系列）
// G3-27: 删除下面曾经重复注册的动态字面量路由——/resend-:key 已能覆盖，
// controller 通过 req.params.key 读取对应 secret，环境变量扫描那段是死代码。
router.post(
  "/resend-:key",
  webhookLimiter,
  express.raw({ type: "application/json" }),
  WebhookController.handleResendWebhook,
);

export default router;