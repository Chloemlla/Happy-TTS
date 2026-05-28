import type { Request, Response } from "express";
import { requireAdmin } from "./_helpers";

export async function syncIpBans(req: Request, res: Response) {
  try {
    if (!requireAdmin(req, res)) return;

    const { schedulerService } = await import("../../services/schedulerService");
    const result = await schedulerService.manualSync();

    if (result.success) {
      res.json({
        success: true,
        message: "IP 封禁同步完成",
        data: { mongoToRedis: result.mongoToRedis, redisToMongo: result.redisToMongo },
      });
    } else {
      res.status(500).json({ success: false, error: result.error || "同步失败" });
    }
  } catch (error) {
    console.error("手动同步失败:", error);
    res.status(500).json({ success: false, error: error instanceof Error ? error.message : "同步失败" });
  }
}

export async function getSyncStatus(req: Request, res: Response) {
  try {
    if (!requireAdmin(req, res)) return;

    const { schedulerService } = await import("../../services/schedulerService");
    const status = schedulerService.getStatus();

    res.json({ success: true, data: status });
  } catch (error) {
    console.error("获取同步状态失败:", error);
    res.status(500).json({ success: false, error: error instanceof Error ? error.message : "获取状态失败" });
  }
}
