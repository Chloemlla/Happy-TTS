import fs from 'fs';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data', 'lottery');
const ROUNDS_FILE = path.join(DATA_DIR, 'rounds.json');
const USERS_FILE = path.join(DATA_DIR, 'users.json');

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}
function readJson(file: string) {
  if (!fs.existsSync(file)) return {};
  try { return JSON.parse(fs.readFileSync(file, 'utf-8')); } catch { return {}; }
}
function writeJson(file: string, data: any) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf-8');
}

export async function getAllRounds() {
  ensureDir();
  const rounds = readJson(ROUNDS_FILE);
  return Object.values(rounds);
}

export async function addRound(round: any) {
  ensureDir();
  const rounds = readJson(ROUNDS_FILE);
  if (rounds[round.id]) throw new Error('轮次已存在');
  rounds[round.id] = round;
  writeJson(ROUNDS_FILE, rounds);
  return round;
}

export async function updateRound(id: string, data: any) {
  ensureDir();
  const rounds = readJson(ROUNDS_FILE);
  if (!rounds[id]) throw new Error('未找到轮次');
  rounds[id] = { ...rounds[id], ...data };
  writeJson(ROUNDS_FILE, rounds);
  return rounds[id];
}

export async function getUserRecord(userId: string) {
  ensureDir();
  const users = readJson(USERS_FILE);
  return users[userId] || null;
}

export async function updateUserRecord(userId: string, data: any) {
  ensureDir();
  const users = readJson(USERS_FILE);
  users[userId] = { ...(users[userId] || {}), ...data };
  writeJson(USERS_FILE, users);
  return users[userId];
} 