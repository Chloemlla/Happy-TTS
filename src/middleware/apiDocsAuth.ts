import type { NextFunction, Request, Response } from "express";
import { adminOnly } from "./adminOnly";
import { authenticateToken } from "./authenticateToken";

/**
 * Single gate shared by the API reference surface: the embedded Swagger UI in the
 * SPA and the raw spec at /api/openapi.json must never disagree on who may read
 * the endpoint inventory. Uses authenticateToken so the httpOnly session cookie
 * counts — plain browser navigation carries no Authorization header.
 */
export const apiDocsAuthGate = (req: Request, res: Response, next: NextFunction): void => {
  if (process.env.NODE_ENV !== "production") {
    next();
    return;
  }
  void authenticateToken(req, res, () => adminOnly(req, res, next));
};

export default apiDocsAuthGate;
