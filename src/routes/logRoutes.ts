import express from 'express';
import fs from 'fs';
import path from 'path';
import { UserStorage } from '../utils/userStorage';
import crypto from 'crypto';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import winston from 'winston';

const router = express.Router();
const DATA_DIR = path.join(process.cwd(), 'data');
const SHARELOGS_DIR = path.join(DATA_DIR, 'sharelogs');
const logDir = path.join(DATA_DIR, 'logs');

// 确保必要的目录都存在
const ensureDirectories = async () => {
  for (const dir of [DATA_DIR, SHARELOGS_DIR, logDir]) {
    if (!fs.existsSync(dir)) {
      await fs.promises.mkdir(dir, { recursive: true });
    }
  }
};

// 初始化目录
ensureDirectories().catch(console.error);

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

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.printf(({ timestamp, level, message }) => `${timestamp} [${level}] ${message}`)
  ),
  transports: [
    new winston.transports.File({ filename: path.join(logDir, `${new Date().toISOString().slice(0,10)}.log`) })
  ]
});

// 每次上传都会生成唯一 fileId，文件名为 `${fileId}${ext}`，所有上传结果均保留在 data/sharelogs/ 目录下，支持多次上传和历史回查。
// 上传日志/文件（支持多种类型）
router.post('/sharelog', logLimiter, upload.single('file'), async (req, res) => {
  const ip = req.ip;
  const adminPassword = req.body.adminPassword;
  const fileName = req.file?.originalname;
  try {
    if (!req.file || !adminPassword) {
      logger.warn(`上传 | IP:${ip} | 文件:${fileName} | 结果:失败 | 原因:缺少参数`);
      return res.status(400).json({ error: '缺少参数' });
    }
    if (req.file.size > 25600) {
      logger.warn(`上传 | IP:${ip} | 文件:${fileName} | 结果:失败 | 原因:文件过大`);
      return res.status(400).json({ error: '文件内容过大' });
    }
    if (!(await checkAdminPassword(adminPassword))) {
      logger.warn(`上传 | IP:${ip} | 文件:${fileName} | 结果:失败 | 原因:管理员密码错误`);
      return res.status(403).json({ error: '管理员密码错误' });
    }
    // 生成随机文件名，保留原扩展名
    const ext = path.extname(req.file.originalname) || '.txt';
    const fileId = crypto.randomBytes(8).toString('hex');
    const filePath = path.join(SHARELOGS_DIR, `${fileId}${ext}`);
    logger.info(`[调试] 上传写入文件: filePath=${filePath}, ext=${ext}, fileName=${fileName}, size=${req.file.size}`);
    await fs.promises.writeFile(filePath, req.file.buffer);
    // 构造前端访问链接
    const baseUrl = 'https://tts.hapx.one';
    const link = `${baseUrl}/logshare?id=${fileId}`;
    logger.info(`上传 | IP:${ip} | 文件:${fileName} | 结果:成功 | ID:${fileId}`);
    return res.json({ id: fileId, link, ext });
  } catch (e: any) {
    logger.error(`上传 | IP:${ip} | 文件:${fileName} | 结果:异常 | 错误:${e?.message}`);
    return res.status(500).json({ error: '日志上传失败' });
  }
});

// 查询日志/文件内容（POST，密码在body）
router.post('/sharelog/:id', logLimiter, async (req, res) => {
  const ip = req.ip;
  const { adminPassword } = req.body;
  const { id } = req.params;
  try {
    if (!adminPassword) {
      logger.warn(`查询 | IP:${ip} | 文件ID:${id} | 结果:失败 | 原因:缺少管理员密码`);
      return res.status(400).json({ error: '缺少管理员密码' });
    }
    if (!(await checkAdminPassword(adminPassword))) {
      logger.warn(`查询 | IP:${ip} | 文件ID:${id} | 结果:失败 | 原因:管理员密码错误`);
      return res.status(403).json({ error: '管理员密码错误' });
    }
    // 查找以id开头的文件（支持多扩展名）
    const files = await fs.promises.readdir(SHARELOGS_DIR);
    const fileName = files.find(f => f.startsWith(id));
    logger.info(`[调试] 查询文件: id=${id}, files=${JSON.stringify(files)}, fileName=${fileName}`);
    if (!fileName) {
      logger.warn(`查询 | IP:${ip} | 文件ID:${id} | 结果:失败 | 原因:日志不存在`);
      return res.status(404).json({ error: '日志不存在' });
    }
    const filePath = path.join(SHARELOGS_DIR, fileName);
    const ext = path.extname(fileName).toLowerCase() || '.txt';
    logger.info(`[调试] 查询文件路径: filePath=${filePath}, ext=${ext}`);
    if ([".txt", ".log", ".json", ".md"].includes(ext)) {
      const content = await fs.promises.readFile(filePath, 'utf-8');
      logger.info(`[调试] 读取文本内容前100字符: ${content.slice(0, 100)}`);
      logger.info(`查询 | IP:${ip} | 文件ID:${id} | 文件:${fileName} | 结果:成功 | 类型:文本`);
      return res.json({ content, ext });
    } else {
      const content = await fs.promises.readFile(filePath);
      logger.info(`[调试] 读取二进制内容长度: ${content.length}`);
      logger.info(`查询 | IP:${ip} | 文件ID:${id} | 文件:${fileName} | 结果:成功 | 类型:二进制`);
      return res.json({ content: content.toString('base64'), ext, encoding: 'base64' });
    }
  } catch (e: any) {
    logger.error(`查询 | IP:${ip} | 文件ID:${id} | 结果:异常 | 错误:${e?.message}`);
    return res.status(500).json({ error: '日志查询失败' });
  }
});

export default router; 