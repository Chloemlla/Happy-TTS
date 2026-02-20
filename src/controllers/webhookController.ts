import type { Request, Response } from "express";
import { getResendSecret, verifyResendPayload, WebhookEventService } from "../services/webhookEventService";
import logger from "../utils/logger";

export class WebhookController {
  /**
   * 将 content 中的 {{value}} 占位符按顺序替换为 values 数组中的值
   */
  private static renderContent(content: string, values?: any[]): string {
    if (!content || !Array.isArray(values) || values.length === 0) return content || "";
    let idx = 0;
    return content.replace(/\{\{value\}\}/g, () => {
      if (idx < values.length) {
        return String(values[idx++]);
      }
      return "{{value}}";
    });
  }

  // POST /api/webhooks/generic 或 /api/webhooks/generic-:source
  // 接收任意服务的 POST 通知，无签名验证，直接持久化
  // 支持结构化通知格式：{ type, title, content, values, timestamp }
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

      // 解析结构化通知字段
      const title = body.title || undefined;
      const content = body.content || undefined;
      const values = Array.isArray(body.values) ? body.values : undefined;
      const renderedContent = content ? WebhookController.renderContent(content, values) : undefined;

      // 时间戳：支持秒级和毫秒级
      let createdAt: Date | undefined;
      const ts = body.created_at || body.timestamp;
      if (ts) {
        const num = typeof ts === "number" ? ts : Number(ts);
        // 秒级时间戳（10位）自动转毫秒
        createdAt = new Date(num < 1e12 ? num * 1000 : num);
      }

      const summary = {
        source: source || "generic",
        type,
        eventId,
        title,
        renderedContent: renderedContent?.slice(0, 200),
        keys: Object.keys(body).slice(0, 10),
      };
      logger.info("[GenericWebhook] Received event", summary);

      try {
        await WebhookEventService.create({
          provider: source || "generic",
          routeKey: source || undefined,
          eventId,
          type,
          title,
          content,
          renderedContent,
          created_at: createdAt,
          to: body.to || body.recipient || body.email || undefined,
          subject: title || body.subject || body.message || undefined,
          status: body.status || undefined,
          data: body,
          raw: body,
        });
      } catch (dbErr) {
        logger.warn("[GenericWebhook] 保存事件到数据库失败", {
          error: dbErr instanceof Error ? dbErr.message : String(dbErr),
        });
      }

      return res.status(200).json({ success: true, renderedContent });
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
