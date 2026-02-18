import { Router } from "express";
import { authMiddleware } from "../middleware/auth";

const router = Router();

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
router.get("/status", authMiddleware, (_req, res) => {
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
router.get("/", (_req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    service: "Happy-TTS API",
    version: "1.0.0",
  });
});

export default router;
