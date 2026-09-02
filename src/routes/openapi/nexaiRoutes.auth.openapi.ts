// OpenAPI/Swagger spec for the /api/nexai auth, WebAuthn, and release-manifest endpoints.
// Collected by swagger-jsdoc via the `src/routes/**/*.ts` glob (scripts/generate-openapi.js,
// src/services/openapiDocumentService.ts); no runtime code lives here.

/**
 * @openapi
 * /api/nexai/auth/register:
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

/**
 * @openapi
 * /api/nexai/auth/login:
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

/**
 * @openapi
 * /api/nexai/auth/passkey/login/options:
 *   post:
 *     summary: 获取 Passkey 登录选项
 *     tags: [NexAI WebAuthn]
 */

/**
 * @openapi
 * /api/nexai/auth/passkey/login/verify:
 *   post:
 *     summary: 验证 Passkey 登录
 *     tags: [NexAI WebAuthn]
 */

/**
 * @openapi
 * /api/nexai/auth/passkey/login/discoverable/options:
 *   post:
 *     summary: 获取 Discoverable（无用户名）Passkey 登录选项
 *     tags: [NexAI WebAuthn]
 */

/**
 * @openapi
 * /api/nexai/auth/passkey/login/discoverable/verify:
 *   post:
 *     summary: 验证 Discoverable Passkey 登录
 *     tags: [NexAI WebAuthn]
 */

/**
 * @openapi
 * /api/nexai/auth/google:
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

/**
 * @openapi
 * /api/nexai/auth/github:
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

/**
 * @openapi
 * /api/nexai/auth/github/callback:
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

/**
 * @openapi
 * /api/nexai/auth/refresh:
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

/**
 * @openapi
 * /api/nexai/auth/forgot-password:
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

/**
 * @openapi
 * /api/nexai/auth/reset-password:
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

/**
 * @openapi
 * /api/nexai/auth/oauth-config:
 *   get:
 *     summary: 获取 OAuth 配置
 *     tags: [NexAI Auth]
 *     description: 获取 Google/GitHub OAuth 是否启用及 Client ID（公开端点）
 *     responses:
 *       200:
 *         description: 配置信息
 */

/**
 * @openapi
 * /api/nexai/releases/{tag}/manifest:
 *   get:
 *     summary: 获取 NexAI 发布包完整性清单
 *     tags: [NexAI Releases]
 *     parameters:
 *       - in: path
 *         name: tag
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: 发布清单
 *       404:
 *         description: 未找到发布清单
 */

/**
 * @openapi
 * /api/nexai/auth/passkey/register/options:
 *   post:
 *     summary: 获取 Passkey 注册选项
 *     tags: [NexAI WebAuthn]
 *     security:
 *       - bearerAuth: []
 */

/**
 * @openapi
 * /api/nexai/auth/passkey/register/verify:
 *   post:
 *     summary: 验证并绑定 Passkey
 *     tags: [NexAI WebAuthn]
 *     security:
 *       - bearerAuth: []
 */

/**
 * @openapi
 * /api/nexai/auth/passkey/signal/options:
 *   get:
 *     summary: 获取 Android Credential Manager Signal API 选项
 *     tags: [NexAI WebAuthn]
 *     security:
 *       - bearerAuth: []
 */

/**
 * @openapi
 * /api/nexai/auth/me:
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

/**
 * @openapi
 * /api/nexai/auth/logout:
 *   post:
 *     summary: 登出
 *     tags: [NexAI Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 登出成功
 */

/**
 * @openapi
 * /api/nexai/auth/profile:
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

/**
 * @openapi
 * /api/nexai/auth/link-google:
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

/**
 * @openapi
 * /api/nexai/auth/unlink-google:
 *   post:
 *     summary: 取消关联 Google 账号
 *     tags: [NexAI Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 取消关联成功
 */

/**
 * @openapi
 * /api/nexai/auth/link-github:
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

/**
 * @openapi
 * /api/nexai/auth/unlink-github:
 *   post:
 *     summary: 取消关联 GitHub 账号
 *     tags: [NexAI Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 取消关联成功
 */
