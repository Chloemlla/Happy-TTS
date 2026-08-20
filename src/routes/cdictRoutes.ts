import express from "express";
import { CDictController } from "../controllers/cdictController";
import { CDictDonationController } from "../controllers/cdictDonationController";
import { createLimiter } from "../middleware/routeLimiters";

const router = express.Router();

/** 署名申请是写操作，单独收紧到每 IP 每小时 10 次，避免有人拿它刷库。 */
const donationClaimLimiter = createLimiter({
  name: "cdictDonationClaim",
  category: "public-api",
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: "署名提交过于频繁，请稍后再试",
});

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
 *     description: 客户端每次进入赞赏页都实时拉取；安装包内不内置任何收款信息。同时返回后台维护的鸣谢名单。
 *     responses:
 *       200:
 *         description: 渠道列表、说明文案与鸣谢名单
 *       404:
 *         description: 赞赏功能未开启
 *       502:
 *         description: 配置读取失败
 */
router.get("/donate", CDictDonationController.channels);

/**
 * @openapi
 * /api/cdict/donate/claim:
 *   post:
 *     tags:
 *       - CDict
 *     summary: 提交赞赏署名申请
 *     description: 赞赏者提交交易号与希望展示的称呼，开发者核实后加入鸣谢名单。只落库这两项，不记录 IP 或设备信息；同一交易号重复提交是幂等的。
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - transactionId
 *               - displayName
 *             properties:
 *               transactionId:
 *                 type: string
 *                 description: 支付宝 / 微信的交易号（订单号）
 *                 pattern: '^[A-Za-z0-9_-]{6,64}$'
 *               displayName:
 *                 type: string
 *                 maxLength: 32
 *                 description: 希望展示在鸣谢名单中的称呼
 *     responses:
 *       200:
 *         description: 已提交（`duplicated` 为 true 表示该交易号此前已提交过）
 *       400:
 *         description: 参数不合法
 *       429:
 *         description: 提交过于频繁
 */
router.post("/donate/claim", donationClaimLimiter, CDictDonationController.claim);

/**
 * @openapi
 * /api/cdict/donate/{channel}:
 *   get:
 *     tags:
 *       - CDict
 *     summary: CDict 收款码图片
 *     description: 管理端填了图片地址时 302 跳到该地址（服务端不下载、不缓存图片字节）；地址留空时返回服务端内置图片。
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
 *         description: 服务端内置收款码图片字节（管理端未填图片地址时）
 *         content:
 *           image/png:
 *             schema:
 *               type: string
 *               format: binary
 *       302:
 *         description: 跳转到管理端配置的收款码图片地址
 *       404:
 *         description: 渠道不存在或没有可用图片
 *       502:
 *         description: 图片获取失败
 */
router.get("/donate/:channel", CDictDonationController.image);

export default router;
