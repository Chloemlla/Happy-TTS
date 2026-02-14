import mongoose, { Schema, Document } from 'mongoose';
import { ProjectContent, SharingSettings } from '../types/workspace';
import { VoiceStyle } from '../types/recommendation';

// 语音风格子文档Schema
const VoiceStyleSchema = new Schema<VoiceStyle>(
  {
    id: { type: String, required: true },
    name: { type: String, required: true },
    voice: { type: String, required: true },
    model: { type: String, required: true },
    speed: { type: Number, required: true },
    emotionalTone: { type: String, required: true },
    language: { type: String, required: true }
  },
  { _id: false }
);

// 项目内容子文档Schema
const ProjectContentSchema = new Schema<ProjectContent>(
  {
    text: { type: String, required: true },
    voiceConfig: { type: VoiceStyleSchema, required: true },
    generatedAudioUrl: { type: String },
    metadata: { type: Schema.Types.Mixed, default: {} }
  },
  { _id: false }
);

// 共享设置子文档Schema
const SharingSettingsSchema = new Schema<SharingSettings>(
  {
    isShared: { type: Boolean, default: false },
    sharedWith: { type: [String], default: [] },
    permission: { type: String, enum: ['view', 'edit'], default: 'view' }
  },
  { _id: false }
);

export interface IVoiceProject extends Document {
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

const VoiceProjectSchema = new Schema<IVoiceProject>(
  {
    id: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    ownerId: { type: String, required: true },
    workspaceId: { type: String },
    content: { type: ProjectContentSchema, required: true },
    sharing: { type: SharingSettingsSchema, default: () => ({}) },
    activeViewers: { type: [String], default: [] },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
  },
  { collection: 'voice_projects' }
);

// 索引
VoiceProjectSchema.index({ id: 1 }, { unique: true });
VoiceProjectSchema.index({ ownerId: 1 });
VoiceProjectSchema.index({ workspaceId: 1 });
VoiceProjectSchema.index({ 'sharing.sharedWith': 1 });
VoiceProjectSchema.index({ createdAt: -1 });

export default mongoose.models.VoiceProject ||
  mongoose.model<IVoiceProject>('VoiceProject', VoiceProjectSchema);
