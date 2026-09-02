import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import express from "express";
import { createLimiter } from "../middleware/routeLimiters";
import multer from "multer";
import { isAdminRole, isSuperAdmin, authenticateSuperAdmin } from "../middleware/auth";
import { auditLog } from "../middleware/auditLog";
import { authenticateToken } from "../middleware/authenticateToken";
import ArchiveModel from "../models/archiveModel";
import { connectMongo } from "../services/mongoService";
import { firstString } from "../utils/httpParam";
import { getTokenFromRequest } from "../utils/authCookie";
import logger from "../utils/logger";
import { archiveLogsHandler } from "./logShare/archive";
import { sanitizeFileName, validateArchiveName, validateFileId } from "./logShare/security";
import {
  ARCHIVE_DIR,
  checkAdminPassword,
  encryptData,
  getLogShareModel,
  SHARELOGS_DIR,
  TEXT_LOG_EXTENSIONS,
} from "./logShare/store";

const router = express.Router();
const SHARELOG_LIST_LIMIT = 5000;

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
const logLimiter = createLimiter({
  name: "logShare",
  profile: "sensitive",
  category: "public-api",
  message: "请求过于频繁，请稍后再试",
});

// 每次上传都会生成唯一 fileId，文件名为 `${fileId}${ext}`，所有上传结果均保留在 data/sharelogs/ 目录下，支持多次上传和历史回查。
// 上传日志/文件（需要登录 + 超级管理员；口令保留为二次确认；upload 在鉴权之后避免匿名内存放大）
router.post("/sharelog", logLimiter, authenticateToken, authenticateSuperAdmin, upload.single("file"), async (req, res) => {
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

    logger.info("[logshare] 已存入MongoDB", {
      fileId,
      ext,
      fileName: sanitizedFileName || "unknown",
      fileSize: req.file.size,
    });

    // 构造前端访问链接
    const baseUrl = "https://tts.chloemlla.com";
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
    if (!isAdminRole((req as any).user?.role)) {
      logger.warn(`获取日志列表 | IP:${ip} | 结果:失败 | 原因:非管理员用户`);
      return res.status(403).json({ error: "需要管理员权限" });
    }

    await connectMongo();
    const LogShareModel = getLogShareModel();
    const mongoLogs = await LogShareModel.aggregate([
      { $sort: { createdAt: -1 } },
      { $limit: SHARELOG_LIST_LIMIT },
      { $project: { _id: 0, fileId: 1, ext: 1, createdAt: 1, size: { $strLenCP: { $ifNull: ["$content", ""] } } } },
    ]);

    // 获取本地文件系统中的非文本类型日志
    const localFiles = await fs.promises.readdir(SHARELOGS_DIR);
    const localEntries = await Promise.all(
      localFiles
        .filter((file) => ![".txt", ".log", ".json", ".md"].includes(path.extname(file).toLowerCase()))
        .map(async (file) => {
          const stats = await fs.promises.stat(path.join(SHARELOGS_DIR, file));
          return {
            id: path.basename(file, path.extname(file)),
            ext: path.extname(file),
            uploadTime: stats.mtime.toISOString(),
            size: stats.size,
          };
        }),
    );
    const localLogs = localEntries.sort((a, b) => new Date(b.uploadTime).getTime() - new Date(a.uploadTime).getTime());

    // 合并MongoDB和本地文件
    const allLogs = [
      ...mongoLogs.map((log) => ({
        id: log.fileId,
        ext: log.ext,
        uploadTime: log.createdAt.toISOString(),
        size: log.size,
      })),
      ...localLogs,
    ];

    // 使用管理员token加密数据（优先从 Authorization header，其次从 cookie）
    const token = getTokenFromRequest(req);
    if (!token) {
      logger.warn(`获取日志列表 | IP:${ip} | 结果:失败 | 原因:缺少认证令牌`);
      return res.status(401).json({ error: "缺少认证令牌" });
    }

    const encrypted = encryptData({ logs: allLogs }, token);
    logger.info(`获取日志列表 | IP:${ip} | 结果:成功 | 数量:${allLogs.length} | 已加密`);
    return res.json(encrypted);
  } catch (e: any) {
    logger.error(`获取日志列表 | IP:${ip} | 结果:异常 | 错误:${e?.message}`, e);
    return res.status(500).json({ error: "获取日志列表失败" });
  }
});

// 批量删除（POST，需要管理员权限）—— 必须在 /sharelog/:id 之前注册，避免被参数路由吞掉
router.post("/sharelog/delete-batch", logLimiter, authenticateToken, auditLog({ module: "media", action: "logshare.batchDelete", extractDetail: (req) => ({ count: Array.isArray(req.body?.ids) ? req.body.ids.length : 0 }) }), async (req, res) => {
  const ip = req.ip;
  const ids: string[] = Array.isArray(req.body.ids) ? req.body.ids : [];
  try {
    if (!isSuperAdmin(req)) {
      logger.warn(`批量删除 | IP:${ip} | 结果:失败 | 原因:非管理员用户`);
      return res.status(403).json({ error: "需要管理员权限" });
    }
    if (ids.length === 0) {
      return res.status(400).json({ error: "缺少要删除的ID列表" });
    }
    await connectMongo();
    const LogShareModel = getLogShareModel();
    const mongoResult = await LogShareModel.deleteMany({
      fileId: { $in: ids },
    });

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
    return res.json({
      success: true,
      mongoDeleted: mongoResult.deletedCount,
      fileDeleted,
    });
  } catch (e: any) {
    logger.error(`批量删除 | IP:${ip} | 结果:异常 | 错误:${e?.message}`);
    return res.status(500).json({ error: "批量删除失败" });
  }
});

// 查询日志/文件内容（POST，需要登录 + 超级管理员；口令保留为二次确认）
router.post("/sharelog/:id", logLimiter, authenticateToken, authenticateSuperAdmin, async (req, res) => {
  const ip = req.ip;
  const { adminPassword } = req.body;
  const id = firstString(req.params.id);
  try {
    if (!id) {
      return res.status(400).json({ error: "无效的文件ID格式" });
    }
    // 字面量路由保留字，防止参数路由吞掉同前缀字面量端点
    if (id === "delete-batch" || id === "all") {
      return res.status(400).json({ error: "无效的文件ID格式" });
    }
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
    if (doc && TEXT_LOG_EXTENSIONS.has(doc.ext)) {
      logger.info(`[logshare] MongoDB命中: fileId=${id}, ext=${doc.ext}, fileName=${doc.fileName}`);
      const encrypted = encryptData({ content: doc.content, ext: doc.ext }, adminPassword);
      logger.info(`查询 | IP:${ip} | 文件ID:${id} | 结果:成功 | 类型:文本 | 已加密`);
      return res.json(encrypted);
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
    if (TEXT_LOG_EXTENSIONS.has(ext)) {
      const content = await fs.promises.readFile(filePath, "utf-8");
      const encrypted = encryptData({ content, ext }, adminPassword);
      logger.info(`查询 | IP:${ip} | 文件ID:${id} | 文件:${fileName} | 结果:成功 | 类型:文本 | 已加密`);
      return res.json(encrypted);
    }

    // 只处理二进制
    const content = await fs.promises.readFile(filePath);
    logger.info(`[调试] 读取二进制内容长度: ${content.length}`);

    const result = {
      content: content.toString("base64"),
      ext,
      encoding: "base64",
    };
    // 使用管理员密码加密数据
    const encrypted = encryptData(result, adminPassword);
    logger.info(`查询 | IP:${ip} | 文件ID:${id} | 文件:${fileName} | 结果:成功 | 类型:二进制 | 已加密`);
    return res.json(encrypted);
  } catch (e: any) {
    logger.error(`查询 | IP:${ip} | 文件ID:${id} | 结果:异常 | 错误:${e?.message}`);
    return res.status(500).json({ error: "日志查询失败" });
  }
});

// 删除单个日志（DELETE，需要管理员权限）
router.delete("/sharelog/:id", logLimiter, authenticateToken, auditLog({ module: "media", action: "logshare.delete", extractTarget: (req) => ({ targetId: req.params.id }) }), async (req, res) => {
  const ip = req.ip;
  const id = firstString(req.params.id);
  try {
    if (!id) {
      return res.status(400).json({ error: "无效的文件ID格式" });
    }
    // 字面量路由保留字，防止参数路由吞掉同前缀字面量端点
    if (id === "all" || id === "delete-batch") {
      return res.status(400).json({ error: "无效的文件ID格式" });
    }
    // 验证文件ID格式
    if (!validateFileId(id)) {
      logger.warn(`删除日志 | IP:${ip} | 文件ID:${id} | 结果:失败 | 原因:无效的文件ID格式`);
      return res.status(400).json({ error: "无效的文件ID格式" });
    }

    if (!isSuperAdmin(req)) {
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
    return res.json({
      success: true,
      mongoDeleted: mongoResult.deletedCount,
      fileDeleted,
    });
  } catch (e: any) {
    logger.error(`删除日志 | IP:${ip} | 文件ID:${id} | 结果:异常 | 错误:${e?.message}`);
    return res.status(500).json({ error: "删除失败" });
  }
});

// 全部删除（DELETE，需要管理员权限）—— 必须在 /sharelog/:id 之前注册，避免被参数路由吞掉
router.delete("/sharelog/all", logLimiter, authenticateToken, auditLog({ module: "media", action: "logshare.deleteAll" }), async (req, res) => {
  const ip = req.ip;
  try {
    if (!isSuperAdmin(req)) {
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
    return res.json({
      success: true,
      mongoDeleted: mongoResult.deletedCount,
      fileDeleted,
    });
  } catch (e: any) {
    logger.error(`全部删除 | IP:${ip} | 结果:异常 | 错误:${e?.message}`);
    return res.status(500).json({ error: "全部删除失败" });
  }
});

// 修改单个日志（PUT，需要管理员权限，仅Mongo文本日志支持）
router.put("/sharelog/:id", logLimiter, authenticateToken, auditLog({ module: "media", action: "logshare.update", extractTarget: (req) => ({ targetId: req.params.id }) }), async (req, res) => {
  const ip = req.ip;
  const id = firstString(req.params.id);
  const { fileName, note } = req.body || {};
  try {
    if (!id) {
      return res.status(400).json({ error: "无效的文件ID格式" });
    }
    // 验证文件ID格式
    if (!validateFileId(id)) {
      logger.warn(`修改日志 | IP:${ip} | 文件ID:${id} | 结果:失败 | 原因:无效的文件ID格式`);
      return res.status(400).json({ error: "无效的文件ID格式" });
    }

    if (!isSuperAdmin(req)) {
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

    const result = await LogShareModel.findOneAndUpdate({ fileId: id }, { $set: update }, { returnDocument: "after" });
    if (!result) {
      logger.warn(`修改日志 | IP:${ip} | 文件ID:${id} | 结果:失败 | 原因:仅支持Mongo文本日志`);
      return res.status(404).json({ error: "仅支持修改存储在Mongo的文本日志" });
    }
    logger.info(`修改日志 | IP:${ip} | 文件ID:${id} | 结果:成功`);
    return res.json({
      success: true,
      log: { id: result.fileId, fileName: result.fileName, note: result.note },
    });
  } catch (e: any) {
    logger.error(`修改日志 | IP:${ip} | 文件ID:${id} | 结果:异常 | 错误:${e?.message}`);
    return res.status(500).json({ error: "修改失败" });
  }
});

// 归档当前日志（POST，需要管理员权限）
router.post("/logs/archive", logLimiter, authenticateToken, auditLog({ module: "system", action: "logshare.archive", extractDetail: (req) => ({ archiveName: req.body?.archiveName }) }), archiveLogsHandler);

// 获取归档列表（GET，需要管理员权限）
router.get("/logs/archives", logLimiter, authenticateToken, async (req, res) => {
  const ip = req.ip;

  try {
    // 检查管理员权限
    if (!isAdminRole((req as any).user?.role)) {
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
router.delete("/logs/archives/:archiveName", logLimiter, authenticateToken, auditLog({ module: "system", action: "logshare.deleteArchive", extractDetail: (req) => ({ archiveName: req.params.archiveName }) }), async (req, res) => {
  const ip = req.ip;
  const archiveName = firstString(req.params.archiveName);

  try {
    if (!archiveName) {
      return res.status(400).json({ error: "无效的归档名称格式" });
    }
    if (!isSuperAdmin(req)) {
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
