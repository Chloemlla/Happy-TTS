import express from 'express';
import fs from 'fs';
import path from 'path';
import { UserStorage } from '../utils/userStorage';
import crypto from 'crypto';
import multer from 'multer';
import rateLimit from 'express-rate-limit';

const router = express.Router();
const DATA_DIR = path.join(process.cwd(), 'data');
const SHARELOGS_DIR = path.join(DATA_DIR, 'sharelogs');

// 确保 sharelogs 目录存在
if (!fs.existsSync(SHARELOGS_DIR)) {
  fs.mkdirSync(SHARELOGS_DIR, { recursive: true });
}

// 配置multer用于多文件类型上传
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25600 * 2 }, // 50KB以内
});

// 简单速率限制（每IP每分钟最多10次上传/查询）
const logLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: '请求过于频繁，请稍后再试' },
  standardHeaders: true,
  legacyHeaders: false,
});

// 工具：校验管理员密码
async function checkAdminPassword(password: string) {
  const users = await UserStorage.getAllUsers();
  const admin = users.find(u => u.role === 'admin');
  return admin && admin.password === password;
}

// 上传日志/文件（支持多种类型）
router.post('/sharelog', logLimiter, upload.single('file'), async (req, res) => {
  try {
    const adminPassword = req.body.adminPassword;
    if (!req.file || !adminPassword) {
      return res.status(400).json({ error: '缺少参数' });
    }
    if (req.file.size > 25600) {
      return res.status(400).json({ error: '文件内容过大' });
    }
    if (!(await checkAdminPassword(adminPassword))) {
      return res.status(403).json({ error: '管理员密码错误' });
    }
    // 生成随机文件名，保留原扩展名
    const ext = path.extname(req.file.originalname) || '.txt';
    const fileId = crypto.randomBytes(8).toString('hex');
    const filePath = path.join(SHARELOGS_DIR, `${fileId}${ext}`);
    fs.writeFileSync(filePath, req.file.buffer);
    // 构造前端访问链接
    const baseUrl = 'https://tts-api.hapxs.com';
    const link = `${baseUrl}/logshare?id=${fileId}`;
    return res.json({ id: fileId, link, ext });
  } catch (e) {
    return res.status(500).json({ error: '日志上传失败' });
  }
});

// 查询日志/文件内容（POST，密码在body）
router.post('/sharelog/:id', logLimiter, async (req, res) => {
  try {
    const { adminPassword } = req.body;
    const { id } = req.params;
    if (!adminPassword) {
      return res.status(400).json({ error: '缺少管理员密码' });
    }
    if (!(await checkAdminPassword(adminPassword))) {
      return res.status(403).json({ error: '管理员密码错误' });
    }
    // 查找以id开头的文件（支持多扩展名）
    const files = fs.readdirSync(SHARELOGS_DIR);
    const fileName = files.find(f => f.startsWith(id));
    if (!fileName) {
      return res.status(404).json({ error: '日志不存在' });
    }
    const filePath = path.join(SHARELOGS_DIR, fileName);
    const ext = path.extname(fileName).toLowerCase();
    // 文本类直接返回内容，其他类型返回base64
    if ([".txt", ".log", ".json", ".md"].includes(ext)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      return res.json({ content, ext });
    } else {
      const content = fs.readFileSync(filePath);
      return res.json({ content: content.toString('base64'), ext, encoding: 'base64' });
    }
  } catch (e) {
    return res.status(500).json({ error: '日志查询失败' });
  }
});

export default router; 