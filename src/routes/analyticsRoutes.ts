/**
 * 分析路由 - Analytics Routes
 * 定义使用分析相关的API端点
 * 
 * Requirements: 3.1, 3.2, 3.5
 */

import express from 'express';
import { AnalyticsController } from '../controllers/analyticsController';
import { authenticateToken } from '../middleware/authenticateToken';
import { createLimiter } from '../middleware/rateLimiter';

const router = express.Router();

// 速率限制配置
const analyticsLimiter = createLimiter({
  windowMs: 60 * 1000, // 1分钟
  max: 30, // 每分钟最多30次请求
  message: '请求过于频繁，请稍后再试'
});

const exportLimiter = createLimiter({
  windowMs: 60 * 1000, // 1分钟
  max: 5, // 每分钟最多5次导出请求
  message: '导出请求过于频繁，请稍后再试'
});

/**
 * @openapi
 * /analytics/statistics:
 *   get:
 *     summary: 获取使用统计
 *     description: 获取用户的使用统计数据，包括总生成次数、常用风格、高峰时间等
 *     tags:
 *       - Analytics
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 统计数据
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/UsageStatistics'
 *       401:
 *         description: 未授权
 */
router.get('/statistics', analyticsLimiter, authenticateToken, AnalyticsController.getStatistics);

/**
 * @openapi
 * /analytics/suggestions:
 *   get:
 *     summary: 获取优化建议
 *     description: 根据用户使用习惯生成优化建议
 *     tags:
 *       - Analytics
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 优化建议列表
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
 *                     $ref: '#/components/schemas/OptimizationSuggestion'
 *                 count:
 *                   type: integer
 *       401:
 *         description: 未授权
 */
router.get('/suggestions', analyticsLimiter, authenticateToken, AnalyticsController.getSuggestions);

/**
 * @openapi
 * /analytics/patterns:
 *   get:
 *     summary: 检测重复模式
 *     description: 检测用户的重复使用模式，用于建议创建模板
 *     tags:
 *       - Analytics
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 检测到的模式列表
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
 *                     $ref: '#/components/schemas/PatternDetection'
 *                 count:
 *                   type: integer
 *       401:
 *         description: 未授权
 */
router.get('/patterns', analyticsLimiter, authenticateToken, AnalyticsController.getPatterns);

/**
 * @openapi
 * /analytics/export:
 *   get:
 *     summary: 导出分析数据
 *     description: 导出用户的分析数据，支持JSON和CSV格式
 *     tags:
 *       - Analytics
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: format
 *         schema:
 *           type: string
 *           enum: [json, csv]
 *           default: json
 *         description: 导出格式
 *     responses:
 *       200:
 *         description: 导出的数据文件
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AnalyticsExport'
 *           text/csv:
 *             schema:
 *               type: string
 *       401:
 *         description: 未授权
 */
router.get('/export', exportLimiter, authenticateToken, AnalyticsController.exportData);

/**
 * @openapi
 * /analytics/import:
 *   post:
 *     summary: 导入分析数据
 *     description: 导入之前导出的分析数据（用于数据恢复或迁移）
 *     tags:
 *       - Analytics
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - data
 *             properties:
 *               data:
 *                 type: string
 *                 description: 导出的数据字符串
 *               format:
 *                 type: string
 *                 enum: [json, csv]
 *                 default: json
 *                 description: 数据格式
 *     responses:
 *       200:
 *         description: 导入成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     userId:
 *                       type: string
 *                     exportDate:
 *                       type: string
 *                     recordCount:
 *                       type: integer
 *       400:
 *         description: 数据格式无效
 *       401:
 *         description: 未授权
 */
router.post('/import', analyticsLimiter, authenticateToken, AnalyticsController.importData);

export default router;
