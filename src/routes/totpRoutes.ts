import { Router } from 'express';
import { TOTPController } from '../controllers/totpController';

const router = Router();

// 生成TOTP设置信息
router.post('/generate-setup', TOTPController.generateSetup);

// 验证并启用TOTP
router.post('/verify-and-enable', TOTPController.verifyAndEnable);

// 验证TOTP令牌
router.post('/verify-token', TOTPController.verifyToken);

// 禁用TOTP
router.post('/disable', TOTPController.disable);

// 获取TOTP状态
router.get('/status', TOTPController.getStatus);

// 获取备用恢复码
router.get('/backup-codes', TOTPController.getBackupCodes);

// 重新生成备用恢复码
router.post('/regenerate-backup-codes', TOTPController.regenerateBackupCodes);

export default router; 