import type { NextFunction, Request, Response } from "express";

function toTimestamp(value: unknown): number {
  if (typeof value !== "string" || !value.trim()) {
    return 0;
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export const translationAccessMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const user = req.user as any;
  if (!user) {
    return res.status(401).json({ error: "未认证" });
  }

  if (user.accountStatus === "suspended") {
    return res.status(403).json({ error: "账户已被封停" });
  }

  if (user.isTranslationEnabled === false) {
    return res.status(403).json({ error: "翻译页面访问已被停用" });
  }

  const accessUntil = toTimestamp(user.translationAccessUntil);
  if (accessUntil > Date.now()) {
    return res.status(403).json({ error: "翻译权限受限，请稍后再试" });
  }

  next();
};
