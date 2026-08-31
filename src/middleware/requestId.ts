import crypto from "node:crypto";
import type { NextFunction, Request, Response } from "express";

declare global {
  namespace Express {
    interface Request {
      requestId: string;
    }
  }
}

// G1-15: 客户端可控的 x-request-id 直接进日志/审计/性能采样，需校验格式与长度，
// 避免日志注入（换行/控制字符）与超长值拖垮下游存储。
const REQUEST_ID_PATTERN = /^[A-Za-z0-9._~-]{1,128}$/;

function sanitizeRequestId(value: string): string | null {
  if (!REQUEST_ID_PATTERN.test(value)) return null;
  return value;
}

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction) {
  const header = req.headers["x-request-id"];
  const raw = Array.isArray(header) ? header[0] : header;
  const provided = typeof raw === "string" ? sanitizeRequestId(raw.trim()) : null;
  req.requestId = provided || crypto.randomUUID();
  res.setHeader("X-Request-Id", req.requestId);
  next();
}
