import express, { Router, Request } from 'express';
import { dataCollectionService } from '../services/dataCollectionService';
import logger from '../utils/logger';

const router = Router();

/**
 * @openapi
 * /collect_data:
 *   post:
 *     summary: 数据收集
 *     description: 支持多种 HTTP 方法的数据收集接口
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: 数据收集成功
 */
// 为该端点单独接管解析器：统一使用文本解析，后续尝试解析 JSON
router.use('/collect_data', express.text({ type: '*/*', limit: '5mb' }));

router.all('/collect_data', async (req, res) => {
  try {
    const now = new Date();
    let payload: any = {};

    try {
      if (typeof req.body === 'string') {
        const raw = req.body.trim();
        if (raw.length > 0) {
          try {
            payload = JSON.parse(raw);
          } catch {
            payload = { raw_data: raw };
          }
        }
      } else if (req.body && typeof req.body === 'object' && Object.keys(req.body).length > 0) {
        payload = req.body;
      }
    } catch {
      payload = { raw_data: String(req.body || '') };
    }

    const data = {
      userId: (req as any).user?.id || 'anonymous',
      action: (req.query.action as string) || 'collect_data',
      timestamp: now.toISOString(),
      details: {
        request_method: req.method,
        path: req.path,
        ip: req.ip || (req.socket?.remoteAddress) || 'unknown',
        headers: req.headers,
        query: req.query,
        payload: payload ?? {},
      },
    };

    // 记录收到的数据（仅显示前五行）
    const preview = JSON.stringify(data, null, 2).split('\n').slice(0, 5).join('\n');
    logger.info('收到的数据前五行:\n' + preview);

    // 选择存储方式：header 优先，其次 query，默认 both（Mongo 优先，失败回落文件）
    const pickMode = (val?: string) => {
      const v = (val || '').toLowerCase();
      return (v === 'mongo' || v === 'file' || v === 'both') ? v : undefined;
    };
    const mode = pickMode(req.headers['x-storage-mode'] as string) || pickMode(req.query.mode as string) || 'both';

    // 保存数据（支持 mongo | file | both）
    const result = await dataCollectionService.saveData(data, mode as any);

    // 返回成功响应，包含 id（如可用）
    return res.json({ status: 'success', id: result.id, savedTo: result.savedTo, message: `Data received via ${req.method} method.` });
  } catch (error) {
    logger.error('Error collecting data:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to process data'
    });
  }
});

export default router;