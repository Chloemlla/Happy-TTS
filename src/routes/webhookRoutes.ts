import express from 'express';
import { WebhookController } from '../controllers/webhookController';

const router = express.Router();

// Resend webhooks send JSON body
router.post('/resend', express.json({ type: 'application/json' }), WebhookController.handleResendWebhook);

export default router;
