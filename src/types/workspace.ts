/**
 * 团队工作空间类型定义
 * Team Workspace Type Definitions
 */

// 工作空间接口
export interface Workspace {
  id: string;
  name: string;
  description: string;
  creatorId: string;
  members: WorkspaceMember[];
  settings: WorkspaceSettings;
  memberLimit: number;
  createdAt: Date;
  updatedAt: Date;
}

// 工作空间成员接口
export interface WorkspaceMember {
  userId: string;
  role: "admin" | "editor" | "viewer";
  joinedAt: Date;
  invitedBy: string;
}

// 工作空间设置接口
export interface WorkspaceSettings {
  allowPublicSharing: boolean;
  defaultPermission: "editor" | "viewer";
  notificationsEnabled: boolean;
}

// 邀请接口
export interface Invitation {
  id: string;
  workspaceId: string;
  inviteeEmail: string;
  role: "editor" | "viewer";
  status: "pending" | "accepted" | "declined" | "expired";
  createdAt: Date;
  expiresAt: Date;
}

// 语音项目接口
export interface VoiceProject {
  id: string;
  name: string;
  ownerId: string;
  workspaceId?: string;
  content: ProjectContent;
  sharing: SharingSettings;
  activeViewers: string[];
  createdAt: Date;
  updatedAt: Date;
}

// 项目内容接口
export interface ProjectContent {
  text: string;
  voiceConfig: import("./recommendation").VoiceStyle;
  generatedAudioUrl?: string;
  metadata: Record<string, any>;
}

// 共享设置接口
export interface SharingSettings {
  isShared: boolean;
  sharedWith: string[];
  permission: "view" | "edit";
}

// 项目通知接口
export interface ProjectNotification {
  id: string;
  projectId: string;
  type: "modified" | "shared" | "unshared" | "comment";
  actorId: string;
  recipientIds: string[];
  message: string;
  createdAt: Date;
}

// 修改记录接口
export interface ModificationRecord {
  id: string;
  projectId: string;
  userId: string;
  action: string;
  changes: Record<string, any>;
  timestamp: Date;
}
