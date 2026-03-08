import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import bcrypt from "bcrypt";
import express from "express";
import rateLimit from "express-rate-limit";
import multer from "multer";
import * as tar from "tar";
import { authenticateToken } from "../middleware/authenticateToken";
import ArchiveModel from "../models/archiveModel";
import { IPFSService } from "../services/ipfsService";
import { connectMongo, mongoose } from "../services/mongoService";
import logger from "../utils/logger";
import { UserStorage } from "../utils/userStorage";

// Security helper functions
function sanitizeFileName(fileName: string): string {
  if (!fileName || typeof fileName !== "string") {
    return "unknown";
  }
  // Remove dangerous characters and path traversal attempts
  let result = fileName.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_");

  // Remove leading dots safely (avoid ReDoS)
  while (result.startsWith(".")) {
    result = `_${result.slice(1)}`;
  }

  // Remove trailing dots safely (avoid ReDoS)
  while (result.endsWith(".")) {
    result = `${result.slice(0, -1)}_`;
  }

  return result.slice(0, 255);
}

function sanitizePathComponent(component: string): string {
  if (!component || typeof component !== "string") {
    return "";
  }
  // Remove path traversal attempts and dangerous characters
  return component
    .replace(/[.]{2,}/g, "_")
    .replace(/[/\\]/g, "_")
    .replace(/[<>:"|?*\x00-\x1f]/g, "_")
    .slice(0, 255);
}

function sanitizeRegexPattern(pattern: string): string {
  if (!pattern || typeof pattern !== "string") {
    return "";
  }
  // Escape special regex characters to prevent injection
  return pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").slice(0, 100);
}

function validateFileId(fileId: string): boolean {
  if (!fileId || typeof fileId !== "string") {
    return false;
  }
  // Only allow alphanumeric characters and hyphens, max 64 chars
  return /^[a-zA-Z0-9-]{1,64}$/.test(fileId);
}

function validateArchiveName(archiveName: string): boolean {
  if (!archiveName || typeof archiveName !== "string") {
    return false;
  }
  // Only allow safe characters for archive names
  return /^[a-zA-Z0-9-_]{1,100}$/.test(archiveName);
}

const router = express.Router();
const DATA_DIR = path.join(process.cwd(), "data");
const SHARELOGS_DIR = path.join(DATA_DIR, "sharelogs");
const logDir = path.join(DATA_DIR, "logs");
const ARCHIVE_DIR = path.join(DATA_DIR, "archives");

// 确保必要的目录都存在
const ensureDirectories = async () => {
  for (const dir of [DATA_DIR, SHARELOGS_DIR, logDir, ARCHIVE_DIR]) {
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
  fileFilter: (_req, file, cb) => {
    // 文件扩展名白名单
    const allowedExtensions = [".txt", ".log", ".json", ".md", ".xml", ".csv"];
    const fileExtension = path.extname(file.originalname).toLowerCase();

    // 只检查文件扩展名，不检查MIME类型（因为MIME类型可能不准确）
    if (allowedExtensions.includes(fileExtension)) {
      cb(null, true);
    } else {
      cb(new Error("不支持的文件类型，仅允许：txt, log, json, md, xml, csv"));
    }
  },
});

// 简单速率限制（每IP每分钟最多10次上传/查询）
const logLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: "请求过于频繁，请稍后再试" },
  standardHeaders: true,
  legacyHeaders: false,
});

// 工具：校验管理员密码
async function checkAdminPassword(password: string) {
  console.log("🔐 [LogShare] 验证管理员密码...");
  console.log("    输入密码长度:", password ? password.length : 0);
  console.log("    输入密码预览:", password ? `${password.substring(0, 3)}***` : "undefined");

  const users = await UserStorage.getAllUsers();
  console.log("    用户总数:", users.length);

  const admin = users.find((u) => u.role === "admin");
  if (!admin) {
    console.log("    ❌ 未找到管理员用户");
    return false;
  }

  console.log("    ✅ 找到管理员用户:", admin.username);
  console.log("    管理员密码长度:", admin.password ? admin.password.length : 0);
  console.log("    管理员密码预览:", admin.password ? `${admin.password.substring(0, 3)}***` : "undefined");

  // 检查密码是否是 bcrypt 哈希格式（以 $2b$ 开头）
  if (admin.password.startsWith("$2b$")) {
    // 使用 bcrypt 验证
    const isValid = await bcrypt.compare(password, admin.password);
    console.log("    🔐 bcrypt 密码验证结果:", isValid ? "✅ 正确" : "❌ 错误");
    return isValid;
  } else {
    // 使用明文密码比较（兼容旧版本）
    const isValid = admin.password === password;
    console.log("    🔐 明文密码验证结果:", isValid ? "✅ 正确" : "❌ 错误");
    return isValid;
  }
}

// 复用的 Mongo 模型获取器
function getLogShareModel() {
  const LogShareSchema = new mongoose.Schema(
    {
      fileId: { type: String, required: true, unique: true },
      ext: String,
      content: String,
      fileName: String,
      mimeType: String,
      fileSize: Number,
      note: String,
      createdAt: { type: Date, default: Date.now },
    },
    { collection: "logshare_files" },
  );
  // 复用已存在的模型，避免重复编译
  return mongoose.models.LogShareFile || mongoose.model("LogShareFile", LogShareSchema);
}

// AES-256加密函数，使用PBKDF2密钥派生
function encryptData(data: any, key: string): { data: string; iv: string } {
  console.log("🔐 [LogShare] 开始加密数据...");
  console.log("    数据类型:", typeof data);
  console.log("    数据长度:", JSON.stringify(data).length);

  const jsonString = JSON.stringify(data);
  const iv = crypto.randomBytes(16);

  // 使用PBKDF2密钥派生，与前端保持一致
  const salt = "logshare-salt";
  const iterations = 10000;
  const keyLength = 32; // 256位

  const keyHash = crypto.pbkdf2Sync(key, salt, iterations, keyLength, "sha512");
  const cipher = crypto.createCipheriv("aes-256-cbc", keyHash, iv);

  let encrypted = cipher.update(jsonString, "utf8", "hex");
  encrypted += cipher.final("hex");

  console.log("🔐 [LogShare] 加密完成");
  console.log("    IV长度:", iv.length);
  console.log("    加密数据长度:", encrypted.length);

  return {
    data: encrypted,
    iv: iv.toString("hex"),
  };
}

// 每次上传都会生成唯一 fileId，文件名为 `${fileId}${ext}`，所有上传结果均保留在 data/sharelogs/ 目录下，支持多次上传和历史回查。
// 上传日志/文件（支持多种类型）
router.post("/sharelog", logLimiter, upload.single("file"), async (req, res) => {
  const ip = req.ip;
  const adminPassword = req.body.adminPassword;
  const fileName = req.file?.originalname;
  try {
    // 验证文件名安全性
    const sanitizedFileName = sanitizeFileName(fileName || "");
    if (fileName && fileName !== sanitizedFileName) {
      logger.warn(`上传 | IP:${ip} | 文件:${fileName} | 结果:失败 | 原因:文件名包含危险字符`);
      return res.status(400).json({ error: "文件名包含危险字符" });
    }

    if (!req.file || !adminPassword) {
      logger.warn(`上传 | IP:${ip} | 文件:${fileName} | 结果:失败 | 原因:缺少参数`);
      return res.status(400).json({ error: "缺少参数" });
    }
    if (req.file.size > 10 * 1024 * 1024) {
      logger.warn(`上传 | IP:${ip} | 文件:${fileName} | 结果:失败 | 原因:文件过大 | size=${req.file.size}`);
      return res.status(400).json({ error: "文件内容过大，最大支持10MB" });
    }
    if (!(await checkAdminPassword(adminPassword))) {
      logger.warn(`上传 | IP:${ip} | 文件:${fileName} | 结果:失败 | 原因:管理员密码错误`);
      return res.status(403).json({ error: "管理员密码错误" });
    }

    // 生成随机文件名，保留原扩展名
    const ext = path.extname(req.file.originalname) || ".txt";
    const fileId = crypto.randomBytes(8).toString("hex");

    // 所有文件都存储到MongoDB，避免本地文件系统风险
    const LogShareModel = getLogShareModel();
    let content = "";
    try {
      content = req.file.buffer.toString("utf-8");
    } catch (_e) {
      content = "";
    }

    await LogShareModel.create({
      fileId,
      ext,
      content,
      fileName: sanitizedFileName || "unknown",
      mimeType: req.file.mimetype,
      fileSize: req.file.size,
      createdAt: new Date(),
    });

    logger.info(
      `[logshare] 已存入MongoDB: fileId=${fileId}, ext=${ext}, fileName=${fileName}, contentPreview=${content.slice(0, 100)}`,
    );

    // 构造前端访问链接
    const baseUrl = "https://tts-new.951100.xyz";
    const link = `${baseUrl}/logshare?id=${fileId}`;
    logger.info(`上传 | IP:${ip} | 文件:${fileName} | 结果:成功 | ID:${fileId}`);
    return res.json({ id: fileId, link, ext });
  } catch (e: any) {
    logger.error(`[logshare] 上传异常 | IP:${ip} | 文件:${fileName} | 错误:${e?.message ?? e}`, e);
    return res.status(500).json({ error: "日志上传失败" });
  }
});

// 获取所有日志列表（GET，需要管理员权限）
router.get("/sharelog/all", logLimiter, authenticateToken, async (req, res) => {
  const ip = req.ip;

  try {
    // 检查管理员权限
    if (!(req as any).user || (req as any).user.role !== "admin") {
      logger.warn(`获取日志列表 | IP:${ip} | 结果:失败 | 原因:非管理员用户`);
      return res.status(403).json({ error: "需要管理员权限" });
    }

    await connectMongo();
    const LogShareModel = getLogShareModel();
    const mongoLogs = await LogShareModel.find({}, { fileId: 1, ext: 1, createdAt: 1, content: 1 }).sort({
      createdAt: -1,
    });

    // 获取本地文件系统中的非文本类型日志
    const localFiles = await fs.promises.readdir(SHARELOGS_DIR);
    const localLogs = localFiles
      .filter((file) => {
        const ext = path.extname(file).toLowerCase();
        return ![".txt", ".log", ".json", ".md"].includes(ext);
      })
      .map((file) => {
        const fileId = path.basename(file, path.extname(file));
        const ext = path.extname(file);
        const filePath = path.join(SHARELOGS_DIR, file);
        const stats = fs.statSync(filePath);
        return {
          id: fileId,
          ext: ext,
          uploadTime: stats.mtime.toISOString(),
          size: stats.size,
        };
      })
      .sort((a, b) => new Date(b.uploadTime).getTime() - new Date(a.uploadTime).getTime());

    // 合并MongoDB和本地文件
    const allLogs = [
      ...mongoLogs.map((log) => ({
        id: log.fileId,
        ext: log.ext,
        uploadTime: log.createdAt.toISOString(),
        size: log.content ? log.content.length : 0,
      })),
      ...localLogs,
    ];

    // 使用管理员token加密数据
    const authHeader = req.headers.authorization;
    const token = authHeader?.split(" ")[1];
    if (token) {
      const encrypted = encryptData({ logs: allLogs }, token);
      logger.info(`获取日志列表 | IP:${ip} | 结果:成功 | 数量:${allLogs.length} | 已加密`);
      return res.json({
        data: encrypted.data,
        iv: encrypted.iv,
      });
    } else {
      logger.info(`获取日志列表 | IP:${ip} | 结果:成功 | 数量:${allLogs.length} | 未加密`);
      return res.json({ logs: allLogs });
    }
  } catch (e: any) {
    logger.error(`获取日志列表 | IP:${ip} | 结果:异常 | 错误:${e?.message}`, e);
    return res.status(500).json({ error: "获取日志列表失败" });
  }
});

// 查询日志/文件内容（POST，密码在body）
router.post("/sharelog/:id", logLimiter, async (req, res) => {
  const ip = req.ip;
  const { adminPassword } = req.body;
  const { id } = req.params;
  try {
    // 验证文件ID格式
    if (!validateFileId(id)) {
      logger.warn(`查询 | IP:${ip} | 文件ID:${id} | 结果:失败 | 原因:无效的文件ID格式`);
      return res.status(400).json({ error: "无效的文件ID格式" });
    }

    if (!adminPassword) {
      logger.warn(`查询 | IP:${ip} | 文件ID:${id} | 结果:失败 | 原因:缺少管理员密码`);
      return res.status(400).json({ error: "缺少管理员密码" });
    }
    if (!(await checkAdminPassword(adminPassword))) {
      logger.warn(`查询 | IP:${ip} | 文件ID:${id} | 结果:失败 | 原因:管理员密码错误`);
      return res.status(403).json({ error: "管理员密码错误" });
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
        iv: encrypted.iv,
      });
    }
    // 非文本类型查本地
    const files = await fs.promises.readdir(SHARELOGS_DIR);
    const fileName = files.find((f) => f.startsWith(id));
    logger.info(`[调试] 查询文件: id=${id}, files=${JSON.stringify(files)}, fileName=${fileName}`);
    if (!fileName) {
      logger.warn(`查询 | IP:${ip} | 文件ID:${id} | 结果:失败 | 原因:日志不存在`);
      return res.status(404).json({ error: "日志不存在" });
    }
    // 验证文件名安全性，防止路径遍历
    const sanitizedFileName = sanitizeFileName(fileName);
    if (fileName !== sanitizedFileName) {
      logger.warn(`查询 | IP:${ip} | 文件ID:${id} | 文件:${fileName} | 结果:失败 | 原因:文件名不安全`);
      return res.status(400).json({ error: "文件名不安全" });
    }
    const filePath = path.join(SHARELOGS_DIR, fileName);
    // 确保文件路径在预期目录内
    const resolvedPath = path.resolve(filePath);
    const resolvedSharelogsDir = path.resolve(SHARELOGS_DIR);
    if (!resolvedPath.startsWith(resolvedSharelogsDir)) {
      logger.warn(`查询 | IP:${ip} | 文件ID:${id} | 文件:${fileName} | 结果:失败 | 原因:路径遍历攻击`);
      return res.status(400).json({ error: "非法的文件路径" });
    }
    const ext = path.extname(fileName).toLowerCase() || ".txt";
    logger.info(`[调试] 查询文件路径: filePath=${filePath}, ext=${ext}`);
    // 只处理二进制
    const content = await fs.promises.readFile(filePath);
    logger.info(`[调试] 读取二进制内容长度: ${content.length}`);

    const result = { content: content.toString("base64"), ext, encoding: "base64" };
    // 使用管理员密码加密数据
    const encrypted = encryptData(result, adminPassword);
    logger.info(`查询 | IP:${ip} | 文件ID:${id} | 文件:${fileName} | 结果:成功 | 类型:二进制 | 已加密`);
    return res.json({
      data: encrypted.data,
      iv: encrypted.iv,
    });
  } catch (e: any) {
    logger.error(`查询 | IP:${ip} | 文件ID:${id} | 结果:异常 | 错误:${e?.message}`);
    return res.status(500).json({ error: "日志查询失败" });
  }
});

// 删除单个日志（DELETE，需要管理员权限）
router.delete("/sharelog/:id", logLimiter, authenticateToken, async (req, res) => {
  const ip = req.ip;
  const { id } = req.params;
  try {
    // 验证文件ID格式
    if (!validateFileId(id)) {
      logger.warn(`删除日志 | IP:${ip} | 文件ID:${id} | 结果:失败 | 原因:无效的文件ID格式`);
      return res.status(400).json({ error: "无效的文件ID格式" });
    }

    if (!(req as any).user || (req as any).user.role !== "admin") {
      logger.warn(`删除日志 | IP:${ip} | 结果:失败 | 原因:非管理员用户`);
      return res.status(403).json({ error: "需要管理员权限" });
    }
    await connectMongo();
    const LogShareModel = getLogShareModel();
    const mongoResult = await LogShareModel.deleteOne({ fileId: id });

    // 删除本地文件（二进制/非文本）
    let fileDeleted = false;
    try {
      const files = await fs.promises.readdir(SHARELOGS_DIR);
      const fileName = files.find((f) => f.startsWith(id));
      if (fileName) {
        // 验证文件名安全性
        const sanitizedFileName = sanitizeFileName(fileName);
        if (fileName !== sanitizedFileName) {
          logger.warn(`删除日志 | IP:${ip} | 文件ID:${id} | 文件:${fileName} | 结果:失败 | 原因:文件名不安全`);
        } else {
          const filePath = path.join(SHARELOGS_DIR, fileName);
          // 确保文件路径在预期目录内
          const resolvedPath = path.resolve(filePath);
          const resolvedSharelogsDir = path.resolve(SHARELOGS_DIR);
          if (resolvedPath.startsWith(resolvedSharelogsDir)) {
            await fs.promises.unlink(filePath);
            fileDeleted = true;
          } else {
            logger.warn(`删除日志 | IP:${ip} | 文件ID:${id} | 文件:${fileName} | 结果:失败 | 原因:路径遍历攻击`);
          }
        }
      }
    } catch (_err) {
      // 忽略本地不存在的情况
    }

    if (mongoResult.deletedCount === 0 && !fileDeleted) {
      logger.warn(`删除日志 | IP:${ip} | 文件ID:${id} | 结果:失败 | 原因:日志不存在`);
      return res.status(404).json({ error: "日志不存在" });
    }
    logger.info(
      `删除日志 | IP:${ip} | 文件ID:${id} | 结果:成功 | mongo:${mongoResult.deletedCount} | file:${fileDeleted}`,
    );
    return res.json({ success: true, mongoDeleted: mongoResult.deletedCount, fileDeleted });
  } catch (e: any) {
    logger.error(`删除日志 | IP:${ip} | 文件ID:${id} | 结果:异常 | 错误:${e?.message}`);
    return res.status(500).json({ error: "删除失败" });
  }
});

// 批量删除（POST，需要管理员权限）
router.post("/sharelog/delete-batch", logLimiter, authenticateToken, async (req, res) => {
  const ip = req.ip;
  const ids: string[] = Array.isArray(req.body.ids) ? req.body.ids : [];
  try {
    if (!(req as any).user || (req as any).user.role !== "admin") {
      logger.warn(`批量删除 | IP:${ip} | 结果:失败 | 原因:非管理员用户`);
      return res.status(403).json({ error: "需要管理员权限" });
    }
    if (ids.length === 0) {
      return res.status(400).json({ error: "缺少要删除的ID列表" });
    }
    await connectMongo();
    const LogShareModel = getLogShareModel();
    const mongoResult = await LogShareModel.deleteMany({ fileId: { $in: ids } });

    let fileDeleted = 0;
    try {
      const files = await fs.promises.readdir(SHARELOGS_DIR);
      for (const id of ids) {
        // 验证每个ID格式
        if (!validateFileId(id)) {
          logger.warn(`批量删除 | IP:${ip} | 文件ID:${id} | 结果:跳过 | 原因:无效的文件ID格式`);
          continue;
        }

        const fileName = files.find((f) => f.startsWith(id));
        if (fileName) {
          // 验证文件名安全性
          const sanitizedFileName = sanitizeFileName(fileName);
          if (fileName !== sanitizedFileName) {
            logger.warn(`批量删除 | IP:${ip} | 文件ID:${id} | 文件:${fileName} | 结果:跳过 | 原因:文件名不安全`);
            continue;
          }

          const filePath = path.join(SHARELOGS_DIR, fileName);
          // 确保文件路径在预期目录内
          const resolvedPath = path.resolve(filePath);
          const resolvedSharelogsDir = path.resolve(SHARELOGS_DIR);
          if (resolvedPath.startsWith(resolvedSharelogsDir)) {
            await fs.promises.unlink(filePath);
            fileDeleted++;
          } else {
            logger.warn(`批量删除 | IP:${ip} | 文件ID:${id} | 文件:${fileName} | 结果:跳过 | 原因:路径遍历攻击`);
          }
        }
      }
    } catch (_err) {
      // 忽略
    }
    logger.info(`批量删除 | IP:${ip} | 结果:成功 | mongo:${mongoResult.deletedCount} | file:${fileDeleted}`);
    return res.json({ success: true, mongoDeleted: mongoResult.deletedCount, fileDeleted });
  } catch (e: any) {
    logger.error(`批量删除 | IP:${ip} | 结果:异常 | 错误:${e?.message}`);
    return res.status(500).json({ error: "批量删除失败" });
  }
});

// 全部删除（DELETE，需要管理员权限）
router.delete("/sharelog/all", logLimiter, authenticateToken, async (req, res) => {
  const ip = req.ip;
  try {
    if (!(req as any).user || (req as any).user.role !== "admin") {
      logger.warn(`全部删除 | IP:${ip} | 结果:失败 | 原因:非管理员用户`);
      return res.status(403).json({ error: "需要管理员权限" });
    }
    await connectMongo();
    const LogShareModel = getLogShareModel();
    const mongoResult = await LogShareModel.deleteMany({});

    let fileDeleted = 0;
    try {
      const files = await fs.promises.readdir(SHARELOGS_DIR);
      for (const file of files) {
        // 验证文件名安全性
        const sanitizedFileName = sanitizeFileName(file);
        if (file !== sanitizedFileName) {
          logger.warn(`全部删除 | IP:${ip} | 文件:${file} | 结果:跳过 | 原因:文件名不安全`);
          continue;
        }

        const filePath = path.join(SHARELOGS_DIR, file);
        // 确保文件路径在预期目录内
        const resolvedPath = path.resolve(filePath);
        const resolvedSharelogsDir = path.resolve(SHARELOGS_DIR);
        if (resolvedPath.startsWith(resolvedSharelogsDir)) {
          await fs.promises.unlink(filePath);
          fileDeleted++;
        } else {
          logger.warn(`全部删除 | IP:${ip} | 文件:${file} | 结果:跳过 | 原因:路径遍历攻击`);
        }
      }
    } catch (_err) {
      // 忽略
    }
    logger.info(`全部删除 | IP:${ip} | 结果:成功 | mongo:${mongoResult.deletedCount} | file:${fileDeleted}`);
    return res.json({ success: true, mongoDeleted: mongoResult.deletedCount, fileDeleted });
  } catch (e: any) {
    logger.error(`全部删除 | IP:${ip} | 结果:异常 | 错误:${e?.message}`);
    return res.status(500).json({ error: "全部删除失败" });
  }
});

// 修改单个日志（PUT，需要管理员权限，仅Mongo文本日志支持）
router.put("/sharelog/:id", logLimiter, authenticateToken, async (req, res) => {
  const ip = req.ip;
  const { id } = req.params;
  const { fileName, note } = req.body || {};
  try {
    // 验证文件ID格式
    if (!validateFileId(id)) {
      logger.warn(`修改日志 | IP:${ip} | 文件ID:${id} | 结果:失败 | 原因:无效的文件ID格式`);
      return res.status(400).json({ error: "无效的文件ID格式" });
    }

    if (!(req as any).user || (req as any).user.role !== "admin") {
      logger.warn(`修改日志 | IP:${ip} | 结果:失败 | 原因:非管理员用户`);
      return res.status(403).json({ error: "需要管理员权限" });
    }
    if (!fileName && typeof note === "undefined") {
      return res.status(400).json({ error: "未提供可以更新的字段" });
    }
    await connectMongo();
    const LogShareModel = getLogShareModel();
    const update: any = {};
    if (fileName) update.fileName = sanitizeFileName(String(fileName)).slice(0, 200);
    if (typeof note !== "undefined") update.note = String(note).slice(0, 1000);

    const result = await LogShareModel.findOneAndUpdate({ fileId: id }, { $set: update }, { returnDocument: 'after' });
    if (!result) {
      logger.warn(`修改日志 | IP:${ip} | 文件ID:${id} | 结果:失败 | 原因:仅支持Mongo文本日志`);
      return res.status(404).json({ error: "仅支持修改存储在Mongo的文本日志" });
    }
    logger.info(`修改日志 | IP:${ip} | 文件ID:${id} | 结果:成功`);
    return res.json({ success: true, log: { id: result.fileId, fileName: result.fileName, note: result.note } });
  } catch (e: any) {
    logger.error(`修改日志 | IP:${ip} | 文件ID:${id} | 结果:异常 | 错误:${e?.message}`);
    return res.status(500).json({ error: "修改失败" });
  }
});

// 归档当前日志（POST，需要管理员权限）
router.post("/logs/archive", logLimiter, authenticateToken, async (req, res) => {
  const ip = req.ip;
  const { archiveName, includePattern, excludePattern } = req.body || {};

  try {
    if (!(req as any).user || (req as any).user.role !== "admin") {
      logger.warn(`归档日志 | IP:${ip} | 结果:失败 | 原因:非管理员用户`);
      return res.status(403).json({ error: "需要管理员权限" });
    }

    // 检查日志目录是否存在
    if (!fs.existsSync(logDir)) {
      logger.warn(`归档日志 | IP:${ip} | 结果:失败 | 原因:日志目录不存在`);
      return res.status(404).json({ error: "日志目录不存在" });
    }

    // 生成归档名称（如果未提供）
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const sanitizedArchiveName = sanitizePathComponent(archiveName || `logs-archive-${timestamp}`);
    const finalArchiveName = sanitizedArchiveName || `logs-archive-${timestamp}`;

    // 验证归档名称安全性
    if (!validateArchiveName(finalArchiveName)) {
      logger.warn(`归档日志 | IP:${ip} | 结果:失败 | 原因:无效的归档名称`);
      return res.status(400).json({ error: "无效的归档名称" });
    }

    // 创建归档目录
    const archiveSubDir = path.join(ARCHIVE_DIR, finalArchiveName);
    await fs.promises.mkdir(archiveSubDir, { recursive: true });

    // 获取数据库中的所有日志
    await connectMongo();
    const LogShareModel = getLogShareModel();
    const mongoLogs = await LogShareModel.find({}).sort({ createdAt: -1 });

    // 获取日志目录中的所有文件
    const logFiles = await fs.promises.readdir(logDir);

    // 创建数据库日志文件到临时目录
    const tempDbLogsDir = path.join(archiveSubDir, "temp-db-logs");
    await fs.promises.mkdir(tempDbLogsDir, { recursive: true });

    const dbLogFiles = [];
    for (const log of mongoLogs) {
      const fileName = `${log.fileId}${log.ext || ".txt"}`;
      const tempFilePath = path.join(tempDbLogsDir, fileName);

      // 应用包含模式
      if (includePattern) {
        const sanitizedPattern = sanitizeRegexPattern(includePattern);
        const regex = new RegExp(sanitizedPattern, "i");
        if (!regex.test(fileName)) continue;
      }

      // 应用排除模式
      if (excludePattern) {
        const sanitizedPattern = sanitizeRegexPattern(excludePattern);
        const regex = new RegExp(sanitizedPattern, "i");
        if (regex.test(fileName)) continue;
      }

      // 写入数据库日志内容到临时文件
      await fs.promises.writeFile(tempFilePath, log.content || "", "utf-8");
      dbLogFiles.push(fileName);
    }

    // 过滤文件系统文件（支持包含和排除模式）
    const filesToArchive = logFiles.filter((file) => {
      const filePath = path.join(logDir, file);
      const stats = fs.statSync(filePath);

      // 只处理文件，不处理目录
      if (!stats.isFile()) return false;

      // 应用包含模式
      if (includePattern) {
        const sanitizedPattern = sanitizeRegexPattern(includePattern);
        const regex = new RegExp(sanitizedPattern, "i");
        if (!regex.test(file)) return false;
      }

      // 应用排除模式
      if (excludePattern) {
        const sanitizedPattern = sanitizeRegexPattern(excludePattern);
        const regex = new RegExp(sanitizedPattern, "i");
        if (regex.test(file)) return false;
      }

      return true;
    });

    // 合并数据库日志文件和文件系统日志文件
    const allFilesToArchive = [...dbLogFiles, ...filesToArchive];

    if (allFilesToArchive.length === 0) {
      logger.warn(`归档日志 | IP:${ip} | 结果:失败 | 原因:没有匹配的日志文件`);
      return res.status(400).json({ error: "没有找到匹配的日志文件进行归档" });
    }

    // 计算所有文件的总大小
    let totalSize = 0;
    const archiveInfo = [];

    for (const file of allFilesToArchive) {
      try {
        // 判断是数据库日志还是文件系统日志
        const isDbLog = dbLogFiles.includes(file);
        const sourcePath = isDbLog ? path.join(tempDbLogsDir, file) : path.join(logDir, file);

        // 获取原文件信息
        const stats = fs.statSync(sourcePath);
        totalSize += stats.size;

        archiveInfo.push({
          fileName: file,
          originalSize: stats.size,
          modifiedAt: stats.mtime.toISOString(),
          source: isDbLog ? "database" : "filesystem",
        });

        logger.info(`准备归档文件 | 文件:${file} | 大小:${stats.size} | 来源:${isDbLog ? "数据库" : "文件系统"}`);
      } catch (fileError) {
        logger.error(`获取文件信息失败 | 文件:${file} | 错误:${fileError}`);
      }
    }

    // 创建单个压缩归档文件
    const archiveFileName = `${finalArchiveName}.tar.gz`;
    const archivePath = path.join(archiveSubDir, archiveFileName);

    // 准备要打包的文件列表
    const filesToTar = [];

    // 添加数据库日志文件
    for (const file of dbLogFiles) {
      if (allFilesToArchive.includes(file)) {
        const sourcePath = path.join(tempDbLogsDir, file);
        const destPath = path.join(archiveSubDir, "database-logs", file);
        const destDir = path.dirname(destPath);

        // 确保目标目录存在
        if (!fs.existsSync(destDir)) {
          fs.mkdirSync(destDir, { recursive: true });
        }

        // 复制文件到归档目录
        fs.copyFileSync(sourcePath, destPath);
        filesToTar.push(`database-logs/${file}`);
      }
    }

    // 添加文件系统日志文件
    for (const file of filesToArchive) {
      if (allFilesToArchive.includes(file)) {
        const sourcePath = path.join(logDir, file);
        const destPath = path.join(archiveSubDir, "filesystem-logs", file);
        const destDir = path.dirname(destPath);

        // 确保目标目录存在
        if (!fs.existsSync(destDir)) {
          fs.mkdirSync(destDir, { recursive: true });
        }

        // 复制文件到归档目录
        fs.copyFileSync(sourcePath, destPath);
        filesToTar.push(`filesystem-logs/${file}`);
      }
    }

    // 使用tar创建压缩归档
    await tar.create(
      {
        gzip: true,
        file: archivePath,
        cwd: archiveSubDir,
      },
      filesToTar,
    );

    // 清理临时复制的文件
    const dbLogsDir = path.join(archiveSubDir, "database-logs");
    const fsLogsDir = path.join(archiveSubDir, "filesystem-logs");

    if (fs.existsSync(dbLogsDir)) {
      fs.rmSync(dbLogsDir, { recursive: true, force: true });
    }
    if (fs.existsSync(fsLogsDir)) {
      fs.rmSync(fsLogsDir, { recursive: true, force: true });
    }

    // 获取压缩后文件大小
    const compressedStats = fs.statSync(archivePath);
    const compressedSize = compressedStats.size;
    const compressionRatio = totalSize > 0 ? `${((1 - compressedSize / totalSize) * 100).toFixed(2)}%` : "0%";

    logger.info(
      `创建压缩归档 | 文件:${archiveFileName} | 原总大小:${totalSize} | 压缩后:${compressedSize} | 压缩率:${compressionRatio}`,
    );

    // 创建归档信息文件
    const archiveMetadata = {
      archiveName: finalArchiveName,
      archiveFileName: archiveFileName,
      createdAt: new Date().toISOString(),
      createdBy: req.user?.username || "admin",
      sourceDirectory: logDir,
      databaseLogsIncluded: dbLogFiles.length,
      fileSystemLogsIncluded: filesToArchive.length,
      totalFiles: allFilesToArchive.length,
      originalTotalSize: totalSize,
      compressedTotalSize: compressedSize,
      overallCompressionRatio: compressionRatio,
      compressionEnabled: true,
      compressionType: "zip",
      includePattern: includePattern || null,
      excludePattern: excludePattern || null,
      files: archiveInfo,
    };

    const metadataPath = path.join(archiveSubDir, "archive-info.json");
    await fs.promises.writeFile(metadataPath, JSON.stringify(archiveMetadata, null, 2), "utf-8");

    logger.info(
      `归档日志 | IP:${ip} | 归档名:${finalArchiveName} | 文件数:${allFilesToArchive.length} | 原总大小:${totalSize} | 压缩后:${compressedSize} | 总压缩率:${compressionRatio} | 结果:成功`,
    );

    // 上传单个压缩归档文件到IPFS并删除本地文件
    let ipfsUploadCount = 0;
    let ipfsFailedCount = 0;
    const ipfsResults = [];

    try {
      // 读取压缩归档文件
      const compressedFileBuffer = await fs.promises.readFile(archivePath);

      // 上传到IPFS
      const ipfsResponse = await IPFSService.uploadFile(
        compressedFileBuffer,
        archiveFileName,
        "application/gzip",
        {
          shortLink: false,
          userId: req.user?.username || "admin",
          username: req.user?.username || "admin",
        },
        undefined, // cfToken
        {
          clientIp: ip,
          isAdmin: true,
          isDev: process.env.NODE_ENV === "development",
          shouldSkipTurnstile: true, // 管理员归档操作跳过验证
          userAgent: req.get("User-Agent") || "Archive-Service",
          skipFileTypeCheck: true, // 归档上传跳过文件类型检查
        },
      );

      ipfsResults.push({
        archiveFileName: archiveFileName,
        ipfsCid: ipfsResponse.cid,
        ipfsUrl: ipfsResponse.url,
        web2Url: ipfsResponse.web2url,
        fileSize: compressedSize,
        uploadSuccess: true,
      });

      // 上传成功后删除本地压缩文件
      await fs.promises.unlink(archivePath);
      logger.info(`IPFS上传成功并删除本地文件 | 文件:${archiveFileName} | CID:${ipfsResponse.cid} | 本地文件已删除`);

      ipfsUploadCount = 1;
    } catch (ipfsError) {
      logger.error(
        `IPFS上传失败 | 文件:${archiveFileName} | 错误:${ipfsError instanceof Error ? ipfsError.message : String(ipfsError)}`,
      );

      ipfsResults.push({
        archiveFileName: archiveFileName,
        ipfsCid: null,
        ipfsUrl: null,
        web2Url: null,
        fileSize: compressedSize,
        uploadSuccess: false,
        error: ipfsError instanceof Error ? ipfsError.message : String(ipfsError),
      });

      ipfsFailedCount = 1;
    }

    // 更新归档元数据，包含IPFS信息
    const updatedArchiveMetadata = {
      ...archiveMetadata,
      ipfsUpload: {
        enabled: true,
        uploadedFiles: ipfsUploadCount,
        failedFiles: ipfsFailedCount,
        totalFiles: 1, // 单个压缩归档文件
        uploadResults: ipfsResults,
        uploadedAt: new Date().toISOString(),
      },
    };

    // 重新写入更新后的元数据
    await fs.promises.writeFile(metadataPath, JSON.stringify(updatedArchiveMetadata, null, 2), "utf-8");

    // 保存归档信息到数据库
    try {
      const archiveDoc = new ArchiveModel(updatedArchiveMetadata);
      await archiveDoc.save();
      logger.info(`归档信息已保存到数据库 | 归档名:${finalArchiveName} | ID:${archiveDoc._id}`);
    } catch (dbError) {
      logger.error(
        `保存归档信息到数据库失败 | 归档名:${finalArchiveName} | 错误:${dbError instanceof Error ? dbError.message : String(dbError)}`,
      );
    }

    // 清理临时数据库日志目录
    try {
      // 验证临时目录路径安全性
      const resolvedTempDir = path.resolve(tempDbLogsDir);
      const resolvedArchiveDir = path.resolve(archiveSubDir);
      if (resolvedTempDir.startsWith(resolvedArchiveDir) && fs.existsSync(tempDbLogsDir)) {
        await fs.promises.rm(tempDbLogsDir, { recursive: true, force: true });
        logger.info(`清理临时数据库日志目录 | 路径:${tempDbLogsDir}`);
      }
    } catch (cleanupError) {
      logger.warn(`清理临时数据库日志目录失败 | 路径:${tempDbLogsDir} | 错误:${cleanupError}`);
    }

    // 如果压缩归档文件成功上传到IPFS
    if (ipfsUploadCount === 1 && ipfsFailedCount === 0) {
      logger.info(`压缩归档文件已成功上传到IPFS | 归档:${finalArchiveName} | 上传文件数:${ipfsUploadCount}`);
    } else {
      logger.warn(
        `压缩归档文件IPFS上传失败 | 归档:${finalArchiveName} | 成功:${ipfsUploadCount} | 失败:${ipfsFailedCount}`,
      );
    }

    return res.json({
      success: true,
      archiveName: finalArchiveName,
      archiveFileName: archiveFileName,
      archivedFiles: allFilesToArchive.length,
      originalTotalSize: totalSize,
      compressedTotalSize: compressedSize,
      overallCompressionRatio: compressionRatio,
      archivePath: archiveSubDir,
      databaseLogsIncluded: dbLogFiles.length,
      fileSystemLogsIncluded: filesToArchive.length,
      files: archiveInfo,
      ipfsUpload: {
        enabled: true,
        uploadedFiles: ipfsUploadCount,
        failedFiles: ipfsFailedCount,
        results: ipfsResults,
      },
    });
  } catch (e: any) {
    logger.error(`归档日志 | IP:${ip} | 结果:异常 | 错误:${e?.message}`, e);
    return res.status(500).json({ error: "归档失败" });
  }
});

// 获取归档列表（GET，需要管理员权限）
router.get("/logs/archives", logLimiter, authenticateToken, async (req, res) => {
  const ip = req.ip;

  try {
    // 检查管理员权限
    if (!(req as any).user || (req as any).user.role !== "admin") {
      logger.warn(`获取归档列表 | IP:${ip} | 结果:失败 | 原因:非管理员用户`);
      return res.status(403).json({ error: "需要管理员权限" });
    }

    await connectMongo();

    // 从数据库获取归档列表
    const archives = await ArchiveModel.find({}).sort({ createdAt: -1 }).lean().exec();

    logger.info(`获取归档列表 | IP:${ip} | 归档数量:${archives.length} | 结果:成功`);
    return res.json({ archives });
  } catch (e: any) {
    logger.error(`获取归档列表 | IP:${ip} | 结果:异常 | 错误:${e?.message}`, e);
    return res.status(500).json({ error: "获取归档列表失败" });
  }
});

// 删除归档（DELETE，需要管理员权限）
router.delete("/logs/archives/:archiveName", logLimiter, authenticateToken, async (req, res) => {
  const ip = req.ip;
  const { archiveName } = req.params;

  try {
    if (!(req as any).user || (req as any).user.role !== "admin") {
      logger.warn(`删除归档 | IP:${ip} | 结果:失败 | 原因:非管理员用户`);
      return res.status(403).json({ error: "需要管理员权限" });
    }

    // 验证归档名称格式
    if (!validateArchiveName(archiveName)) {
      logger.warn(`删除归档 | IP:${ip} | 归档:${archiveName} | 结果:失败 | 原因:无效的归档名称格式`);
      return res.status(400).json({ error: "无效的归档名称格式" });
    }

    await connectMongo();

    // 首先检查数据库中是否存在该归档
    const dbArchive = await ArchiveModel.findOne({ archiveName });

    const archivePath = path.join(ARCHIVE_DIR, archiveName);

    // 确保归档路径在预期目录内
    const resolvedArchivePath = path.resolve(archivePath);
    const resolvedArchiveDir = path.resolve(ARCHIVE_DIR);
    if (!resolvedArchivePath.startsWith(resolvedArchiveDir)) {
      logger.warn(`删除归档 | IP:${ip} | 归档:${archiveName} | 结果:失败 | 原因:路径遍历攻击`);
      return res.status(400).json({ error: "非法的归档路径" });
    }

    // 检查归档是否存在（数据库或文件系统）
    const fileSystemExists = fs.existsSync(archivePath);

    if (!dbArchive && !fileSystemExists) {
      logger.warn(`删除归档 | IP:${ip} | 归档:${archiveName} | 结果:失败 | 原因:归档不存在`);
      return res.status(404).json({ error: "归档不存在" });
    }

    let deletedFromDb = false;
    let deletedFromFs = false;

    // 从数据库删除归档记录
    if (dbArchive) {
      await ArchiveModel.deleteOne({ archiveName });
      deletedFromDb = true;
      logger.info(`从数据库删除归档 | 归档:${archiveName} | ID:${dbArchive._id}`);
    }

    // 从文件系统删除归档目录
    if (fileSystemExists) {
      await fs.promises.rm(archivePath, { recursive: true, force: true });
      deletedFromFs = true;
      logger.info(`从文件系统删除归档 | 归档:${archiveName} | 路径:${archivePath}`);
    }

    logger.info(
      `删除归档 | IP:${ip} | 归档:${archiveName} | 结果:成功 | 数据库:${deletedFromDb} | 文件系统:${deletedFromFs}`,
    );
    return res.json({
      success: true,
      deletedArchive: archiveName,
      deletedFromDatabase: deletedFromDb,
      deletedFromFileSystem: deletedFromFs,
    });
  } catch (e: any) {
    logger.error(`删除归档 | IP:${ip} | 归档:${archiveName} | 结果:异常 | 错误:${e?.message}`, e);
    return res.status(500).json({ error: "删除归档失败" });
  }
});

export default router;
