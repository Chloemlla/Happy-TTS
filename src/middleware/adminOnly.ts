import type { NextFunction, Request, Response } from "express";

export function adminOnly(req: Request, res: Response, next: NextFunction) {
  try {
    const user = (req as any).user;
    if (!user || user.role !== "admin") {
      return res.status(403).json({ error: "需要管理员权限" });
    }
    next();
  } catch (_err) {
    return res.status(500).json({ error: "管理员权限校验失败" });
  }
}

export default adminOnly;
