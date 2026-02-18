/**
 * 邀请路由 - Invitation Routes
 * 定义邀请相关的API端点
 *
 * Requirements: 4.2, 4.3
 */

import express from "express";
import { WorkspaceController } from "../controllers/workspaceController";
import { authenticateToken } from "../middleware/authenticateToken";
import { createLimiter } from "../middleware/rateLimiter";

const router = express.Router();

// 速率限制配置
const invitationLimiter = createLimiter({
  windowMs: 60 * 1000, // 1分钟
  max: 20, // 每分钟最多20次请求
  message: "请求过于频繁，请稍后再试",
});

/**
 * @openapi
 * /invitations/pending:
 *   get:
 *     summary: 获取待处理的邀请
 *     description: 获取当前用户的所有待处理邀请
 *     tags:
 *       - Invitations
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 邀请列表
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
 *                     $ref: '#/components/schemas/Invitation'
 *                 count:
 *                   type: integer
 *       401:
 *         description: 未授权
 */
router.get("/pending", invitationLimiter, authenticateToken, WorkspaceController.getPendingInvitations);

/**
 * @openapi
 * /invitations/{id}/accept:
 *   post:
 *     summary: 接受邀请
 *     description: 接受工作空间邀请并加入工作空间
 *     tags:
 *       - Invitations
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: 邀请ID
 *     responses:
 *       200:
 *         description: 成功加入工作空间
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/WorkspaceMember'
 *                 message:
 *                   type: string
 *       401:
 *         description: 未授权
 *       404:
 *         description: 邀请不存在
 *       409:
 *         description: 已是成员或成员数量已达上限
 *       410:
 *         description: 邀请已过期
 */
router.post("/:id/accept", invitationLimiter, authenticateToken, WorkspaceController.acceptInvitation);

export default router;
