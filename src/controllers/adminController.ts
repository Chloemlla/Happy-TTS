import { Request, Response } from 'express';
import { UserStorage } from '../utils/userStorage';
import { v4 as uuidv4 } from 'uuid';
import logger from '../utils/logger';
import { mongoose } from '../services/mongoService';
import mysql from 'mysql2/promise';
import fs from 'fs';
import path from 'path';
import { env as startupEnv } from '../config/env';
import * as envModule from '../config/env';
const STORAGE_MODE = process.env.STORAGE_MODE || 'mongo';
const ANNOUNCEMENT_FILE = path.join(__dirname, '../../data/announcement.json');
const ENV_FILE = path.join(__dirname, '../../data/env.admin.json');

function readEnvFile() {
  if (!fs.existsSync(ENV_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(ENV_FILE, 'utf-8'));
  } catch {
    return [];
  }
}
function writeEnvFile(envs: any[]) {
  fs.writeFileSync(ENV_FILE, JSON.stringify(envs, null, 2));
}

// MongoDB 公告 Schema
const AnnouncementSchema = new mongoose.Schema({
  content: { type: String, required: true },
  format: { type: String, enum: ['markdown', 'html'], default: 'markdown' },
  updatedAt: { type: Date, default: Date.now },
}, { collection: 'announcements' });

// 自动初始化公告集合（仅 mongo）
async function ensureMongoAnnouncementCollection() {
  if (mongoose.connection.readyState === 1) {
    const db = (mongoose.connection.db ?? undefined) as typeof mongoose.connection.db | undefined;
    if (!db) return;
    const collections = await db.listCollections().toArray();
    if (!collections.find(c => c.name === 'announcements')) {
      await db.createCollection('announcements');
    }
  }
}

const AnnouncementModel = mongoose.models.Announcement || mongoose.model('Announcement', AnnouncementSchema);

// MySQL建表
async function ensureMysqlTable(conn: any) {
  await conn.execute(`CREATE TABLE IF NOT EXISTS announcements (
    id INT AUTO_INCREMENT PRIMARY KEY,
    content TEXT NOT NULL,
    format VARCHAR(16) DEFAULT 'markdown',
    updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
}

// XSS 过滤简单实现
function sanitizeInput(str: string) {
  return str.replace(/[<>]/g, '');
}

export const adminController = {
    getUsers: async (req: Request, res: Response) => {
        try {
            const users = await UserStorage.getAllUsers();
            const usersWithoutPassword = users.map(user => {
                const { password, ...userWithoutPassword } = user;
                return userWithoutPassword;
            });
            res.json(usersWithoutPassword);
        } catch (error) {
            logger.error('获取用户列表失败:', error);
            res.status(500).json({ error: '获取用户列表失败' });
        }
    },
    
    createUser: async (req: Request, res: Response) => {
        try {
            const { username, email, password, role } = req.body;
            if (!username || !email || !password) {
                return res.status(400).json({ error: '参数不全' });
            }
            const exist = await UserStorage.getUserByUsername(username);
            if (exist) {
                return res.status(400).json({ error: '用户名已存在' });
            }
            const user = await UserStorage.createUser(username, email, password);
            if (user && role) {
                await UserStorage.updateUser(user.id, { role });
            }
            const { password: _, ...newUser } = user || {};
            res.status(201).json(newUser);
        } catch (error) {
            logger.error('创建用户失败:', error);
            res.status(500).json({ error: '创建用户失败' });
        }
    },
    
    updateUser: async (req: Request, res: Response) => {
        try {
            const { username, email, password, role } = req.body;
            if (!username || !email || !role) {
                return res.status(400).json({ error: '参数不全' });
            }
            const user = await UserStorage.getUserById(req.params.id);
            if (!user) {
                return res.status(404).json({ error: '用户不存在' });
            }
            const newPassword = password || user.password;
            const updated = await UserStorage.updateUser(user.id, { username, email, password: newPassword, role });
            const { password: _, ...updatedUser } = updated || {};
            res.json(updatedUser);
        } catch (error) {
            logger.error('更新用户失败:', error);
            res.status(500).json({ error: '更新用户失败' });
        }
    },
    
    deleteUser: async (req: Request, res: Response) => {
        try {
            const user = await UserStorage.getUserById(req.params.id);
            if (!user) {
                return res.status(404).json({ error: '用户不存在' });
            }
            await UserStorage.deleteUser(user.id);
            const { password, ...deletedUser } = user;
            res.json(deletedUser);
        } catch (error) {
            logger.error('删除用户失败:', error);
            res.status(500).json({ error: '删除用户失败' });
        }
    },

  // 获取当前公告
  async getAnnouncement(req: Request, res: Response) {
    try {
      if (STORAGE_MODE === 'mongo' && mongoose.connection.readyState === 1) {
        await ensureMongoAnnouncementCollection();
        const ann = await AnnouncementModel.findOne().sort({ updatedAt: -1 }).lean();
        return res.json({ success: true, announcement: ann });
      } else if (STORAGE_MODE === 'mysql' && process.env.MYSQL_URI) {
        const conn = await mysql.createConnection(process.env.MYSQL_URI);
        await ensureMysqlTable(conn);
        const [rows] = await conn.execute('SELECT * FROM announcements ORDER BY updatedAt DESC LIMIT 1');
        await conn.end();
        return res.json({ success: true, announcement: (rows as any[])[0] });
      } else {
        if (fs.existsSync(ANNOUNCEMENT_FILE)) {
          const data = JSON.parse(fs.readFileSync(ANNOUNCEMENT_FILE, 'utf-8'));
          return res.json({ success: true, announcement: data });
        }
        return res.json({ success: true, announcement: null });
      }
    } catch (e) {
      res.status(500).json({ success: false, error: '获取公告失败' });
    }
  },

  // 设置/更新公告（仅管理员）
  async setAnnouncement(req: Request, res: Response) {
    try {
      if (!req.user || req.user.role !== 'admin') return res.status(403).json({ error: '无权限' });
      const { content, format } = req.body;
      if (typeof content !== 'string' || !content.trim() || content.length > 2000) return res.status(400).json({ error: '公告内容不能为空且不超过2000字' });
      const safeContent = sanitizeInput(content);
      if (STORAGE_MODE === 'mongo' && mongoose.connection.readyState === 1) {
        await ensureMongoAnnouncementCollection();
        const ann = await AnnouncementModel.create({ content: safeContent, format: format || 'markdown', updatedAt: new Date() });
        console.log(`[公告] 管理员${req.user.username} 更新公告`);
        return res.json({ success: true, announcement: ann });
      } else if (STORAGE_MODE === 'mysql' && process.env.MYSQL_URI) {
        const conn = await mysql.createConnection(process.env.MYSQL_URI);
        await ensureMysqlTable(conn);
        await conn.execute('INSERT INTO announcements (content, format, updatedAt) VALUES (?, ?, NOW())', [safeContent, format || 'markdown']);
        const [rows] = await conn.execute('SELECT * FROM announcements ORDER BY updatedAt DESC LIMIT 1');
        await conn.end();
        console.log(`[公告] 管理员${req.user.username} 更新公告`);
        return res.json({ success: true, announcement: (rows as any[])[0] });
      } else {
        const data = { content: safeContent, format: format || 'markdown', updatedAt: new Date().toISOString() };
        fs.writeFileSync(ANNOUNCEMENT_FILE, JSON.stringify(data, null, 2));
        console.log(`[公告] 管理员${req.user.username} 更新公告`);
        return res.json({ success: true, announcement: data });
      }
    } catch (e) {
      res.status(500).json({ success: false, error: '设置公告失败' });
    }
  },

  // 删除所有公告（仅管理员）
  async deleteAnnouncements(req: Request, res: Response) {
    try {
      if (!req.user || req.user.role !== 'admin') return res.status(403).json({ error: '无权限' });
      if (STORAGE_MODE === 'mongo' && mongoose.connection.readyState === 1) {
        await ensureMongoAnnouncementCollection();
        await AnnouncementModel.deleteMany({});
        return res.json({ success: true });
      } else if (STORAGE_MODE === 'mysql' && process.env.MYSQL_URI) {
        const conn = await mysql.createConnection(process.env.MYSQL_URI);
        await ensureMysqlTable(conn);
        await conn.execute('DELETE FROM announcements');
        await conn.end();
        return res.json({ success: true });
      } else {
        if (fs.existsSync(ANNOUNCEMENT_FILE)) fs.unlinkSync(ANNOUNCEMENT_FILE);
        return res.json({ success: true });
      }
    } catch (e) {
      res.status(500).json({ success: false, error: '删除公告失败' });
    }
  },

  // 获取所有环境变量
  async getEnvs(req: Request, res: Response) {
    try {
      // 合并env对象和所有导出常量
      let allEnvs: Record<string, any> = {};
      if (envModule.env && typeof envModule.env === 'object') {
        allEnvs = { ...envModule.env };
      }
      for (const [k, v] of Object.entries(envModule)) {
        if (k !== 'env') allEnvs[k] = v;
      }
      res.json({ success: true, envs: allEnvs });
    } catch (e) {
      res.status(500).json({ success: false, error: '获取环境变量失败' });
    }
  },

  // 新增/更新环境变量（仅管理员）
  async setEnv(req: Request, res: Response) {
    try {
      if (!req.user || req.user.role !== 'admin') return res.status(403).json({ error: '无权限' });
      const { key, value, desc } = req.body;
      if (typeof key !== 'string' || !key.trim() || key.length > 64 || /[<>\s]/.test(key)) return res.status(400).json({ error: 'key不能为空，不能包含空格/<>，且不超过64字' });
      if (typeof value !== 'string' || !value.trim() || value.length > 1024) return res.status(400).json({ error: 'value不能为空且不超过1024字' });
      let envs = readEnvFile();
      const idx = envs.findIndex((e: any) => e.key === key);
      const now = new Date().toISOString();
      if (idx >= 0) {
        envs[idx] = { ...envs[idx], value, desc, updatedAt: now };
      } else {
        envs.push({ key, value, desc, updatedAt: now });
      }
      writeEnvFile(envs);
      console.log(`[环境变量] 管理员${req.user.username} 设置/更新 key=${key}`);
      res.json({ success: true, envs });
    } catch (e) {
      res.status(500).json({ success: false, error: '保存环境变量失败' });
    }
  },

  // 删除环境变量（仅管理员）
  async deleteEnv(req: Request, res: Response) {
    try {
      if (!req.user || req.user.role !== 'admin') return res.status(403).json({ error: '无权限' });
      const { key } = req.body;
      if (typeof key !== 'string' || !key.trim()) return res.status(400).json({ error: 'key不能为空' });
      let envs = readEnvFile();
      const idx = envs.findIndex((e: any) => e.key === key);
      if (idx === -1) return res.status(404).json({ error: 'key不存在' });
      envs.splice(idx, 1);
      writeEnvFile(envs);
      console.log(`[环境变量] 管理员${req.user.username} 删除 key=${key}`);
      res.json({ success: true, envs });
    } catch (e) {
      res.status(500).json({ success: false, error: '删除环境变量失败' });
    }
  },
}; 