import { Router } from 'express';
import { generateSpeech } from '../services/tts';
import { logger } from '../services/logger';
import { authMiddleware } from '../middleware/auth';
import { rateLimitMiddleware } from '../middleware/rateLimit';
import { ipCheckMiddleware } from '../middleware/ipCheck';

const router = Router();

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