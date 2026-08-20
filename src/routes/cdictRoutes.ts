import express from "express";
import { CDictController } from "../controllers/cdictController";
import { CDictDonationController } from "../controllers/cdictDonationController";

const router = express.Router();

/**
 * @openapi
 * /api/cdict/translate:
 *   post:
 *     tags:
 *       - CDict
 *     summary: CDict 文本翻译代理
 *     description: 供 CDict 客户端使用的文本翻译接口，服务端代持上游凭据与签名。
 *     requestBody:
 *       required: true
 *       content:
 *         application/x-www-form-urlencoded:
 *           schema:
 *             type: object
 *             required:
 *               - text
 *               - to
 *             properties:
 *               text:
 *                 type: string
 *                 description: 待翻译文本，多行用 \n 分隔
 *               from:
 *                 type: string
 *                 default: auto
 *               to:
 *                 type: string
 *                 example: zh-CHS
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - text
 *               - to
 *             properties:
 *               text:
 *                 type: string
 *               from:
 *                 type: string
 *               to:
 *                 type: string
 *     responses:
 *       200:
 *         description: 翻译结果（retcode/code/data 结构与上游一致）
 *       400:
 *         description: 参数不合法
 *       413:
 *         description: 文本超长
 *       502:
 *         description: 上游翻译失败
 */
router.post("/translate", CDictController.translate);

/**
 * @openapi
 * /api/cdict/languages:
 *   get:
 *     tags:
 *       - CDict
 *     summary: CDict 支持语言列表
 *     responses:
 *       200:
 *         description: 语言集合
 *       502:
 *         description: 上游语言列表失败
 */
router.get("/languages", CDictController.languages);

/**
 * @openapi
 * /api/cdict/tts:
 *   get:
 *     tags:
 *       - CDict
 *     summary: CDict 单词朗读代理
 *     description: source=engine 走在线合成引擎，source=youdao 走词典静态音频；成功返回音频字节。
 *     parameters:
 *       - in: query
 *         name: text
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: source
 *         schema:
 *           type: string
 *           enum: [engine, youdao]
 *           default: engine
 *       - in: query
 *         name: langType
 *         description: source=engine 时的音色语言
 *         schema:
 *           type: string
 *           default: en-USA
 *       - in: query
 *         name: type
 *         description: source=youdao 时的音色，1 英式 / 2 美式
 *         schema:
 *           type: integer
 *           enum: [1, 2]
 *           default: 2
 *     responses:
 *       200:
 *         description: 音频字节
 *         content:
 *           audio/mpeg:
 *             schema:
 *               type: string
 *               format: binary
 *       400:
 *         description: 参数不合法
 *       502:
 *         description: 上游语音失败
 */
router.get("/tts", CDictController.tts);

/**
 * @openapi
 * /api/cdict/donate:
 *   get:
 *     tags:
 *       - CDict
 *     summary: CDict 赞赏渠道列表
 *     description: 客户端每次进入赞赏页都实时拉取；安装包内不内置任何收款信息。
 *     responses:
 *       200:
 *         description: 渠道列表与说明文案
 *       404:
 *         description: 赞赏功能未开启
 *       502:
 *         description: 配置读取失败
 */
router.get("/donate", CDictDonationController.channels);

/**
 * @openapi
 * /api/cdict/donate/{channel}:
 *   get:
 *     tags:
 *       - CDict
 *     summary: CDict 收款码图片
 *     parameters:
 *       - in: path
 *         name: channel
 *         required: true
 *         schema:
 *           type: string
 *           pattern: '^[a-z0-9-]{1,32}$'
 *           example: alipay
 *     responses:
 *       200:
 *         description: 收款码图片字节
 *         content:
 *           image/png:
 *             schema:
 *               type: string
 *               format: binary
 *       404:
 *         description: 渠道不存在或没有可用图片
 *       502:
 *         description: 图片获取失败
 */
router.get("/donate/:channel", CDictDonationController.image);

export default router;
