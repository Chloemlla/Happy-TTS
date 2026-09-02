import fs from "node:fs";
import path from "node:path";
import type { Request, Response } from "express";
import * as tar from "tar";
import { isSuperAdmin } from "../../middleware/auth";
import ArchiveModel from "../../models/archiveModel";
import { IPFSService } from "../../services/ipfsService";
import { connectMongo } from "../../services/mongoService";
import logger from "../../utils/logger";
import { sanitizePathComponent, sanitizeRegexPattern, validateArchiveName } from "./security";
import { ARCHIVE_DIR, getLogShareModel, logDir } from "./store";

// G3-15: 单次归档的日志文件数量上限，防止单请求无界放大
const MAX_ARCHIVE_FILES = 5000;
// 单一归档任务占位：避免匿名/重复请求并发执行全量导出+打包+IPFS 上传
const archiveJobsInFlight = new Set<string>();

// G3-15: 给外部调用（IPFS 上传）加超时，避免请求无界挂起
function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export async function archiveLogsHandler(req: Request, res: Response) {
  const ip = req.ip;
  const { archiveName, includePattern, excludePattern } = req.body || {};

  // G3-15: 同一归档任务的并发占位，防止重复点击/匿名并发触发多份全量导出
  const archiveJobKey = `archive:${ip}:${String(archiveName || "default").slice(0, 100)}`;
  if (archiveJobsInFlight.has(archiveJobKey)) {
    return res.status(429).json({ error: "归档任务正在执行，请稍后再试" });
  }
  archiveJobsInFlight.add(archiveJobKey);
  const clearArchiveJob = () => archiveJobsInFlight.delete(archiveJobKey);
  res.on("finish", clearArchiveJob);
  res.on("close", clearArchiveJob);

  try {
    if (!isSuperAdmin(req)) {
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

    const includeRegex = includePattern ? new RegExp(sanitizeRegexPattern(includePattern), "i") : null;
    const excludeRegex = excludePattern ? new RegExp(sanitizeRegexPattern(excludePattern), "i") : null;

    // 获取数据库中的所有日志
    await connectMongo();
    const LogShareModel = getLogShareModel();
    const mongoLogCursor = LogShareModel.find({}, { fileId: 1, ext: 1, content: 1 })
      .sort({ createdAt: -1 })
      .limit(MAX_ARCHIVE_FILES)
      .lean()
      .cursor();

    // 获取日志目录中的所有文件
    const logFiles = await fs.promises.readdir(logDir);

    // 创建数据库日志文件到临时目录
    const tempDbLogsDir = path.join(archiveSubDir, "temp-db-logs");
    await fs.promises.mkdir(tempDbLogsDir, { recursive: true });

    const dbLogFiles = [];
    for await (const log of mongoLogCursor) {
      const fileName = `${log.fileId}${log.ext || ".txt"}`;
      const tempFilePath = path.join(tempDbLogsDir, fileName);

      if (includeRegex && !includeRegex.test(fileName)) continue;
      if (excludeRegex && excludeRegex.test(fileName)) continue;

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
      if (includeRegex && !includeRegex.test(file)) return false;
      if (excludeRegex && excludeRegex.test(file)) return false;

      return true;
    });

    // 合并数据库日志文件和文件系统日志文件
    const allFilesToArchive = [...dbLogFiles, ...filesToArchive];
    const dbLogFileSet = new Set(dbLogFiles);
    const archiveFileSet = new Set(allFilesToArchive);

    // G3-15: 单次归档文件数上限，避免无界放大
    if (allFilesToArchive.length > MAX_ARCHIVE_FILES) {
      logger.warn(`归档日志 | IP:${ip} | 结果:失败 | 原因:文件数超限 ${allFilesToArchive.length} > ${MAX_ARCHIVE_FILES}`);
      return res.status(400).json({ error: `待归档文件数超过上限（${MAX_ARCHIVE_FILES}），请分批归档` });
    }

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
        const isDbLog = dbLogFileSet.has(file);
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
      if (archiveFileSet.has(file)) {
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
      if (archiveFileSet.has(file)) {
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

      // 上传到IPFS（带 60s 超时，防止第三方挂起占住请求）
      const ipfsResponse = await withTimeout(
        IPFSService.uploadFile(
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
        ),
        60_000,
        "IPFS 上传超时",
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
}
