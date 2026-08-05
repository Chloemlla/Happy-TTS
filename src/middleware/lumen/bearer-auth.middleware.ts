import type { NextFunction, Request, Response } from "express";
import { Session } from "../../models/lumen/index.js";

/**
 * Middleware that extracts a Bearer token from the Authorization header,
 * validates it against a Session document, and attaches the user/session
 * context to the request.
 *
 * The session's `_id` is the raw bearer token value.  The document is looked up
 * by `_id`, checked for expiry, and its `lastUsedAt` is bumped on success.
 */
export function requireAuth(): (req: Request, res: Response, next: NextFunction) => void {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader) {
        res.status(401).json({ error: "Unauthorized", reasonCode: "missing_authorization_header" });
        return;
      }

      const parts = authHeader.split(/\s+/);
      if (parts.length !== 2 || parts[0].toLowerCase() !== "bearer" || !parts[1]) {
        res.status(401).json({ error: "Unauthorized", reasonCode: "invalid_authorization_format" });
        return;
      }

      const token = parts[1].trim();

      const session = await Session.findById(token).exec();

      if (!session) {
        res.status(401).json({ error: "Unauthorized", reasonCode: "session_not_found" });
        return;
      }

      if (session.expiresAt && session.expiresAt <= new Date()) {
        await Session.deleteOne({ _id: token }).exec();
        res.status(401).json({ error: "Unauthorized", reasonCode: "session_expired" });
        return;
      }

      // Bump lastUsedAt without blocking the response.
      Session.updateOne({ _id: token }, { $set: { lastUsedAt: new Date() } }).exec().catch(() => {
        /* non-critical */
      });

      req.lumenUserId = session.userId;
      req.lumenSession = session;
      next();
    } catch (error) {
      next(error);
    }
  };
}