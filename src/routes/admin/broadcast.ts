import express from "express";
import logger from "../../utils/logger";

const router = express.Router();

// WebSocket 广播接口（管理员向所有在线用户推送消息）
router.post("/broadcast", async (req, res) => {
  try {
    const { message, level, duration, display, format, title } = req.body;
    if (!message || typeof message !== "string") {
      return res.status(400).json({ error: "缺少 message 参数" });
    }
    const safeDuration = typeof duration === "number" && duration > 0 ? Math.min(duration, 60000) : undefined;
    const safeDisplay = display === "modal" ? "modal" : "toast";
    const safeFormat = ["text", "html", "markdown"].includes(format) ? format : "text";
    const safeTitle = typeof title === "string" ? title.slice(0, 200) : undefined;
    const { wsService } = require("../../services/wsService");
    wsService.notifyAll(message, level || "info", {
      duration: safeDuration,
      display: safeDisplay,
      format: safeFormat,
      title: safeTitle,
    });

    // 存储广播历史
    try {
      const { mongoose } = require("../../services/mongoService");
      const BroadcastLog =
        mongoose.models.BroadcastLog ||
        mongoose.model(
          "BroadcastLog",
          new mongoose.Schema({
            message: String,
            level: String,
            admin: String,
            connections: Number,
            createdAt: { type: Date, default: Date.now },
          }),
        );
      await BroadcastLog.create({
        message,
        level: level || "info",
        admin: (req as any).user?.username || "unknown",
        connections: wsService.getConnectionCount(),
      });
    } catch (dbErr) {
      logger.warn("[Admin] 广播历史存储失败（不影响广播）", dbErr);
    }

    logger.info("[Admin] WebSocket 广播消息", { message, level, admin: (req as any).user?.username });
    return res.json({ success: true, connections: wsService.getConnectionCount() });
  } catch (e) {
    logger.error("[Admin] 广播消息失败", e);
    return res.status(500).json({ error: "广播失败" });
  }
});

// 定向用户推送
router.post("/broadcast/user", async (req, res) => {
  try {
    const { userId, message, level, duration, display, format, title } = req.body;
    if (!userId || !message) {
      return res.status(400).json({ error: "缺少 userId 或 message 参数" });
    }
    const safeDuration = typeof duration === "number" && duration > 0 ? Math.min(duration, 60000) : undefined;
    const safeDisplay = display === "modal" ? "modal" : "toast";
    const safeFormat = ["text", "html", "markdown"].includes(format) ? format : "text";
    const safeTitle = typeof title === "string" ? title.slice(0, 200) : undefined;
    const { wsService } = require("../../services/wsService");
    wsService.sendToUser(userId, {
      type: "notification",
      data: {
        message,
        level: level || "info",
        duration: safeDuration,
        display: safeDisplay,
        format: safeFormat,
        title: safeTitle,
      },
    });
    logger.info("[Admin] 定向推送", { userId, message, admin: (req as any).user?.username });
    return res.json({ success: true });
  } catch (e) {
    logger.error("[Admin] 定向推送失败", e);
    return res.status(500).json({ error: "推送失败" });
  }
});

// 广播历史记录
router.get("/broadcast/history", async (req, res) => {
  try {
    const { mongoose } = require("../../services/mongoService");
    const BroadcastLog =
      mongoose.models.BroadcastLog ||
      mongoose.model(
        "BroadcastLog",
        new mongoose.Schema({
          message: String,
          level: String,
          admin: String,
          connections: Number,
          createdAt: { type: Date, default: Date.now },
        }),
      );
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const logs = await BroadcastLog.find().sort({ createdAt: -1 }).limit(limit).lean();
    return res.json({ success: true, logs });
  } catch (e) {
    logger.error("[Admin] 获取广播历史失败", e);
    return res.status(500).json({ error: "获取历史失败" });
  }
});

// 在线用户列表
router.get("/ws/clients", async (_req, res) => {
  try {
    const { wsService } = require("../../services/wsService");
    const clients = wsService.getOnlineClients();
    return res.json({
      success: true,
      total: wsService.getConnectionCount(),
      clients,
    });
  } catch (e) {
    logger.error("[Admin] 获取在线用户失败", e);
    return res.status(500).json({ error: "获取在线用户失败" });
  }
});

// 强制断开用户连接
router.post("/ws/kick", async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) {
      return res.status(400).json({ error: "缺少 userId 参数" });
    }
    const { wsService } = require("../../services/wsService");
    const kicked = wsService.kickUser(userId);
    logger.info("[Admin] 强制断开用户", { userId, kicked, admin: (req as any).user?.username });
    return res.json({ success: true, kicked });
  } catch (e) {
    logger.error("[Admin] 强制断开失败", e);
    return res.status(500).json({ error: "操作失败" });
  }
});

export default router;
