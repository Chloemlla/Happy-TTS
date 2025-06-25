import { Router, Request } from 'express';
import { dataCollectionService } from '../services/dataCollectionService';
import { logger } from '../services/logger';

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
router.all('/collect_data', async (req, res) => {
  try {
    let data: any;

    // 根据请求类型获取数据
    if (req.body && Object.keys(req.body).length > 0) {
      // JSON 或表单数据
      data = req.body;
    } else {
      // 原始数据
      const rawData = req.body.toString();
      data = { raw_data: rawData };
    }

    // 添加请求方法信息
    data.request_method = req.method;
    
    // 记录收到的数据
    logger.log('收到的数据:', data);

    // 保存数据
    await dataCollectionService.saveData(data);

    // 返回成功响应
    return res.json({
      status: 'success',
      message: `Data received via ${req.method} method.`
    });
  } catch (error) {
    logger.error('Error collecting data:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to process data'
    });
  }
});

export default router; 