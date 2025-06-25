import { Router } from 'express';
import { tamperService } from '../services/tamperService';
import logger from '../utils/logger';

const router = Router();

/**
 * @openapi
 * /report-tampering:
 *   post:
 *     summary: 上报篡改事件
 *     description: 上报客户端检测到的篡改事件
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: 篡改报告已记录
 */
router.post('/report-tampering', async (req, res) => {
  try {
    const tamperEvent = {
      ...req.body,
      ip: req.ip || req.connection.remoteAddress || 'unknown',
      userAgent: req.headers['user-agent']
    };

    await tamperService.recordTamperEvent(tamperEvent);

    // 检查是否需要立即返回封禁响应
    if (tamperService.isIPBlocked(tamperEvent.ip)) {
      const details = tamperService.getBlockDetails(tamperEvent.ip);
      return res.status(403).json({
        error: '您的访问已被临时封禁',
        reason: details?.reason,
        expiresAt: details?.expiresAt
      });
    }

    res.status(200).json({ message: '篡改报告已记录' });
  } catch (error) {
    logger.error('Error handling tamper report:', error);
    res.status(500).json({ error: '内部服务器错误' });
  }
});

export default router; 