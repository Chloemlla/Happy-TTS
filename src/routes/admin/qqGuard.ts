import express from "express";
import type { NextFunction, Request, Response } from "express";
import { QqGuardModerationService } from "../../services/qqGuardModerationService";
import type { QqGuardCommandAction } from "../../models/qqGuardModel";

/**
 * QQ 群纪律面板（仅管理员）。挂在 /api/admin 下，路径为 /qq-guard/*。
 * 所有读写都经 QqGuardModerationService；面板动作（立即重试/手动撤回/豁免）
 * 写命令 outbox，由机器人轮询执行并回执。Mongo 未就绪时查询返回空集而非报错。
 */
const router = express.Router();

const VERDICTS = new Set(["violated", "clean", "undetermined"]);

function num(v: unknown, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

function str(v: unknown, max = 200): string | undefined {
  return typeof v === "string" ? v.trim().slice(0, max) : undefined;
}

function operator(req: Request): string {
  const u = (req as Request & { user?: { id?: string; username?: string } }).user;
  return String(u?.id || u?.username || "admin");
}

/** 概览统计。 */
router.get("/qq-guard/stats", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const stats = await QqGuardModerationService.stats();
    res.json({ success: true, ...stats });
  } catch (error) {
    next(error);
  }
});

/** 待复审任务（undetermined 且时间线无终态）。 */
router.get("/qq-guard/pending", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { items } = await QqGuardModerationService.pendingReviews(num(req.query.limit, 50));
    res.json({ success: true, items });
  } catch (error) {
    next(error);
  }
});

/** 审计列表（可组合筛选）。 */
router.get("/qq-guard/audits", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const event = str(req.query.event);
    const verdict = str(req.query.verdict);
    if (verdict && !VERDICTS.has(verdict)) {
      res.status(400).json({ success: false, error: "invalid verdict" });
      return;
    }
    const { audits, total } = await QqGuardModerationService.listAudits({
      traceId: str(req.query.traceId, 128),
      groupId: str(req.query.groupId, 64),
      userId: str(req.query.userId, 64),
      ...(event ? { event } : {}),
      ...(verdict ? { verdict } : {}),
      page: num(req.query.page, 1),
      limit: num(req.query.limit, 30),
    });
    res.json({ success: true, audits, total });
  } catch (error) {
    next(error);
  }
});

/** 单条 traceId 的完整时间线（顺时序）。 */
router.get("/qq-guard/audits/:traceId", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const traceId = String(req.params.traceId || "").trim().slice(0, 128);
    if (!traceId) {
      res.status(400).json({ success: false, error: "traceId required" });
      return;
    }
    const events = await QqGuardModerationService.timelineByTrace(traceId);
    res.json({ success: true, traceId, events });
  } catch (error) {
    next(error);
  }
});

/** 白名单列表。 */
router.get("/qq-guard/whitelist", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const items = await QqGuardModerationService.listWhitelist();
    res.json({ success: true, items });
  } catch (error) {
    next(error);
  }
});

/** 加入白名单（userId 必填；groupId 缺省按全群 "*"）。 */
router.post("/qq-guard/whitelist", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const userId = str(body.userId, 64);
    if (!userId) {
      res.status(400).json({ success: false, error: "userId required" });
      return;
    }
    const result = await QqGuardModerationService.addWhitelist({
      userId,
      groupId: str(body.groupId, 64) || "*",
      name: str(body.name, 120),
      reason: str(body.reason, 400),
      addedBy: operator(req),
    });
    res.json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
});

/** 移出白名单（按 userId，跨群删除）。 */
router.delete("/qq-guard/whitelist/:userId", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = String(req.params.userId || "").trim().slice(0, 64);
    if (!userId) {
      res.status(400).json({ success: false, error: "userId required" });
      return;
    }
    await QqGuardModerationService.removeWhitelist(userId);
    res.json({ success: true, removed: userId });
  } catch (error) {
    next(error);
  }
});

/** 命令历史（默认按最新排，status 可筛选 pending/done/failed）。 */
router.get("/qq-guard/commands", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const status = str(req.query.status, 16);
    const all = await QqGuardModerationService.recentCommands(num(req.query.limit, 50));
    const commands = status
      ? all.filter((c) => String(c.status) === status)
      : all;
    res.json({ success: true, commands });
  } catch (error) {
    next(error);
  }
});

/**
 * 下发一条命令给机器人执行：
 *  - retry   立即复审：payload { traceId }
 *  - recall  手动撤回：payload { traceId, userId, groupId, messageId, reason?, sentAt? }
 *  - exempt  豁免用户：payload { userId, traceId?, groupId?, reason? }
 */
router.post("/qq-guard/commands", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const action = String(body.action || "").trim();
    if (action !== "retry" && action !== "recall" && action !== "exempt") {
      res.status(400).json({ success: false, error: "action must be retry|recall|exempt" });
      return;
    }
    const payload = (body.payload && typeof body.payload === "object" ? body.payload : {}) as Record<string, unknown>;

    const traceId = str(payload.traceId, 128);
    const userId = str(payload.userId, 64);
    const groupId = str(payload.groupId, 64);
    const messageId = str(payload.messageId, 64);

    if (action === "retry" && !traceId) {
      res.status(400).json({ success: false, error: "retry 需要 traceId" });
      return;
    }
    if (action === "recall" && (!traceId || !groupId || !userId || !messageId)) {
      res.status(400).json({ success: false, error: "recall 需要 traceId/groupId/userId/messageId" });
      return;
    }
    if (action === "exempt" && !userId) {
      res.status(400).json({ success: false, error: "exempt 需要 userId" });
      return;
    }

    const cleanPayload: Record<string, unknown> = { traceId };
    if (userId) cleanPayload.userId = userId;
    if (groupId) cleanPayload.groupId = groupId;
    if (messageId) cleanPayload.messageId = messageId;
    const reason = str(payload.reason, 400);
    if (reason) cleanPayload.reason = reason;
    if (payload.sentAt !== undefined) cleanPayload.sentAt = num(payload.sentAt, Math.floor(Date.now() / 1000));
    if (payload.content !== undefined && typeof payload.content === "string") {
      cleanPayload.content = payload.content.slice(0, 20_000);
    }

    const result = await QqGuardModerationService.createCommand({
      action: action as QqGuardCommandAction,
      payload: cleanPayload,
      createdBy: operator(req),
    });
    if (!("ok" in result) || (result as { ok: false }).ok === false) {
      res.status(503).json({ success: false, error: "qq-guard 数据未就绪（Mongo 不可用）" });
      return;
    }
    // 豁免 = 持久化白名单（DB 为准），bot 命令轮询同步后跨重启仍生效
    if (action === "exempt" && userId) {
      await QqGuardModerationService.addWhitelist({
        userId,
        groupId: groupId || "*",
        reason: reason ? `面板豁免：${reason}` : "面板豁免",
        addedBy: operator(req),
      });
    }
    res.json({ success: true, commandId: (result as { commandId: string }).commandId });
  } catch (error) {
    next(error);
  }
});

export default router;
