import crypto from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { AdminAccessAudit } from "../../models/lumen/index.js";

/**
 * Audit middleware for Project Lumen admin API access.
 *
 * Records each request to the AdminAccessAudit collection after the response
 * is sent.  Fields match the Rust `AdminAccessAuditRecord` format:
 *   - userId    (or "anonymous")
 *   - endpoint  (the route path)
 *   - ip        (client IP)
 *   - geo       (placeholder — geolocation not yet implemented)
 *   - status    (HTTP status code as string)
 */
export function auditMiddleware(): (req: Request, res: Response, next: NextFunction) => void {
  return (req: Request, res: Response, next: NextFunction): void => {
    const start = Date.now();

    res.once("finish", () => {
      AdminAccessAudit.create({
        _id: crypto.randomUUID(),
        at: start,
        userId: req.lumenUserId || "anonymous",
        endpoint: req.path,
        ip: req.ip || req.socket?.remoteAddress || "unknown",
        geo: "",
        status: String(res.statusCode),
      }).catch(() => {
        /* Non-critical: audit logging failure should not break the request */
      });
    });

    next();
  };
}