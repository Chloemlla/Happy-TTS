import type { NextFunction, Request, Response } from "express";
import { profilingService } from "../services/profilingService";

const shouldSkipRequestProfiling = (req: Request): boolean => {
  if (!profilingService.isEnabled()) {
    return true;
  }

  const path = req.originalUrl || req.url || "";
  return path.startsWith("/static/") || path === "/favicon.ico";
};

export function requestProfilingMiddleware(req: Request, res: Response, next: NextFunction) {
  if (shouldSkipRequestProfiling(req)) {
    return next();
  }

  const startedAt = process.hrtime.bigint();
  res.on("finish", () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    const pathname = (() => {
      try {
        return new URL(req.originalUrl || req.url, "http://localhost").pathname;
      } catch {
        return req.path || req.url || "unknown";
      }
    })();

    profilingService.recordRequest({
      requestId: (req as any).requestId,
      method: req.method,
      path: pathname,
      statusCode: res.statusCode,
      durationMs: Math.round(durationMs * 100) / 100,
      contentLength: Number(res.getHeader("content-length") || 0) || undefined,
      timestamp: new Date().toISOString(),
    });
  });

  next();
}
