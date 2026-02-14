/**
 * 推荐路由 - Recommendation Routes
 * 定义推荐相关的API端点
 * 
 * Requirements: 1.1, 1.3, 2.1
 */

import express from 'express';
import { RecommendationController } from '../controllers/recommendationController';
import { authenticateToken } from '../middleware/authenticateToken';
import { optionalAuthenticateToken } from '../middleware/optionalAuthenticateToken';
import { createLimiter } from '../middleware/rateLimiter';

const router = express.Router();

// 速率限制配置
const recommendationLimiter = createLimiter({
  windowMs: 60 * 1000, // 1分钟
  max: 30, // 每分钟最多30次请求
  message: '请求过于频繁，请稍后再试'
});

const analyzeLimiter = createLimiter({
  windowMs: 60 * 1000, // 1分钟
  max: 20, // 每分钟最多20次分析请求
  message: '分析请求过于频繁，请稍后再试'
});

/**
 * @openapi
 * /recommendations:
 *   get:
 *     summary: 获取个性化推荐
 *     description: 根据用户历史获取个性化语音风格推荐
 *     tags:
 *       - Recommendations
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 5
 *           minimum: 1
 *           maximum: 10
 *         description: 推荐数量限制
 *     responses:
 *       200:
 *         description: 推荐列表
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Recommendation'
 *                 count:
 *                   type: integer
 *       401:
 *         description: 未授权
 */
router.get('/', recommendationLimiter, authenticateToken, RecommendationController.getRecommendations);

/**
 * @openapi
 * /recommendations/popular:
 *   get:
 *     summary: 获取热门语音风格
 *     description: 获取社区热门的语音风格列表
 *     tags:
 *       - Recommendations
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 5
 *           minimum: 1
 *           maximum: 10
 *         description: 数量限制
 *     responses:
 *       200:
 *         description: 热门风格列表
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/VoiceStyle'
 *                 count:
 *                   type: integer
 */
router.get('/popular', recommendationLimiter, RecommendationController.getPopularStyles);

/**
 * @openapi
 * /recommendations/select:
 *   post:
 *     summary: 记录用户选择
 *     description: 记录用户选择的语音风格以改进推荐
 *     tags:
 *       - Recommendations
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - styleId
 *             properties:
 *               styleId:
 *                 type: string
 *                 description: 选择的语音风格ID
 *               textContent:
 *                 type: string
 *                 description: 相关文本内容
 *               voiceStyle:
 *                 $ref: '#/components/schemas/VoiceStyle'
 *     responses:
 *       200:
 *         description: 选择已记录
 *       400:
 *         description: 参数错误
 *       401:
 *         description: 未授权
 */
router.post('/select', recommendationLimiter, authenticateToken, RecommendationController.recordSelection);

/**
 * @openapi
 * /recommendations/analyze:
 *   post:
 *     summary: 分析文本内容
 *     description: 分析文本内容并提供语音参数建议
 *     tags:
 *       - Recommendations
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - text
 *             properties:
 *               text:
 *                 type: string
 *                 description: 要分析的文本内容
 *     responses:
 *       200:
 *         description: 内容分析结果
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/ContentSuggestion'
 *       400:
 *         description: 参数错误
 */
router.post('/analyze', analyzeLimiter, optionalAuthenticateToken, RecommendationController.analyzeContent);

/**
 * @openapi
 * /recommendations/apply:
 *   post:
 *     summary: 应用内容建议
 *     description: 将分析得到的建议应用到当前配置
 *     tags:
 *       - Recommendations
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - suggestion
 *             properties:
 *               suggestion:
 *                 $ref: '#/components/schemas/ContentSuggestion'
 *     responses:
 *       200:
 *         description: 建议已应用
 *       400:
 *         description: 参数错误
 *       401:
 *         description: 未授权
 */
router.post('/apply', recommendationLimiter, authenticateToken, RecommendationController.applySuggestion);

export default router;
