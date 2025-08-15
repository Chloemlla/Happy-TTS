import express from 'express';
import { WebhookController } from '../controllers/webhookController';

const router = express.Router();

// Resend webhooks require RAW body for signature verification
router.post('/resend', express.raw({ type: 'application/json' }), WebhookController.handleResendWebhook);

export default router;
