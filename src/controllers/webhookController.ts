import type { Request, Response } from "express";
import { getResendSecret, verifyResendPayload, WebhookEventService } from "../services/webhookEventService";
import logger from "../utils/logger";

export class WebhookController {
  // POST /api/webhooks/generic 或 /api/webhooks/generic-:source
  // 接收任意服务的 POST 通知，无签名验证，直接持久化
  static async handleGenericWebhook(req: Request, res: Response) {
    try {
      const source = (req.params as any)?.source as string | undefined;
      const body =
        Buffer.isBuffer(req.body)
          ? (() => { try { return JSON.parse(req.body.toString("utf8")); } catch { return { raw: req.body.toString("utf8") }; } })()
          : typeof req.body === "string"
            ? (() => { try { return JSON.parse(req.body); } catch { return { raw: req.body }; } })()
            : req.body || {};

      const type = body.type || body.event || body.action || "generic";
      const eventId = body.id || body.event_id || body.eventId || undefined;

      const summary = {
        source: source || "generic",
        type,
        eventId,
        keys: Object.keys(body).slice(0, 10),
      };
      logger.info("[GenericWebhook] Received event", summary);

      try {
        await WebhookEventService.create({
          provider: source || "generic",
          routeKey: source || undefined,
          eventId,
          type,
          created_at: body.created_at || body.timestamp ? new Date(body.created_at || body.timestamp) : undefined,
          to: body.to || body.recipient || body.email || undefined,
          subject: body.subject || body.title || body.message || undefined,
          status: body.status || undefined,
          data: body,
          raw: body,
        });
      } catch (dbErr) {
        logger.warn("[GenericWebhook] 保存事件到数据库失败", {
          error: dbErr instanceof Error ? dbErr.message : String(dbErr),
        });
      }

      return res.status(200).json({ success: true });
    } catch (err) {
      logger.error("[GenericWebhook] Error handling webhook", {
        error: err instanceof Error ? err.message : String(err),
      });
      return res.status(500).json({ error: "Webhook handling failed" });
    }
  }

  // POST /api/webhooks/resend
  static async handleResendWebhook(req: Request, res: Response) {
    try {
      // 读取原始请求体（express.raw 中间件提供 Buffer）并验证 Svix 签名
      const payload = Buffer.isBuffer(req.body)
        ? req.body.toString("utf8")
        : typeof req.body === "string"
          ? req.body
          : JSON.stringify(req.body || {});
      // 支持从路由读取多密钥的 key（/resend-:key）
      const routeKey = (req.params as any)?.key as string | undefined;
      let event: any;
      try {
        const secret = await getResendSecret(routeKey);
        event = verifyResendPayload(payload, req.headers, secret);
      } catch (e) {
        logger.warn("[ResendWebhook] 签名验证失败", { error: e instanceof Error ? e.message : String(e) });
        return res.status(400).json({ error: "Invalid webhook signature" });
      }

      // Basic validation
      if (!event) {
        return res.status(400).json({ error: "Invalid webhook payload" });
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
      logger.info("[ResendWebhook] Received event", summary);

      // Persist to database
      try {
        await WebhookEventService.create({
          provider: "resend",
          routeKey: routeKey,
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
        logger.warn("[ResendWebhook] 保存事件到数据库失败", {
          error: dbErr instanceof Error ? dbErr.message : String(dbErr),
        });
      }

      // Acknowledge receipt
      return res.status(200).json({ success: true });
    } catch (err) {
      logger.error("[ResendWebhook] Error handling webhook", {
        error: err instanceof Error ? err.message : String(err),
      });
      return res.status(500).json({ error: "Webhook handling failed" });
    }
  }
}
