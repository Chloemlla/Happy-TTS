import { Request, Response } from 'express';
import { getAllMods, addMod as addModStorage, updateMod as updateModStorage, deleteMod as deleteModStorage, batchAddMods as batchAddModsService, batchDeleteMods as batchDeleteModsService } from '../services/modlistStorage';

const MODIFY_CODE = process.env.MODIFY_CODE || '123456';

export const getModList = async (req: Request, res: Response) => {
  const { withHash, withMd5 } = req.query;
  const mods = await getAllMods({
    withHash: withHash === '1' || withHash === 'true',
    withMd5: withMd5 === '1' || withMd5 === 'true',
  });
  res.json({ mods });
};

export const getModListJson = async (req: Request, res: Response) => {
  const { withHash, withMd5 } = req.query;
  const mods = await getAllMods({
    withHash: withHash === '1' || withHash === 'true',
    withMd5: withMd5 === '1' || withMd5 === 'true',
  });
  res.json(mods);
};

export const addMod = async (req: Request, res: Response) => {
  const { name, code, hash, md5 } = req.body;
  if (!name || typeof name !== 'string') {
    return res.status(400).json({ error: 'MOD名不能为空' });
  }
  if (code !== MODIFY_CODE) {
    return res.status(403).json({ error: '修改码错误' });
  }
  try {
    const newMod = await addModStorage({ name, hash, md5 });
    res.json({ success: true, mod: newMod });
  } catch (e: any) {
    res.status(409).json({ error: e.message || '添加失败' });
  }
};

export const updateMod = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { name, code } = req.body;
  if (!id || !name || typeof name !== 'string') {
    return res.status(400).json({ error: '参数错误' });
  }
  if (code !== MODIFY_CODE) {
    return res.status(403).json({ error: '修改码错误' });
  }
  try {
    const mod = await updateModStorage(id, name);
    res.json({ success: true, mod });
  } catch (e: any) {
    res.status(404).json({ error: e.message || '修改失败' });
  }
};

export const deleteMod = async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    await deleteModStorage(id);
    res.json({ success: true });
  } catch (e: any) {
    res.status(404).json({ error: e.message || '删除失败' });
  }
};

export const batchAddMods = async (req: Request, res: Response) => {
  const mods = req.body;
  if (!Array.isArray(mods)) return res.status(400).json({ error: '参数必须为数组' });
  try {
    const added = await batchAddModsService(mods);
    res.json({ success: true, added });
  } catch (e: any) {
    res.status(500).json({ error: e.message || '批量添加失败' });
  }
};

export const batchDeleteMods = async (req: Request, res: Response) => {
  const ids = req.body;
  if (!Array.isArray(ids)) return res.status(400).json({ error: '参数必须为数组' });
  try {
    const result = await batchDeleteModsService(ids);
    res.json({ success: true, ...result });
  } catch (e: any) {
    res.status(500).json({ error: e.message || '批量删除失败' });
  }
}; 