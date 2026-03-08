/**
 * NexAI 路由定义
 * 所有路由挂载在 /api/nexai 前缀下
 */
import express from "express";
import { NexaiAuthController } from "../controllers/nexaiAuthController";
import { NexaiSyncController } from "../controllers/nexaiSyncController";
import { nexaiAuthRequired } from "../middleware/nexaiAuth";
import { createLimiter } from "../middleware/rateLimiter";

const router = express.Router();

// ========== 限流器 ==========

const nexaiAuthLimiter = createLimiter({
    windowMs: 15 * 60 * 1000, // 15 分钟
    max: 20,
    message: "NexAI 认证请求过于频繁，请稍后再试",
});

const nexaiLoginLimiter = createLimiter({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: "登录尝试次数过多，请 15 分钟后再试",
});

const nexaiRegisterLimiter = createLimiter({
    windowMs: 60 * 60 * 1000, // 1 小时
    max: 5,
    message: "注册尝试次数过多，请稍后再试",
});

const nexaiOAuthLimiter = createLimiter({
    windowMs: 15 * 60 * 1000,
    max: 15,
    message: "OAuth 请求过于频繁，请稍后再试",
});

const nexaiRefreshLimiter = createLimiter({
    windowMs: 5 * 60 * 1000,
    max: 10,
    message: "Token 刷新过于频繁",
});

const nexaiProfileLimiter = createLimiter({
    windowMs: 15 * 60 * 1000,
    max: 20,
    message: "操作过于频繁，请稍后再试",
});

const nexaiSyncLimiter = createLimiter({
    windowMs: 5 * 60 * 1000,
    max: 30,
    message: "同步请求过于频繁，请稍后再试",
});

// ========== 公开端点（无需登录） ==========

/**
 * @openapi
 * /nexai/auth/register:
 *   post:
 *     summary: NexAI 用户注册
 *     tags: [NexAI Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [username, email, password]
 *             properties:
 *               username:
 *                 type: string
 *                 description: 用户名（3-30位，字母数字下划线连字符）
 *               email:
 *                 type: string
 *                 description: 邮箱地址
 *               password:
 *                 type: string
 *                 description: 密码（至少6位）
 *               displayName:
 *                 type: string
 *                 description: 显示名称
 *     responses:
 *       201:
 *         description: 注册成功
 *       400:
 *         description: 输入验证失败
 *       409:
 *         description: 用户名或邮箱已存在
 */
router.post("/auth/register", nexaiRegisterLimiter, NexaiAuthController.register);

/**
 * @openapi
 * /nexai/auth/login:
 *   post:
 *     summary: NexAI 用户登录
 *     tags: [NexAI Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [identifier, password]
 *             properties:
 *               identifier:
 *                 type: string
 *                 description: 用户名或邮箱
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: 登录成功
 *       401:
 *         description: 认证失败
 */
router.post("/auth/login", nexaiLoginLimiter, NexaiAuthController.login);

/**
 * @openapi
 * /nexai/auth/google:
 *   post:
 *     summary: Google OAuth 登录/注册
 *     tags: [NexAI Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [idToken]
 *             properties:
 *               idToken:
 *                 type: string
 *                 description: Google ID Token
 *     responses:
 *       200:
 *         description: 认证成功
 */
router.post("/auth/google", nexaiOAuthLimiter, NexaiAuthController.googleAuth);

/**
 * @openapi
 * /nexai/auth/github:
 *   post:
 *     summary: GitHub OAuth 登录/注册
 *     tags: [NexAI Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [code]
 *             properties:
 *               code:
 *                 type: string
 *                 description: GitHub 授权码
 *     responses:
 *       200:
 *         description: 认证成功
 */
router.post("/auth/github", nexaiOAuthLimiter, NexaiAuthController.githubAuth);

/**
 * @openapi
 * /nexai/auth/github/callback:
 *   get:
 *     summary: GitHub OAuth 回调
 *     tags: [NexAI Auth]
 *     parameters:
 *       - in: query
 *         name: code
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       302:
 *         description: 重定向到前端
 */
router.get("/auth/github/callback", nexaiOAuthLimiter, NexaiAuthController.githubCallback);

/**
 * @openapi
 * /nexai/auth/refresh:
 *   post:
 *     summary: 刷新 Access Token
 *     tags: [NexAI Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [refreshToken]
 *             properties:
 *               refreshToken:
 *                 type: string
 *     responses:
 *       200:
 *         description: 刷新成功
 */
router.post("/auth/refresh", nexaiRefreshLimiter, NexaiAuthController.refreshToken);

/**
 * @openapi
 * /nexai/auth/forgot-password:
 *   post:
 *     summary: 忘记密码
 *     tags: [NexAI Auth]
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
 *     responses:
 *       200:
 *         description: 处理成功
 */
router.post("/auth/forgot-password", nexaiAuthLimiter, NexaiAuthController.forgotPassword);

/**
 * @openapi
 * /nexai/auth/reset-password:
 *   post:
 *     summary: 重置密码
 *     tags: [NexAI Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token, newPassword]
 *             properties:
 *               token:
 *                 type: string
 *               newPassword:
 *                 type: string
 *     responses:
 *       200:
 *         description: 重置成功
 */
router.post("/auth/reset-password", nexaiAuthLimiter, NexaiAuthController.resetPassword);

/**
 * @openapi
 * /nexai/auth/oauth-config:
 *   get:
 *     summary: 获取 OAuth 配置
 *     tags: [NexAI Auth]
 *     description: 获取 Google/GitHub OAuth 是否启用及 Client ID（公开端点）
 *     responses:
 *       200:
 *         description: 配置信息
 */
router.get("/auth/oauth-config", NexaiAuthController.getOAuthConfig);

// ========== 需要登录的端点 ==========

/**
 * @openapi
 * /nexai/auth/me:
 *   get:
 *     summary: 获取当前用户信息
 *     tags: [NexAI Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 用户信息
 *       401:
 *         description: 未授权
 */
router.get("/auth/me", nexaiAuthRequired, NexaiAuthController.getCurrentUser);

/**
 * @openapi
 * /nexai/auth/logout:
 *   post:
 *     summary: 登出
 *     tags: [NexAI Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 登出成功
 */
router.post("/auth/logout", nexaiAuthRequired, NexaiAuthController.logout);

/**
 * @openapi
 * /nexai/auth/profile:
 *   put:
 *     summary: 更新个人资料
 *     tags: [NexAI Auth]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               displayName:
 *                 type: string
 *               username:
 *                 type: string
 *               avatarUrl:
 *                 type: string
 *     responses:
 *       200:
 *         description: 更新成功
 */
router.put("/auth/profile", nexaiAuthRequired, nexaiProfileLimiter, NexaiAuthController.updateProfile);

/**
 * @openapi
 * /nexai/auth/link-google:
 *   post:
 *     summary: 关联 Google 账号
 *     tags: [NexAI Auth]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [idToken]
 *             properties:
 *               idToken:
 *                 type: string
 *     responses:
 *       200:
 *         description: 关联成功
 */
router.post("/auth/link-google", nexaiAuthRequired, nexaiOAuthLimiter, NexaiAuthController.linkGoogle);

/**
 * @openapi
 * /nexai/auth/unlink-google:
 *   post:
 *     summary: 取消关联 Google 账号
 *     tags: [NexAI Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 取消关联成功
 */
router.post("/auth/unlink-google", nexaiAuthRequired, NexaiAuthController.unlinkGoogle);

/**
 * @openapi
 * /nexai/auth/link-github:
 *   post:
 *     summary: 关联 GitHub 账号
 *     tags: [NexAI Auth]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [code]
 *             properties:
 *               code:
 *                 type: string
 *     responses:
 *       200:
 *         description: 关联成功
 */
router.post("/auth/link-github", nexaiAuthRequired, nexaiOAuthLimiter, NexaiAuthController.linkGithub);

/**
 * @openapi
 * /nexai/auth/unlink-github:
 *   post:
 *     summary: 取消关联 GitHub 账号
 *     tags: [NexAI Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 取消关联成功
 */
router.post("/auth/unlink-github", nexaiAuthRequired, NexaiAuthController.unlinkGithub);

// ========== 云同步端点（需要登录） ==========

/**
 * @openapi
 * /nexai/sync:
 *   get:
 *     summary: 获取全部同步数据
 *     tags: [NexAI Sync]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 同步数据
 */
router.get("/sync", nexaiAuthRequired, nexaiSyncLimiter, NexaiSyncController.getSyncData);

/**
 * @openapi
 * /nexai/sync:
 *   put:
 *     summary: 全量上传同步数据
 *     tags: [NexAI Sync]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               settings:
 *                 type: object
 *               notes:
 *                 type: array
 *               conversations:
 *                 type: array
 *               translationHistory:
 *                 type: array
 *               savedPasswords:
 *                 type: array
 *               shortUrls:
 *                 type: array
 *     responses:
 *       200:
 *         description: 上传成功
 */
router.put("/sync", nexaiAuthRequired, nexaiSyncLimiter, NexaiSyncController.putSyncData);

/**
 * @openapi
 * /nexai/sync/meta:
 *   get:
 *     summary: 获取同步元信息
 *     tags: [NexAI Sync]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 同步状态
 */
router.get("/sync/meta", nexaiAuthRequired, nexaiSyncLimiter, NexaiSyncController.getSyncMeta);

/**
 * @openapi
 * /nexai/sync/changes:
 *   get:
 *     summary: 增量拉取变更数据
 *     tags: [NexAI Sync]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: since
 *         required: true
 *         schema:
 *           type: string
 *           format: date-time
 *         description: ISO 8601 时间戳
 *     responses:
 *       200:
 *         description: 变更数据
 */
router.get("/sync/changes", nexaiAuthRequired, nexaiSyncLimiter, NexaiSyncController.getChangesSince);

/**
 * @openapi
 * /nexai/sync/incremental:
 *   post:
 *     summary: 增量同步（上传本地变更 + 拉取服务端变更）
 *     tags: [NexAI Sync]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [lastSyncedAt, data]
 *             properties:
 *               lastSyncedAt:
 *                 type: string
 *                 format: date-time
 *               data:
 *                 type: object
 *     responses:
 *       200:
 *         description: 服务端变更数据
 */
router.post("/sync/incremental", nexaiAuthRequired, nexaiSyncLimiter, NexaiSyncController.incrementalSync);

/**
 * @openapi
 * /nexai/sync/{category}:
 *   patch:
 *     summary: 按类别局部更新同步数据
 *     tags: [NexAI Sync]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: category
 *         required: true
 *         schema:
 *           type: string
 *           enum: [settings, notes, conversations, translations, passwords, shortUrls]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [data]
 *             properties:
 *               data:
 *                 description: 对应类别的数据
 *     responses:
 *       200:
 *         description: 更新成功
 */
router.patch("/sync/:category", nexaiAuthRequired, nexaiSyncLimiter, NexaiSyncController.patchSyncData);

/**
 * @openapi
 * /nexai/sync:
 *   delete:
 *     summary: 清除所有同步数据
 *     tags: [NexAI Sync]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 清除成功
 */
router.delete("/sync", nexaiAuthRequired, nexaiSyncLimiter, NexaiSyncController.deleteSyncData);

export default router;
