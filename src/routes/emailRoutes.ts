import express from 'express';
import { EmailController } from '../controllers/emailController';
import { authMiddleware } from '../middleware/authMiddleware';
import { createLimiter } from '../middleware/rateLimiter';
import logger from '../utils/logger';

const router = express.Router();

// 管理员权限检查中间件
const adminAuthMiddleware = (req: any, res: any, next: any) => {
    if (!req.user || req.user.role !== 'admin') {
        logger.warn('邮件发送权限检查失败：非管理员用户', {
            userId: req.user?.id,
            username: req.user?.username,
            role: req.user?.role,
            ip: req.ip
        });
        return res.status(403).json({ error: '需要管理员权限' });
    }
    next();
};

// 邮件发送速率限制（每管理员每分钟最多5封邮件）
const emailSendLimiter = createLimiter({
    windowMs: 60 * 1000, // 1分钟
    max: 5, // 最多5次
    message: '邮件发送过于频繁，请稍后再试',
    routeName: 'email.send'
});

// 邮箱验证速率限制（每管理员每分钟最多20次验证）
const emailValidationLimiter = createLimiter({
    windowMs: 60 * 1000, // 1分钟
    max: 20, // 最多20次
    message: '邮箱验证过于频繁，请稍后再试',
    routeName: 'email.validate'
});

// 服务状态查询速率限制（每管理员每分钟最多10次查询）
const statusQueryLimiter = createLimiter({
    windowMs: 60 * 1000, // 1分钟
    max: 10, // 最多10次
    message: '状态查询过于频繁，请稍后再试',
    routeName: 'email.status'
});

// 全局邮件接口速率限制（每管理员每分钟最多5次）
router.use(emailSendLimiter);

// 新增：无需认证的 code 校验邮件发送接口
router.post('/send-with-code', EmailController.sendEmailWithCode);

// 应用认证和管理员权限中间件
router.use(authMiddleware);
router.use(adminAuthMiddleware);

/**
 * @openapi
 * /api/email/send:
 *   post:
 *     summary: 发送邮件
 *     description: 管理员发送邮件接口
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [from, to, subject, html]
 *             properties:
 *               from:
 *                 type: string
 *                 description: 发件人邮箱（必须是 @hapxs.com 域名）
 *                 example: "noreply@hapxs.com"
 *               to:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: 收件人邮箱列表
 *                 example: ["recipient1@example.com", "recipient2@example.com"]
 *               subject:
 *                 type: string
 *                 description: 邮件主题
 *                 example: "重要通知"
 *               html:
 *                 type: string
 *                 description: HTML格式的邮件内容
 *                 example: "<h1>Hello World</h1><p>这是一封测试邮件。</p>"
 *               text:
 *                 type: string
 *                 description: 纯文本格式的邮件内容（可选）
 *                 example: "Hello World\n这是一封测试邮件。"
 *     responses:
 *       200:
 *         description: 邮件发送成功
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
 *                   example: "邮件发送成功"
 *                 messageId:
 *                   type: string
 *                   example: "abc123def456"
 *                 data:
 *                   type: object
 *       400:
 *         description: 请求参数错误（邮箱格式无效、发件人域名不允许等）
 *       401:
 *         description: 未授权
 *       403:
 *         description: 权限不足
 *       429:
 *         description: 请求过于频繁
 *       500:
 *         description: 服务器错误
 */
router.post('/send', EmailController.sendEmail);

/**
 * @openapi
 * /api/email/send-simple:
 *   post:
 *     summary: 发送简单文本邮件
 *     description: 管理员发送简单文本邮件接口
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [to, subject, content]
 *             properties:
 *               to:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: 收件人邮箱列表
 *                 example: ["recipient@example.com"]
 *               subject:
 *                 type: string
 *                 description: 邮件主题
 *                 example: "简单通知"
 *               content:
 *                 type: string
 *                 description: 邮件内容
 *                 example: "这是一封简单的通知邮件。"
 *               from:
 *                 type: string
 *                 description: 发件人邮箱（可选，必须是 @hapxs.com 域名）
 *                 example: "noreply@hapxs.com"
 *     responses:
 *       200:
 *         description: 邮件发送成功
 *       400:
 *         description: 请求参数错误
 *       401:
 *         description: 未授权
 *       403:
 *         description: 权限不足
 *       429:
 *         description: 请求过于频繁
 *       500:
 *         description: 服务器错误
 */
router.post('/send-simple', EmailController.sendSimpleEmail);

/**
 * @openapi
 * /api/email/send-markdown:
 *   post:
 *     summary: 发送Markdown格式邮件
 *     description: 管理员发送Markdown格式邮件接口，后端自动将markdown转为HTML
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [from, to, subject, markdown]
 *             properties:
 *               from:
 *                 type: string
 *                 description: 发件人邮箱（必须是 @hapxs.com 域名）
 *                 example: "noreply@hapxs.com"
 *               to:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: 收件人邮箱列表
 *                 example: ["recipient1@example.com"]
 *               subject:
 *                 type: string
 *                 description: 邮件主题
 *                 example: "Markdown通知"
 *               markdown:
 *                 type: string
 *                 description: Markdown格式的邮件内容
 *                 example: "# Hello World\n这是一封测试邮件。"
 *     responses:
 *       200:
 *         description: 邮件发送成功
 *       400:
 *         description: 请求参数错误
 *       401:
 *         description: 未授权
 *       403:
 *         description: 权限不足
 *       429:
 *         description: 请求过于频繁
 *       500:
 *         description: 服务器错误
 */
router.post('/send-markdown', EmailController.sendMarkdownEmail);

/**
 * @openapi
 * /api/email/status:
 *   get:
 *     summary: 获取邮件服务状态
 *     description: 管理员查询邮件服务状态接口
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 服务状态查询成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 available:
 *                   type: boolean
 *                   example: true
 *                 error:
 *                   type: string
 *                   example: null
 *       401:
 *         description: 未授权
 *       403:
 *         description: 权限不足
 *       429:
 *         description: 请求过于频繁
 *       500:
 *         description: 服务器错误
 */
router.get('/status', statusQueryLimiter, EmailController.getServiceStatus);

/**
 * @openapi
 * /api/email/validate-sender-domain:
 *   post:
 *     summary: 验证发件人域名
 *     description: 管理员验证发件人域名接口
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email:
 *                 type: string
 *                 description: 要验证的发件人邮箱地址
 *                 example: "noreply@hapxs.com"
 *     responses:
 *       200:
 *         description: 域名验证成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 email:
 *                   type: string
 *                   example: "noreply@hapxs.com"
 *                 isValid:
 *                   type: boolean
 *                   example: true
 *                 allowedDomain:
 *                   type: string
 *                   example: "hapxs.com"
 *       400:
 *         description: 请求参数错误
 *       401:
 *         description: 未授权
 *       403:
 *         description: 权限不足
 *       429:
 *         description: 请求过于频繁
 *       500:
 *         description: 服务器错误
 */
router.post('/validate-sender-domain', emailValidationLimiter, EmailController.validateSenderDomain);

/**
 * @openapi
 * /api/email/validate:
 *   post:
 *     summary: 验证邮箱格式
 *     description: 管理员验证邮箱格式接口
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [emails]
 *             properties:
 *               emails:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: 要验证的邮箱地址列表
 *                 example: ["test@example.com", "invalid-email", "another@test.com"]
 *     responses:
 *       200:
 *         description: 邮箱验证成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 total:
 *                   type: number
 *                   example: 3
 *                 valid:
 *                   type: array
 *                   items:
 *                     type: string
 *                   example: ["test@example.com", "another@test.com"]
 *                 invalid:
 *                   type: array
 *                   items:
 *                     type: string
 *                   example: ["invalid-email"]
 *       400:
 *         description: 请求参数错误
 *       401:
 *         description: 未授权
 *       403:
 *         description: 权限不足
 *       429:
 *         description: 请求过于频繁
 *       500:
 *         description: 服务器错误
 */
router.post('/validate', emailValidationLimiter, EmailController.validateEmails);

/**
 * @openapi
 * /api/email/quota:
 *   get:
 *     summary: 获取邮件配额
 *     description: 管理员获取邮件配额接口
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 配额获取成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 quota:
 *                   type: object
 *                   properties:
 *                     daily:
 *                       type: number
 *                       example: 1000
 *                     monthly:
 *                       type: number
 *                       example: 50000
 *                 error:
 *                   type: string
 *                   example: null
 *       401:
 *         description: 未授权
 *       403:
 *         description: 权限不足
 *       429:
 *         description: 请求过于频繁
 *       500:
 *         description: 服务器错误
 */
router.get('/quota', authMiddleware, adminAuthMiddleware, EmailController.getQuota);

/**
 * @openapi
 * /api/email/domains:
 *   get:
 *     summary: 获取所有可用发件人域名
 *     description: 获取所有可用发件人域名接口
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 域名获取成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 domains:
 *                   type: array
 *                   items:
 *                     type: string
 *                   example: ["hapxs.com", "example.com"]
 *                 error:
 *                   type: string
 *                   example: null
 *       401:
 *         description: 未授权
 *       403:
 *         description: 权限不足
 *       429:
 *         description: 请求过于频繁
 *       500:
 *         description: 服务器错误
 */
router.get('/domains', authMiddleware, EmailController.getDomains);

export default router; 