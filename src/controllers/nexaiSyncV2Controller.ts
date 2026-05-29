import type { Request, Response } from "express";
import { NexaiEncryptedSyncService } from "../services/nexaiEncryptedSyncService";
import logger from "../utils/logger";

function getRequiredNexaiUserId(req: Request, res: Response): string | null {
  const userId = req.nexaiUser?.id;
  if (userId) {
    return userId;
  }

  res.status(401).json({
    success: false,
    error: "Unauthorized",
    code: "NEXAI_AUTH_REQUIRED",
  });
  return null;
}

function sendError(res: Response, error: any, fallback: string): void {
  const statusCode = Number(error?.statusCode) || 500;
  res.status(statusCode).json({
    success: false,
    error: error?.message || fallback,
    code: error?.code || "NEXAI_SYNC_V2_ERROR",
  });
}

export class NexaiSyncV2Controller {
  static async putSnapshot(req: Request, res: Response) {
    try {
      const userId = getRequiredNexaiUserId(req, res);
      if (!userId) return;

      const result = await NexaiEncryptedSyncService.putSnapshot(userId, req.body || {});
      res.json({
        success: true,
        data: result,
      });
    } catch (error: any) {
      logger.error("[NexAI Sync V2] PUT /sync/v2 error:", error);
      sendError(res, error, "上传加密同步数据失败");
    }
  }

  static async getSnapshot(req: Request, res: Response) {
    try {
      const userId = getRequiredNexaiUserId(req, res);
      if (!userId) return;

      const data = await NexaiEncryptedSyncService.getSnapshot(userId);
      res.json({
        success: true,
        data,
      });
    } catch (error: any) {
      logger.error("[NexAI Sync V2] GET /sync/v2 error:", error);
      sendError(res, error, "获取加密同步数据失败");
    }
  }

  static async getMeta(req: Request, res: Response) {
    try {
      const userId = getRequiredNexaiUserId(req, res);
      if (!userId) return;

      const data = await NexaiEncryptedSyncService.getMeta(userId);
      res.json({
        success: true,
        data,
      });
    } catch (error: any) {
      logger.error("[NexAI Sync V2] GET /sync/v2/meta error:", error);
      sendError(res, error, "获取加密同步状态失败");
    }
  }

  static async incrementalSync(req: Request, res: Response) {
    try {
      const userId = getRequiredNexaiUserId(req, res);
      if (!userId) return;

      const data = await NexaiEncryptedSyncService.incrementalSync(userId, req.body || {});
      res.json({
        success: true,
        data,
      });
    } catch (error: any) {
      logger.error("[NexAI Sync V2] POST /sync/v2/incremental error:", error);
      sendError(res, error, "加密增量同步失败");
    }
  }

  static async deleteSnapshot(req: Request, res: Response) {
    try {
      const userId = getRequiredNexaiUserId(req, res);
      if (!userId) return;

      const data = await NexaiEncryptedSyncService.deleteSnapshot(userId);
      res.json({
        success: true,
        data,
      });
    } catch (error: any) {
      logger.error("[NexAI Sync V2] DELETE /sync/v2 error:", error);
      sendError(res, error, "清除加密同步数据失败");
    }
  }
}
