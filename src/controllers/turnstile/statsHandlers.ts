import type { Request, Response } from "express";
import { TurnstileService } from "../../services/turnstileService";
import { requireAdmin } from "./_helpers";

export async function cleanupExpiredFingerprints(req: Request, res: Response) {
  try {
    if (!requireAdmin(req, res)) return;

    const deletedCount = await TurnstileService.cleanupExpiredFingerprints();

    res.json({
      success: true,
      deletedCount,
      message: `清理了 ${deletedCount} 条过期指纹记录`,
    });
  } catch (error) {
    console.error("清理过期指纹失败:", error);
    res.status(500).json({ success: false, error: "服务器内部错误" });
  }
}

export async function getFingerprintStats(req: Request, res: Response) {
  try {
    if (!requireAdmin(req, res)) return;

    const stats = await TurnstileService.getTempFingerprintStats();

    res.json({ success: true, stats });
  } catch (error) {
    console.error("获取指纹统计失败:", error);
    res.status(500).json({ success: false, error: "服务器内部错误" });
  }
}

export async function getIpBanStats(req: Request, res: Response) {
  try {
    if (!requireAdmin(req, res)) return;

    const stats = await TurnstileService.getIpBanStats();

    res.json({ success: true, stats });
  } catch (error) {
    console.error("获取IP封禁统计失败:", error);
    res.status(500).json({ success: false, error: "服务器内部错误" });
  }
}
