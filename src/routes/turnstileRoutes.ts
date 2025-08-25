import express from 'express';
import { TurnstileService } from '../services/turnstileService';
import { authenticateToken } from '../middleware/authenticateToken';

const router = express.Router();

/**
 * @openapi
 * /api/turnstile/config:
 *   get:
 *     summary: 获取Turnstile配置
 *     description: 获取当前Turnstile配置信息
 *     responses:
 *       200:
 *         description: Turnstile配置信息
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 enabled:
 *                   type: boolean
 *                   description: 是否启用
 *                 siteKey:
 *                   type: string
 *                   description: 站点密钥
 *                 secretKey:
 *                   type: string
 *                   description: 密钥（仅管理员可见）
 */
router.get('/config', async (req, res) => {
    try {
        const config = await TurnstileService.getConfig();
        
        // 非管理员用户不返回secretKey
        const userRole = (req as any).user?.role;
        const isAdmin = userRole === 'admin' || userRole === 'administrator';
        
        res.json({
            enabled: config.enabled,
            siteKey: config.siteKey,
            ...(isAdmin && { secretKey: config.secretKey })
        });
    } catch (error) {
        console.error('获取Turnstile配置失败:', error);
        res.status(500).json({
            error: '获取配置失败'
        });
    }
});

/**
 * @openapi
 * /api/turnstile/config:
 *   post:
 *     summary: 更新Turnstile配置
 *     description: 更新Turnstile配置（仅管理员）
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               key:
 *                 type: string
 *                 enum: [TURNSTILE_SECRET_KEY, TURNSTILE_SITE_KEY]
 *                 description: 配置键名
 *               value:
 *                 type: string
 *                 description: 配置值
 *     responses:
 *       200:
 *         description: 配置更新成功
 *       401:
 *         description: 未授权
 *       403:
 *         description: 权限不足
 */
router.post('/config', authenticateToken, async (req, res) => {
    try {
        // 检查管理员权限
        const userRole = (req as any).user?.role;
        if (userRole !== 'admin' && userRole !== 'administrator') {
            return res.status(403).json({
                error: '权限不足，仅管理员可操作'
            });
        }

        const { key, value } = req.body;

        if (!key || !value) {
            return res.status(400).json({
                error: '缺少必要参数'
            });
        }

        if (!['TURNSTILE_SECRET_KEY', 'TURNSTILE_SITE_KEY'].includes(key)) {
            return res.status(400).json({
                error: '无效的配置键名'
            });
        }

        const success = await TurnstileService.updateConfig(key, value);
        
        if (success) {
            res.json({
                success: true,
                message: '配置更新成功'
            });
        } else {
            res.status(500).json({
                error: '配置更新失败'
            });
        }
    } catch (error) {
        console.error('更新Turnstile配置失败:', error);
        res.status(500).json({
            error: '更新配置失败'
        });
    }
});

/**
 * @openapi
 * /api/turnstile/config/{key}:
 *   delete:
 *     summary: 删除Turnstile配置
 *     description: 删除指定的Turnstile配置（仅管理员）
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: key
 *         required: true
 *         schema:
 *           type: string
 *           enum: [TURNSTILE_SECRET_KEY, TURNSTILE_SITE_KEY]
 *         description: 配置键名
 *     responses:
 *       200:
 *         description: 配置删除成功
 *       401:
 *         description: 未授权
 *       403:
 *         description: 权限不足
 */
router.delete('/config/:key', authenticateToken, async (req, res) => {
    try {
        // 检查管理员权限
        const userRole = (req as any).user?.role;
        if (userRole !== 'admin' && userRole !== 'administrator') {
            return res.status(403).json({
                error: '权限不足，仅管理员可操作'
            });
        }

        const { key } = req.params;

        if (!['TURNSTILE_SECRET_KEY', 'TURNSTILE_SITE_KEY'].includes(key)) {
            return res.status(400).json({
                error: '无效的配置键名'
            });
        }

        const success = await TurnstileService.deleteConfig(key as 'TURNSTILE_SECRET_KEY' | 'TURNSTILE_SITE_KEY');
        
        if (success) {
            res.json({
                success: true,
                message: '配置删除成功'
            });
        } else {
            res.status(500).json({
                error: '配置删除失败'
            });
        }
    } catch (error) {
        console.error('删除Turnstile配置失败:', error);
        res.status(500).json({
            error: '删除配置失败'
        });
    }
});

export default router; 