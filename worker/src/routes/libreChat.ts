/**
 * LibreChat 路由 - /api/libre-chat
 */
import { Hono } from 'hono';
import type { Env } from '../types';
import { MongoClient } from '../lib/mongo';

const libreChat = new Hono<{ Bindings: Env }>();

// 获取最新记录
libreChat.get('/latest', async (c) => {
  try {
    const mongo = new MongoClient(c.env);
    const col = mongo.collection('librechat_records');
    const records = await col.find({}, { sort: { updateTime: -1 }, limit: 1 });
    if (records.length > 0) {
      return c.json(records[0]);
    }
    return c.json({ error: 'No data available' }, 404);
  } catch {
    return c.json({ error: 'Internal Server Error' }, 500);
  }
});

// 兼容旧路径
libreChat.get('/librechat-image', async (c) => {
  try {
    const mongo = new MongoClient(c.env);
    const col = mongo.collection('librechat_records');
    const records = await col.find({}, { sort: { updateTime: -1 }, limit: 1 });
    if (records.length > 0 && records[0].imageUrl) {
      return c.redirect(records[0].imageUrl, 302);
    }
    return c.json({ error: 'No image available' }, 404);
  } catch {
    return c.json({ error: 'Internal Server Error' }, 500);
  }
});

export default libreChat;
