import express from "express";
import { AntaController } from "../controllers/antaController";

const router = express.Router();

/**
 * @openapi
 * /api/anta/query:
 *   post:
 *     summary: 查询安踏产品信息
 *     description: 通过产品参数查询安踏产品的详细信息，包括条码、性别、品名、系列、货号、EAN码、尺码、零售价等
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - barcode
 *             properties:
 *               barcode:
 *                 type: string
 *                 description: 产品条码（必填）
 *               itemNumber:
 *                 type: string
 *                 description: 货号（选填）
 *               ean:
 *                 type: string
 *                 description: EAN码（选填）
 *               size:
 *                 type: string
 *                 description: 尺码（选填）
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
 *                 data:
 *                   type: object
 *                   properties:
 *                     barcode:
 *                       type: string
 *                       description: 条码
 *                     gender:
 *                       type: string
 *                       description: 性别
 *                     productName:
 *                       type: string
 *                       description: 品名
 *                     series:
 *                       type: string
 *                       description: 系列
 *                     itemNumber:
 *                       type: string
 *                       description: 货号
 *                     ean:
 *                       type: string
 *                       description: EAN码
 *                     size:
 *                       type: string
 *                       description: 尺码
 *                     retailPrice:
 *                       type: number
 *                       description: 零售价
 *                     queryCount:
 *                       type: number
 *                       description: 查询次数
 *       400:
 *         description: 请求参数错误
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: string
 *                   description: 错误信息
 *       404:
 *         description: 产品未找到
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: string
 *                   description: 错误信息
 *       500:
 *         description: 服务器内部错误
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: string
 *                   description: 错误信息
 */
// 新的POST路由用于查询产品
router.post("/query", AntaController.queryProduct);

// 保留旧的GET路由以兼容现有代码
router.get("/query/:productId", AntaController.queryProductLegacy);

/**
 * @openapi
 * /api/anta/stats/{productId}:
 *   get:
 *     summary: 获取某产品的查询统计
 *     parameters:
 *       - in: path
 *         name: productId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: 成功
 */
router.get("/stats/:productId", AntaController.getProductStats);

/**
 * @openapi
 * /api/anta/stats/top:
 *   get:
 *     summary: 获取查询次数最多的产品
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *     responses:
 *       200:
 *         description: 成功
 */
router.get("/stats/top", AntaController.getTopStats);

/**
 * @openapi
 * /api/anta/history:
 *   get:
 *     summary: 获取最近查询历史
 *     parameters:
 *       - in: query
 *         name: productId
 *         schema:
 *           type: string
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *     responses:
 *       200:
 *         description: 成功
 */
router.get("/history", AntaController.getRecentHistory);

export default router;
