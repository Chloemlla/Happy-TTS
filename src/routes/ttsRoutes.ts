import express from 'express';
import { TtsController } from '../controllers/ttsController';

const router = express.Router();

/**
 * @openapi
 * /tts:
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
 *               output_format:
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
 *                 audioUrl:
 *                   type: string
 *                   description: 语音文件地址
 */
router.post('/', TtsController.generateSpeech);

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