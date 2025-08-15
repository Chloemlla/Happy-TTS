import { Request, Response } from 'express';
import logger from '../utils/logger';
import { WebhookEventService } from '../services/webhookEventService';

export class WebhookController {
  // POST /api/webhooks/resend
  static async handleResendWebhook(req: Request, res: Response) {
    try {
      // Resend sends JSON events. If signature verification is needed later,
      // we can add it here using a webhook secret.
      const event = req.body;

      // Basic validation
      if (!event) {
        return res.status(400).json({ error: 'Invalid webhook payload' });
      }

      // Log safely (avoid logging huge content)
      const { type, created_at, data, id: evtId } = event;
      const summary = {
        type,
        created_at,
        messageId: data?.id || data?.message?.id,
        to: data?.to || data?.recipient,
        subject: data?.subject || data?.message?.subject,
        status: data?.status,
      };
      logger.info('[ResendWebhook] Received event', summary);

      // Persist to database
      try {
        await WebhookEventService.create({
          provider: 'resend',
          eventId: evtId || data?.id || data?.message?.id,
          type,
          created_at: created_at ? new Date(created_at) : undefined,
          to: data?.to || data?.recipient,
          subject: data?.subject || data?.message?.subject,
          status: data?.status,
          data,
          raw: event,
        });
      } catch (dbErr) {
        logger.warn('[ResendWebhook] 保存事件到数据库失败', {
          error: dbErr instanceof Error ? dbErr.message : String(dbErr),
        });
      }

      // Acknowledge receipt
      return res.status(200).json({ success: true });
    } catch (err) {
      logger.error('[ResendWebhook] Error handling webhook', {
        error: err instanceof Error ? err.message : String(err),
      });
      return res.status(500).json({ error: 'Webhook handling failed' });
    }
  }
}
