/**
 * 工作空间路由 - Workspace Routes
 * 定义工作空间相关的API端点
 *
 * Requirements: 4.1, 4.2, 4.3, 4.4
 */

import express from "express";
import { WorkspaceController } from "../controllers/workspaceController";
import { authenticateToken } from "../middleware/authenticateToken";
import { createLimiter } from "../middleware/rateLimiter";

const router = express.Router();

// 速率限制配置
const workspaceLimiter = createLimiter({
  windowMs: 60 * 1000, // 1分钟
  max: 30, // 每分钟最多30次请求
  message: "请求过于频繁，请稍后再试",
});

const inviteLimiter = createLimiter({
  windowMs: 60 * 1000, // 1分钟
  max: 10, // 每分钟最多10次邀请请求
  message: "邀请请求过于频繁，请稍后再试",
});

/**
 * @openapi
 * /workspaces:
 *   get:
 *     summary: 获取用户的所有工作空间
 *     description: 获取当前用户所属的所有工作空间列表
 *     tags:
 *       - Workspaces
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 工作空间列表
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Workspace'
 *                 count:
 *                   type: integer
 *       401:
 *         description: 未授权
 */
router.get("/", workspaceLimiter, authenticateToken, WorkspaceController.getUserWorkspaces);

/**
 * @openapi
 * /workspaces:
 *   post:
 *     summary: 创建工作空间
 *     description: 创建一个新的团队工作空间，创建者自动成为管理员
 *     tags:
 *       - Workspaces
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *             properties:
 *               name:
 *                 type: string
 *                 description: 工作空间名称
 *                 maxLength: 100
 *               description:
 *                 type: string
 *                 description: 工作空间描述
 *                 maxLength: 500
 *     responses:
 *       201:
 *         description: 工作空间创建成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/Workspace'
 *       400:
 *         description: 参数错误
 *       401:
 *         description: 未授权
 */
router.post("/", workspaceLimiter, authenticateToken, WorkspaceController.createWorkspace);

/**
 * @openapi
 * /workspaces/{id}:
 *   get:
 *     summary: 获取工作空间详情
 *     description: 获取指定工作空间的详细信息
 *     tags:
 *       - Workspaces
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: 工作空间ID
 *     responses:
 *       200:
 *         description: 工作空间详情
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/Workspace'
 *       401:
 *         description: 未授权
 *       403:
 *         description: 无权访问
 *       404:
 *         description: 工作空间不存在
 */
router.get("/:id", workspaceLimiter, authenticateToken, WorkspaceController.getWorkspace);

/**
 * @openapi
 * /workspaces/{id}/members:
 *   get:
 *     summary: 获取工作空间成员列表
 *     description: 获取指定工作空间的所有成员
 *     tags:
 *       - Workspaces
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: 工作空间ID
 *     responses:
 *       200:
 *         description: 成员列表
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/WorkspaceMember'
 *                 count:
 *                   type: integer
 *       401:
 *         description: 未授权
 *       403:
 *         description: 无权访问
 *       404:
 *         description: 工作空间不存在
 */
router.get("/:id/members", workspaceLimiter, authenticateToken, WorkspaceController.getMembers);

/**
 * @openapi
 * /workspaces/{id}/invite:
 *   post:
 *     summary: 邀请成员加入工作空间
 *     description: 向指定邮箱发送工作空间邀请（仅管理员可操作）
 *     tags:
 *       - Workspaces
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: 工作空间ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 description: 被邀请者邮箱
 *               role:
 *                 type: string
 *                 enum: [editor, viewer]
 *                 default: viewer
 *                 description: 分配的角色
 *     responses:
 *       201:
 *         description: 邀请创建成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/Invitation'
 *       400:
 *         description: 参数错误
 *       401:
 *         description: 未授权
 *       403:
 *         description: 无权限（非管理员）
 *       404:
 *         description: 工作空间不存在
 *       409:
 *         description: 成员数量已达上限
 */
router.post("/:id/invite", inviteLimiter, authenticateToken, WorkspaceController.inviteMember);

/**
 * @openapi
 * /workspaces/{id}/settings:
 *   put:
 *     summary: 更新工作空间设置
 *     description: 更新工作空间的设置（仅管理员可操作）
 *     tags:
 *       - Workspaces
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: 工作空间ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               allowPublicSharing:
 *                 type: boolean
 *                 description: 是否允许公开分享
 *               defaultPermission:
 *                 type: string
 *                 enum: [editor, viewer]
 *                 description: 默认权限
 *               notificationsEnabled:
 *                 type: boolean
 *                 description: 是否启用通知
 *     responses:
 *       200:
 *         description: 设置更新成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/Workspace'
 *       400:
 *         description: 参数错误
 *       401:
 *         description: 未授权
 *       403:
 *         description: 无权限（非管理员）
 *       404:
 *         description: 工作空间不存在
 */
router.put("/:id/settings", workspaceLimiter, authenticateToken, WorkspaceController.updateSettings);

export default router;
