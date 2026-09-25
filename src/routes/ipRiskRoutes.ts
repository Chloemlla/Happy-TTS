import { Router } from "express";
import { ipProbeLimiter, ipRiskLimiter } from "../middleware/routeLimiters";
import { IpRiskController } from "../controllers/ipRiskController";

const router = Router();

/**
 * @openapi
 * /api/ip-risk:
 *   get:
 *     summary: 查询来源 IP 的风险结论
 *     description: 返回本次请求解析出的客户端 IP 的 proxycheck 风险结论（同 IP 走 Mongo 去重缓存）。
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
 *                 data:
 *                   type: object
 *                   description: IpRiskResult（risk/level/detections/flags/cached/source 等）
 *       502:
 *         description: 上游风险查询失败
 */
router.get("/ip-risk", ipRiskLimiter, IpRiskController.getIpRisk);

/**
 * @openapi
 * /api/ip-risk/echo:
 *   get:
 *     summary: 网络出口 / IPv6 出口探测
 *     description: |
 *       返回服务端观测到的出口地址（ipv4/ipv6/socket/primary）、三个代理头原文与告警项。
 *       配置了 hmacSecret 时额外返回一次性探测会话（probeId/probeKey/nonce），
 *       用于后续上报的 payload 验签；未配置则省略 probe 字段。
 *     responses:
 *       200:
 *         description: 探测成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     ipv4:
 *                       type: string
 *                       nullable: true
 *                     ipv6:
 *                       type: string
 *                       nullable: true
 *                     socket:
 *                       type: string
 *                       nullable: true
 *                     primary:
 *                       type: string
 *                       nullable: true
 *                     isProxyHeader:
 *                       type: boolean
 *                     headers:
 *                       type: object
 *                       properties:
 *                         cfConnectingIp:
 *                           type: string
 *                           nullable: true
 *                         xRealIp:
 *                           type: string
 *                           nullable: true
 *                         xForwardedFor:
 *                           type: string
 *                           nullable: true
 *                     warning:
 *                       type: array
 *                       items:
 *                         type: string
 *                 probe:
 *                   type: object
 *                   description: 仅在 hmacSecret 已配置时出现
 *                   properties:
 *                     probeId:
 *                       type: string
 *                     probeKey:
 *                       type: string
 *                     nonce:
 *                       type: string
 *                     expiresInSec:
 *                       type: number
 */
router.get("/ip-risk/echo", ipProbeLimiter, IpRiskController.getEcho);

/**
 * @openapi
 * /api/ip-risk/report:
 *   post:
 *     summary: 客户端探测结果上报（HMAC-SHA256 验签）
 *     description: |
 *       body 为 {probeId, nonce, payload, signature}，signature = HMAC-SHA256(probeKey, canonical(payload)) 的 hex。
 *       失败码：403 hmac_not_configured / 403 probe_session_not_found / 403 signature_mismatch / 409 nonce_replayed。
 *     responses:
 *       200:
 *         description: 验签通过并已处理
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     stored:
 *                       type: boolean
 *                     flags:
 *                       type: array
 *                       items:
 *                         type: string
 *                     mismatch:
 *                       type: object
 *                       properties:
 *                         ipv4vsWs:
 *                           type: boolean
 *                         ipvEvsV6:
 *                           type: boolean
 *                         timezoneVsGeo:
 *                           type: boolean
 *       400:
 *         description: 请求体缺字段或格式错误
 *       403:
 *         description: 未配置验签密钥 / 会话不存在 / 签名不匹配
 *       409:
 *         description: nonce 重放
 */
router.post("/ip-risk/report", ipProbeLimiter, IpRiskController.reportProbe);

/**
 * @openapi
 * /api/ip-risk/probe-config:
 *   get:
 *     summary: 前端探测组件的运行时开关
 *     description: |
 *       返回探测总开关、是否启用 HMAC、各端点路径，以及（仅 usePublicKeyForClient=true 时）
 *       浏览器专用 publicApiKey 与直连查询 URL。服务端 apiKey / hmacSecret 绝不下发。
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
 *                 data:
 *                   type: object
 *                   properties:
 *                     enabled:
 *                       type: boolean
 *                     hmacEnabled:
 *                       type: boolean
 *                     echoPath:
 *                       type: string
 *                     reportPath:
 *                       type: string
 *                     wsProbePath:
 *                       type: string
 *                     publicApiKey:
 *                       type: string
 *                       nullable: true
 *                     directQueryUrl:
 *                       type: string
 *                       nullable: true
 */
router.get("/ip-risk/probe-config", ipRiskLimiter, IpRiskController.getProbeConfig);

export default router;
