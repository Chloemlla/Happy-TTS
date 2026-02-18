/**
 * 工作空间服务 - Workspace Service
 * 提供团队工作空间管理、成员邀请和设置功能
 *
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5
 */

import InvitationModel, { type IInvitation } from "../models/invitationModel";
import WorkspaceModel, { type IWorkspace } from "../models/workspaceModel";
import type { Invitation, Workspace, WorkspaceMember, WorkspaceSettings } from "../types/workspace";
import logger from "../utils/logger";

// 默认成员限制
const DEFAULT_MEMBER_LIMIT = 10;

// 邀请过期时间（7天）
const INVITATION_EXPIRY_DAYS = 7;

// 错误代码
export const WorkspaceErrorCodes = {
  WORKSPACE_NOT_FOUND: "WS_001",
  MEMBER_LIMIT_REACHED: "WS_002",
  PERMISSION_DENIED: "WS_003",
  INVITATION_EXPIRED: "WS_004",
  INVITATION_NOT_FOUND: "WS_005",
  ALREADY_MEMBER: "WS_006",
  INVALID_ROLE: "WS_007",
};

/**
 * 工作空间错误类
 */
export class WorkspaceError extends Error {
  constructor(
    message: string,
    public code: string,
  ) {
    super(message);
    this.name = "WorkspaceError";
  }
}

/**
 * 工作空间服务类
 */
export class WorkspaceService {
  /**
   * 生成唯一的工作空间ID
   * @returns 唯一ID字符串
   */
  private generateUniqueId(): string {
    const timestamp = Date.now().toString(36);
    const randomPart = Math.random().toString(36).substring(2, 11);
    return `ws-${timestamp}-${randomPart}`;
  }

  /**
   * 生成唯一的邀请ID
   * @returns 唯一ID字符串
   */
  private generateInvitationId(): string {
    const timestamp = Date.now().toString(36);
    const randomPart = Math.random().toString(36).substring(2, 11);
    return `inv-${timestamp}-${randomPart}`;
  }

  /**
   * 创建工作空间
   * Requirements: 4.1
   *
   * @param creatorId 创建者用户ID
   * @param name 工作空间名称
   * @param description 工作空间描述（可选）
   * @returns 创建的工作空间
   */
  async createWorkspace(creatorId: string, name: string, description: string = ""): Promise<Workspace> {
    try {
      const now = new Date();
      const workspaceId = this.generateUniqueId();

      // 创建者自动成为管理员（Requirements 4.1）
      const creatorMember: WorkspaceMember = {
        userId: creatorId,
        role: "admin",
        joinedAt: now,
        invitedBy: creatorId, // 创建者自己邀请自己
      };

      const defaultSettings: WorkspaceSettings = {
        allowPublicSharing: false,
        defaultPermission: "viewer",
        notificationsEnabled: true,
      };

      const workspaceData = {
        id: workspaceId,
        name,
        description,
        creatorId,
        members: [creatorMember],
        settings: defaultSettings,
        memberLimit: DEFAULT_MEMBER_LIMIT,
        createdAt: now,
        updatedAt: now,
      };

      const workspace = await WorkspaceModel.create(workspaceData);

      logger.info(`[WorkspaceService] 创建工作空间成功: ${workspaceId}, 创建者: ${creatorId}`);

      return this.toWorkspace(workspace);
    } catch (error) {
      logger.error("[WorkspaceService] 创建工作空间失败:", error);
      throw error;
    }
  }

  /**
   * 获取工作空间成员列表
   * Requirements: 4.1
   *
   * @param workspaceId 工作空间ID
   * @returns 成员列表
   */
  async getWorkspaceMembers(workspaceId: string): Promise<WorkspaceMember[]> {
    try {
      const workspace = await WorkspaceModel.findOne({ id: workspaceId }).lean();

      if (!workspace) {
        throw new WorkspaceError(`工作空间不存在: ${workspaceId}`, WorkspaceErrorCodes.WORKSPACE_NOT_FOUND);
      }

      return workspace.members;
    } catch (error) {
      if (error instanceof WorkspaceError) throw error;
      logger.error("[WorkspaceService] 获取工作空间成员失败:", error);
      throw error;
    }
  }

  /**
   * 获取工作空间详情
   *
   * @param workspaceId 工作空间ID
   * @returns 工作空间详情
   */
  async getWorkspace(workspaceId: string): Promise<Workspace> {
    try {
      const workspace = await WorkspaceModel.findOne({ id: workspaceId }).lean();

      if (!workspace) {
        throw new WorkspaceError(`工作空间不存在: ${workspaceId}`, WorkspaceErrorCodes.WORKSPACE_NOT_FOUND);
      }

      return this.toWorkspace(workspace);
    } catch (error) {
      if (error instanceof WorkspaceError) throw error;
      logger.error("[WorkspaceService] 获取工作空间详情失败:", error);
      throw error;
    }
  }

  /**
   * 邀请成员加入工作空间
   * Requirements: 4.2, 4.5
   *
   * @param workspaceId 工作空间ID
   * @param inviterId 邀请者用户ID
   * @param inviteeEmail 被邀请者邮箱
   * @param role 分配的角色
   * @returns 邀请对象
   */
  async inviteMember(
    workspaceId: string,
    inviterId: string,
    inviteeEmail: string,
    role: "editor" | "viewer",
  ): Promise<Invitation> {
    try {
      // 获取工作空间
      const workspace = await WorkspaceModel.findOne({ id: workspaceId }).lean();

      if (!workspace) {
        throw new WorkspaceError(`工作空间不存在: ${workspaceId}`, WorkspaceErrorCodes.WORKSPACE_NOT_FOUND);
      }

      // 检查邀请者权限（只有管理员可以邀请）
      const inviter = workspace.members.find((m: WorkspaceMember) => m.userId === inviterId);
      if (!inviter || inviter.role !== "admin") {
        throw new WorkspaceError("只有管理员可以邀请成员", WorkspaceErrorCodes.PERMISSION_DENIED);
      }

      // 检查成员数量限制（Requirements 4.5）
      if (workspace.members.length >= workspace.memberLimit) {
        throw new WorkspaceError(
          `工作空间已达到成员上限 (${workspace.memberLimit})`,
          WorkspaceErrorCodes.MEMBER_LIMIT_REACHED,
        );
      }

      // 验证角色
      if (!["editor", "viewer"].includes(role)) {
        throw new WorkspaceError(`无效的角色: ${role}`, WorkspaceErrorCodes.INVALID_ROLE);
      }

      const now = new Date();
      const expiresAt = new Date(now.getTime() + INVITATION_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

      const invitationData = {
        id: this.generateInvitationId(),
        workspaceId,
        inviteeEmail,
        role,
        status: "pending" as const,
        createdAt: now,
        expiresAt,
      };

      const invitation = await InvitationModel.create(invitationData);

      logger.info(`[WorkspaceService] 创建邀请成功: ${invitation.id}, 工作空间: ${workspaceId}, 邮箱: ${inviteeEmail}`);

      return this.toInvitation(invitation);
    } catch (error) {
      if (error instanceof WorkspaceError) throw error;
      logger.error("[WorkspaceService] 邀请成员失败:", error);
      throw error;
    }
  }

  /**
   * 接受邀请加入工作空间
   * Requirements: 4.3
   *
   * @param invitationId 邀请ID
   * @param userId 接受邀请的用户ID
   * @returns 新成员信息
   */
  async acceptInvitation(invitationId: string, userId: string): Promise<WorkspaceMember> {
    try {
      // 获取邀请
      const invitation = await InvitationModel.findOne({ id: invitationId });

      if (!invitation) {
        throw new WorkspaceError(`邀请不存在: ${invitationId}`, WorkspaceErrorCodes.INVITATION_NOT_FOUND);
      }

      // 检查邀请状态
      if (invitation.status !== "pending") {
        throw new WorkspaceError(
          `邀请已${invitation.status === "accepted" ? "被接受" : invitation.status === "declined" ? "被拒绝" : "过期"}`,
          WorkspaceErrorCodes.INVITATION_EXPIRED,
        );
      }

      // 检查邀请是否过期
      if (new Date() > invitation.expiresAt) {
        // 更新邀请状态为过期
        await InvitationModel.updateOne({ id: invitationId }, { status: "expired" });
        throw new WorkspaceError("邀请已过期", WorkspaceErrorCodes.INVITATION_EXPIRED);
      }

      // 获取工作空间
      const workspace = await WorkspaceModel.findOne({ id: invitation.workspaceId });

      if (!workspace) {
        throw new WorkspaceError(`工作空间不存在: ${invitation.workspaceId}`, WorkspaceErrorCodes.WORKSPACE_NOT_FOUND);
      }

      // 检查用户是否已经是成员
      const existingMember = workspace.members.find((m: WorkspaceMember) => m.userId === userId);
      if (existingMember) {
        throw new WorkspaceError("用户已经是工作空间成员", WorkspaceErrorCodes.ALREADY_MEMBER);
      }

      // 再次检查成员限制
      if (workspace.members.length >= workspace.memberLimit) {
        throw new WorkspaceError(
          `工作空间已达到成员上限 (${workspace.memberLimit})`,
          WorkspaceErrorCodes.MEMBER_LIMIT_REACHED,
        );
      }

      const now = new Date();

      // 创建新成员（使用邀请中指定的角色，Requirements 4.3）
      const newMember: WorkspaceMember = {
        userId,
        role: invitation.role,
        joinedAt: now,
        invitedBy: workspace.creatorId, // 或者可以从邀请中获取邀请者ID
      };

      // 更新工作空间成员列表
      await WorkspaceModel.updateOne(
        { id: invitation.workspaceId },
        {
          $push: { members: newMember },
          $set: { updatedAt: now },
        },
      );

      // 更新邀请状态
      await InvitationModel.updateOne({ id: invitationId }, { status: "accepted" });

      logger.info(`[WorkspaceService] 用户 ${userId} 接受邀请加入工作空间 ${invitation.workspaceId}`);

      return newMember;
    } catch (error) {
      if (error instanceof WorkspaceError) throw error;
      logger.error("[WorkspaceService] 接受邀请失败:", error);
      throw error;
    }
  }

  /**
   * 更新工作空间设置
   * Requirements: 4.4
   *
   * @param workspaceId 工作空间ID
   * @param adminId 管理员用户ID
   * @param settings 要更新的设置
   * @returns 更新后的工作空间
   */
  async updateSettings(workspaceId: string, adminId: string, settings: Partial<WorkspaceSettings>): Promise<Workspace> {
    try {
      const workspace = await WorkspaceModel.findOne({ id: workspaceId });

      if (!workspace) {
        throw new WorkspaceError(`工作空间不存在: ${workspaceId}`, WorkspaceErrorCodes.WORKSPACE_NOT_FOUND);
      }

      // 检查权限（只有管理员可以修改设置）
      const admin = workspace.members.find((m: WorkspaceMember) => m.userId === adminId);
      if (!admin || admin.role !== "admin") {
        throw new WorkspaceError("只有管理员可以修改工作空间设置", WorkspaceErrorCodes.PERMISSION_DENIED);
      }

      const now = new Date();

      // 合并设置
      const updatedSettings: WorkspaceSettings = {
        ...workspace.settings,
        ...settings,
      };

      // 更新工作空间
      await WorkspaceModel.updateOne(
        { id: workspaceId },
        {
          $set: {
            settings: updatedSettings,
            updatedAt: now,
          },
        },
      );

      logger.info(`[WorkspaceService] 更新工作空间设置成功: ${workspaceId}`);

      // 返回更新后的工作空间
      const updated = await WorkspaceModel.findOne({ id: workspaceId }).lean();
      return this.toWorkspace(updated!);
    } catch (error) {
      if (error instanceof WorkspaceError) throw error;
      logger.error("[WorkspaceService] 更新工作空间设置失败:", error);
      throw error;
    }
  }

  /**
   * 获取用户的所有工作空间
   *
   * @param userId 用户ID
   * @returns 工作空间列表
   */
  async getUserWorkspaces(userId: string): Promise<Workspace[]> {
    try {
      const workspaces = await WorkspaceModel.find({
        "members.userId": userId,
      }).lean();

      return workspaces.map((ws) => this.toWorkspace(ws));
    } catch (error) {
      logger.error("[WorkspaceService] 获取用户工作空间失败:", error);
      throw error;
    }
  }

  /**
   * 获取用户的待处理邀请
   *
   * @param email 用户邮箱
   * @returns 邀请列表
   */
  async getPendingInvitations(email: string): Promise<Invitation[]> {
    try {
      const now = new Date();

      // 先更新过期的邀请
      await InvitationModel.updateMany(
        {
          inviteeEmail: email,
          status: "pending",
          expiresAt: { $lt: now },
        },
        { status: "expired" },
      );

      // 获取待处理的邀请
      const invitations = await InvitationModel.find({
        inviteeEmail: email,
        status: "pending",
      }).lean();

      return invitations.map((inv) => this.toInvitation(inv));
    } catch (error) {
      logger.error("[WorkspaceService] 获取待处理邀请失败:", error);
      throw error;
    }
  }

  /**
   * 检查用户是否是工作空间成员
   *
   * @param workspaceId 工作空间ID
   * @param userId 用户ID
   * @returns 是否是成员
   */
  async isMember(workspaceId: string, userId: string): Promise<boolean> {
    try {
      const workspace = await WorkspaceModel.findOne({
        id: workspaceId,
        "members.userId": userId,
      }).lean();

      return !!workspace;
    } catch (error) {
      logger.error("[WorkspaceService] 检查成员身份失败:", error);
      return false;
    }
  }

  /**
   * 获取用户在工作空间中的角色
   *
   * @param workspaceId 工作空间ID
   * @param userId 用户ID
   * @returns 用户角色或null
   */
  async getMemberRole(workspaceId: string, userId: string): Promise<"admin" | "editor" | "viewer" | null> {
    try {
      const workspace = await WorkspaceModel.findOne({ id: workspaceId }).lean();

      if (!workspace) return null;

      const member = workspace.members.find((m: WorkspaceMember) => m.userId === userId);
      return member?.role || null;
    } catch (error) {
      logger.error("[WorkspaceService] 获取成员角色失败:", error);
      return null;
    }
  }

  // ==================== 私有辅助方法 ====================

  /**
   * 将MongoDB文档转换为Workspace类型
   */
  private toWorkspace(doc: IWorkspace | any): Workspace {
    return {
      id: doc.id,
      name: doc.name,
      description: doc.description,
      creatorId: doc.creatorId,
      members: doc.members,
      settings: doc.settings,
      memberLimit: doc.memberLimit,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }

  /**
   * 将MongoDB文档转换为Invitation类型
   */
  private toInvitation(doc: IInvitation | any): Invitation {
    return {
      id: doc.id,
      workspaceId: doc.workspaceId,
      inviteeEmail: doc.inviteeEmail,
      role: doc.role,
      status: doc.status,
      createdAt: doc.createdAt,
      expiresAt: doc.expiresAt,
    };
  }
}

// 导出单例实例
export const workspaceService = new WorkspaceService();
