// OpenAPI/Swagger spec for the /api/nexai cloud-sync endpoints (plain and end-to-end encrypted).
// Collected by swagger-jsdoc via the `src/routes/**/*.ts` glob (scripts/generate-openapi.js,
// src/services/openapiDocumentService.ts); no runtime code lives here.

/**
 * @openapi
 * /api/nexai/sync:
 *   get:
 *     summary: 获取全部同步数据
 *     tags: [NexAI Sync]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 同步数据
 */

/**
 * @openapi
 * /api/nexai/sync:
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

/**
 * @openapi
 * /api/nexai/sync/meta:
 *   get:
 *     summary: 获取同步元信息
 *     tags: [NexAI Sync]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 同步状态
 */

/**
 * @openapi
 * /api/nexai/sync/changes:
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

/**
 * @openapi
 * /api/nexai/sync/incremental:
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

/**
 * @openapi
 * /api/nexai/sync/{category}:
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

/**
 * @openapi
 * /api/nexai/sync:
 *   delete:
 *     summary: 清除所有同步数据
 *     tags: [NexAI Sync]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 清除成功
 */

/**
 * @openapi
 * /api/nexai/sync/v2:
 *   put:
 *     summary: 上传端到端加密同步快照
 *     tags: [NexAI Sync]
 *     security:
 *       - bearerAuth: []
 */

/**
 * @openapi
 * /api/nexai/sync/v2:
 *   get:
 *     summary: 获取端到端加密同步快照
 *     description: |
 *       按 revision 升序分页返回。不带 cursor/limit 时返回首页，若记录数超过一页上限
 *       （NEXAI_SYNC_V2_MAX_PAGE_RECORDS，默认 2000）则返回 413
 *       NEXAI_SYNC_V2_SNAPSHOT_TOO_LARGE，避免调用方把半份快照当全量去覆盖。
 *       响应含 hasMore 与 nextCursor，翻页时把 nextCursor 回传给 cursor。
 *     tags: [NexAI Sync]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: cursor
 *         schema:
 *           type: integer
 *           minimum: 0
 *         description: 只返回 revision 大于该值的记录，取上一页响应的 nextCursor
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *         description: 本页记录数上限，超过服务端上限时按服务端上限截断
 */

/**
 * @openapi
 * /api/nexai/sync/v2/meta:
 *   get:
 *     summary: 获取端到端加密同步元信息
 *     tags: [NexAI Sync]
 *     security:
 *       - bearerAuth: []
 */

/**
 * @openapi
 * /api/nexai/sync/v2/incremental:
 *   post:
 *     summary: 端到端加密增量同步
 *     tags: [NexAI Sync]
 *     security:
 *       - bearerAuth: []
 */

/**
 * @openapi
 * /api/nexai/sync/v2:
 *   delete:
 *     summary: 清除端到端加密同步数据
 *     tags: [NexAI Sync]
 *     security:
 *       - bearerAuth: []
 */
