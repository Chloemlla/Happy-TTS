import { Request, Response } from 'express';
import { getAllMods, addMod as addModStorage, updateMod as updateModStorage, deleteMod as deleteModStorage, batchAddMods as batchAddModsService, batchDeleteMods as batchDeleteModsService } from '../services/modlistStorage';
import * as crypto from 'crypto';

const MODIFY_CODE = process.env.MODIFY_CODE || '123456';

export const getModList = async (req: Request, res: Response) => {
  try {
    console.log('🔐 [ModList] 开始处理MOD列表请求...');
    console.log('   用户ID:', req.user?.id);
    console.log('   用户名:', req.user?.username);
    console.log('   用户角色:', req.user?.role);
    console.log('   请求IP:', req.ip);

  const { withHash, withMd5 } = req.query;
  const mods = await getAllMods({
    withHash: withHash === '1' || withHash === 'true',
    withMd5: withMd5 === '1' || withMd5 === 'true',
  });

    console.log('📊 [ModList] 获取到MOD数量:', mods.length);

    // 检查是否为管理员用户
    if (req.user && req.user.role === 'admin') {
      console.log('✅ [ModList] 管理员用户，返回加密数据');

      // 获取管理员token作为加密密钥
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        console.log('❌ [ModList] Token格式错误：未携带Token或格式不正确');
        res.status(401).json({ error: '未携带Token，请先登录' });
        return;
      }
      
      const token = authHeader.substring(7); // 移除 'Bearer ' 前缀
      if (!token) {
        console.log('❌ [ModList] Token为空');
        res.status(401).json({ error: 'Token为空' });
        return;
      }

      console.log('✅ [ModList] Token获取成功，长度:', token.length);

      // 准备加密数据
      const responseData = { mods };
      const jsonData = JSON.stringify(responseData);
      console.log('📝 [ModList] JSON数据准备完成，长度:', jsonData.length);

      // 使用AES-256-CBC加密数据
      console.log('🔐 [ModList] 开始AES-256-CBC加密...');
      const algorithm = 'aes-256-cbc';
      
      // 生成密钥
      console.log('   生成密钥...');
      const key = crypto.createHash('sha256').update(token).digest();
      console.log('   密钥生成完成，长度:', key.length);
      
      // 生成IV
      console.log('   生成初始化向量(IV)...');
      const iv = crypto.randomBytes(16);
      console.log('   IV生成完成，长度:', iv.length);
      console.log('   IV (hex):', iv.toString('hex'));
      
      // 创建加密器
      console.log('   创建加密器...');
      const cipher = crypto.createCipheriv(algorithm, key, iv);
      
      // 执行加密
      console.log('   开始加密数据...');
      let encrypted = cipher.update(jsonData, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      console.log('✅ [ModList] 加密完成');
      console.log('   原始数据长度:', jsonData.length);
      console.log('   加密后数据长度:', encrypted.length);
      console.log('   加密算法:', algorithm);
      console.log('   密钥长度:', key.length);
      console.log('   IV长度:', iv.length);

      // 返回加密后的数据
      const response = { 
        success: true, 
        data: encrypted,
        iv: iv.toString('hex')
      };
      
      console.log('📤 [ModList] 准备返回加密数据');
      console.log('   响应数据大小:', JSON.stringify(response).length);
      
      res.json(response);
      
      console.log('✅ [ModList] 管理员MOD列表加密请求处理完成');
    } else {
      // 普通用户或未登录用户，返回未加密数据
      console.log('📝 [ModList] 普通用户，返回未加密数据');
  res.json({ mods });
      console.log('✅ [ModList] 普通用户MOD列表请求处理完成');
    }
    
  } catch (error) {
    console.error('❌ [ModList] 获取MOD列表失败:', error);
    res.status(500).json({ error: '获取MOD列表失败' });
  }
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
  const { code } = req.body;
  if (code !== MODIFY_CODE) {
    return res.status(403).json({ error: '修改码错误' });
  }
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