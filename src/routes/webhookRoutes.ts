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

router.post(
  '/resend',
  webhookLimiter,
  express.raw({ type: 'application/json' }),
  WebhookController.handleResendWebhook
);

export default router;
