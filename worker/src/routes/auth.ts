/**
 * 认证路由 - /api/auth
 */
import { Hono } from 'hono';
import { hash, compare } from 'bcryptjs';
import type { Env } from '../types';
import { signToken, verifyToken } from '../lib/jwt';
import { authenticateToken } from '../middleware/auth';
import { MongoClient } from '../lib/mongo';
import { KVStore } from '../lib/kv-storage';
import logger from '../lib/logger';

const auth = new Hono<{ Bindings: Env }>();

// 注册
auth.post('/register', async (c) => {
  try {
    const { username, password, email } = await c.req.json();

    if (!username || !password) {
      return c.json({ error: '用户名和密码不能为空' }, 400);
    }
    if (username.length < 3 || username.length > 20) {
      return c.json({ error: '用户名长度需在3-20之间' }, 400);
    }
    if (password.length < 6) {
      return c.json({ error: '密码长度至少6位' }, 400);
    }

    const mongo = new MongoClient(c.env);
    const users = mongo.collection('user_datas');

    // 检查用户名是否已存在
    const existing = await users.findOne({ username });
    if (existing) {
      return c.json({ error: '用户名已存在' }, 409);
    }

    const hashedPassword = await hash(password, 12);
    const userId = crypto.randomUUID();
    const now = new Date().toISOString();

    const newUser = {
      id: userId,
      username,
      email: email || '',
      password: hashedPassword,
      role: 'user',
      dailyUsage: 0,
      lastUsageDate: now.split('T')[0],
      createdAt: now,
    };

    await users.insertOne(newUser);

    const token = await signToken(
      { userId, username, role: 'user' },
      c.env.JWT_SECRET
    );

    return c.json({
      message: '注册成功',
      token,
      user: { id: userId, username, role: 'user' },
    });
  } catch (error) {
    logger.error('注册失败', { error: String(error) });
    return c.json({ error: '注册失败' }, 500);
  }
});

// 登录
auth.post('/login', async (c) => {
  try {
    const { username, password } = await c.req.json();

    if (!username || !password) {
      return c.json({ error: '用户名和密码不能为空' }, 400);
    }

    const mongo = new MongoClient(c.env);
    const users = mongo.collection('user_datas');
    const user = await users.findOne({ username });

    if (!user) {
      return c.json({ error: '用户名或密码错误' }, 401);
    }

    const valid = await compare(password, user.password);
    if (!valid) {
      return c.json({ error: '用户名或密码错误' }, 401);
    }

    const token = await signToken(
      { userId: user.id, username: user.username, role: user.role },
      c.env.JWT_SECRET
    );

    // 更新 token
    await users.updateOne({ id: user.id }, { $set: { token, tokenExpiresAt: Date.now() + 86400000 } });

    return c.json({
      message: '登录成功',
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        totpEnabled: user.totpEnabled || false,
        passkeyEnabled: user.passkeyEnabled || false,
      },
    });
  } catch (error) {
    logger.error('登录失败', { error: String(error) });
    return c.json({ error: '登录失败' }, 500);
  }
});

// 获取当前用户信息
auth.get('/me', authenticateToken, async (c) => {
  try {
    const payload = c.get('user');
    const mongo = new MongoClient(c.env);
    const users = mongo.collection('user_datas');
    const user = await users.findOne(
      { id: payload.userId },
      { password: 0, token: 0, backupCodes: 0 }
    );

    if (!user) {
      return c.json({ error: '用户不存在' }, 404);
    }

    return c.json({ user });
  } catch (error) {
    return c.json({ error: '获取用户信息失败' }, 500);
  }
});

// 登出
auth.post('/logout', authenticateToken, async (c) => {
  try {
    const payload = c.get('user');
    const mongo = new MongoClient(c.env);
    const users = mongo.collection('user_datas');
    await users.updateOne({ id: payload.userId }, { $unset: { token: '', tokenExpiresAt: '' } });
    return c.json({ message: '已登出' });
  } catch {
    return c.json({ error: '登出失败' }, 500);
  }
});

export default auth;
