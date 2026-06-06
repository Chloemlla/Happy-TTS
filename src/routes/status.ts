import { Router } from "express";
import { adminOnly } from "../middleware/adminOnly";
import { apiKeyAuth } from "../middleware/apiKeyAuth";
import { authMiddleware } from "../middleware/auth";
import { authenticateToken } from "../middleware/authenticateToken";
import { statusLimiter } from "../middleware/routeLimiters";
import { profilingService } from "../services/profilingService";

const router = Router();
const statusApiKeyAuth = apiKeyAuth("status");

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
    version: "1.0.0",
  });
});

router.get("/profiling", statusLimiter, authenticateToken, adminOnly, (_req, res) => {
  res.json(profilingService.getSnapshot());
});

export default router;
