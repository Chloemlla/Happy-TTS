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

/**
 * @openapi
 * /api/network/ipquery:
 *   get:
 *     summary: 精准IP查询
 *     description: 查询IP地址的精准地理位置信息，可定位到县级行政区
 *     parameters:
 *       - in: query
 *         name: ip
 *         required: true
 *         schema:
 *           type: string
 *           pattern: '^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$'
 *         description: 要查询的IP地址
 *     responses:
 *       200:
 *         description: 查询成功
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
 *                   description: IP地理位置信息
 *                   properties:
 *                     code:
 *                       type: integer
 *                       description: 响应状态码
 *                     msg:
 *                       type: string
 *                       description: 响应消息
 *                     data:
 *                       type: object
 *                       description: IP详细信息
 *                       properties:
 *                         ip:
 *                           type: string
 *                           description: IP地址
 *                         country:
 *                           type: string
 *                           description: 国家
 *                         country_code:
 *                           type: string
 *                           description: 国家代码
 *                         country_en:
 *                           type: string
 *                           description: 国家英文名
 *                         province:
 *                           type: string
 *                           description: 省份
 *                         city:
 *                           type: string
 *                           description: 城市
 *                         district:
 *                           type: string
 *                           description: 区县
 *                         address:
 *                           type: string
 *                           description: 完整地址
 *                         isp:
 *                           type: string
 *                           description: 运营商
 *                         latitude:
 *                           type: number
 *                           description: 纬度
 *                         longitude:
 *                           type: number
 *                           description: 经度
 *                         adcode:
 *                           type: string
 *                           description: 行政区划代码
 *                         continent:
 *                           type: string
 *                           description: 大洲
 *                     request_id:
 *                       type: string
 *                       description: 请求ID
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
router.get('/ipquery', NetworkController.ipQuery);

/**
 * @openapi
 * /api/network/yiyan:
 *   get:
 *     summary: 随机一言古诗词
 *     description: 获取随机的一言或古诗词，为应用提供灵感
 *     parameters:
 *       - in: query
 *         name: type
 *         required: true
 *         schema:
 *           type: string
 *           enum: [hitokoto, poetry]
 *         description: 返回类型 - hitokoto(一言) 或 poetry(古诗词)
 *     responses:
 *       200:
 *         description: 获取成功
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
 *                   description: 一言古诗词数据
 *                   properties:
 *                     code:
 *                       type: string
 *                       description: 响应状态码
 *                     data:
 *                       type: string
 *                       description: 一言或古诗词内容
 *                     msg:
 *                       type: string
 *                       description: 响应消息
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
router.get('/yiyan', NetworkController.randomQuote);

export default router; 