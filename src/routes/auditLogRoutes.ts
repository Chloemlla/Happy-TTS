import { type Request, type Response, Router } from "express";
import { AuditLogService } from "../services/auditLogService";
import logger from "../utils/logger";

const router = Router();

// 查询审计日志（分页 + 筛选）
router.get("/", async (req: Request, res: Response) => {
  try {
    const result = await AuditLogService.query({
      page: Number(req.query.page) || 1,
      pageSize: Number(req.query.pageSize) || 20,
      module: req.query.module as string,
      action: req.query.action as string,
      userId: req.query.userId as string,
      result: req.query.result as string,
      startDate: req.query.startDate as string,
      endDate: req.query.endDate as string,
      keyword: req.query.keyword as string,
    });
    res.json({ success: true, ...result });
  } catch (error) {
    logger.error("[AuditLog] 查询失败:", error);
    res.status(500).json({ success: false, error: "查询审计日志失败" });
  }
});

// 获取统计信息
router.get("/stats", async (_req: Request, res: Response) => {
  try {
    const stats = await AuditLogService.getStats();
    res.json({ success: true, ...stats });
  } catch (error) {
    logger.error("[AuditLog] 获取统计失败:", error);
    res.status(500).json({ success: false, error: "获取审计统计失败" });
  }
});

export default router;
