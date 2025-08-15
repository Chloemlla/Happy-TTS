import { mongoose } from '../mongoService';

function sanitizeString(str: any): string {
  if (typeof str !== 'string') return '';
  // 只允许字母、数字、下划线、短横线、点、大小写，长度1-128
  if (!/^[\w\-\.]{1,128}$/.test(str)) return '';
  return str;
}

const modSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  id: { type: String, required: true, unique: true },
  hash: { type: String },
  md5: { type: String }
}, { collection: 'modlist' });

const ModModel = mongoose.models.ModList || mongoose.model('ModList', modSchema);

export async function getAllMods({ withHash, withMd5 }: { withHash?: boolean, withMd5?: boolean } = {}) {
  const mods = await ModModel.find().lean();
  return mods.map((mod: any) => {
    const result: any = { id: mod.id, name: mod.name };
    if (withHash && mod.hash) result.hash = mod.hash;
    if (withMd5 && mod.md5) result.md5 = mod.md5;
    return result;
  });
}

export async function addMod(mod: { name: string, hash?: string, md5?: string }) {
  const safeName = sanitizeString(mod.name);
  const safeHash = mod.hash ? sanitizeString(mod.hash) : undefined;
  const safeMd5 = mod.md5 ? sanitizeString(mod.md5) : undefined;
  if (!safeName) throw new Error('MOD名非法');
  if (await ModModel.findOne({ name: safeName })) {
    throw new Error('MOD名已存在');
  }
  const newMod: any = { id: Date.now().toString(), name: safeName };
  if (safeHash) newMod.hash = safeHash;
  if (safeMd5) newMod.md5 = safeMd5;
  await ModModel.create(newMod);
  return newMod;
}

export async function updateMod(id: string, name: string, hash?: string, md5?: string) {
  const safeId = sanitizeString(id);
  const safeName = sanitizeString(name);
  const safeHash = typeof hash === 'string' ? sanitizeString(hash) : undefined;
  const safeMd5 = typeof md5 === 'string' ? sanitizeString(md5) : undefined;
  if (!safeId || !safeName) throw new Error('参数非法');
  const mod = await ModModel.findOne({ id: safeId });
  if (!mod) throw new Error('未找到MOD');
  mod.name = safeName;
  if (hash !== undefined) {
    if (safeHash) {
      mod.hash = safeHash;
    } else {
      // 清空无效/空hash
      mod.hash = undefined as any;
    }
  }
  if (md5 !== undefined) {
    if (safeMd5) {
      mod.md5 = safeMd5;
    } else {
      // 清空无效/空md5
      mod.md5 = undefined as any;
    }
  }
  await mod.save();
  return mod.toObject();
}

export async function deleteMod(id: string) {
  const safeId = sanitizeString(id);
  if (!safeId) throw new Error('参数非法');
  const mod = await ModModel.findOne({ id: safeId });
  if (!mod) throw new Error('未找到MOD');
  await ModModel.deleteOne({ id: safeId });
  return { success: true };
}

export async function batchAddMods(mods: Array<{ name: string, hash?: string, md5?: string }>) {
  const added: any[] = [];
  for (const mod of mods) {
    const safeName = sanitizeString(mod.name);
    const safeHash = mod.hash ? sanitizeString(mod.hash) : undefined;
    const safeMd5 = mod.md5 ? sanitizeString(mod.md5) : undefined;
    if (!safeName) continue;
    if (await ModModel.findOne({ name: safeName })) continue;
    const newMod: any = { id: Date.now().toString() + Math.floor(Math.random()*10000), name: safeName };
    if (safeHash) newMod.hash = safeHash;
    if (safeMd5) newMod.md5 = safeMd5;
    await ModModel.create(newMod);
    added.push(newMod);
  }
  return added;
}

export async function batchDeleteMods(ids: string[]) {
  let count = 0;
  for (const id of ids) {
    const safeId = sanitizeString(id);
    if (!safeId) continue;
    const mod = await ModModel.findOne({ id: safeId });
    if (!mod) continue;
    await ModModel.deleteOne({ id: safeId });
    count++;
  }
  return { deleted: count };
} 