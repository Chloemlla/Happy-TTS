import { Router } from "express";
import rateLimit from "express-rate-limit";
import {
  cleanExpiredConsents,
  getCurrentPolicyVersion,
  getPolicyStats,
  recordPolicyConsent,
  revokePolicyConsent,
  verifyPolicyConsent,
} from "../controllers/policyController";
import { adminOnly } from "../middleware/adminOnly";
import { authenticateToken } from "../middleware/authenticateToken";
import logger from "../utils/logger";

const router = Router();

// 检查是否为本地开发环境
const isLocalDevelopment =
  process.env.NODE_ENV === "development" || process.env.NODE_ENV === "dev" || process.env.NODE_ENV === "local";

// 速率限制配置
const policyRateLimit = rateLimit({
  windowMs: 1 * 60 * 1000, // 1分钟
  max: isLocalDevelopment ? 1000 : 120, // 本地环境放宽限制，生产环境120次/分钟
  message: {
    success: false,
    error: "Too many policy requests, please try again later",
    code: "RATE_LIMIT_EXCEEDED",
  },
  standardHeaders: true,
  legacyHeaders: false,
  // 本地环境跳过速率限制
  skip: (req) => {
    if (isLocalDevelopment) {
      logger.info("Skipping rate limit for local development:", {
        ip: req.ip,
        hostname: req.hostname,
        url: req.url,
      });
      return true;
    }
    return false;
  },
});

const adminRateLimit = rateLimit({
  windowMs: 1 * 60 * 1000, // 1分钟
  max: isLocalDevelopment ? 2000 : 120, // 本地环境放宽限制，生产环境120次/分钟
  message: {
    success: false,
    error: "Too many admin requests, please try again later",
    code: "ADMIN_RATE_LIMIT_EXCEEDED",
  },
  standardHeaders: true,
  legacyHeaders: false,
  // 本地环境跳过速率限制
  skip: (req) => {
    if (isLocalDevelopment) {
      logger.info("Skipping admin rate limit for local development:", {
        ip: req.ip,
        hostname: req.hostname,
        url: req.url,
      });
      return true;
    }
    return false;
  },
});

/**
 * @swagger
 * components:
 *   schemas:
 *     PolicyConsent:
 *       type: object
 *       required:
 *         - timestamp
 *         - version
 *         - fingerprint
 *         - checksum
 *       properties:
 *         timestamp:
 *           type: number
 *           description: 同意时间戳
 *           example: 1696636800000
 *         version:
 *           type: string
 *           description: 政策版本
 *           example: "2.0"
 *         fingerprint:
 *           type: string
 *           description: 设备指纹
 *           example: "abc123def456"
 *         checksum:
 *           type: string
 *           description: 数据校验和
 *           example: "xyz789"
 *
 *     PolicyConsentRequest:
 *       type: object
 *       required:
 *         - consent
 *       properties:
 *         consent:
 *           $ref: '#/components/schemas/PolicyConsent'
 *         userAgent:
 *           type: string
 *           description: 用户代理字符串
 *           example: "Mozilla/5.0..."
 *         timestamp:
 *           type: number
 *           description: 请求时间戳
 *           example: 1696636800000
 */

/**
 * @swagger
 * /api/policy/verify:
 *   post:
 *     summary: 记录隐私政策同意
 *     description: 记录用户对隐私政策的同意状态
 *     tags: [Policy]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/PolicyConsentRequest'
 *     responses:
 *       200:
 *         description: 同意记录成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Consent recorded successfully"
 *                 consentId:
 *                   type: string
 *                   example: "uuid-string"
 *                 expiresAt:
 *                   type: string
 *                   format: date-time
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
 *                   example: "Invalid consent data"
 *                 code:
 *                   type: string
 *                   example: "INVALID_CHECKSUM"
 *       429:
 *         description: 请求过于频繁
 *       500:
 *         description: 服务器内部错误
 */
router.post("/verify", policyRateLimit, recordPolicyConsent);

/**
 * @swagger
 * /api/policy/check:
 *   get:
 *     summary: 验证隐私政策同意状态
 *     description: 检查指定设备指纹是否有有效的政策同意记录
 *     tags: [Policy]
 *     parameters:
 *       - in: query
 *         name: fingerprint
 *         required: true
 *         schema:
 *           type: string
 *         description: 设备指纹
 *       - in: query
 *         name: version
 *         required: true
 *         schema:
 *           type: string
 *         description: 政策版本
 *     responses:
 *       200:
 *         description: 验证结果
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 hasValidConsent:
 *                   type: boolean
 *                 consentId:
 *                   type: string
 *                 version:
 *                   type: string
 *                 expiresAt:
 *                   type: string
 *                   format: date-time
 *                 recordedAt:
 *                   type: string
 *                   format: date-time
 *       400:
 *         description: 缺少必需参数
 *       500:
 *         description: 服务器内部错误
 */
router.get("/check", policyRateLimit, verifyPolicyConsent);

/**
 * @swagger
 * /api/policy/revoke:
 *   post:
 *     summary: 撤销隐私政策同意
 *     description: 撤销指定设备指纹的政策同意记录
 *     tags: [Policy]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - fingerprint
 *             properties:
 *               fingerprint:
 *                 type: string
 *                 description: 设备指纹
 *               version:
 *                 type: string
 *                 description: 政策版本（可选，不提供则撤销所有版本）
 *     responses:
 *       200:
 *         description: 撤销成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Consent revoked successfully"
 *                 revokedCount:
 *                   type: number
 *                   example: 1
 *       400:
 *         description: 缺少必需参数
 *       500:
 *         description: 服务器内部错误
 */
router.post("/revoke", policyRateLimit, revokePolicyConsent);

/**
 * @swagger
 * /api/policy/version:
 *   get:
 *     summary: 获取当前政策版本
 *     description: 获取当前隐私政策版本和有效期信息
 *     tags: [Policy]
 *     responses:
 *       200:
 *         description: 版本信息
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 version:
 *                   type: string
 *                   example: "2.0"
 *                 validityDays:
 *                   type: number
 *                   example: 30
 */
router.get("/version", getCurrentPolicyVersion);

// 管理员接口
/**
 * @swagger
 * /api/policy/admin/stats:
 *   get:
 *     summary: 获取隐私政策统计信息（管理员）
 *     description: 获取隐私政策同意的统计信息和分析数据
 *     tags: [Policy Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *         description: 开始日期
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *         description: 结束日期
 *     responses:
 *       200:
 *         description: 统计信息
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 stats:
 *                   type: object
 *                   properties:
 *                     total:
 *                       type: object
 *                       properties:
 *                         validConsents:
 *                           type: number
 *                         expiredConsents:
 *                           type: number
 *                         currentVersion:
 *                           type: string
 *                     versions:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           _id:
 *                             type: string
 *                           count:
 *                             type: number
 *                     recentTrend:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           _id:
 *                             type: string
 *                           count:
 *                             type: number
 *       401:
 *         description: 未授权
 *       403:
 *         description: 权限不足
 *       500:
 *         description: 服务器内部错误
 */
router.get("/admin/stats", adminRateLimit, authenticateToken, adminOnly, getPolicyStats);

/**
 * @swagger
 * /api/policy/admin/cleanup:
 *   post:
 *     summary: 清理过期的同意记录（管理员）
 *     description: 删除过期和无效的隐私政策同意记录
 *     tags: [Policy Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 清理完成
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Expired consents cleaned successfully"
 *                 deletedCount:
 *                   type: number
 *                   example: 42
 *       401:
 *         description: 未授权
 *       403:
 *         description: 权限不足
 *       500:
 *         description: 服务器内部错误
 */
router.post("/admin/cleanup", adminRateLimit, authenticateToken, adminOnly, cleanExpiredConsents);

export default router;
