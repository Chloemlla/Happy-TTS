import fs from 'fs';
import path from 'path';
import { formatModForOutput } from './shared';

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

export async function getAllMods({ withHash, withMd5 }: { withHash?: boolean, withMd5?: boolean } = {}) {
  const list = readModList();
  return list.map((mod: any) => formatModForOutput(mod, { withHash, withMd5 }));
}

export async function addMod(mod: { name: string, hash?: string, md5?: string }) {
  const list = readModList();
  if (list.find((m: any) => m.name === mod.name)) {
    throw new Error('MOD名已存在');
  }
  const newMod: any = { id: Date.now().toString(), name: mod.name };
  if (mod.hash) newMod.hash = mod.hash;
  if (mod.md5) newMod.md5 = mod.md5;
  list.push(newMod);
  writeModList(list);
  return newMod;
}

export async function updateMod(id: string, name: string, hash?: string, md5?: string) {
  const list = readModList();
  const mod = list.find((m: any) => m.id === id);
  if (!mod) throw new Error('未找到MOD');
  mod.name = name;
  if (hash !== undefined) {
    if (hash) mod.hash = hash; else delete mod.hash;
  }
  if (md5 !== undefined) {
    if (md5) mod.md5 = md5; else delete mod.md5;
  }
  writeModList(list);
  return mod;
}

export async function deleteMod(id: string) {
  const list = readModList();
  const idx = list.findIndex((m: any) => m.id === id);
  if (idx === -1) throw new Error('未找到MOD');
  list.splice(idx, 1);
  writeModList(list);
  return { success: true };
}

export async function batchAddMods(mods: Array<{ name: string, hash?: string, md5?: string }>) {
  const list = readModList();
  const added: any[] = [];
  for (const mod of mods) {
    if (!mod.name || list.find((m: any) => m.name === mod.name)) continue;
    const newMod: any = { id: Date.now().toString() + Math.floor(Math.random()*10000), name: mod.name };
    if (mod.hash) newMod.hash = mod.hash;
    if (mod.md5) newMod.md5 = mod.md5;
    list.push(newMod);
    added.push(newMod);
  }
  writeModList(list);
  return added;
}

export async function batchDeleteMods(ids: string[]) {
  const list = readModList();
  let count = 0;
  for (const id of ids) {
    const idx = list.findIndex((m: any) => m.id === id);
    if (idx !== -1) {
      list.splice(idx, 1);
      count++;
    }
  }
  writeModList(list);
  return { deleted: count };
} 