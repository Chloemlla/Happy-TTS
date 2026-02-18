import mongoose, { type Document, Schema } from "mongoose";
import type { CursorPosition, Operation, OperationData, SessionParticipant } from "../types/collaboration";
import type { VoiceStyle } from "../types/recommendation";
import type { ProjectContent } from "../types/workspace";

// 语音风格子文档Schema
const VoiceStyleSchema = new Schema<VoiceStyle>(
  {
    id: { type: String, required: true },
    name: { type: String, required: true },
    voice: { type: String, required: true },
    model: { type: String, required: true },
    speed: { type: Number, required: true },
    emotionalTone: { type: String, required: true },
    language: { type: String, required: true },
  },
  { _id: false },
);

// 项目内容子文档Schema
const ProjectContentSchema = new Schema<ProjectContent>(
  {
    text: { type: String, required: true },
    voiceConfig: { type: VoiceStyleSchema, required: true },
    generatedAudioUrl: { type: String },
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  { _id: false },
);

// 光标位置子文档Schema
const CursorPositionSchema = new Schema<CursorPosition>(
  {
    line: { type: Number, required: true },
    column: { type: Number, required: true },
  },
  { _id: false },
);

// 文本选择子文档Schema
const TextSelectionSchema = new Schema(
  {
    start: { type: CursorPositionSchema, required: true },
    end: { type: CursorPositionSchema, required: true },
  },
  { _id: false },
);

// 操作数据子文档Schema
const OperationDataSchema = new Schema<OperationData>(
  {
    position: { type: CursorPositionSchema },
    text: { type: String },
    length: { type: Number },
    configKey: { type: String },
    configValue: { type: Schema.Types.Mixed },
  },
  { _id: false },
);

// 操作子文档Schema
const OperationSchema = new Schema<Operation>(
  {
    id: { type: String, required: true },
    type: { type: String, enum: ["insert", "delete", "replace", "config_change"], required: true },
    userId: { type: String, required: true },
    timestamp: { type: Date, required: true },
    data: { type: OperationDataSchema, required: true },
  },
  { _id: false },
);

// 会话参与者子文档Schema
const SessionParticipantSchema = new Schema<SessionParticipant>(
  {
    userId: { type: String, required: true },
    cursorPosition: { type: CursorPositionSchema, required: true },
    selection: { type: TextSelectionSchema },
    isConnected: { type: Boolean, default: true },
    lastSeen: { type: Date, default: Date.now },
    pendingChanges: { type: [OperationSchema], default: [] },
  },
  { _id: false },
);

export interface ICollaborationSession extends Document {
  id: string;
  projectId: string;
  participants: SessionParticipant[];
  state: ProjectContent;
  pendingOperations: Operation[];
  startedAt: Date;
  lastActivity: Date;
  status: "active" | "ended";
}

const CollaborationSessionSchema = new Schema<ICollaborationSession>(
  {
    id: { type: String, required: true, unique: true },
    projectId: { type: String, required: true },
    participants: { type: [SessionParticipantSchema], default: [] },
    state: { type: ProjectContentSchema, required: true },
    pendingOperations: { type: [OperationSchema], default: [] },
    startedAt: { type: Date, default: Date.now },
    lastActivity: { type: Date, default: Date.now },
    status: { type: String, enum: ["active", "ended"], default: "active" },
  },
  { collection: "collaboration_sessions" },
);

// 索引
CollaborationSessionSchema.index({ id: 1 }, { unique: true });
CollaborationSessionSchema.index({ projectId: 1 });
CollaborationSessionSchema.index({ status: 1 });
CollaborationSessionSchema.index({ "participants.userId": 1 });
CollaborationSessionSchema.index({ lastActivity: -1 });

export default mongoose.models.CollaborationSession ||
  mongoose.model<ICollaborationSession>("CollaborationSession", CollaborationSessionSchema);
