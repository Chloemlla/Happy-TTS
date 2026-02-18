import type { NextFunction, Request, Response } from "express";
import type { IAuditLog } from "../models/auditLogModel";
import { type AuditEntry, AuditLogService } from "../services/auditLogService";

/**
 * 审计日志中间件
 *
 * 用法：
 *   router.post('/users', auditLog({ module: 'user', action: 'user.create' }), handler);
 *
 * 也可以传入函数动态提取 targetId / targetName：
 *   auditLog({
 *     module: 'cdk',
 *     action: 'cdk.delete',
 *     extractTarget: (req) => ({ targetId: req.params.id }),
 *   })
 */

export interface AuditLogOptions {
  module: IAuditLog["module"];
  action: string;
  /** 从请求中提取操作目标信息 */
  extractTarget?: (req: Request) => { targetId?: string; targetName?: string };
  /** 从请求中提取额外详情 */
  extractDetail?: (req: Request) => Record<string, any> | undefined;
}

export function auditLog(options: AuditLogOptions) {
  const { module, action, extractTarget, extractDetail } = options;

  return (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).user;
    const startTime = Date.now();
    let audited = false;

    // 拦截 res.json / res.send 来捕获响应结果
    const originalJson = res.json.bind(res);
    const originalSend = res.send.bind(res);

    const writeAudit = (result: "success" | "failure", errorMessage?: string) => {
      if (audited) return;
      audited = true;

      const target = extractTarget ? extractTarget(req) : {};
      const detail = extractDetail ? extractDetail(req) : undefined;

      const entry: AuditEntry = {
        userId: user?.id || user?._id || "unknown",
        username: user?.username || user?.name || "unknown",
        role: user?.role || "unknown",
        action,
        module,
        targetId: target.targetId,
        targetName: target.targetName,
        result,
        errorMessage,
        detail: detail ? { ...detail, durationMs: Date.now() - startTime } : { durationMs: Date.now() - startTime },
        ip: req.ip || (req as any).connection?.remoteAddress || "unknown",
        userAgent: req.headers["user-agent"],
        path: req.originalUrl || req.path,
        method: req.method,
      };

      // fire-and-forget
      AuditLogService.log(entry).catch(() => {});
    };

    res.json = (body: any) => {
      const statusCode = res.statusCode;
      if (statusCode >= 200 && statusCode < 400) {
        writeAudit("success");
      } else {
        writeAudit("failure", body?.error || body?.message);
      }
      return originalJson(body);
    };

    res.send = (body: any) => {
      const statusCode = res.statusCode;
      if (statusCode >= 200 && statusCode < 400) {
        writeAudit("success");
      } else {
        writeAudit("failure", typeof body === "string" ? body : undefined);
      }
      return originalSend(body);
    };

    next();
  };
}
