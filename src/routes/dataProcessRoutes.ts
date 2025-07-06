import express from 'express';
import { DataProcessController } from '../controllers/dataProcessController';

const router = express.Router();

/**
 * @openapi
 * /api/data/base64/encode:
 *   get:
 *     summary: Base64编码
 *     description: 对文本进行Base64编码操作
 *     parameters:
 *       - in: query
 *         name: text
 *         required: true
 *         schema:
 *           type: string
 *           maxLength: 10000
 *         description: 要编码的文本
 *     responses:
 *       200:
 *         description: 编码成功
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
 *                   description: 编码结果数据
 *       400:
 *         description: 参数错误
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
router.get('/base64/encode', DataProcessController.base64Encode);

/**
 * @openapi
 * /api/data/base64/decode:
 *   get:
 *     summary: Base64解码
 *     description: 对Base64编码的文本进行解码操作
 *     parameters:
 *       - in: query
 *         name: text
 *         required: true
 *         schema:
 *           type: string
 *           maxLength: 10000
 *         description: 要解码的Base64文本
 *     responses:
 *       200:
 *         description: 解码成功
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
 *                   description: 解码结果数据
 *       400:
 *         description: 参数错误
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
router.get('/base64/decode', DataProcessController.base64Decode);

/**
 * @openapi
 * /api/data/md5:
 *   get:
 *     summary: MD5哈希加密
 *     description: 对字符串进行MD5哈希加密
 *     parameters:
 *       - in: query
 *         name: text
 *         required: true
 *         schema:
 *           type: string
 *           maxLength: 10000
 *         description: 要加密的文本
 *     responses:
 *       200:
 *         description: 加密成功
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
 *                   description: 加密结果数据
 *       400:
 *         description: 参数错误
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
router.get('/md5', DataProcessController.md5Hash);

export default router; 