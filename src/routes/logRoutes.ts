import express from 'express';
import fs from 'fs';
import path from 'path';
import { UserStorage } from '../utils/userStorage';
import crypto from 'crypto';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import logger from '../utils/logger';
import { connectMongo, mongoose } from '../services/mongoService';
import { authenticateToken } from '../middleware/authenticateToken';
import { config } from '../config/config';
import bcrypt from 'bcrypt';

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
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB以内
  fileFilter: (req, file, cb) => {
    // 文件扩展名白名单
    const allowedExtensions = ['.txt', '.log', '.json', '.md', '.xml', '.csv'];
    const fileExtension = path.extname(file.originalname).toLowerCase();
    
    // 只检查文件扩展名，不检查MIME类型（因为MIME类型可能不准确）
    if (allowedExtensions.includes(fileExtension)) {
      cb(null, true);
    } else {
      cb(new Error('不支持的文件类型，仅允许：txt, log, json, md, xml, csv'));
    }
  }
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
  console.log('🔐 [LogShare] 验证管理员密码...');
  console.log('    输入密码长度:', password ? password.length : 0);
  console.log('    输入密码预览:', password ? password.substring(0, 3) + '***' : 'undefined');
  
  const users = await UserStorage.getAllUsers();
  console.log('    用户总数:', users.length);
  
  const admin = users.find(u => u.role === 'admin');
  if (!admin) {
    console.log('    ❌ 未找到管理员用户');
    return false;
  }
  
  console.log('    ✅ 找到管理员用户:', admin.username);
  console.log('    管理员密码长度:', admin.password ? admin.password.length : 0);
  console.log('    管理员密码预览:', admin.password ? admin.password.substring(0, 3) + '***' : 'undefined');
  
  // 检查密码是否是 bcrypt 哈希格式（以 $2b$ 开头）
  if (admin.password.startsWith('$2b$')) {
    // 使用 bcrypt 验证
    const isValid = await bcrypt.compare(password, admin.password);
    console.log('    🔐 bcrypt 密码验证结果:', isValid ? '✅ 正确' : '❌ 错误');
    return isValid;
  } else {
    // 使用明文密码比较（兼容旧版本）
    const isValid = admin.password === password;
    console.log('    🔐 明文密码验证结果:', isValid ? '✅ 正确' : '❌ 错误');
    return isValid;
  }
}

// 复用的 Mongo 模型获取器
function getLogShareModel() {
  const LogShareSchema = new mongoose.Schema({
    fileId: { type: String, required: true, unique: true },
    ext: String,
    content: String,
    fileName: String,
    mimeType: String,
    fileSize: Number,
    note: String,
    createdAt: { type: Date, default: Date.now }
  }, { collection: 'logshare_files' });
  // 复用已存在的模型，避免重复编译
  // @ts-ignore
  return mongoose.models.LogShareFile || mongoose.model('LogShareFile', LogShareSchema);
}

// AES-256加密函数，使用PBKDF2密钥派生
function encryptData(data: any, key: string): { data: string, iv: string } {
  console.log('🔐 [LogShare] 开始加密数据...');
  console.log('    数据类型:', typeof data);
  console.log('    数据长度:', JSON.stringify(data).length);
  
  const jsonString = JSON.stringify(data);
  const iv = crypto.randomBytes(16);
  
  // 使用PBKDF2密钥派生，与前端保持一致
  const salt = 'logshare-salt';
  const iterations = 10000;
  const keyLength = 32; // 256位
  
  const keyHash = crypto.pbkdf2Sync(key, salt, iterations, keyLength, 'sha512');
  const cipher = crypto.createCipheriv('aes-256-cbc', keyHash, iv);
  
  let encrypted = cipher.update(jsonString, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  console.log('🔐 [LogShare] 加密完成');
  console.log('    IV长度:', iv.length);
  console.log('    加密数据长度:', encrypted.length);
  
  return {
    data: encrypted,
    iv: iv.toString('hex')
  };
}

// 每次上传都会生成唯一 fileId，文件名为 `${fileId}${ext}`，所有上传结果均保留在 data/sharelogs/ 目录下，支持多次上传和历史回查。
// 上传日志/文件（支持多种类型）
router.post('/sharelog', logLimiter, upload.single('file'), async (req, res) => {
  const ip = req.ip;
  const adminPassword = req.body.adminPassword;
  const fileName = req.file?.originalname;
  try {
    // 验证文件名安全性
    if (fileName && (fileName.includes('..') || fileName.includes('/') || fileName.includes('\\'))) {
      logger.warn(`上传 | IP:${ip} | 文件:${fileName} | 结果:失败 | 原因:文件名包含危险字符`);
      return res.status(400).json({ error: '文件名包含危险字符' });
    }
    
    if (!req.file || !adminPassword) {
      logger.warn(`上传 | IP:${ip} | 文件:${fileName} | 结果:失败 | 原因:缺少参数`);
      return res.status(400).json({ error: '缺少参数' });
    }
    if (req.file.size > 10 * 1024 * 1024) {
      logger.warn(`上传 | IP:${ip} | 文件:${fileName} | 结果:失败 | 原因:文件过大 | size=${req.file.size}`);
      return res.status(400).json({ error: '文件内容过大，最大支持10MB' });
    }
    if (!(await checkAdminPassword(adminPassword))) {
      logger.warn(`上传 | IP:${ip} | 文件:${fileName} | 结果:失败 | 原因:管理员密码错误`);
      return res.status(403).json({ error: '管理员密码错误' });
    }
    
    // 生成随机文件名，保留原扩展名
    const ext = path.extname(req.file.originalname) || '.txt';
    const fileId = crypto.randomBytes(8).toString('hex');
    
    // 所有文件都存储到MongoDB，避免本地文件系统风险
    const LogShareModel = getLogShareModel();
    let content = '';
    try {
      content = req.file.buffer.toString('utf-8');
    } catch (e) {
      content = '';
    }
    
    await LogShareModel.create({ 
      fileId, 
      ext, 
      content, 
      fileName: fileName || 'unknown',
      mimeType: req.file.mimetype,
      fileSize: req.file.size,
      createdAt: new Date() 
    });
    
    logger.info(`[logshare] 已存入MongoDB: fileId=${fileId}, ext=${ext}, fileName=${fileName}, contentPreview=${content.slice(0, 100)}`);
    
    // 构造前端访问链接
    const baseUrl = 'https://tts.hapx.one';
    const link = `${baseUrl}/logshare?id=${fileId}`;
    logger.info(`上传 | IP:${ip} | 文件:${fileName} | 结果:成功 | ID:${fileId}`);
    return res.json({ id: fileId, link, ext });
  } catch (e: any) {
    logger.error(`[logshare] 上传异常 | IP:${ip} | 文件:${fileName} | 错误:${e?.message ?? e}`, e);
    return res.status(500).json({ error: '日志上传失败' });
  }
});

// 获取所有日志列表（GET，需要管理员权限）
router.get('/sharelog/all', logLimiter, authenticateToken, async (req, res) => {
  const ip = req.ip;
  
  try {
    // 检查管理员权限
    // @ts-ignore
    if (!req.user || req.user.role !== 'admin') {
      logger.warn(`获取日志列表 | IP:${ip} | 结果:失败 | 原因:非管理员用户`);
      return res.status(403).json({ error: '需要管理员权限' });
    }

    await connectMongo();
    const LogShareModel = getLogShareModel();
    const mongoLogs = await LogShareModel.find({}, { fileId: 1, ext: 1, createdAt: 1, content: 1 }).sort({ createdAt: -1 });
    
    // 获取本地文件系统中的非文本类型日志
    const localFiles = await fs.promises.readdir(SHARELOGS_DIR);
    const localLogs = localFiles
      .filter(file => {
        const ext = path.extname(file).toLowerCase();
        return ![".txt", ".log", ".json", ".md"].includes(ext);
      })
      .map(file => {
        const fileId = path.basename(file, path.extname(file));
        const ext = path.extname(file);
        const filePath = path.join(SHARELOGS_DIR, file);
        const stats = fs.statSync(filePath);
        return {
          id: fileId,
          ext: ext,
          uploadTime: stats.mtime.toISOString(),
          size: stats.size
        };
      })
      .sort((a, b) => new Date(b.uploadTime).getTime() - new Date(a.uploadTime).getTime());

    // 合并MongoDB和本地文件
    const allLogs = [
      ...mongoLogs.map(log => ({
        id: log.fileId,
        ext: log.ext,
        uploadTime: log.createdAt.toISOString(),
        size: log.content ? log.content.length : 0
      })),
      ...localLogs
    ];

    // 使用管理员token加密数据
    const authHeader = req.headers.authorization;
    const token = authHeader?.split(' ')[1];
    if (token) {
      const encrypted = encryptData({ logs: allLogs }, token);
      logger.info(`获取日志列表 | IP:${ip} | 结果:成功 | 数量:${allLogs.length} | 已加密`);
      return res.json({
        data: encrypted.data,
        iv: encrypted.iv
      });
    } else {
      logger.info(`获取日志列表 | IP:${ip} | 结果:成功 | 数量:${allLogs.length} | 未加密`);
      return res.json({ logs: allLogs });
    }
  } catch (e: any) {
    logger.error(`获取日志列表 | IP:${ip} | 结果:异常 | 错误:${e?.message}`, e);
    return res.status(500).json({ error: '获取日志列表失败' });
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
    // 只查MongoDB文本类型
    const LogShareModel = getLogShareModel();
    const doc = await LogShareModel.findOne({ fileId: id });
    if (doc && [".txt", ".log", ".json", ".md"].includes(doc.ext)) {
      logger.info(`[logshare] MongoDB命中: fileId=${id}, ext=${doc.ext}, fileName=${doc.fileName}`);
      const result = { content: doc.content, ext: doc.ext };
      
      // 使用管理员密码加密数据
      const encrypted = encryptData(result, adminPassword);
      logger.info(`查询 | IP:${ip} | 文件ID:${id} | 结果:成功 | 类型:文本 | 已加密`);
      return res.json({
        data: encrypted.data,
        iv: encrypted.iv
      });
    }
    // 非文本类型查本地
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
    // 只处理二进制
    const content = await fs.promises.readFile(filePath);
    logger.info(`[调试] 读取二进制内容长度: ${content.length}`);
    
    const result = { content: content.toString('base64'), ext, encoding: 'base64' };
    // 使用管理员密码加密数据
    const encrypted = encryptData(result, adminPassword);
    logger.info(`查询 | IP:${ip} | 文件ID:${id} | 文件:${fileName} | 结果:成功 | 类型:二进制 | 已加密`);
    return res.json({
      data: encrypted.data,
      iv: encrypted.iv
    });
  } catch (e: any) {
    logger.error(`查询 | IP:${ip} | 文件ID:${id} | 结果:异常 | 错误:${e?.message}`);
    return res.status(500).json({ error: '日志查询失败' });
  }
});

// 删除单个日志（DELETE，需要管理员权限）
router.delete('/sharelog/:id', logLimiter, authenticateToken, async (req, res) => {
  const ip = req.ip;
  const { id } = req.params;
  try {
    // @ts-ignore
    if (!req.user || req.user.role !== 'admin') {
      logger.warn(`删除日志 | IP:${ip} | 结果:失败 | 原因:非管理员用户`);
      return res.status(403).json({ error: '需要管理员权限' });
    }
    await connectMongo();
    const LogShareModel = getLogShareModel();
    const mongoResult = await LogShareModel.deleteOne({ fileId: id });

    // 删除本地文件（二进制/非文本）
    let fileDeleted = false;
    try {
      const files = await fs.promises.readdir(SHARELOGS_DIR);
      const fileName = files.find(f => f.startsWith(id));
      if (fileName) {
        await fs.promises.unlink(path.join(SHARELOGS_DIR, fileName));
        fileDeleted = true;
      }
    } catch (err) {
      // 忽略本地不存在的情况
    }

    if (mongoResult.deletedCount === 0 && !fileDeleted) {
      logger.warn(`删除日志 | IP:${ip} | 文件ID:${id} | 结果:失败 | 原因:日志不存在`);
      return res.status(404).json({ error: '日志不存在' });
    }
    logger.info(`删除日志 | IP:${ip} | 文件ID:${id} | 结果:成功 | mongo:${mongoResult.deletedCount} | file:${fileDeleted}`);
    return res.json({ success: true, mongoDeleted: mongoResult.deletedCount, fileDeleted });
  } catch (e: any) {
    logger.error(`删除日志 | IP:${ip} | 文件ID:${id} | 结果:异常 | 错误:${e?.message}`);
    return res.status(500).json({ error: '删除失败' });
  }
});

// 批量删除（POST，需要管理员权限）
router.post('/sharelog/delete-batch', logLimiter, authenticateToken, async (req, res) => {
  const ip = req.ip;
  const ids: string[] = Array.isArray(req.body.ids) ? req.body.ids : [];
  try {
    // @ts-ignore
    if (!req.user || req.user.role !== 'admin') {
      logger.warn(`批量删除 | IP:${ip} | 结果:失败 | 原因:非管理员用户`);
      return res.status(403).json({ error: '需要管理员权限' });
    }
    if (ids.length === 0) {
      return res.status(400).json({ error: '缺少要删除的ID列表' });
    }
    await connectMongo();
    const LogShareModel = getLogShareModel();
    const mongoResult = await LogShareModel.deleteMany({ fileId: { $in: ids } });

    let fileDeleted = 0;
    try {
      const files = await fs.promises.readdir(SHARELOGS_DIR);
      for (const id of ids) {
        const fileName = files.find(f => f.startsWith(id));
        if (fileName) {
          await fs.promises.unlink(path.join(SHARELOGS_DIR, fileName));
          fileDeleted++;
        }
      }
    } catch (err) {
      // 忽略
    }
    logger.info(`批量删除 | IP:${ip} | 结果:成功 | mongo:${mongoResult.deletedCount} | file:${fileDeleted}`);
    return res.json({ success: true, mongoDeleted: mongoResult.deletedCount, fileDeleted });
  } catch (e: any) {
    logger.error(`批量删除 | IP:${ip} | 结果:异常 | 错误:${e?.message}`);
    return res.status(500).json({ error: '批量删除失败' });
  }
});

// 全部删除（DELETE，需要管理员权限）
router.delete('/sharelog/all', logLimiter, authenticateToken, async (req, res) => {
  const ip = req.ip;
  try {
    // @ts-ignore
    if (!req.user || req.user.role !== 'admin') {
      logger.warn(`全部删除 | IP:${ip} | 结果:失败 | 原因:非管理员用户`);
      return res.status(403).json({ error: '需要管理员权限' });
    }
    await connectMongo();
    const LogShareModel = getLogShareModel();
    const mongoResult = await LogShareModel.deleteMany({});

    let fileDeleted = 0;
    try {
      const files = await fs.promises.readdir(SHARELOGS_DIR);
      for (const file of files) {
        await fs.promises.unlink(path.join(SHARELOGS_DIR, file));
        fileDeleted++;
      }
    } catch (err) {
      // 忽略
    }
    logger.info(`全部删除 | IP:${ip} | 结果:成功 | mongo:${mongoResult.deletedCount} | file:${fileDeleted}`);
    return res.json({ success: true, mongoDeleted: mongoResult.deletedCount, fileDeleted });
  } catch (e: any) {
    logger.error(`全部删除 | IP:${ip} | 结果:异常 | 错误:${e?.message}`);
    return res.status(500).json({ error: '全部删除失败' });
  }
});

// 修改单个日志（PUT，需要管理员权限，仅Mongo文本日志支持）
router.put('/sharelog/:id', logLimiter, authenticateToken, async (req, res) => {
  const ip = req.ip;
  const { id } = req.params;
  const { fileName, note } = req.body || {};
  try {
    // @ts-ignore
    if (!req.user || req.user.role !== 'admin') {
      logger.warn(`修改日志 | IP:${ip} | 结果:失败 | 原因:非管理员用户`);
      return res.status(403).json({ error: '需要管理员权限' });
    }
    if (!fileName && typeof note === 'undefined') {
      return res.status(400).json({ error: '未提供可以更新的字段' });
    }
    await connectMongo();
    const LogShareModel = getLogShareModel();
    const update: any = {};
    if (fileName) update.fileName = String(fileName).slice(0, 200);
    if (typeof note !== 'undefined') update.note = String(note).slice(0, 1000);

    const result = await LogShareModel.findOneAndUpdate({ fileId: id }, { $set: update }, { new: true });
    if (!result) {
      logger.warn(`修改日志 | IP:${ip} | 文件ID:${id} | 结果:失败 | 原因:仅支持Mongo文本日志`);
      return res.status(404).json({ error: '仅支持修改存储在Mongo的文本日志' });
    }
    logger.info(`修改日志 | IP:${ip} | 文件ID:${id} | 结果:成功`);
    return res.json({ success: true, log: { id: result.fileId, fileName: result.fileName, note: result.note } });
  } catch (e: any) {
    logger.error(`修改日志 | IP:${ip} | 文件ID:${id} | 结果:异常 | 错误:${e?.message}`);
    return res.status(500).json({ error: '修改失败' });
  }
});

export default router; 