import fs from 'fs';
import path from 'path';
const FILE_PATH = path.resolve(__dirname, '../../../data/user_generations.json');

function readAll(): any[] {
  if (!fs.existsSync(FILE_PATH)) return [];
  try {
    const raw = fs.readFileSync(FILE_PATH, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return [];
  }
}
function writeAll(arr: any[]) {
  fs.writeFileSync(FILE_PATH, JSON.stringify(arr, null, 2));
}

export async function findDuplicateGeneration({ userId, text, voice, model, contentHash }: any): Promise<any | null> {
  const arr = readAll();
  if (contentHash) {
    return arr.find(r => r.userId === userId && r.contentHash === contentHash) || null;
  }
  return arr.find(r => r.userId === userId && r.text === text && r.voice === voice && r.model === model) || null;
}
export async function addGenerationRecord(record: any): Promise<any> {
  const arr = readAll();
  arr.push({ ...record, timestamp: new Date().toISOString() });
  writeAll(arr);
  return record;
}
export async function isAdminUser(userId: string): Promise<boolean> {
  // 本地存储下可选实现，默认 false
  return false;
} 