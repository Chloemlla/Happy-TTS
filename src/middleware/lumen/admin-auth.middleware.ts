import crypto from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { lumenConfig } from "../../config/lumen.js";
import { AdminSession } from "../../models/lumen/index.js";

/**
 * Admin authentication middleware.
 *
 * Two authentication modes are supported:
 *   1. **Bearer token** against an `AdminSession` document (from a browser
 *      session obtained via the admin login flow).
 *   2. **Automation token** – a constant-time comparison against the
 *      `LUMEN_ADMIN_AUTOMATION_TOKEN` environment variable.
 *
 * On success, sets `req.lumenAdminOperator` and `req.lumenAdminRole`.
 */

function constantTimeEqual(a: string, b: string): boolean {
  try {
    const ba = Buffer.from(a, "utf8");
    const bb = Buffer.from(b, "utf8");
    if (ba.length !== bb.length) return false;
    return crypto.timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

function extractBearerToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (!authHeader) return null;
  const parts = authHeader.split(/\s+/);
  if (parts.length !== 2 || parts[0].toLowerCase() !== "bearer") return null;
  return parts[1].trim() || null;
}

/**
 * Returns middleware that requires a valid admin session or automation token.
 * Sets `req.lumenAdminOperator` and `req.lumenAdminRole`.
 */
export function requireAdmin(): (req: Request, res: Response, next: NextFunction) => void {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const token = extractBearerToken(req);
      if (!token) {
        res.status(401).json({ error: "Unauthorized", reasonCode: "missing_authorization_header" });
        return;
      }

      // 1. Try automation token
      if (lumenConfig.adminAutomationToken) {
        if (constantTimeEqual(token, lumenConfig.adminAutomationToken)) {
          req.lumenAdminOperator = "automation";
          req.lumenAdminRole = "admin";
          req.lumenAdminUsername = "automation";
          req.lumenAdminCreatedAt = Date.now();
          next();
          return;
        }
      }

      // 2. Try admin session document
      const session = await AdminSession.findById(token).exec();

      if (!session) {
        res.status(401).json({ error: "Unauthorized", reasonCode: "admin_session_not_found" });
        return;
      }

      if (session.expiresAt && session.expiresAt <= new Date()) {
        await AdminSession.deleteOne({ _id: token }).exec();
        res.status(401).json({ error: "Unauthorized", reasonCode: "admin_session_expired" });
        return;
      }

      // Bump lastUsedAt
      AdminSession.updateOne({ _id: token }, { $set: { lastUsedAt: new Date() } }).exec().catch(() => {
        /* non-critical */
      });

      req.lumenAdminOperator = session.username || "admin";
      req.lumenAdminRole = session.role || "admin";
      req.lumenAdminUsername = session.username || req.lumenAdminOperator;
      req.lumenAdminCreatedAt = typeof session.createdAt === "number" ? session.createdAt : undefined;
      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Returns middleware that specifically requires operator-level admin access
 * (role "operator").  Must run after `requireAdmin()`.
 */
export function requireAdminActionOperator(): (req: Request, res: Response, next: NextFunction) => void {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.lumenAdminOperator) {
      res.status(401).json({ error: "Unauthorized", reasonCode: "admin_auth_required" });
      return;
    }

    if (req.lumenAdminRole !== "operator" && req.lumenAdminRole !== "admin") {
      res.status(403).json({
        error: "Forbidden",
        reasonCode: "admin_action_operator_required",
        message: "Operator-level admin access is required for this action",
      });
      return;
    }

    next();
  };
}