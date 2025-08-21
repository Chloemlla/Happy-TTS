import fs from 'fs';
import path from 'path';
import { GenerationRecord, isAdminUser as sharedIsAdminUser } from './types';

const FILE_PATH = path.resolve(__dirname, '../../../data/user_generations.json');

function readAll(): GenerationRecord[] {
  if (!fs.existsSync(FILE_PATH)) return [];
  try {
    const raw = fs.readFileSync(FILE_PATH, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function writeAll(arr: GenerationRecord[]) {
  fs.writeFileSync(FILE_PATH, JSON.stringify(arr, null, 2));
}

export async function findDuplicateGeneration({ userId, text, voice, model, contentHash }: GenerationRecord): Promise<GenerationRecord | null> {
  const arr = readAll();
  if (contentHash) {
    return arr.find(r => r.userId === userId && r.contentHash === contentHash) || null;
  }
  return arr.find(r => r.userId === userId && r.text === text && r.voice === voice && r.model === model) || null;
}

export async function addGenerationRecord(record: GenerationRecord): Promise<GenerationRecord> {
  const arr = readAll();
  arr.push({ ...record, timestamp: new Date().toISOString() });
  writeAll(arr);
  return record;
}

export async function isAdminUser(userId: string): Promise<boolean> {
  return sharedIsAdminUser(userId);
}

// 重新导出类型
export type { GenerationRecord }; 