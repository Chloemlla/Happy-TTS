import express from "express";
import { mongoose } from "../../services/mongoService";
import { wsService } from "../../services/wsService";
import logger from "../../utils/logger";

const router = express.Router();

type BroadcastLevel = "info" | "warn" | "error";
type BroadcastDisplay = "toast" | "modal";
type BroadcastFormat = "text" | "html" | "markdown";
type BroadcastAudience = "all" | "authenticated" | "admins" | "anonymous" | "users" | "channel";

interface BroadcastPayload {
  message: string;
  level: BroadcastLevel;
  duration?: number;
  display: BroadcastDisplay;
  format: BroadcastFormat;
  title?: string;
  audience: BroadcastAudience;
  targetUserIds: string[];
  targetChannel?: string;
}

const MAX_MESSAGE_LENGTH = 1000;
const MAX_TITLE_LENGTH = 200;
const MAX_TARGET_USERS = 100;
const MAX_DURATION_MS = 60_000;
const VALID_CHANNEL_PATTERN = /^[a-zA-Z0-9:_./-]{1,120}$/;

const LEVELS = new Set<BroadcastLevel>(["info", "warn", "error"]);
const DISPLAYS = new Set<BroadcastDisplay>(["toast", "modal"]);
const FORMATS = new Set<BroadcastFormat>(["text", "html", "markdown"]);
const AUDIENCES = new Set<BroadcastAudience>(["all", "authenticated", "admins", "anonymous", "users", "channel"]);

const BroadcastLogSchema = new mongoose.Schema({
  message: { type: String, required: true },
  level: { type: String, default: "info" },
  title: String,
  duration: Number,
  display: { type: String, default: "toast" },
  format: { type: String, default: "text" },
  audience: { type: String, default: "all" },
  targetUserIds: { type: [String], default: [] },
  targetChannel: String,
  admin: String,
  connections: Number,
  createdAt: { type: Date, default: Date.now },
});

function getBroadcastLogModel() {
  return mongoose.models.BroadcastLog || mongoose.model("BroadcastLog", BroadcastLogSchema);
}

function badRequest(message: string): Error & { statusCode: number } {
  const error = new Error(message) as Error & { statusCode: number };
  error.statusCode = 400;
  return error;
}

function normalizeMessage(raw: unknown): string {
  if (typeof raw !== "string") {
    throw badRequest("缺少 message 参数");
  }

  const message = raw.trim();
  if (!message) {
    throw badRequest("消息内容不能为空");
  }
  if (message.length > MAX_MESSAGE_LENGTH) {
    throw badRequest(`消息内容不能超过 ${MAX_MESSAGE_LENGTH} 字`);
  }
  return message;
}

function normalizeLevel(raw: unknown): BroadcastLevel {
  if (raw === undefined || raw === null || raw === "") return "info";
  if (typeof raw === "string" && LEVELS.has(raw as BroadcastLevel)) return raw as BroadcastLevel;
  throw badRequest("不支持的消息级别");
}

function normalizeDuration(raw: unknown): number | undefined {
  if (raw === undefined || raw === null || raw === "") return undefined;
  const duration = Number(raw);
  if (!Number.isFinite(duration) || duration <= 0) {
    throw badRequest("展示时长必须为正数");
  }
  return Math.min(Math.round(duration), MAX_DURATION_MS);
}

function normalizeDisplay(raw: unknown): BroadcastDisplay {
  if (raw === undefined || raw === null || raw === "") return "toast";
  if (typeof raw === "string" && DISPLAYS.has(raw as BroadcastDisplay)) return raw as BroadcastDisplay;
  throw badRequest("不支持的展示方式");
}

function normalizeFormat(raw: unknown, display: BroadcastDisplay): BroadcastFormat {
  if (display !== "modal") return "text";
  if (raw === undefined || raw === null || raw === "") return "text";
  if (typeof raw === "string" && FORMATS.has(raw as BroadcastFormat)) return raw as BroadcastFormat;
  throw badRequest("不支持的内容格式");
}

function normalizeTitle(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const title = raw.trim();
  return title ? title.slice(0, MAX_TITLE_LENGTH) : undefined;
}

function normalizeAudience(raw: unknown, fallback: BroadcastAudience): BroadcastAudience {
  if (raw === undefined || raw === null || raw === "") return fallback;
  if (typeof raw === "string" && AUDIENCES.has(raw as BroadcastAudience)) return raw as BroadcastAudience;
  throw badRequest("不支持的推送范围");
}

function normalizeUserIds(raw: unknown): string[] {
  const values = Array.isArray(raw) ? raw : [raw];
  const userIds = values
    .flatMap((value) => (typeof value === "string" ? value.split(/[\s,;，；]+/) : []))
    .map((value) => value.trim())
    .filter(Boolean);

  return Array.from(new Set(userIds)).slice(0, MAX_TARGET_USERS);
}

function normalizeChannel(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const channel = raw.trim();
  if (!channel) return undefined;
  if (!VALID_CHANNEL_PATTERN.test(channel)) {
    throw badRequest("频道名称只能包含字母、数字、冒号、下划线、短横线、点和斜杠");
  }
  return channel;
}

function normalizePayload(body: any, fallbackAudience: BroadcastAudience): BroadcastPayload {
  const message = normalizeMessage(body?.message);
  const level = normalizeLevel(body?.level);
  const duration = normalizeDuration(body?.duration);
  const display = normalizeDisplay(body?.display);
  const format = normalizeFormat(body?.format, display);
  const title = normalizeTitle(body?.title);
  const audience = normalizeAudience(body?.audience, fallbackAudience);
  const targetUserIds = normalizeUserIds(body?.targetUserIds ?? body?.userIds ?? body?.userId);
  const targetChannel = normalizeChannel(body?.targetChannel ?? body?.channel);

  if (audience === "users" && targetUserIds.length === 0) {
    throw badRequest("指定用户推送需要提供至少一个用户 ID");
  }
  if (audience === "channel" && !targetChannel) {
    throw badRequest("频道推送需要提供频道名称");
  }

  return {
    message,
    level,
    duration,
    display,
    format,
    title,
    audience,
    targetUserIds,
    targetChannel,
  };
}

function buildNotification(payload: BroadcastPayload, adminMessage = false) {
  return {
    type: adminMessage ? ("admin:broadcast" as const) : ("notification" as const),
    data: {
      message: payload.message,
      level: payload.level,
      duration: payload.duration,
      display: payload.display,
      format: payload.format,
      title: payload.title,
    },
  };
}

function dispatchBroadcast(payload: BroadcastPayload): number {
  switch (payload.audience) {
    case "all":
      return wsService.broadcast(buildNotification(payload));
    case "authenticated":
      return wsService.broadcastToAuthenticatedUsers(buildNotification(payload));
    case "admins":
      return wsService.broadcastToAdmins(buildNotification(payload, true));
    case "anonymous":
      return wsService.broadcastToAnonymous(buildNotification(payload));
    case "users":
      return wsService.sendToUsers(payload.targetUserIds, buildNotification(payload));
    case "channel":
      return wsService.sendToChannel(payload.targetChannel!, buildNotification(payload));
  }
}

async function saveBroadcastLog(payload: BroadcastPayload, admin: string, connections: number) {
  const BroadcastLog = getBroadcastLogModel();
  await BroadcastLog.create({
    message: payload.message,
    level: payload.level,
    title: payload.title,
    duration: payload.duration,
    display: payload.display,
    format: payload.format,
    audience: payload.audience,
    targetUserIds: payload.audience === "users" ? payload.targetUserIds : [],
    targetChannel: payload.audience === "channel" ? payload.targetChannel : undefined,
    admin,
    connections,
  });
}

async function handleBroadcastRequest(req: any, res: any, fallbackAudience: BroadcastAudience) {
  let payload: BroadcastPayload;
  try {
    payload = normalizePayload(req.body, fallbackAudience);
  } catch (error) {
    const err = error as Error & { statusCode?: number };
    return res.status(err.statusCode || 400).json({ error: err.message || "请求参数无效" });
  }

  try {
    const admin = req.user?.username || req.user?.email || req.user?.id || "unknown";
    const connections = dispatchBroadcast(payload);

    try {
      await saveBroadcastLog(payload, admin, connections);
    } catch (dbErr) {
      logger.warn("[Admin] 广播历史存储失败（不影响推送）", dbErr);
    }

    logger.info("[Admin] WebSocket 推送消息", {
      admin,
      audience: payload.audience,
      level: payload.level,
      connections,
      messageLength: payload.message.length,
      targetUserCount: payload.audience === "users" ? payload.targetUserIds.length : undefined,
      targetChannel: payload.audience === "channel" ? payload.targetChannel : undefined,
    });

    return res.json({
      success: true,
      connections,
      audience: payload.audience,
      targetUserIds: payload.audience === "users" ? payload.targetUserIds : undefined,
      targetChannel: payload.audience === "channel" ? payload.targetChannel : undefined,
    });
  } catch (error) {
    logger.error("[Admin] WebSocket 推送失败", error);
    return res.status(500).json({ error: "推送失败" });
  }
}

// WebSocket 广播接口（管理员向指定范围推送消息）
router.post("/broadcast", async (req, res) => {
  return handleBroadcastRequest(req, res, "all");
});

// 定向用户推送（兼容旧前端，同时支持 userIds / targetUserIds 批量推送）
router.post("/broadcast/user", async (req, res) => {
  req.body = { ...req.body, audience: "users" };
  return handleBroadcastRequest(req, res, "users");
});

// 广播历史记录
router.get("/broadcast/history", async (req, res) => {
  try {
    const BroadcastLog = getBroadcastLogModel();
    const requestedLimit = Number(req.query.limit);
    const limit = Math.min(Math.max(Number.isFinite(requestedLimit) ? requestedLimit : 20, 1), 100);
    const audience = typeof req.query.audience === "string" && AUDIENCES.has(req.query.audience as BroadcastAudience)
      ? req.query.audience
      : undefined;
    const query = audience ? { audience } : {};
    const logs = await BroadcastLog.find(query).sort({ createdAt: -1 }).limit(limit).lean();
    return res.json({ success: true, logs });
  } catch (error) {
    logger.error("[Admin] 获取广播历史失败", error);
    return res.status(500).json({ error: "获取历史失败" });
  }
});

// 在线用户列表
router.get("/ws/clients", async (_req, res) => {
  try {
    const clients = wsService.getOnlineClients();
    return res.json({
      success: true,
      total: wsService.getConnectionCount(),
      stats: wsService.getConnectionStats(),
      clients,
    });
  } catch (error) {
    logger.error("[Admin] 获取在线用户失败", error);
    return res.status(500).json({ error: "获取在线用户失败" });
  }
});

// 强制断开用户连接
router.post("/ws/kick", async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId || typeof userId !== "string") {
      return res.status(400).json({ error: "缺少 userId 参数" });
    }
    const kicked = wsService.kickUser(userId.trim());
    logger.info("[Admin] 强制断开用户", { userId: userId.trim(), kicked, admin: (req as any).user?.username });
    return res.json({ success: true, kicked });
  } catch (error) {
    logger.error("[Admin] 强制断开失败", error);
    return res.status(500).json({ error: "操作失败" });
  }
});

export default router;
