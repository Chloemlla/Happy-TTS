import type { NextFunction, Request, Response } from "express";
import { Router } from "express";
import { qqGuardLimiter } from "../middleware/routeLimiters";
import { verifyQqGuardSignature, DEFAULT_MAX_DRIFT_MS } from "../middleware/qqGuardSignature";
import { getNonceStore } from "../services/nonceStore";
import { QqGuardModerationService } from "../services/qqGuardModerationService";
import { RuntimeConfigService } from "../services/runtimeConfigService";
import type { QqGuardAuditEvent } from "../models/qqGuardModel";
import logger from "../utils/logger";

const router = Router();

const ALLOWED_AUDIT_EVENTS = new Set<string>([
  "message", "moderate", "violation", "recalled", "recall_failed",
  "dm", "dm_sent", "dm_suppressed", "dm_failed", "pass", "review_pending",
  "review_clean", "review_violated", "exempted", "command",
  "bot_offline", "bot_recovered",
]);

function readSharedSecret(): string {
  // 运行时配置优先（Env Manager 里保存的 QQ_GUARD_SIGNING，可随时更新无需重启），
  // 其次部署环境变量（QQ_GUARD_BOT_TOKEN / QQ_GUARD_SHARED_SECRET，已由 config.ts 种入 defaults）。
  const runtimeToken = RuntimeConfigService.getCachedConfig().qqGuardSigning?.token;
  const runtimeSecret = (runtimeToken || "").trim();
  if (runtimeSecret) return runtimeSecret;
  return (process.env.QQ_GUARD_BOT_TOKEN || process.env.QQ_GUARD_SHARED_SECRET || "").trim();
}

const qqGuardNonceStore = getNonceStore({
  namespace: "qq-guard-sig-v1",
  maxSize: 100_000,
  ttlMs: 24 * 60 * 60 * 1000,
  redisPrefix: "qq-guard-sig-nonce:",
  sharedClaimsRequired: !["development", "test"].includes(process.env.NODE_ENV || ""),
});

/**
 * 机器人唯一入口鉴权：HMAC 签名 + 时间窗 + nonce 一次性消费。
 * 先验签再消费 nonce（G1-09），无效签名不会烧掉合法 nonce。
 * secret 未配置时整棵子树 fail-closed（503），绝不放行未签名请求。
 */
async function qqGuardAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const secret = readSharedSecret();
  if (!secret) {
    logger.warn("[QqGuard] 共享密钥未配置，拒绝全部控制通道请求", { path: req.originalUrl });
    res.status(503).json({ success: false, error: "qq-guard not configured" });
    return;
  }
  const check = verifyQqGuardSignature(req, { secret });
  if (!check.ok) {
    logger.warn("[QqGuard Sig]", { code: check.message, path: req.originalUrl, ip: req.ip });
    res.status(check.code).json({ success: false, error: check.message, code: check.message });
    return;
  }
  const nonce = String(req.headers["x-qqg-nonce"] || "");
  const nonceTtlMs = DEFAULT_MAX_DRIFT_MS + Math.max(0, 60_000);
  try {
    const claimed = await qqGuardNonceStore.claimNonceAsync(
      nonce,
      nonceTtlMs,
      req.ip,
      req.headers["user-agent"] as string | undefined,
    );
    if (!claimed.success) {
      const isReplay = claimed.reason === "nonce_already_consumed";
      logger.warn("[QqGuard Sig]", {
        code: isReplay ? "replay" : claimed.reason || "nonce_store",
        path: req.originalUrl,
        ip: req.ip,
      });
      res.status(409).json({
        success: false,
        error: isReplay ? "nonce replay" : "nonce claim failed",
        code: claimed.reason || "nonce_unavailable",
      });
      return;
    }
  } catch (err) {
    logger.error("[QqGuard Sig] nonce claim failed", {
      error: err instanceof Error ? err.message : String(err),
      path: req.originalUrl,
    });
    res.status(503).json({ success: false, error: "nonce store unavailable" });
    return;
  }
  next();
}

function asyncHandler(fn: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res).catch((err: unknown) => {
      logger.error("[QqGuard] handler error", {
        path: req.originalUrl,
        error: err instanceof Error ? err.message : String(err),
      });
      if (!res.headersSent) res.status(500).json({ success: false, error: "internal error" });
      else next(err);
    });
  };
}

/**
 * 同步 AI 合规裁决。机器人是执行者：拿到裁决后自行撤回/私信；
 * AI 不可达/不可解析一律返回 undetermined（fail-open），由机器人按 30 分钟递进重试。
 */
router.post(
  "/moderate",
  qqGuardLimiter,
  qqGuardAuth,
  asyncHandler(async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const groupId = String(body.groupId ?? "").trim();
    const userId = String(body.userId ?? "").trim();
    const messageId = String(body.messageId ?? "").trim();
    const content = typeof body.content === "string" ? body.content : "";
    const sentAt = Number(body.sentAt) || Math.floor(Date.now() / 1000);
    const traceId = typeof body.traceId === "string" ? body.traceId.trim().slice(0, 128) : undefined;
    const attempt = Number.isFinite(Number(body.attempt)) ? Math.max(0, Math.floor(Number(body.attempt))) : undefined;

    if (!groupId || !userId || !messageId) {
      res.status(400).json({ success: false, error: "groupId/userId/messageId required" });
      return;
    }
    if (content.length > 20_000) {
      res.status(400).json({ success: false, error: "content too long" });
      return;
    }

    const result = await QqGuardModerationService.moderate({
      groupId,
      userId,
      messageId,
      content,
      sentAt,
      ...(traceId ? { traceId } : {}),
      ...(attempt !== undefined ? { attempt } : {}),
    });
    res.json({ success: true, ...result });
  }),
);

/** 机器人回推执行结果审计（撤回/私信/复审挂起/追溯撤回等），供面板还原完整时间线。 */
router.post(
  "/audit",
  qqGuardLimiter,
  qqGuardAuth,
  asyncHandler(async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const traceId = typeof body.traceId === "string" ? body.traceId.trim().slice(0, 128) : "";
    const event = typeof body.event === "string" ? body.event.trim() : "";
    if (!traceId || !ALLOWED_AUDIT_EVENTS.has(event)) {
      res.status(400).json({ success: false, error: "traceId + valid event required" });
      return;
    }
    const opt = (v: unknown): string | undefined =>
      typeof v === "string" ? v.slice(0, 4000) : undefined;
    const num = (v: unknown): number | undefined => (Number.isFinite(Number(v)) ? Number(v) : undefined);
    const eventId = typeof body.eventId === "string" ? body.eventId.trim().slice(0, 128) : undefined;
    // 写库失败要如实上报（5xx），bot 才能把它送进补推队列重试；不吞错。
    try {
      const inserted = await QqGuardModerationService.recordAudit(
        {
          eventId,
          traceId,
          event: event as QqGuardAuditEvent,
          groupId: opt(body.groupId),
          userId: opt(body.userId),
          messageId: opt(body.messageId),
          content: opt(body.content),
          verdict: (["violated", "clean", "undetermined"] as string[]).includes(String(body.verdict))
            ? (String(body.verdict) as "violated" | "clean" | "undetermined")
            : undefined,
          reason: opt(body.reason),
          httpCode: num(body.httpCode),
          attempt: num(body.attempt),
          action: opt(body.action),
          status: opt(body.status),
          error: opt(body.error),
          ...(body.meta && typeof body.meta === "object" ? { meta: body.meta as Record<string, unknown> } : {}),
        },
        { throwOnError: true },
      );
      if (inserted && (event === "bot_offline" || event === "bot_recovered")) {
        // 邮件告警 fire-and-forget：不入 audit 送达契约（outbox 只管审计行），失败只记日志。
        void QqGuardModerationService.sendHealthAlertEmail({
          event,
          traceId,
          reason: opt(body.reason),
          status: opt(body.status),
          ...(body.meta && typeof body.meta === "object"
            ? { meta: body.meta as Record<string, unknown> }
            : {}),
        });
      }
    } catch (err) {
      logger.error("[QqGuard] /audit 写库失败，返回 5xx 供 bot 补推", {
        traceId,
        event,
        error: err instanceof Error ? err.message : String(err),
      });
      res.status(500).json({ success: false, error: "audit persist failed" });
      return;
    }
    res.json({ success: true, accepted: true, traceId, ...(eventId ? { eventId } : {}) });
  }),
);

/** 机器人拉取远端白名单（DB 为准），供运行时合并，使面板豁免跨重启生效。 */
router.get(
  "/whitelist",
  qqGuardLimiter,
  qqGuardAuth,
  asyncHandler(async (_req, res) => {
    const items = await QqGuardModerationService.listWhitelist();
    res.json({ success: true, items });
  }),
);

/** 机器人轮询面板命令 outbox（立即重试 / 手动撤回 / 豁免）。 */
router.get(
  "/commands",
  qqGuardLimiter,
  qqGuardAuth,
  asyncHandler(async (req, res) => {
    const rawLimit = Number(req.query.limit) || 10;
    const limit = Math.min(Math.max(1, Math.floor(rawLimit)), 50);
    const commands = await QqGuardModerationService.listPendingCommands(limit);
    res.json({ success: true, commands });
  }),
);

/** 机器人回执：命令执行结果写回 outbox。 */
router.post(
  "/commands/:commandId/ack",
  qqGuardLimiter,
  qqGuardAuth,
  asyncHandler(async (req, res) => {
    const commandId = String(req.params.commandId || "").trim().slice(0, 128);
    const body = (req.body ?? {}) as Record<string, unknown>;
    if (!commandId) {
      res.status(400).json({ success: false, error: "commandId required" });
      return;
    }
    const result = await QqGuardModerationService.ackCommand({
      commandId,
      ok: body.ok !== false,
      ...(body.result && typeof body.result === "object"
        ? { result: body.result as Record<string, unknown> }
        : {}),
      ...(typeof body.error === "string" ? { error: body.error.slice(0, 2000) } : {}),
    });
    if (!result.ok) {
      res.status(404).json({ success: false, error: "command not found" });
      return;
    }
    res.json({ success: true, accepted: true, commandId });
  }),
);

export default router;
