import { Router } from 'express';
import { generateSpeech } from '../services/tts';
import { logger } from '../services/logger';
import { authMiddleware } from '../middleware/auth';
import { rateLimitMiddleware } from '../middleware/rateLimit';
import { ipCheckMiddleware } from '../middleware/ipCheck';

const router = Router();

/**
 * @openapi
 * /tts/generate:
 *   post:
 *     summary: 生成语音
 *     description: 生成语音文件，需登录、限流、IP校验
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
 *               customFileName:
 *                 type: string
 *                 description: 自定义文件名
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
 *                 filePath:
 *                   type: string
 *                   description: 语音文件路径
 */
router.post(
  '/generate',
  authMiddleware,
  rateLimitMiddleware,
  ipCheckMiddleware,
  async (req, res) => {
    try {
      const { text, model, voice, outputFormat, speed, customFileName } = req.body;

      if (!text || !model || !voice || !outputFormat) {
        return res.status(400).json({ error: '缺少必要参数' });
      }

      const filePath = await generateSpeech({
        text,
        model,
        voice,
        outputFormat,
        speed,
        customFileName,
      });

      logger.log('TTS generation successful', { text, model, voice, outputFormat, filePath });

      res.json({ success: true, filePath });
    } catch (error) {
      logger.error('TTS generation failed', error);
      res.status(500).json({ error: '生成语音时出现错误，请向站点管理员报告。' });
    }
  }
);

export default router; 