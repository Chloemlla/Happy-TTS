import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { TOTPController } from '../controllers/totpController';
import { authenticateToken } from '../middleware/authenticateToken';
import { config } from '../config/config';

const router = Router();

// TOTP路由限流器
const totpLimiter = rateLimit({
    windowMs: 60 * 1000, // 1分钟
    max: 15, // 限制每个IP每分钟15次请求
    message: { error: 'TOTP操作过于频繁，请稍后再试' },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
        const ip = req.ip || req.socket.remoteAddress || 'unknown';
        return ip;
    },
    skip: (req) => {
        // 跳过本地IP的限制
        const ip = req.ip || req.socket.remoteAddress || 'unknown';
        return config.localIps.includes(ip);
    }
});

/**
 * @openapi
 * /totp/generate-setup:
 *   post:
 *     summary: 生成TOTP设置信息
 *     responses:
 *       200:
 *         description: 生成TOTP设置信息
 */
router.post('/generate-setup', authenticateToken, totpLimiter, TOTPController.generateSetup);

/**
 * @openapi
 * /totp/verify-and-enable:
 *   post:
 *     summary: 验证并启用TOTP
 *     responses:
 *       200:
 *         description: 验证并启用TOTP
 */
router.post('/verify-and-enable', authenticateToken, totpLimiter, TOTPController.verifyAndEnable);

/**
 * @openapi
 * /totp/verify-token:
 *   post:
 *     summary: 验证TOTP令牌
 *     responses:
 *       200:
 *         description: 验证TOTP令牌
 */
router.post('/verify-token', authenticateToken, totpLimiter, TOTPController.verifyToken);

/**
 * @openapi
 * /totp/disable:
 *   post:
 *     summary: 禁用TOTP
 *     responses:
 *       200:
 *         description: 禁用TOTP
 */
router.post('/disable', authenticateToken, totpLimiter, TOTPController.disable);

/**
 * @openapi
 * /totp/status:
 *   get:
 *     summary: 获取TOTP状态
 *     responses:
 *       200:
 *         description: 获取TOTP状态
 */
router.get('/status', authenticateToken, totpLimiter, TOTPController.getStatus);

/**
 * @openapi
 * /totp/backup-codes:
 *   get:
 *     summary: 获取备用恢复码
 *     responses:
 *       200:
 *         description: 获取备用恢复码
 */
router.get('/backup-codes', authenticateToken, totpLimiter, TOTPController.getBackupCodes);

/**
 * @openapi
 * /totp/regenerate-backup-codes:
 *   post:
 *     summary: 重新生成备用恢复码
 *     responses:
 *       200:
 *         description: 重新生成备用恢复码
 */
router.post('/regenerate-backup-codes', authenticateToken, totpLimiter, TOTPController.regenerateBackupCodes);

export default router; 