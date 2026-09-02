// OpenAPI/Swagger spec for the /api/nexai artifact sharing endpoints.
// Collected by swagger-jsdoc via the `src/routes/**/*.ts` glob (scripts/generate-openapi.js,
// src/services/openapiDocumentService.ts); no runtime code lives here.

/**
 * @openapi
 * /api/nexai/artifacts:
 *   post:
 *     summary: 创建 Artifact
 *     tags: [NexAI Artifacts]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [title, content_type, content]
 *             properties:
 *               title:
 *                 type: string
 *               content_type:
 *                 type: string
 *                 enum: [html, code, markdown, mermaid]
 *               content:
 *                 type: string
 *                 description: Base64 编码的内容
 *               language:
 *                 type: string
 *               visibility:
 *                 type: string
 *                 enum: [public, private, password]
 *               password:
 *                 type: string
 *               description:
 *                 type: string
 *               tags:
 *                 type: array
 *                 items:
 *                   type: string
 *               expires_in_days:
 *                 type: integer
 *     responses:
 *       201:
 *         description: 创建成功
 */

/**
 * @openapi
 * /api/nexai/artifacts/{shortId}:
 *   get:
 *     summary: 获取 Artifact
 *     tags: [NexAI Artifacts]
 *     parameters:
 *       - in: path
 *         name: shortId
 *         required: true
 *         schema:
 *           type: string
 *       - in: header
 *         name: X-Password
 *         schema:
 *           type: string
 *         description: 密码保护的 Artifact 需要提供密码
 *     responses:
 *       200:
 *         description: 获取成功
 *       403:
 *         description: 需要密码或密码错误
 *       404:
 *         description: 不存在或已过期
 */

/**
 * @openapi
 * /api/nexai/artifacts/{shortId}:
 *   patch:
 *     summary: 更新 Artifact
 *     tags: [NexAI Artifacts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: shortId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *               visibility:
 *                 type: string
 *               password:
 *                 type: string
 *               description:
 *                 type: string
 *               tags:
 *                 type: array
 *               expires_in_days:
 *                 type: integer
 *     responses:
 *       200:
 *         description: 更新成功
 */

/**
 * @openapi
 * /api/nexai/artifacts/{shortId}:
 *   delete:
 *     summary: 删除 Artifact
 *     tags: [NexAI Artifacts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: shortId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       204:
 *         description: 删除成功
 */

/**
 * @openapi
 * /api/nexai/artifacts:
 *   get:
 *     summary: 获取用户的 Artifacts 列表
 *     tags: [NexAI Artifacts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *       - in: query
 *         name: sort
 *         schema:
 *           type: string
 *       - in: query
 *         name: order
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *     responses:
 *       200:
 *         description: 获取成功
 */

/**
 * @openapi
 * /api/nexai/artifacts/{shortId}/view:
 *   post:
 *     summary: 记录访问
 *     tags: [NexAI Artifacts]
 *     parameters:
 *       - in: path
 *         name: shortId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               referer:
 *                 type: string
 *               user_agent:
 *                 type: string
 *     responses:
 *       204:
 *         description: 记录成功
 */
