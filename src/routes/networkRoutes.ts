import express from 'express';
import { NetworkController } from '../controllers/networkController';

const router = express.Router();

/**
 * @openapi
 * /api/network/tcping:
 *   get:
 *     summary: TCP连接检测
 *     description: 检测目标地址的TCP端口是否可连接
 *     parameters:
 *       - in: query
 *         name: address
 *         required: true
 *         schema:
 *           type: string
 *         description: 目标地址
 *       - in: query
 *         name: port
 *         required: true
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 65535
 *         description: 端口号
 *     responses:
 *       200:
 *         description: 检测成功
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
 *                   description: 检测结果数据
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
router.get('/tcping', NetworkController.tcpPing);

/**
 * @openapi
 * /api/network/ping:
 *   get:
 *     summary: Ping检测
 *     description: 检测服务器的网络连接状况
 *     parameters:
 *       - in: query
 *         name: url
 *         required: true
 *         schema:
 *           type: string
 *         description: 目标URL
 *     responses:
 *       200:
 *         description: 检测成功
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
 *                   description: 检测结果数据
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
router.get('/ping', NetworkController.ping);

/**
 * @openapi
 * /api/network/speed:
 *   get:
 *     summary: 网站测速
 *     description: 检测网站的加载速度
 *     parameters:
 *       - in: query
 *         name: url
 *         required: true
 *         schema:
 *           type: string
 *         description: 目标URL
 *     responses:
 *       200:
 *         description: 测速成功
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
 *                   description: 测速结果数据
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
router.get('/speed', NetworkController.speedTest);

/**
 * @openapi
 * /api/network/portscan:
 *   get:
 *     summary: 端口扫描
 *     description: 扫描目标IP地址的开放端口
 *     parameters:
 *       - in: query
 *         name: address
 *         required: true
 *         schema:
 *           type: string
 *         description: 目标IP地址
 *     responses:
 *       200:
 *         description: 扫描成功
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
 *                   description: 扫描结果数据
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
router.get('/portscan', NetworkController.portScan);

export default router; 