import mongoose from '../mongoService';

function sanitizeString(str: any): string {
  if (typeof str !== 'string') return '';
  if (/[$.{}\[\]]/.test(str)) return '';
  return str;
}

const modSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  id: { type: String, required: true, unique: true }
}, { collection: 'modlist' });

const ModModel = mongoose.models.ModList || mongoose.model('ModList', modSchema);

export async function getAllMods() {
  return await ModModel.find().lean();
}

export async function addMod(mod: { name: string }) {
  const safeName = sanitizeString(mod.name);
  if (!safeName) throw new Error('MOD名非法');
  if (await ModModel.findOne({ name: safeName })) {
    throw new Error('MOD名已存在');
  }
  const newMod = { id: Date.now().toString(), name: safeName };
  await ModModel.create(newMod);
  return newMod;
}

export async function updateMod(id: string, name: string) {
  const safeId = sanitizeString(id);
  const safeName = sanitizeString(name);
  if (!safeId || !safeName) throw new Error('参数非法');
  const mod = await ModModel.findOne({ id: safeId });
  if (!mod) throw new Error('未找到MOD');
  mod.name = safeName;
  await mod.save();
  return mod;
} 