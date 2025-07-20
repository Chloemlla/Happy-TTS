import { Request, Response } from 'express';
import { UserStorage } from '../utils/userStorage';
import { v4 as uuidv4 } from 'uuid';
import logger from '../utils/logger';
import { mongoose } from '../services/mongoService';
import mysql from 'mysql2/promise';
import fs from 'fs';
import path from 'path';
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
      if (!content) return res.status(400).json({ error: '公告内容不能为空' });
      if (STORAGE_MODE === 'mongo' && mongoose.connection.readyState === 1) {
        const ann = await AnnouncementModel.create({ content, format: format || 'markdown', updatedAt: new Date() });
        return res.json({ success: true, announcement: ann });
      } else if (STORAGE_MODE === 'mysql' && process.env.MYSQL_URI) {
        const conn = await mysql.createConnection(process.env.MYSQL_URI);
        await ensureMysqlTable(conn);
        await conn.execute('INSERT INTO announcements (content, format, updatedAt) VALUES (?, ?, NOW())', [content, format || 'markdown']);
        const [rows] = await conn.execute('SELECT * FROM announcements ORDER BY updatedAt DESC LIMIT 1');
        await conn.end();
        return res.json({ success: true, announcement: (rows as any[])[0] });
      } else {
        const data = { content, format: format || 'markdown', updatedAt: new Date().toISOString() };
        fs.writeFileSync(ANNOUNCEMENT_FILE, JSON.stringify(data, null, 2));
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
      const envs = readEnvFile();
      res.json({ success: true, envs });
    } catch (e) {
      res.status(500).json({ success: false, error: '获取环境变量失败' });
    }
  },

  // 新增/更新环境变量
  async setEnv(req: Request, res: Response) {
    try {
      const { key, value, desc } = req.body;
      if (!key) return res.status(400).json({ error: 'key不能为空' });
      let envs = readEnvFile();
      const idx = envs.findIndex((e: any) => e.key === key);
      const now = new Date().toISOString();
      if (idx >= 0) {
        envs[idx] = { ...envs[idx], value, desc, updatedAt: now };
      } else {
        envs.push({ key, value, desc, updatedAt: now });
      }
      writeEnvFile(envs);
      res.json({ success: true, envs });
    } catch (e) {
      res.status(500).json({ success: false, error: '保存环境变量失败' });
    }
  },

  // 删除环境变量
  async deleteEnv(req: Request, res: Response) {
    try {
      const { key } = req.body;
      if (!key) return res.status(400).json({ error: 'key不能为空' });
      let envs = readEnvFile();
      envs = envs.filter((e: any) => e.key !== key);
      writeEnvFile(envs);
      res.json({ success: true, envs });
    } catch (e) {
      res.status(500).json({ success: false, error: '删除环境变量失败' });
    }
  },
}; 