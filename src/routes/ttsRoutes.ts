import express from 'express';
import { TtsController } from '../controllers/ttsController';
import { TurnstileService } from '../services/turnstileService';
import { ClarityService } from '../services/clarityService';
import { config } from '../config/config';

const router = express.Router();

/**
 * @openapi
 * /api/tts/generate:
 *   post:
 *     summary: 生成语音
 *     description: 提交文本生成语音
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               text:
 *                 type: string
 *                 description: 文本内容
 *               model:
 *                 type: string
 *                 description: 语音模型
 *               voice:
 *                 type: string
 *                 description: 发音人
 *               outputFormat:
 *                 type: string
 *                 description: 输出格式
 *               speed:
 *                 type: number
 *                 description: 语速
 *     responses:
 *       200:
 *         description: 语音生成成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   description: 是否成功
 *                 audioUrl:
 *                   type: string
 *                   description: 语音文件地址
 *                 signature:
 *                   type: string
 *                   description: 签名
 */
router.post('/generate', TtsController.generateSpeech);

/**
 * @openapi
 * /tts/turnstile/config:
 *   get:
 *     summary: 获取 Turnstile 配置
 *     description: 获取 Turnstile 配置
 *     responses:
 *       200:
 *         description: Turnstile 配置
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 enabled:
 *                   type: boolean
 *                 siteKey:
 *                   type: string
 *                   description: Turnstile 站点密钥
 */
router.get('/turnstile/config', async (req, res) => {
    try {
        const turnstileConfig = await TurnstileService.getConfig();

        console.log('Turnstile config response:', {
            enabled: turnstileConfig.enabled,
            siteKey: turnstileConfig.siteKey,
            siteKeyType: typeof turnstileConfig.siteKey
        });

        res.json({
            enabled: turnstileConfig.enabled,
            siteKey: turnstileConfig.siteKey
        });
    } catch (error) {
        console.error('获取Turnstile配置失败:', error);
        res.status(500).json({
            enabled: false,
            siteKey: null,
            error: '获取配置失败'
        });
    }
});

/**
 * @openapi
 * /tts/clarity/config:
 *   get:
 *     summary: 获取 Clarity 配置
 *     description: 获取 Microsoft Clarity 配置
 *     responses:
 *       200:
 *         description: Clarity 配置
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 enabled:
 *                   type: boolean
 *                 projectId:
 *                   type: string
 *                   description: Clarity 项目ID
 */
router.get('/clarity/config', async (req, res) => {
    try {
        const clarityConfig = await ClarityService.getConfig();

        console.log('Clarity config response:', {
            enabled: clarityConfig.enabled,
            projectId: clarityConfig.projectId,
            projectIdType: typeof clarityConfig.projectId
        });

        res.json({
            enabled: clarityConfig.enabled,
            projectId: clarityConfig.projectId
        });
    } catch (error) {
        console.error('获取Clarity配置失败:', error);
        res.status(500).json({
            enabled: false,
            projectId: null,
            error: '获取配置失败'
        });
    }
});

/**
 * @openapi
 * /tts/clarity/config:
 *   post:
 *     summary: 更新 Clarity 配置
 *     description: 更新 Microsoft Clarity 项目ID配置
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               projectId:
 *                 type: string
 *                 description: Clarity 项目ID
 *     responses:
 *       200:
 *         description: 配置更新成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 */
router.post('/clarity/config', async (req, res) => {
    try {
        const { projectId } = req.body;

        if (!projectId || typeof projectId !== 'string') {
            return res.status(400).json({
                success: false,
                error: '项目ID不能为空'
            });
        }

        const success = await ClarityService.updateConfig(projectId);

        if (success) {
            res.json({
                success: true,
                message: 'Clarity配置更新成功'
            });
        } else {
            res.status(500).json({
                success: false,
                error: '配置更新失败'
            });
        }
    } catch (error) {
        console.error('更新Clarity配置失败:', error);
        res.status(500).json({
            success: false,
            error: '配置更新失败'
        });
    }
});

/**
 * @openapi
 * /tts/clarity/config:
 *   delete:
 *     summary: 删除 Clarity 配置
 *     description: 删除 Microsoft Clarity 项目ID配置
 *     responses:
 *       200:
 *         description: 配置删除成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 */
router.delete('/clarity/config', async (req, res) => {
    try {
        const success = await ClarityService.deleteConfig();

        if (success) {
            res.json({
                success: true,
                message: 'Clarity配置删除成功'
            });
        } else {
            res.status(500).json({
                success: false,
                error: '配置删除失败'
            });
        }
    } catch (error) {
        console.error('删除Clarity配置失败:', error);
        res.status(500).json({
            success: false,
            error: '配置删除失败'
        });
    }
});

/**
 * @openapi
 * /tts/history:
 *   get:
 *     summary: 获取最近生成记录
 *     description: 获取最近生成的语音记录
 *     responses:
 *       200:
 *         description: 生成记录列表
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 records:
 *                   type: array
 *                   description: 生成记录列表
 */
router.get('/history', TtsController.getRecentGenerations);

export default router; 