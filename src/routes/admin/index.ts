import express from "express";
import { adminController } from "../../controllers/adminController";
import { authMiddlewareV2 as authMiddleware } from "../../middleware/auth";
import { UserStorage } from "../../utils/userStorage";
import broadcastRouter from "./broadcast";
import configRouter from "./config";
import profileRouter from "./profile";
import registrationInvitesRouter from "./registrationInvites";
import shortlinksRouter from "./shortlinks";
import usersRouter from "./users";
import { adminLimiter } from "../../middleware/routeLimiters";

const router = express.Router();

// 管理员权限检查中间件
const adminAuthMiddleware = (req: any, res: any, next: any) => {
  // 允许普通已登录用户访问的用户自助接口（在本路由前缀 /api/admin 下）
  // 注意：这里匹配的是路由内的路径（不含前缀），例如 '/user/profile'
  const userSelfServicePaths = new Set<string>([
    "/user/profile",
    "/user/profile/verify",
    "/user/profile/email/send-code",
    "/user/avatar",
    "/user/avatar/exist",
    "/user/fingerprint",
  ]);

  if (
    userSelfServicePaths.has(req.path) ||
    req.path.startsWith("/user/profile/linked-accounts") ||
    req.path.startsWith("/user/profile/account-merge")
  ) {
    return next();
  }

  if (!req.user || req.user.role !== "admin") {
    return res.status(403).json({ error: "需要管理员权限" });
  }
  next();
};

// 启动时清理用户表的 avatarBase64 字段
(async () => {
  try {
    const users = await UserStorage.getAllUsers();
    for (const user of users) {
      if ((user as any).avatarBase64) {
        await UserStorage.updateUser(user.id, { avatarBase64: undefined } as any);
      }
    }
  } catch (e) {
    console.warn("启动时清理avatarBase64字段失败", e);
  }
})();

// 公告读取接口移到最前面，不加任何中间件
router.get("/announcement", adminController.getAnnouncement);

// 其余路由依然加auth
router.use(authMiddleware);
router.use(adminAuthMiddleware);
router.use(adminLimiter); // 已登录管理员不再限速

// 在所有已认证/管理员路由上，若用户被标记为需要上报指纹，则通知前端（带去重 hash）
router.use(async (req: any, res: any, next: any) => {
  try {
    if (req.user?.id) {
      const { getUserById } = require("../../services/userService");
      const current = await getUserById(req.user.id);
      if (current && (current as any).requireFingerprint) {
        // 生成去重 hash，前端收到后通过 WS 回传确认，避免与 WS 推送双重触发
        const { wsService } = require("../../services/wsService");
        const hash = wsService.notifyFingerprintRequired(req.user.id, true);
        res.setHeader("X-Require-Fingerprint", "1");
        res.setHeader("X-Fingerprint-Hash", hash);
      }
    }
  } catch (_e) {
    // 静默失败，不影响主流程
  }
  next();
});

// 子路由挂载（按业务领域拆分）
router.use(usersRouter);
router.use(configRouter);
router.use(shortlinksRouter);
router.use(profileRouter);
router.use(broadcastRouter);
router.use(registrationInvitesRouter);

export default router;
