import { mongoose } from '../services/mongoService';
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

function sanitizeString(str: any): string {
  if (typeof str !== 'string') return '';
  // 禁止 $、.、{、}、[、] 等特殊符号
  if (/[$.{}\[\]]/.test(str)) return '';
  return str;
}

export async function findDuplicateGeneration({ userId, text, voice, model, contentHash }: GenerationRecord): Promise<any | null> {
  // NoSQL注入防护：所有字段做严格校验
  const safeUserId = sanitizeString(userId);
  const safeText = sanitizeString(text);
  const safeVoice = sanitizeString(voice);
  const safeModel = sanitizeString(model);
  const safeContentHash = sanitizeString(contentHash);
  const query = safeContentHash
    ? { userId: safeUserId, contentHash: safeContentHash }
    : { userId: safeUserId, text: safeText, voice: safeVoice, model: safeModel };
  return await GenerationModel.findOne(query).lean();
}

export async function addGenerationRecord(record: GenerationRecord): Promise<any> {
  // NoSQL注入防护：所有字段做严格校验
  const safeRecord = {
    ...record,
    userId: sanitizeString(record.userId),
    text: sanitizeString(record.text),
    voice: sanitizeString(record.voice),
    model: sanitizeString(record.model),
    contentHash: sanitizeString(record.contentHash),
  };
  return await GenerationModel.create(safeRecord);
}

// 判断用户是否为管理员
import { getUserById } from '../services/userService';
export async function isAdminUser(userId: string): Promise<boolean> {
  const user = await getUserById(userId);
  return !!(user && user.role === 'admin');
} 