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

// 更严格的验证限流
const verifyLimiter = createLimiter({
  windowMs: 60 * 1000,
  max: 30,
  message: '验证请求过于频繁，请稍后再试'
});

// 添加 CORS 和安全头
router.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.header('Access-Control-Max-Age', '86400');

  // 安全头
  res.header('X-Content-Type-Options', 'nosniff');
  res.header('X-Frame-Options', 'DENY');
  res.header('X-XSS-Protection', '1; mode=block');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  next();
});

// 发放 nonce（前端在渲染组件前获取）
router.get('/nonce', humanCheckLimiter, SmartHumanCheckController.issueNonce);

// 校验 token（前端提交验证结果）
router.post('/verify', verifyLimiter, SmartHumanCheckController.verifyToken);

// 获取统计信息（管理端点，可能需要额外的认证）
router.get('/stats', humanCheckLimiter, SmartHumanCheckController.getStats);

export default router;
