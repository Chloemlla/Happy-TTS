import mongoose, { type Document, Schema } from "mongoose";
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

// 项目内容快照子文档Schema
const ProjectContentSnapshotSchema = new Schema<ProjectContent>(
  {
    text: { type: String, required: true },
    voiceConfig: { type: VoiceStyleSchema, required: true },
    generatedAudioUrl: { type: String },
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  { _id: false },
);

export interface IVersion extends Document {
  id: string;
  projectId: string;
  versionNumber: number;
  snapshot: ProjectContent;
  authorId: string;
  changeSummary: string;
  createdAt: Date;
}

const VersionSchema = new Schema<IVersion>(
  {
    id: { type: String, required: true, unique: true },
    projectId: { type: String, required: true },
    versionNumber: { type: Number, required: true },
    snapshot: { type: ProjectContentSnapshotSchema, required: true },
    authorId: { type: String, required: true },
    changeSummary: { type: String, default: "" },
    createdAt: { type: Date, default: Date.now },
  },
  { collection: "versions" },
);

// 索引
VersionSchema.index({ id: 1 }, { unique: true });
VersionSchema.index({ projectId: 1, versionNumber: -1 });
VersionSchema.index({ projectId: 1, createdAt: -1 });
VersionSchema.index({ authorId: 1 });

export default mongoose.models.Version || mongoose.model<IVersion>("Version", VersionSchema);
