import express from 'express';
import { SmartHumanCheckController } from '../controllers/humanCheckController';
import { createLimiter } from '../middleware/rateLimiter';

const router = express.Router();

// 适度限流，防止滥用
const humanCheckLimiter = createLimiter({
  windowMs: 60 * 1000,
  max: 120,
  message: '请求过于频繁，请稍后再试'
});

// 发放 nonce（前端在渲染组件前获取）
router.get('/nonce', humanCheckLimiter, SmartHumanCheckController.issueNonce);

// 校验 token（前端提交验证结果）
router.post('/verify', humanCheckLimiter, SmartHumanCheckController.verifyToken);

export default router;
