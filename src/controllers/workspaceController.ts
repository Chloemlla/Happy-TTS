/**
 * 工作空间控制器 - Workspace Controller
 * 处理工作空间相关的HTTP请求
 *
 * Requirements: 4.1, 4.2, 4.3, 4.4
 */

import type { Request, Response } from "express";
import { WorkspaceError, WorkspaceErrorCodes, workspaceService } from "../services/workspaceService";
import logger from "../utils/logger";

export class WorkspaceController {
  /**
   * 创建工作空间
   * POST /workspaces
   * Requirements: 4.1
   */
  static async createWorkspace(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user?.id || (req as any).userId;

      if (!userId) {
        res.status(401).json({ error: "未授权访问" });
        return;
      }

      const { name, description } = req.body;

      if (!name || typeof name !== "string" || name.trim().length === 0) {
        res.status(400).json({ error: "缺少必要参数: name" });
        return;
      }

      // 限制名称长度
      const safeName = name.trim().substring(0, 100);
      const safeDescription = description ? description.substring(0, 500) : "";

      const workspace = await workspaceService.createWorkspace(userId, safeName, safeDescription);

      res.status(201).json({
        success: true,
        data: workspace,
      });
    } catch (error) {
      logger.error("[WorkspaceController] 创建工作空间失败:", error);
      res.status(500).json({ error: "创建工作空间失败" });
    }
  }

  /**
   * 获取工作空间详情
   * GET /workspaces/:id
   */
  static async getWorkspace(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user?.id || (req as any).userId;

      if (!userId) {
        res.status(401).json({ error: "未授权访问" });
        return;
      }

      const { id } = req.params;

      if (!id) {
        res.status(400).json({ error: "缺少工作空间ID" });
        return;
      }

      // 检查用户是否是成员
      const isMember = await workspaceService.isMember(id, userId);
      if (!isMember) {
        res.status(403).json({ error: "无权访问此工作空间" });
        return;
      }

      const workspace = await workspaceService.getWorkspace(id);

      res.json({
        success: true,
        data: workspace,
      });
    } catch (error) {
      if (error instanceof WorkspaceError) {
        const statusCode = error.code === WorkspaceErrorCodes.WORKSPACE_NOT_FOUND ? 404 : 400;
        res.status(statusCode).json({ error: error.message, code: error.code });
        return;
      }
      logger.error("[WorkspaceController] 获取工作空间失败:", error);
      res.status(500).json({ error: "获取工作空间失败" });
    }
  }

  /**
   * 获取工作空间成员列表
   * GET /workspaces/:id/members
   */
  static async getMembers(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user?.id || (req as any).userId;

      if (!userId) {
        res.status(401).json({ error: "未授权访问" });
        return;
      }

      const { id } = req.params;

      if (!id) {
        res.status(400).json({ error: "缺少工作空间ID" });
        return;
      }

      // 检查用户是否是成员
      const isMember = await workspaceService.isMember(id, userId);
      if (!isMember) {
        res.status(403).json({ error: "无权访问此工作空间" });
        return;
      }

      const members = await workspaceService.getWorkspaceMembers(id);

      res.json({
        success: true,
        data: members,
        count: members.length,
      });
    } catch (error) {
      if (error instanceof WorkspaceError) {
        const statusCode = error.code === WorkspaceErrorCodes.WORKSPACE_NOT_FOUND ? 404 : 400;
        res.status(statusCode).json({ error: error.message, code: error.code });
        return;
      }
      logger.error("[WorkspaceController] 获取成员列表失败:", error);
      res.status(500).json({ error: "获取成员列表失败" });
    }
  }

  /**
   * 邀请成员加入工作空间
   * POST /workspaces/:id/invite
   * Requirements: 4.2
   */
  static async inviteMember(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user?.id || (req as any).userId;

      if (!userId) {
        res.status(401).json({ error: "未授权访问" });
        return;
      }

      const { id } = req.params;
      const { email, role } = req.body;

      if (!id) {
        res.status(400).json({ error: "缺少工作空间ID" });
        return;
      }

      if (!email || typeof email !== "string") {
        res.status(400).json({ error: "缺少必要参数: email" });
        return;
      }

      // 验证邮箱格式 - 使用更安全的正则表达式避免ReDoS攻击
      // 限制长度并使用简单的验证模式
      if (email.length > 254) {
        res.status(400).json({ error: "无效的邮箱格式" });
        return;
      }

      const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
      if (!emailRegex.test(email)) {
        res.status(400).json({ error: "无效的邮箱格式" });
        return;
      }

      // 验证角色
      const validRoles = ["editor", "viewer"];
      const safeRole = validRoles.includes(role) ? role : "viewer";

      const invitation = await workspaceService.inviteMember(
        id,
        userId,
        email.toLowerCase().trim(),
        safeRole as "editor" | "viewer",
      );

      res.status(201).json({
        success: true,
        data: invitation,
      });
    } catch (error) {
      if (error instanceof WorkspaceError) {
        let statusCode = 400;
        if (error.code === WorkspaceErrorCodes.WORKSPACE_NOT_FOUND) statusCode = 404;
        if (error.code === WorkspaceErrorCodes.PERMISSION_DENIED) statusCode = 403;
        if (error.code === WorkspaceErrorCodes.MEMBER_LIMIT_REACHED) statusCode = 409;

        res.status(statusCode).json({ error: error.message, code: error.code });
        return;
      }
      logger.error("[WorkspaceController] 邀请成员失败:", error);
      res.status(500).json({ error: "邀请成员失败" });
    }
  }

  /**
   * 接受邀请
   * POST /invitations/:id/accept
   * Requirements: 4.3
   */
  static async acceptInvitation(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user?.id || (req as any).userId;

      if (!userId) {
        res.status(401).json({ error: "未授权访问" });
        return;
      }

      const { id } = req.params;

      if (!id) {
        res.status(400).json({ error: "缺少邀请ID" });
        return;
      }

      const member = await workspaceService.acceptInvitation(id, userId);

      res.json({
        success: true,
        data: member,
        message: "已成功加入工作空间",
      });
    } catch (error) {
      if (error instanceof WorkspaceError) {
        let statusCode = 400;
        if (error.code === WorkspaceErrorCodes.INVITATION_NOT_FOUND) statusCode = 404;
        if (error.code === WorkspaceErrorCodes.INVITATION_EXPIRED) statusCode = 410;
        if (error.code === WorkspaceErrorCodes.ALREADY_MEMBER) statusCode = 409;
        if (error.code === WorkspaceErrorCodes.MEMBER_LIMIT_REACHED) statusCode = 409;

        res.status(statusCode).json({ error: error.message, code: error.code });
        return;
      }
      logger.error("[WorkspaceController] 接受邀请失败:", error);
      res.status(500).json({ error: "接受邀请失败" });
    }
  }

  /**
   * 更新工作空间设置
   * PUT /workspaces/:id/settings
   * Requirements: 4.4
   */
  static async updateSettings(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user?.id || (req as any).userId;

      if (!userId) {
        res.status(401).json({ error: "未授权访问" });
        return;
      }

      const { id } = req.params;
      const { allowPublicSharing, defaultPermission, notificationsEnabled } = req.body;

      if (!id) {
        res.status(400).json({ error: "缺少工作空间ID" });
        return;
      }

      // 构建设置更新对象
      const settings: Record<string, any> = {};

      if (typeof allowPublicSharing === "boolean") {
        settings.allowPublicSharing = allowPublicSharing;
      }

      if (defaultPermission && ["editor", "viewer"].includes(defaultPermission)) {
        settings.defaultPermission = defaultPermission;
      }

      if (typeof notificationsEnabled === "boolean") {
        settings.notificationsEnabled = notificationsEnabled;
      }

      if (Object.keys(settings).length === 0) {
        res.status(400).json({ error: "没有有效的设置更新" });
        return;
      }

      const workspace = await workspaceService.updateSettings(id, userId, settings);

      res.json({
        success: true,
        data: workspace,
      });
    } catch (error) {
      if (error instanceof WorkspaceError) {
        let statusCode = 400;
        if (error.code === WorkspaceErrorCodes.WORKSPACE_NOT_FOUND) statusCode = 404;
        if (error.code === WorkspaceErrorCodes.PERMISSION_DENIED) statusCode = 403;

        res.status(statusCode).json({ error: error.message, code: error.code });
        return;
      }
      logger.error("[WorkspaceController] 更新设置失败:", error);
      res.status(500).json({ error: "更新设置失败" });
    }
  }

  /**
   * 获取用户的所有工作空间
   * GET /workspaces
   */
  static async getUserWorkspaces(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user?.id || (req as any).userId;

      if (!userId) {
        res.status(401).json({ error: "未授权访问" });
        return;
      }

      const workspaces = await workspaceService.getUserWorkspaces(userId);

      res.json({
        success: true,
        data: workspaces,
        count: workspaces.length,
      });
    } catch (error) {
      logger.error("[WorkspaceController] 获取用户工作空间失败:", error);
      res.status(500).json({ error: "获取工作空间列表失败" });
    }
  }

  /**
   * 获取用户的待处理邀请
   * GET /invitations/pending
   */
  static async getPendingInvitations(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user?.id || (req as any).userId;
      const userEmail = (req as any).user?.email;

      if (!userId) {
        res.status(401).json({ error: "未授权访问" });
        return;
      }

      if (!userEmail) {
        res.status(400).json({ error: "无法获取用户邮箱" });
        return;
      }

      const invitations = await workspaceService.getPendingInvitations(userEmail);

      res.json({
        success: true,
        data: invitations,
        count: invitations.length,
      });
    } catch (error) {
      logger.error("[WorkspaceController] 获取待处理邀请失败:", error);
      res.status(500).json({ error: "获取邀请列表失败" });
    }
  }
}
