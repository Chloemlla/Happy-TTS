import type { Request, Response } from "express";
import { schedulerService } from "../../services/schedulerService";
import { requireAdmin } from "./_helpers";

export async function getSchedulerStatus(req: Request, res: Response) {
  try {
    if (!requireAdmin(req, res)) return;

    const status = schedulerService.getStatus();
    res.json({ success: true, status });
  } catch (error) {
    console.error("获取定时任务状态失败:", error);
    res.status(500).json({ success: false, error: "服务器内部错误" });
  }
}

export async function manualCleanup(req: Request, res: Response) {
  try {
    if (!requireAdmin(req, res)) return;

    const result = await schedulerService.manualCleanup();

    res.json({
      success: result.success,
      deletedCount: result.deletedCount,
      cleanedCount: result.deletedCount,
      details: result.details,
      message: result.success
        ? `手动清理完成，删除了 ${result.deletedCount} 条过期记录`
        : `手动清理失败: ${result.error}`,
      error: result.error,
    });
  } catch (error) {
    console.error("手动清理失败:", error);
    res.status(500).json({ success: false, error: "服务器内部错误" });
  }
}

export async function startScheduler(req: Request, res: Response) {
  try {
    if (!requireAdmin(req, res)) return;

    schedulerService.start();
    res.json({ success: true, message: "定时任务已启动" });
  } catch (error) {
    console.error("启动定时任务失败:", error);
    res.status(500).json({ success: false, error: "服务器内部错误" });
  }
}

export async function stopScheduler(req: Request, res: Response) {
  try {
    if (!requireAdmin(req, res)) return;

    schedulerService.stop();
    res.json({ success: true, message: "定时任务已停止" });
  } catch (error) {
    console.error("停止定时任务失败:", error);
    res.status(500).json({ success: false, error: "服务器内部错误" });
  }
}
