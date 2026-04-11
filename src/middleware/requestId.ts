import crypto from "node:crypto";
import type { NextFunction, Request, Response } from "express";

declare global {
  namespace Express {
    interface Request {
      requestId: string;
    }
  }
}

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction) {
  req.requestId = (req.headers["x-request-id"] as string) || crypto.randomUUID();
  res.setHeader("X-Request-Id", req.requestId);
  next();
}
