import { Router } from "express";
import { backendBuildInfo } from "../config/buildInfo";
import { adminOnly } from "../middleware/adminOnly";
import { apiKeyAuth } from "../middleware/apiKeyAuth";
import { authMiddlewareV2 as authMiddleware } from "../middleware/auth";
import { authenticateToken } from "../middleware/authenticateToken";
import { statusLimiter } from "../middleware/routeLimiters";
import { profilingService } from "../services/profilingService";

const router = Router();
const statusApiKeyAuth = apiKeyAuth("status", { required: false });

/**
 * @openapi
 * /status:
 *   get:
 *     summary: 服务状态（需要认证）
 *     description: 检查服务是否正常，需要用户认证
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 服务正常
 *       401:
 *         description: 未授权
 */
router.get("/status", statusLimiter, statusApiKeyAuth, authMiddleware, (_req, res) => {
  res.json({ status: "ok" });
});

/**
 * @openapi
 * /:
 *   get:
 *     summary: 服务状态（无需认证）
 *     description: 检查服务是否正常，无需认证
 *     responses:
 *       200:
 *         description: 服务正常
 */
router.get("/", statusLimiter, (_req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    service: "Synapse API",
    // 版本号取自仓库根 package.json，短 SHA 由镜像构建参数 GIT_SHA 固化（见 config/buildInfo.ts）。
    // 前端页脚每次刷新后查一次这里，展示的必须是当前真正在跑的后端，而不是前端构建时烤进去的那份。
    version: backendBuildInfo.version,
    shortSha: backendBuildInfo.shortSha,
  });
});

router.get("/profiling", statusLimiter, authenticateToken, adminOnly, (_req, res) => {
  res.json(profilingService.getSnapshot());
});

export default router;
