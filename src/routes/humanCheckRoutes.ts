import express from 'express';
import rateLimit from 'express-rate-limit';
import { SmartHumanCheckController } from '../controllers/humanCheckController';
import { authenticateToken } from '../middleware/authenticateToken';

const router = express.Router();

// 适度限流，防止滥用（使用 express-rate-limit 以便静态分析识别）
const humanCheckLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: '请求过于频繁，请稍后再试',
  },
  keyGenerator: (req) => req.ip || req.socket.remoteAddress || 'unknown',
});

// 更严格的验证限流（使用 express-rate-limit 以便静态分析识别）
const verifyLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: '验证请求过于频繁，请稍后再试',
  },
  keyGenerator: (req) => req.ip || req.socket.remoteAddress || 'unknown',
});

// 显式的管理员端点限流（使用 express-rate-limit 以便静态分析识别）
const adminLimiter = rateLimit({
  windowMs: 60 * 1000, // 1分钟
  max: 60,             // 管理查询/删除操作 QPS 较低
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: '管理端请求过于频繁，请稍后再试',
  },
  keyGenerator: (req) => req.ip || req.socket.remoteAddress || 'unknown',
});

// 添加 CORS 和安全头
router.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
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

// 管理端：查询溯源记录（需要管理员权限）
router.get('/traces', adminLimiter, authenticateToken, SmartHumanCheckController.listTraces);
router.get('/trace/:id', adminLimiter, authenticateToken, SmartHumanCheckController.getTrace);

// 管理端：删除溯源记录（需要管理员权限）
router.delete('/traces', adminLimiter, authenticateToken, SmartHumanCheckController.deleteTraces);
router.delete('/trace/:id', adminLimiter, authenticateToken, SmartHumanCheckController.deleteTrace);

export default router;
