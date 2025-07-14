import mongoose from './mongoService';
import { Document } from 'mongoose';

export interface GenerationRecord {
  userId: string;
  text: string;
  voice?: string;
  model?: string;
  outputFormat?: string;
  speed?: number;
  fileName?: string;
  contentHash?: string;
  timestamp?: Date;
}

const generationSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  text: { type: String, required: true },
  voice: { type: String },
  model: { type: String },
  outputFormat: { type: String },
  speed: { type: Number },
  fileName: { type: String },
  contentHash: { type: String },
  timestamp: { type: Date, default: Date.now }
}, { collection: 'user_generations' });

const GenerationModel = mongoose.models.UserGeneration || mongoose.model('UserGeneration', generationSchema);

export async function findDuplicateGeneration({ userId, text, voice, model, contentHash }: GenerationRecord): Promise<any | null> {
  // contentHash 优先查找，若无则用 text+voice+model
  const query = contentHash
    ? { userId, contentHash }
    : { userId, text, voice, model };
  return await GenerationModel.findOne(query).lean();
}

export async function addGenerationRecord(record: GenerationRecord): Promise<any> {
  return await GenerationModel.create(record);
}

// 判断用户是否为管理员
import { getUserById } from '../services/userService';
export async function isAdminUser(userId: string): Promise<boolean> {
  const user = await getUserById(userId);
  return !!(user && user.role === 'admin');
} 