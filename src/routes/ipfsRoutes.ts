import express from 'express';
import multer from 'multer';
import { IPFSController } from '../controllers/ipfsController';
import mongoose from 'mongoose';
import logger from '../utils/logger';
import { connectMongo } from '../services/mongoService';
import rateLimit from 'express-rate-limit';
import { authenticateAdmin } from '../middleware/auth';

const router = express.Router();

// 配置multer中间件用于文件上传
const upload = multer({
    storage: multer.memoryStorage(), // 将文件存储在内存中
    limits: {
        fileSize: 5 * 1024 * 1024, // 限制文件大小为5MB
        files: 1 // 只允许上传一个文件
    },
    fileFilter: (req, file, cb) => {
        // 只允许图片文件
        const allowedMimeTypes = [
            'image/jpeg',
            'image/jpg',
            'image/png',
            'image/gif',
            'image/webp',
            'image/bmp',
            'image/svg+xml'
        ];

        if (allowedMimeTypes.includes(file.mimetype.toLowerCase())) {
            cb(null, true);
        } else {
            cb(new Error('只支持图片文件格式：JPEG, PNG, GIF, WebP, BMP, SVG'));
        }
    }
});

// 图片上传限速：每IP每分钟最多10次
const uploadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { error: '上传过于频繁，请稍后再试' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip || (req.socket?.remoteAddress) || 'unknown',
});

// 短链跳转限速：每IP每分钟最多60次
const shortlinkLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: { error: '访问过于频繁，请稍后再试' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip || (req.socket?.remoteAddress) || 'unknown',
});

/**
 * @openapi
 * /api/ipfs/upload:
 *   post:
 *     summary: 上传图片到IPFS
 *     description: 将图片文件上传到IPFS网络，返回可访问的URL
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: 要上传的图片文件
 *     responses:
 *       200:
 *         description: 上传成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   description: 是否成功
 *                 message:
 *                   type: string
 *                   description: 成功消息
 *                 data:
 *                   type: object
 *                   properties:
 *                     cid:
 *                       type: string
 *                       description: IPFS内容标识符
 *                     url:
 *                       type: string
 *                       description: IPFS协议URL
 *                     web2url:
 *                       type: string
 *                       description: 可直接访问的HTTP URL
 *                     fileSize:
 *                       type: string
 *                       description: 文件大小
 *                     filename:
 *                       type: string
 *                       description: 原始文件名
 *       400:
 *         description: 请求错误
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   description: 错误信息
 *       500:
 *         description: 服务器错误
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   description: 是否成功
 *                 error:
 *                   type: string
 *                   description: 错误信息
 */
router.post('/upload', uploadLimiter, upload.single('file'), IPFSController.uploadImage);

/**
 * @openapi
 * /api/ipfs/settings:
 *   get:
 *     summary: 获取IPFS配置
 *     description: 获取当前IPFS上传URL配置
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 获取配置成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   description: 是否成功
 *                 data:
 *                   type: object
 *                   properties:
 *                     ipfsUploadUrl:
 *                       type: string
 *                       description: IPFS上传URL
 *       401:
 *         description: 未授权
 *       500:
 *         description: 服务器错误
 */
router.get('/settings', authenticateAdmin, IPFSController.getConfig);

/**
 * @openapi
 * /api/ipfs/settings:
 *   post:
 *     summary: 设置IPFS配置
 *     description: 设置IPFS上传URL配置
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               ipfsUploadUrl:
 *                 type: string
 *                 description: IPFS上传URL
 *                 example: "https://ipfs-webui.hapxs.com/api/v0/add"
 *     responses:
 *       200:
 *         description: 设置配置成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   description: 是否成功
 *                 message:
 *                   type: string
 *                   description: 成功消息
 *       400:
 *         description: 请求错误
 *       401:
 *         description: 未授权
 *       500:
 *         description: 服务器错误
 */
router.post('/settings', authenticateAdmin, IPFSController.setConfig);

/**
 * @openapi
 * /api/ipfs/settings/test:
 *   post:
 *     summary: 测试IPFS配置
 *     description: 测试当前IPFS配置是否有效
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 测试结果
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   description: 是否成功
 *                 message:
 *                   type: string
 *                   description: 测试结果消息
 *       401:
 *         description: 未授权
 *       500:
 *         description: 服务器错误
 */
router.post('/settings/test', authenticateAdmin, IPFSController.testConfig);

// 短链跳转路由 - 必须放在最后，避免与其他路由冲突
router.get('/:code', shortlinkLimiter, async (req, res) => {
  const code = req.params.code;
  const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
  if (!code) {
    logger.warn('[ShortLink] 缺少短链码', { ip, code });
    return res.status(400).send('缺少短链码');
  }
  try {
    // 强制确保数据库已连接
    logger.info('[ShortLink] 检查数据库连接状态', { readyState: mongoose.connection.readyState });
    if (mongoose.connection.readyState !== 1) {
      logger.warn('[ShortLink] 数据库未连接，尝试重连...');
      await connectMongo();
      logger.info('[ShortLink] 数据库重连完成', { readyState: mongoose.connection.readyState });
    }
    const ShortUrlModel = mongoose.models.ShortUrl || mongoose.model('ShortUrl');
    logger.info('[ShortLink] 查询短链', { code, model: ShortUrlModel.modelName });
    const record = await ShortUrlModel.findOne({ code });
    logger.info('[ShortLink] 查询结果', { code, record });
    if (!record) {
      logger.warn('[ShortLink] 短链不存在', { ip, code });
      return res.status(404).send('短链不存在');
    }
    logger.info('[ShortLink] 短链跳转', { ip, code, target: record.target });
    res.redirect(301, record.target); // 永久重定向
  } catch (err) {
    logger.error('[ShortLink] 短链跳转异常', { ip, code, error: err });
    res.status(500).send('短链跳转异常');
  }
});

export default router; 