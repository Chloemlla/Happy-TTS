import express from 'express';
import rateLimit from 'express-rate-limit';
import { imageDataController } from '../controllers/imageDataController';
import { authenticateToken } from '../middleware/authenticateToken';

const router = express.Router();

// 图片数据相关接口限速器
const imageDataLimiter = rateLimit({
  windowMs: 60 * 1000, // 1分钟
  max: 20, // 每个IP每分钟最多20次请求
  message: { error: '图片数据接口请求过于频繁，请稍后再试' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip || (req.socket?.remoteAddress) || 'unknown'
});

// 验证单个图片数据
router.post('/validate', imageDataLimiter, authenticateToken, imageDataController.validateImageData);

// 批量验证图片数据
router.post('/validate-batch', imageDataLimiter, authenticateToken, imageDataController.validateBatchImageData);

// 获取图片数据信息
router.get('/info/:imageId', imageDataLimiter, authenticateToken, imageDataController.getImageDataInfo);

// 记录图片数据到数据库
router.post('/record', imageDataLimiter, authenticateToken, imageDataController.recordImageData);

export default router; 