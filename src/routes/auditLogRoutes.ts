import { type Request, type Response, Router } from "express";
import { authenticateAdmin } from "../middleware/auth";
import { type AuditLogQueryParams, AuditLogService } from "../services/auditLogService";
import { firstString } from "../utils/httpParam";
import logger from "../utils/logger";

const router = Router();

router.use(authenticateAdmin);

function buildAuditLogQuery(req: Request): AuditLogQueryParams {
  return {
    page: Number(firstString(req.query.page)),
    pageSize: Number(firstString(req.query.pageSize)),
    requestId: firstString(req.query.requestId),
    module: firstString(req.query.module),
    action: firstString(req.query.action),
    userId: firstString(req.query.userId),
    username: firstString(req.query.username),
    role: firstString(req.query.role),
    result: firstString(req.query.result),
    startDate: firstString(req.query.startDate),
    endDate: firstString(req.query.endDate),
    keyword: firstString(req.query.keyword),
    method: firstString(req.query.method),
    path: firstString(req.query.path),
    ip: firstString(req.query.ip),
    targetId: firstString(req.query.targetId),
    targetName: firstString(req.query.targetName),
    statusCode: firstString(req.query.statusCode),
    minDurationMs: firstString(req.query.minDurationMs),
    maxDurationMs: firstString(req.query.maxDurationMs),
  };
}

// 获取前端可用的审计能力范围
router.get("/meta", (_req: Request, res: Response) => {
  res.json({ success: true, ...AuditLogService.getCapabilities() });
});

// 获取统计信息（可按当前筛选条件收敛）
router.get("/stats", async (req: Request, res: Response) => {
  try {
    const stats = await AuditLogService.getStats(buildAuditLogQuery(req));
    res.json({ success: true, ...stats });
  } catch (error) {
    logger.error("[AuditLog] 获取统计失败:", error);
    res.status(500).json({ success: false, error: "获取审计统计失败" });
  }
});

// 导出当前筛选范围内的审计日志
router.get("/export", async (req: Request, res: Response) => {
  try {
    const exported = await AuditLogService.exportCsv(buildAuditLogQuery(req));
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${exported.filename}"`);
    res.setHeader("X-Audit-Log-Export-Count", String(exported.count));
    res.setHeader("X-Audit-Log-Export-Max-Rows", String(exported.maxRows));
    res.send(`\uFEFF${exported.csv}`);
  } catch (error) {
    logger.error("[AuditLog] 导出失败:", error);
    res.status(500).json({ success: false, error: "导出审计日志失败" });
  }
});

// 查询审计日志（分页 + 筛选）
router.get("/", async (req: Request, res: Response) => {
  try {
    const result = await AuditLogService.query(buildAuditLogQuery(req));
    res.json({ success: true, ...result });
  } catch (error) {
    logger.error("[AuditLog] 查询失败:", error);
    res.status(500).json({ success: false, error: "查询审计日志失败" });
  }
});

export default router;
