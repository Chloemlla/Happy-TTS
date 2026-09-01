import type { NextFunction, Request, Response } from "express";
import { adminOnly } from "./adminOnly";
import { authenticateToken } from "./authenticateToken";

const LOOPBACK_ADDRESSES = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

/**
 * G1-31: 只有回环调用方才免鉴权。用 socket.remoteAddress 而不是 getClientIP，
 * 因为后者信任 X-Forwarded-For，任何远端都能伪造成 127.0.0.1。
 */
const isLoopbackCaller = (req: Request): boolean => {
  const remote = req.socket?.remoteAddress;
  return Boolean(remote && LOOPBACK_ADDRESSES.has(remote));
};

/**
 * Single gate shared by the API reference surface: the embedded Swagger UI in the
 * SPA and the raw spec at /api/openapi.json must never disagree on who may read
 * the endpoint inventory. Uses authenticateToken so the httpOnly session cookie
 * counts — plain browser navigation carries no Authorization header.
 */
export const apiDocsAuthGate = (req: Request, res: Response, next: NextFunction): void => {
  // 非生产环境曾经完全放行，于是任何绑到 0.0.0.0 的 dev/staging 实例都把完整
  // 端点清单交给同网段。现在需要 API_DOCS_PUBLIC=true 显式开，或来自本机。
  const nonProductionBypass =
    process.env.NODE_ENV !== "production" && (process.env.API_DOCS_PUBLIC === "true" || isLoopbackCaller(req));
  if (nonProductionBypass) {
    next();
    return;
  }
  void authenticateToken(req, res, () => adminOnly(req, res, next));
};

export default apiDocsAuthGate;
