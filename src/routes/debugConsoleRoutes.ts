import { Router } from 'express';
import { DebugConsoleController } from '../controllers/debugConsoleController';
import { authenticateToken } from '../middleware/authenticateToken';
import { createLimiter } from '../middleware/rateLimiter';
import { logsLimiter, commandLimiter } from '../middleware/routeLimiters';

const router = Router();

// 针对调试控制台的限流器
const verifyLimiter = createLimiter({
  windowMs: 60 * 1000,
  max: 10,
  routeName: 'debugConsole.verify',
  message: '验证请求过于频繁，请稍后再试'
});

const adminLimiter = createLimiter({
  windowMs: 60 * 1000,
  max: 30,
  routeName: 'debugConsole.admin',
  message: '管理请求过于频繁，请稍后再试'
});

// 验证调试控制台访问（无需认证）
router.post('/verify', verifyLimiter, DebugConsoleController.verifyAccess);

// 管理员接口（需要认证）
router.get('/configs', authenticateToken, adminLimiter, commandLimiter, DebugConsoleController.getConfigs);
router.get('/configs/encrypted', authenticateToken, adminLimiter, commandLimiter, DebugConsoleController.getEncryptedConfigs);
router.put('/configs/:group', authenticateToken, adminLimiter, commandLimiter, DebugConsoleController.updateConfig);
router.delete('/configs/:group', authenticateToken, adminLimiter, commandLimiter, DebugConsoleController.deleteConfig);
router.post('/init', authenticateToken, adminLimiter, commandLimiter, DebugConsoleController.initDefaultConfig);

// 访问日志相关（需认证）
router.get('/logs', authenticateToken, adminLimiter, logsLimiter, DebugConsoleController.getAccessLogs);
router.delete('/logs/all', authenticateToken, adminLimiter, logsLimiter, DebugConsoleController.deleteAllAccessLogs);
router.delete('/logs/filter', authenticateToken, adminLimiter, logsLimiter, DebugConsoleController.deleteAccessLogsByFilter);
router.delete('/logs', authenticateToken, adminLimiter, logsLimiter, DebugConsoleController.deleteAccessLogs);
router.delete('/logs/:logId', authenticateToken, adminLimiter, logsLimiter, DebugConsoleController.deleteAccessLog);

export default router; 