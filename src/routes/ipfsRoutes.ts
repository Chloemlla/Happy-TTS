import express from 'express';
import multer from 'multer';
import { IPFSController } from '../controllers/ipfsController';
import mongoose from 'mongoose';

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
router.post('/upload', upload.single('file'), IPFSController.uploadImage);

// 短链跳转路由
router.get('/s/:code', async (req, res) => {
  const code = req.params.code;
  if (!code) return res.status(400).send('缺少短链码');
  const ShortUrlModel = mongoose.models.ShortUrl || mongoose.model('ShortUrl');
  const record = await ShortUrlModel.findOne({ code });
  if (!record) return res.status(404).send('短链不存在');
  res.redirect(record.target);
});

export default router; 