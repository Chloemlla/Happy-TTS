import express from "express";
import { adminController } from "../../controllers/adminController";
import { authMiddlewareV2 as authMiddleware, isAdminRole } from "../../middleware/auth";
import { wsService } from "../../services/wsService";
import broadcastRouter from "./broadcast";
import configRouter from "./config";
import crashReportsRouter from "./crashReports";
import profileRouter from "./profile";
import registrationInvitesRouter from "./registrationInvites";
import shortlinksRouter from "./shortlinks";
import usersRouter from "./users";

const router = express.Router();

// 管理员权限检查中间件
const adminAuthMiddleware = (req: any, res: any, next: any) => {
  // 允许普通已登录用户访问的用户自助接口（在本路由前缀 /api/admin 下）
  // 注意：这里匹配的是路由内的路径（不含前缀），例如 '/user/profile'
  // 用前缀 startsWith 覆盖，避免新增自助端点时再次漏配
  const userSelfServicePrefixes = [
    "/user/profile",
    "/user/avatar",
    "/user/fingerprint",
  ];

  if (
    userSelfServicePrefixes.some((prefix) => req.path === prefix || req.path.startsWith(`${prefix}/`))
  ) {
    return next();
  }

  if (!req.user || !isAdminRole(req.user.role)) {
    return res.status(403).json({ error: "需要管理员权限" });
  }
  next();
};

// 公告读取接口移到最前面，不加任何中间件
router.get("/announcement", adminController.getAnnouncement);

// 其余路由依然加auth
router.use(authMiddleware);
router.use(adminAuthMiddleware);

// 在所有已认证/管理员路由上，若用户被标记为需要上报指纹，则通知前端（带去重 hash）
// 复用 authMiddleware 已加载的 req.user，避免每个请求多打一次数据库
router.use(async (req: any, res: any, next: any) => {
  try {
    const current = req.user;
    if (current && (current as any).requireFingerprint) {
      // 生成去重 hash，前端收到后通过 WS 回传确认，避免与 WS 推送双重触发
      const hash = wsService.notifyFingerprintRequired(current.id, true);
      res.setHeader("X-Require-Fingerprint", "1");
      res.setHeader("X-Fingerprint-Hash", hash);
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
router.use(crashReportsRouter);

// Bilibili Sync 管理（PiliPlus 配置数据）
router.get("/bilibili-sync", (req, res) => adminController.getBilibiliSyncRecords(req, res));
router.get("/bilibili-sync/:userId/search-records", (req, res) => adminController.getBilibiliSearchRecords(req, res));

export default router;
