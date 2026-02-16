import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/authMiddleware';
import {
  createApiKey, listUserKeys, listAllKeys,
  revokeKey, enableKey, deleteKey, updateKey,
  ALL_PERMISSIONS,
} from '../services/apiKeyService';
import logger from '../utils/logger';

const router = Router();

// 所有路由都需要 JWT 认证
router.use(authMiddleware);

/** 获取可用权限列表 */
router.get('/permissions', (_req: Request, res: Response) => {
  res.json({ success: true, permissions: ALL_PERMISSIONS });
});

/** 创建 API Key（任何已登录用户） */
router.post('/', async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { name, permissions, rateLimit, expiresInDays } = req.body;

    if (!name || typeof name !== 'string' || name.trim().length === 0 || name.trim().length > 50) {
      return res.status(400).json({ error: '名称不能为空且不超过50字符' });
    }

    // 非管理员不能设置 '*' 权限
    let perms = Array.isArray(permissions) ? permissions : ['status'];
    if (user.role !== 'admin') {
      perms = perms.filter((p: string) => p !== '*');
    }

    const result = await createApiKey({
      name: name.trim(),
      userId: user.id,
      permissions: perms,
      rateLimit: Math.min(Math.max(Number(rateLimit) || 60, 1), 1000),
      expiresInDays: expiresInDays != null ? Math.min(Math.max(Number(expiresInDays), 1), 365) : null,
    });

    return res.json({ success: true, ...result, message: '请妥善保存此密钥，它不会再次显示' });
  } catch (err) {
    logger.error('[ApiKey] 创建失败', err);
    return res.status(500).json({ error: '创建 API Key 失败' });
  }
});

/** 列出当前用户的 Key */
router.get('/mine', async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const keys = await listUserKeys(user.id);
    return res.json({ success: true, keys });
  } catch (err) {
    logger.error('[ApiKey] 列出失败', err);
    return res.status(500).json({ error: '获取 API Key 列表失败' });
  }
});

/** 列出所有 Key（管理员） */
router.get('/all', async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    if (user.role !== 'admin') return res.status(403).json({ error: '需要管理员权限' });
    const keys = await listAllKeys();
    return res.json({ success: true, keys });
  } catch (err) {
    logger.error('[ApiKey] 列出全部失败', err);
    return res.status(500).json({ error: '获取失败' });
  }
});

/** 更新 Key（所有者或管理员） */
router.put('/:keyId', async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { keyId } = req.params;
    const { name, permissions, rateLimit, enabled } = req.body;

    // 先查找确认所有权
    const allKeys = user.role === 'admin' ? await listAllKeys() : await listUserKeys(user.id);
    const target = allKeys.find(k => k.keyId === keyId);
    if (!target) return res.status(404).json({ error: 'API Key 不存在' });

    const updates: any = {};
    if (name !== undefined) updates.name = String(name).trim().slice(0, 50);
    if (permissions !== undefined) updates.permissions = Array.isArray(permissions) ? permissions : undefined;
    if (rateLimit !== undefined) updates.rateLimit = Math.min(Math.max(Number(rateLimit) || 60, 1), 1000);
    if (enabled !== undefined) updates.enabled = !!enabled;

    const updated = await updateKey(keyId, updates);
    return res.json({ success: true, key: updated });
  } catch (err) {
    logger.error('[ApiKey] 更新失败', err);
    return res.status(500).json({ error: '更新失败' });
  }
});

/** 吊销 Key */
router.post('/:keyId/revoke', async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { keyId } = req.params;
    const allKeys = user.role === 'admin' ? await listAllKeys() : await listUserKeys(user.id);
    if (!allKeys.find(k => k.keyId === keyId)) return res.status(404).json({ error: 'API Key 不存在' });

    await revokeKey(keyId);
    return res.json({ success: true, message: '已吊销' });
  } catch (err) {
    logger.error('[ApiKey] 吊销失败', err);
    return res.status(500).json({ error: '吊销失败' });
  }
});

/** 启用 Key */
router.post('/:keyId/enable', async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { keyId } = req.params;
    const allKeys = user.role === 'admin' ? await listAllKeys() : await listUserKeys(user.id);
    if (!allKeys.find(k => k.keyId === keyId)) return res.status(404).json({ error: 'API Key 不存在' });

    await enableKey(keyId);
    return res.json({ success: true, message: '已启用' });
  } catch (err) {
    logger.error('[ApiKey] 启用失败', err);
    return res.status(500).json({ error: '启用失败' });
  }
});

/** 删除 Key（永久） */
router.delete('/:keyId', async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { keyId } = req.params;
    const allKeys = user.role === 'admin' ? await listAllKeys() : await listUserKeys(user.id);
    if (!allKeys.find(k => k.keyId === keyId)) return res.status(404).json({ error: 'API Key 不存在' });

    await deleteKey(keyId);
    return res.json({ success: true, message: '已永久删除' });
  } catch (err) {
    logger.error('[ApiKey] 删除失败', err);
    return res.status(500).json({ error: '删除失败' });
  }
});

export default router;
