/**
 * 管理员路由 - /api/admin
 */
import { Hono } from 'hono';
import type { Env } from '../types';
import { authenticateAdmin } from '../middleware/auth';
import { MongoClient } from '../lib/mongo';
import logger from '../lib/logger';

const admin = new Hono<{ Bindings: Env }>();

// 所有管理员路由都需要管理员认证
admin.use('/*', authenticateAdmin);

// 获取所有用户
admin.get('/users', async (c) => {
  try {
    const mongo = new MongoClient(c.env);
    const users = mongo.collection('user_datas');
    const allUsers = await users.find({}, {
      projection: { password: 0, token: 0, backupCodes: 0, totpSecret: 0 },
      sort: { createdAt: -1 },
    });
    return c.json({ users: allUsers });
  } catch (error) {
    logger.error('获取用户列表失败', { error: String(error) });
    return c.json({ error: '获取用户列表失败' }, 500);
  }
});

// 删除用户
admin.delete('/users/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const mongo = new MongoClient(c.env);
    const users = mongo.collection('user_datas');
    await users.deleteOne({ id });
    return c.json({ message: '用户已删除' });
  } catch (error) {
    return c.json({ error: '删除用户失败' }, 500);
  }
});

// 更新用户角色
admin.put('/users/:id/role', async (c) => {
  try {
    const id = c.req.param('id');
    const { role } = await c.req.json();
    if (!['user', 'admin'].includes(role)) {
      return c.json({ error: '无效的角色' }, 400);
    }
    const mongo = new MongoClient(c.env);
    const users = mongo.collection('user_datas');
    await users.updateOne({ id }, { $set: { role } });
    return c.json({ message: '角色已更新' });
  } catch (error) {
    return c.json({ error: '更新角色失败' }, 500);
  }
});

// 系统状态
admin.get('/status', async (c) => {
  return c.json({
    status: 'ok',
    runtime: 'cloudflare-workers',
    timestamp: new Date().toISOString(),
  });
});

export default admin;
