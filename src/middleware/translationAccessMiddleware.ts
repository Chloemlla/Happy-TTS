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
    return res.status(403).json({ error: "账户已被封停", code: "ACCOUNT_SUSPENDED", supportEmail: "support@chloemlla.com" });
  }

  if (user.isTranslationEnabled === false) {
    return res.status(403).json({ error: "翻译页面访问已被停用" });
  }

  // G1-23: 字段名读起来像"授权截止"，实际语义是"限制截止"——adminController 的
  // LIMIT_TRANSLATION 把它设为将来时间以禁用翻译，CLEAR_TRANSLATION_RESTRICTIONS 清空它。
  // 未来时间 = 仍在惩戒期内 = 拒绝，勿按字面名字反转判断。
  const restrictedUntil = toTimestamp(user.translationAccessUntil);
  if (restrictedUntil > Date.now()) {
    return res.status(403).json({ error: "翻译权限受限，请稍后再试" });
  }

  next();
};
