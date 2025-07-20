import fs from 'fs';
import path from 'path';

const MODLIST_PATH = path.resolve(__dirname, '../../../data/modlist.json');

function readModList() {
  if (!fs.existsSync(MODLIST_PATH)) return [];
  try {
    return JSON.parse(fs.readFileSync(MODLIST_PATH, 'utf-8'));
  } catch {
    return [];
  }
}

function writeModList(list: any[]) {
  fs.writeFileSync(MODLIST_PATH, JSON.stringify(list, null, 2), 'utf-8');
}

export async function getAllMods() {
  return readModList();
}

export async function addMod(mod: { name: string }) {
  const list = readModList();
  if (list.find((m: any) => m.name === mod.name)) {
    throw new Error('MOD名已存在');
  }
  const newMod = { id: Date.now().toString(), name: mod.name };
  list.push(newMod);
  writeModList(list);
  return newMod;
}

export async function updateMod(id: string, name: string) {
  const list = readModList();
  const mod = list.find((m: any) => m.id === id);
  if (!mod) throw new Error('未找到MOD');
  mod.name = name;
  writeModList(list);
  return mod;
} 