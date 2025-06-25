import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';

const router = Router();

/**
 * @openapi
 * /status:
 *   get:
 *     summary: 服务状态
 *     description: 检查服务是否正常
 *     responses:
 *       200:
 *         description: 服务正常
 */
router.get('/status', authMiddleware, (req, res) => {
  res.json({ status: 'ok' });
});

export default router; 