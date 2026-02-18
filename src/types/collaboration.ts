/**
 * 实时协作类型定义
 * Real-time Collaboration Type Definitions
 */

import type { ProjectContent } from "./workspace";

// 协作会话接口
export interface CollaborationSession {
  id: string;
  projectId: string;
  participants: SessionParticipant[];
  state: ProjectContent;
  pendingOperations: Operation[];
  startedAt: Date;
  lastActivity: Date;
}

// 会话参与者接口
export interface SessionParticipant {
  userId: string;
  cursorPosition: CursorPosition;
  selection?: TextSelection;
  isConnected: boolean;
  lastSeen: Date;
  pendingChanges: Operation[];
}

// 光标位置接口
export interface CursorPosition {
  line: number;
  column: number;
}

// 文本选择接口
export interface TextSelection {
  start: CursorPosition;
  end: CursorPosition;
}

// 操作接口
export interface Operation {
  id: string;
  type: "insert" | "delete" | "replace" | "config_change";
  userId: string;
  timestamp: Date;
  data: OperationData;
}

// 操作数据接口
export interface OperationData {
  position?: CursorPosition;
  text?: string;
  length?: number;
  configKey?: string;
  configValue?: any;
}

// 会话摘要接口
export interface SessionSummary {
  sessionId: string;
  duration: number;
  participantCount: number;
  operationCount: number;
  finalState: ProjectContent;
}

// 协作状态枚举
export enum CollaborationStatus {
  ACTIVE = "active",
  ENDED = "ended",
  PAUSED = "paused",
}

// WebSocket消息类型
export interface CollaborationMessage {
  type: "operation" | "cursor" | "join" | "leave" | "sync";
  sessionId: string;
  userId: string;
  payload: any;
  timestamp: Date;
}
