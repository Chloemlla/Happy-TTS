import { Request, Response } from 'express';
import { getAllMods, addMod as addModStorage, updateMod as updateModStorage } from '../services/modlistStorage';

const MODIFY_CODE = process.env.MODIFY_CODE || '123456';

export const getModList = async (req: Request, res: Response) => {
  const mods = await getAllMods();
  res.json({ mods });
};

export const getModListJson = async (req: Request, res: Response) => {
  const mods = await getAllMods();
  res.json(mods);
};

export const addMod = async (req: Request, res: Response) => {
  const { name, code } = req.body;
  if (!name || typeof name !== 'string') {
    return res.status(400).json({ error: 'MOD名不能为空' });
  }
  if (code !== MODIFY_CODE) {
    return res.status(403).json({ error: '修改码错误' });
  }
  try {
    const newMod = await addModStorage({ name });
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