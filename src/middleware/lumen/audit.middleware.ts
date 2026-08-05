import type { NextFunction, Request, Response } from "express";
import { AdminAccessAuditModel } from "../../models/lumen/index.js";

/**
 * Audit middleware for Project Lumen admin API access.
 *
 * Records each request to the AdminAccessAudit collection after the response
 * is sent.  Fields captured:
 *   - `req.lumenUserId`  (or "anonymous")
 *   - `req.path`         (the matched route path)
 *   - `req.ip`           (client IP, with proxy-awareness)
 *   - `res.statusCode`   (the HTTP response status code)
 */
export function auditMiddleware(): (req: Request, res: Response, next: NextFunction) => void {
  return (req: Request, res: Response, next: NextFunction): void => {
    // Capture the start time (optional, for future duration tracking)
    const start = Date.now();

    // Hook into response finish event to record the audit entry
    res.once("finish", () => {
      const duration = Date.now() - start;

      AdminAccessAuditModel.create({
        userId: req.lumenUserId || "anonymous",
        adminOperator: req.lumenAdminOperator || null,
        path: req.path,
        method: req.method,
        ip: req.ip || req.socket?.remoteAddress || "unknown",
        statusCode: res.statusCode,
        userAgent: (req.headers["user-agent"] as string) || "",
        duration,
        timestamp: new Date(),
      }).catch(() => {
        /* Non-critical: audit logging failure should not break the request */
      });
    });

    next();
  };
}