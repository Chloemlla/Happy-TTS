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
import crypto from 'crypto';

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
            console.log('🔐 [UserManagement] 开始处理用户列表加密请求...');
            console.log('   用户ID:', req.user?.id);
            console.log('   用户名:', req.user?.username);
            console.log('   用户角色:', req.user?.role);
            console.log('   请求IP:', req.ip);
            
            // 检查管理员权限
            if (!req.user || req.user.role !== 'admin') {
                console.log('❌ [UserManagement] 权限检查失败：非管理员用户');
                return res.status(403).json({ error: '需要管理员权限' });
            }

            console.log('✅ [UserManagement] 权限检查通过');

            // 获取管理员token作为加密密钥
            const authHeader = req.headers.authorization;
            if (!authHeader || !authHeader.startsWith('Bearer ')) {
                console.log('❌ [UserManagement] Token格式错误：未携带Token或格式不正确');
                return res.status(401).json({ error: '未携带Token，请先登录' });
            }
            
            const token = authHeader.substring(7); // 移除 'Bearer ' 前缀
            if (!token) {
                console.log('❌ [UserManagement] Token为空');
                return res.status(401).json({ error: 'Token为空' });
            }

            console.log('✅ [UserManagement] Token获取成功，长度:', token.length);

            // 获取用户数据
            const users = await UserStorage.getAllUsers();
            const usersWithoutPassword = users.map(user => {
                const { password, ...userWithoutPassword } = user;
                return userWithoutPassword;
            });

            console.log('📊 [UserManagement] 获取到用户数量:', usersWithoutPassword.length);

            // 准备加密数据
            const jsonData = JSON.stringify(usersWithoutPassword);
            console.log('📝 [UserManagement] JSON数据准备完成，长度:', jsonData.length);

            // 使用AES-256-CBC加密数据
            console.log('🔐 [UserManagement] 开始AES-256-CBC加密...');
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
            
            console.log('✅ [UserManagement] 加密完成');
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
            
            console.log('📤 [UserManagement] 准备返回加密数据');
            console.log('   响应数据大小:', JSON.stringify(response).length);
            
            res.json(response);
            
            console.log('✅ [UserManagement] 用户列表加密请求处理完成');
            
        } catch (error) {
            console.error('❌ [UserManagement] 获取用户列表失败:', error);
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
      console.log('🔐 [EnvManager] 开始处理环境变量加密请求...');
      console.log('   用户ID:', req.user?.id);
      console.log('   用户名:', req.user?.username);
      console.log('   用户角色:', req.user?.role);
      console.log('   请求IP:', req.ip);
      
      // 检查管理员权限
      if (!req.user || req.user.role !== 'admin') {
        console.log('❌ [EnvManager] 权限检查失败：非管理员用户');
        return res.status(403).json({ error: '需要管理员权限' });
      }

      console.log('✅ [EnvManager] 权限检查通过');

      // 获取管理员token作为加密密钥
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        console.log('❌ [EnvManager] Token格式错误：未携带Token或格式不正确');
        return res.status(401).json({ error: '未携带Token，请先登录' });
      }
      
      const token = authHeader.substring(7); // 移除 'Bearer ' 前缀
      if (!token) {
        console.log('❌ [EnvManager] Token为空');
        return res.status(401).json({ error: 'Token为空' });
      }

      console.log('✅ [EnvManager] Token获取成功，长度:', token.length);

      // 合并env对象和所有导出常量
      let allEnvs: Record<string, any> = {};
      if (envModule.env && typeof envModule.env === 'object') {
        allEnvs = { ...envModule.env };
      }
      for (const [k, v] of Object.entries(envModule)) {
        if (k !== 'env') allEnvs[k] = v;
      }

      console.log('📊 [EnvManager] 收集到环境变量数量:', Object.keys(allEnvs).length);

      // 将环境变量转换为数组格式
      const envArray = Object.entries(allEnvs).map(([key, value]) => ({
        key,
        value: String(value)
      }));

      console.log('🔄 [EnvManager] 环境变量转换为数组格式完成');
      console.log('   数组长度:', envArray.length);

      // 准备加密数据
      const jsonData = JSON.stringify(envArray);
      console.log('📝 [EnvManager] JSON数据准备完成，长度:', jsonData.length);

      // 使用AES-256-CBC加密数据
      console.log('🔐 [EnvManager] 开始AES-256-CBC加密...');
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
      
      console.log('✅ [EnvManager] 加密完成');
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
      
      console.log('📤 [EnvManager] 准备返回加密数据');
      console.log('   响应数据大小:', JSON.stringify(response).length);
      
      res.json(response);
      
      console.log('✅ [EnvManager] 环境变量加密请求处理完成');
      
    } catch (e) {
      console.error('❌ [EnvManager] 获取环境变量失败:', e);
      logger.error('获取环境变量失败:', e);
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