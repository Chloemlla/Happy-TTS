import type { Request, Response } from "express";
import { requireAdmin } from "./_helpers";

function countMongoToRedis(result?: { synced: number; merged: number }): number {
  return (result?.synced || 0) + (result?.merged || 0);
}

function countRedisToMongo(result?: { synced: number; updated: number }): number {
  return (result?.synced || 0) + (result?.updated || 0);
}

export async function syncIpBans(req: Request, res: Response) {
  try {
    if (!requireAdmin(req, res)) return;

    const { schedulerService } = await import("../../services/schedulerService");
    const result = await schedulerService.manualSync();

    if (result.success) {
      const mongoToRedisCount = countMongoToRedis(result.mongoToRedis);
      const redisToMongoCount = countRedisToMongo(result.redisToMongo);
      res.json({
        success: true,
        message: "IP 封禁同步完成",
        mongoToRedis: mongoToRedisCount,
        redisToMongo: redisToMongoCount,
        data: {
          mongoToRedis: result.mongoToRedis,
          redisToMongo: result.redisToMongo,
          mongoToRedisCount,
          redisToMongoCount,
        },
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
    const ipBanSyncStatus = status.ipBanSyncStatus;
    const errors = status.lastSyncError ? [status.lastSyncError] : [];

    res.json({
      success: true,
      data: {
        lastSync: status.lastSync,
        nextSync: status.nextSync,
        mongoToRedisCount: countMongoToRedis(status.lastSyncResult?.mongoToRedis),
        redisToMongoCount: countRedisToMongo(status.lastSyncResult?.redisToMongo),
        errors,
        isRunning: Boolean(ipBanSyncStatus?.isRunning || status.isSyncEnabled),
        isSyncEnabled: status.isSyncEnabled,
        isSyncing: Boolean(ipBanSyncStatus?.isSyncing),
        redisAvailable: Boolean(ipBanSyncStatus?.redisAvailable),
        syncIntervalMs: status.syncIntervalMs,
        totalSyncs: status.totalSyncs,
        totalErrors: status.totalSyncErrors,
        lastSyncResult: status.lastSyncResult,
        lastSyncError: status.lastSyncError,
        lastSyncDurationMs: status.lastSyncDurationMs,
        capabilities: status.capabilities.filter((capability) => capability.key === "ipban.sync"),
      },
    });
  } catch (error) {
    console.error("获取同步状态失败:", error);
    res.status(500).json({ success: false, error: error instanceof Error ? error.message : "获取状态失败" });
  }
}
