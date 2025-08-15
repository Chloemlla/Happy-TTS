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
// 为该端点单独接管解析器：先解析 JSON，再兜底文本
router.use('/collect_data', express.json({ strict: false, limit: '5mb' }));
router.use('/collect_data', express.text({
  // 仅在非 JSON 的情况下接管
  type: (req) => {
    const ct = req.headers['content-type'] || '';
    return typeof ct === 'string' ? !ct.includes('application/json') : true;
  },
  limit: '5mb',
}));

router.all('/collect_data', async (req, res) => {
  try {
    const now = new Date();
    let payload: any = undefined;
    try {
      if (req.body && typeof req.body === 'object' && Object.keys(req.body).length > 0) {
        payload = req.body;
      } else if (typeof req.body === 'string') {
        payload = { raw_data: req.body };
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

    // 记录收到的数据
    logger.info('收到的数据:', data);

    // 选择存储方式：header 优先，其次 query，默认 both（Mongo 优先，失败回落文件）
    const pickMode = (val?: string) => {
      const v = (val || '').toLowerCase();
      return (v === 'mongo' || v === 'file' || v === 'both') ? v : undefined;
    };
    const mode = pickMode(req.headers['x-storage-mode'] as string) || pickMode(req.query.mode as string) || 'both';

    // 保存数据（支持 mongo | file | both）
    const result = await dataCollectionService.saveData(data, mode as any);

    // 返回成功响应
    return res.json({ status: 'success', savedTo: result.savedTo, message: `Data received via ${req.method} method.` });
  } catch (error) {
    logger.error('Error collecting data:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to process data'
    });
  }
});

export default router;