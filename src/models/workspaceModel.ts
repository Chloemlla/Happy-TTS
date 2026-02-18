import mongoose, { type Document, Schema } from "mongoose";
import type { WorkspaceMember, WorkspaceSettings } from "../types/workspace";

// 工作空间成员子文档Schema
const WorkspaceMemberSchema = new Schema<WorkspaceMember>(
  {
    userId: { type: String, required: true },
    role: { type: String, enum: ["admin", "editor", "viewer"], required: true },
    joinedAt: { type: Date, default: Date.now },
    invitedBy: { type: String, required: true },
  },
  { _id: false },
);

// 工作空间设置子文档Schema
const WorkspaceSettingsSchema = new Schema<WorkspaceSettings>(
  {
    allowPublicSharing: { type: Boolean, default: false },
    defaultPermission: { type: String, enum: ["editor", "viewer"], default: "viewer" },
    notificationsEnabled: { type: Boolean, default: true },
  },
  { _id: false },
);

export interface IWorkspace extends Document {
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

const WorkspaceSchema = new Schema<IWorkspace>(
  {
    id: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    description: { type: String, default: "" },
    creatorId: { type: String, required: true },
    members: { type: [WorkspaceMemberSchema], default: [] },
    settings: { type: WorkspaceSettingsSchema, default: () => ({}) },
    memberLimit: { type: Number, default: 10 },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  { collection: "workspaces" },
);

// 索引
WorkspaceSchema.index({ id: 1 }, { unique: true });
WorkspaceSchema.index({ creatorId: 1 });
WorkspaceSchema.index({ "members.userId": 1 });
WorkspaceSchema.index({ createdAt: -1 });

export default mongoose.models.Workspace || mongoose.model<IWorkspace>("Workspace", WorkspaceSchema);
