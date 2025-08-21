import { Router } from 'express';
import { DebugConsoleController } from '../controllers/debugConsoleController';
import { authenticateToken } from '../middleware/authenticateToken';

const router = Router();

// 验证调试控制台访问（无需认证）
router.post('/verify', DebugConsoleController.verifyAccess);

// 管理员接口（需要认证）
router.get('/configs', authenticateToken, DebugConsoleController.getConfigs);
router.get('/configs/encrypted', authenticateToken, DebugConsoleController.getEncryptedConfigs);
router.put('/configs/:group', authenticateToken, DebugConsoleController.updateConfig);
router.delete('/configs/:group', authenticateToken, DebugConsoleController.deleteConfig);
router.get('/logs', authenticateToken, DebugConsoleController.getAccessLogs);
router.delete('/logs/all', authenticateToken, DebugConsoleController.deleteAllAccessLogs);
router.delete('/logs/filter', authenticateToken, DebugConsoleController.deleteAccessLogsByFilter);
router.delete('/logs', authenticateToken, DebugConsoleController.deleteAccessLogs);
router.delete('/logs/:logId', authenticateToken, DebugConsoleController.deleteAccessLog);
router.post('/init', authenticateToken, DebugConsoleController.initDefaultConfig);

export default router; 