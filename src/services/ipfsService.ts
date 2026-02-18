import type { Request } from "express";
import logger from "../utils/logger";

const nanoid = require("nanoid").nanoid;

import createDOMPurify from "dompurify";
import { JSDOM } from "jsdom";
import mongoose from "mongoose";
import { shortUrlMigrationService } from "./shortUrlMigrationService";
import { ShortUrlService } from "./shortUrlService";
import { TurnstileService } from "./turnstileService";

// IPFS服务设置（支持从 MongoDB 读取配置，优先于环境变量）
interface IPFSSettingDoc {
  key: string;
  value: string;
  updatedAt?: Date;
}
const IPFSSettingSchema = new mongoose.Schema<IPFSSettingDoc>(
  {
    key: { type: String, required: true },
    value: { type: String, required: true },
    updatedAt: { type: Date, default: Date.now },
  },
  { collection: "shorturl_settings" },
);
const IPFSSettingModel =
  (mongoose.models.IPFSSetting as mongoose.Model<IPFSSettingDoc>) ||
  mongoose.model<IPFSSettingDoc>("IPFSSetting", IPFSSettingSchema);

async function getIPFSUploadURL(): Promise<string> {
  try {
    if (mongoose.connection.readyState === 1) {
      const doc = await IPFSSettingModel.findOne({ key: "IPFS_UPLOAD_URL" }).lean().exec();
      if (doc && typeof doc.value === "string" && doc.value.trim().length > 0) {
        logger.info("[IPFS] 从MongoDB读取到IPFS_UPLOAD_URL配置:", doc.value);
        return doc.value.trim();
      }
    }
  } catch (e) {
    logger.error("[IPFS] 读取IPFS_UPLOAD_URL配置失败", e);
  }

  // 如果没有配置，抛出错误
  throw new Error('IPFS_UPLOAD_URL配置未设置，请在MongoDB的shorturl_settings集合中设置key为"IPFS_UPLOAD_URL"的配置');
}

async function getIPFSUserAgent(): Promise<string> {
  try {
    if (mongoose.connection.readyState === 1) {
      const doc = await IPFSSettingModel.findOne({ key: "IPFS_UA" }).lean().exec();
      if (doc && typeof doc.value === "string" && doc.value.trim().length > 0) {
        logger.info("[IPFS] 从MongoDB读取到IPFS_UA配置:", doc.value);
        return doc.value.trim();
      }
    }
  } catch (e) {
    logger.error("[IPFS] 读取IPFS_UA配置失败", e);
  }

  // 如果没有配置，使用默认User-Agent
  const defaultUA = "Happy-TTS-IPFS-Client/1.0";
  logger.info("[IPFS] 使用默认User-Agent:", defaultUA);
  return defaultUA;
}

async function getBypassUAKeyword(): Promise<string | null> {
  try {
    if (mongoose.connection.readyState === 1) {
      const doc = await IPFSSettingModel.findOne({ key: "IPFS_BYPASS_UA_KEYWORD" }).lean().exec();
      if (doc && typeof doc.value === "string" && doc.value.trim().length > 0) {
        logger.info("[IPFS] 从MongoDB读取到IPFS_BYPASS_UA_KEYWORD配置:", doc.value);
        return doc.value.trim();
      }
    }
  } catch (e) {
    logger.error("[IPFS] 读取IPFS_BYPASS_UA_KEYWORD配置失败", e);
  }

  return null;
}

async function getAllowAllFileTypes(): Promise<boolean> {
  try {
    if (mongoose.connection.readyState === 1) {
      const doc = await IPFSSettingModel.findOne({ key: "IPFS_ALLOW_ALL_FILE_TYPES" }).lean().exec();
      if (doc && typeof doc.value === "string") {
        const value = doc.value.trim().toLowerCase();
        const result = value === "true" || value === "1";
        logger.info("[IPFS] 从MongoDB读取到IPFS_ALLOW_ALL_FILE_TYPES配置:", result);
        return result;
      }
    }
  } catch (e) {
    logger.error("[IPFS] 读取IPFS_ALLOW_ALL_FILE_TYPES配置失败", e);
  }

  return false;
}

async function getDevSkipTurnstile(): Promise<boolean> {
  try {
    if (mongoose.connection.readyState === 1) {
      const doc = await IPFSSettingModel.findOne({ key: "IPFS_DEV_SKIP_TURNSTILE" }).lean().exec();
      if (doc && typeof doc.value === "string") {
        const value = doc.value.trim().toLowerCase();
        const result = value === "true" || value === "1";
        logger.info("[IPFS] 从MongoDB读取到IPFS_DEV_SKIP_TURNSTILE配置:", result);
        return result;
      }
    }
  } catch (e) {
    logger.error("[IPFS] 读取IPFS_DEV_SKIP_TURNSTILE配置失败", e);
  }

  // 开发环境默认跳过 Turnstile 验证
  const isDev = process.env.NODE_ENV !== "production";
  logger.info("[IPFS] 使用默认IPFS_DEV_SKIP_TURNSTILE配置:", isDev);
  return isDev;
}

export interface IPFSUploadResponse {
  status: string;
  cid: string;
  url: string;
  web2url: string;
  fileSize: string;
  gnfd_id: string | null;
  gnfd_txn: string | null;
  shortUrl?: string;
}

// 确保 mongoose 连接已建立
async function ensureMongoConnected() {
  if (mongoose.connection.readyState !== 1) {
    await mongoose.connect(process.env.MONGO_URI || "mongodb://localhost:27017/tts");
  }
}

export class IPFSService {
  private static readonly IPFS_BACKUP_URL = "https://ipfs.infura.io:5001/api/v0/add"; // 备用IPFS网关
  private static readonly MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
  private static dompurifyInstance: any | null = null;

  // 懒加载并返回 DOMPurify 实例（Node 环境使用 JSDOM）
  private static getDOMPurify(): any {
    if (!IPFSService.dompurifyInstance) {
      const { window } = new JSDOM("");
      IPFSService.dompurifyInstance = (createDOMPurify as any)(window as any);
    }
    return IPFSService.dompurifyInstance;
  }

  /**
   * 上传文件到IPFS
   * @param fileBuffer 文件缓冲区
   * @param filename 文件名
   * @param mimetype 文件类型
   * @param options 上传选项
   * @param cfToken Turnstile验证token（可选）
   * @returns IPFS上传响应
   */
  public static async uploadFile(
    fileBuffer: Buffer,
    filename: string,
    mimetype: string,
    options?: { shortLink?: boolean; userId?: string; username?: string },
    cfToken?: string,
    context?: {
      clientIp?: string;
      isAdmin?: boolean;
      isDev?: boolean;
      shouldSkipTurnstile?: boolean;
      userAgent?: string;
      skipFileTypeCheck?: boolean;
    },
  ): Promise<IPFSUploadResponse> {
    // 检查UA是否包含绕过关键字
    const bypassUAKeyword = await getBypassUAKeyword();
    const shouldBypassByUA = bypassUAKeyword && context?.userAgent && context.userAgent.includes(bypassUAKeyword);

    // 检查开发环境是否跳过 Turnstile 验证
    const devSkipTurnstile = await getDevSkipTurnstile();

    // 对于本地开发环境的管理员请求，免除Turnstile验证
    const isLocalIp = context?.clientIp ? ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(context.clientIp) : false;
    const shouldSkipTurnstile =
      context?.shouldSkipTurnstile ||
      (context?.isAdmin && isLocalIp && context?.isDev) ||
      shouldBypassByUA ||
      devSkipTurnstile;

    if (shouldBypassByUA) {
      logger.info("[IPFS] 检测到UA包含绕过关键字，跳过Turnstile验证", {
        userAgent: context?.userAgent,
        bypassKeyword: bypassUAKeyword,
      });
    } else if (devSkipTurnstile) {
      logger.info("[IPFS] 开发环境配置跳过Turnstile验证", {
        environment: process.env.NODE_ENV || "development",
        devSkipTurnstile,
      });
    } else if (shouldSkipTurnstile) {
      logger.info("[IPFS] 本地开发环境管理员请求，跳过Turnstile验证", {
        clientIp: context?.clientIp,
        isAdmin: context?.isAdmin,
        isDev: context?.isDev,
        isLocalIp,
        environment: process.env.NODE_ENV || "development",
      });
    } else {
      // 如果提供了cfToken，进行Turnstile验证（保持现有行为，不强制要求所有请求必须提供cfToken）
      if (cfToken) {
        if (await TurnstileService.isEnabled()) {
          try {
            const isValid = await TurnstileService.verifyToken(cfToken);
            if (!isValid) {
              throw new Error("人机验证失败，请重新验证");
            }
            logger.info("[IPFS] Turnstile验证通过");
          } catch (error) {
            logger.error("[IPFS] Turnstile验证失败:", error instanceof Error ? error.message : String(error));
            throw new Error("人机验证失败，请重新验证");
          }
        } else {
          logger.warn("[IPFS] Turnstile服务未启用，跳过验证");
        }
      } else {
        logger.info("[IPFS] 未提供cfToken，跳过Turnstile验证");
      }
    }

    // 检查文件大小
    if (fileBuffer.length > IPFSService.MAX_FILE_SIZE) {
      throw new Error(`文件大小不能超过 ${IPFSService.MAX_FILE_SIZE / 1024 / 1024}MB`);
    }

    // 检查文件类型限制（归档上传可跳过检查）
    if (context?.skipFileTypeCheck) {
      logger.info("[IPFS] 跳过文件类型检查（归档上传）", { mimetype, filename });
    } else {
      const allowAllFileTypes = await getAllowAllFileTypes();
      if (!allowAllFileTypes) {
        // 默认允许所有图片文件格式
        const isImageFile = mimetype.toLowerCase().startsWith("image/");
        if (!isImageFile) {
          throw new Error("默认只支持图片文件格式，如需上传其他文件类型请联系管理员开启");
        }
        logger.info("[IPFS] 允许上传图片文件", { mimetype, filename });
      } else {
        logger.info("[IPFS] 允许上传任意文件类型", { mimetype, filename });
      }
    }

    // 规范化文件名，特别是SVG文件
    const normalizedFilename = IPFSService.normalizeFilename(filename, mimetype);
    logger.info(`[IPFS] 原始文件名: ${filename}, 规范化后: ${normalizedFilename}`);

    // 如果规范化后的文件名有问题，使用原始文件名
    const finalFilename = normalizedFilename && normalizedFilename !== ".svg" ? normalizedFilename : filename;

    // 如果是SVG文件，验证和优化文件内容
    if (mimetype.toLowerCase() === "image/svg+xml" || filename.toLowerCase().endsWith(".svg")) {
      logger.info(`[IPFS] 检测到SVG文件，进行安全验证和优化: ${filename}`);
      IPFSService.validateSVGContent(fileBuffer);
      // 优化SVG内容
      fileBuffer = Buffer.from(IPFSService.optimizeSVGContent(fileBuffer.toString("utf-8")));
    }
    return await IPFSService.uploadFileInternal(fileBuffer, finalFilename, mimetype, options, cfToken);
  }

  /**
   * 备用IPFS上传方案
   */
  private static async uploadToBackup(
    fileBuffer: Buffer,
    filename: string,
    mimetype: string,
    _options?: { shortLink?: boolean; userId?: string; username?: string },
    _cfToken?: string,
  ): Promise<IPFSUploadResponse> {
    // 规范化文件名
    const normalizedFilename = IPFSService.normalizeFilename(filename, mimetype);
    logger.info(`[IPFS] 使用备用方案上传: ${normalizedFilename}`);

    try {
      const formData = new (require("form-data"))();
      formData.append("file", fileBuffer, {
        filename: normalizedFilename,
        contentType: mimetype,
      });

      const response = await require("axios").post(IPFSService.IPFS_BACKUP_URL, formData, {
        headers: {
          ...formData.getHeaders(),
        },
        timeout: 45000, // 备用服务可能需要更长时间
      });

      // 备用服务返回格式可能不同，需要适配
      const cid = response.data.Hash;
      const web2url = `https://ipfs.io/ipfs/${cid}`;

      logger.info(`[IPFS] 备用方案上传成功: ${normalizedFilename}, CID: ${cid}`);

      return {
        status: "success",
        cid,
        url: `ipfs://${cid}`,
        web2url,
        fileSize: fileBuffer.length.toString(),
        gnfd_id: null,
        gnfd_txn: null,
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`[IPFS] 备用方案失败: ${errorMessage}`);
      throw new Error(`备用IPFS服务也失败: ${errorMessage}`);
    }
  }

  /**
   * 内部上传方法，包含重试逻辑
   * @param fileBuffer 文件缓冲区
   * @param filename 文件名
   * @param mimetype 文件类型
   * @param options 上传选项
   * @param cfToken Turnstile验证token（可选）
   * @returns IPFS上传响应
   */
  private static async uploadFileInternal(
    fileBuffer: Buffer,
    filename: string,
    mimetype: string,
    options?: { shortLink?: boolean; userId?: string; username?: string },
    cfToken?: string,
  ): Promise<IPFSUploadResponse> {
    const MAX_RETRIES = 2;
    let lastError: any = null;

    // 预先获取IPFS配置，避免在循环中重复获取
    let ipfsUploadUrl: string;
    let ipfsUserAgent: string;
    try {
      ipfsUploadUrl = await getIPFSUploadURL();
      ipfsUserAgent = await getIPFSUserAgent();
    } catch (configError) {
      logger.error(
        "[IPFS] 获取IPFS配置失败:",
        configError instanceof Error ? configError.message : String(configError),
      );
      throw new Error("IPFS服务配置未设置，请联系管理员配置IPFS_UPLOAD_URL");
    }

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        logger.info(`[IPFS] 尝试上传文件 (第${attempt + 1}次): ${filename}`);

        // 从ipfsUploadUrl提取origin和检测是否为特殊域名
        const ipfsUrlObj = new URL(ipfsUploadUrl);
        const origin = `${ipfsUrlObj.protocol}//${ipfsUrlObj.host}`;
        // 安全的域名检查：精确匹配或有效子域名
        const isCrossbellRelay =
          ipfsUrlObj.hostname === "ipfs-relay.crossbell.io" || ipfsUrlObj.hostname.endsWith(".ipfs-relay.crossbell.io");

        // 创建FormData
        const formData = new (require("form-data"))();

        // 为 ipfs-relay.crossbell.io 使用特殊的格式
        if (isCrossbellRelay) {
          logger.info(`[IPFS] 检测到 Crossbell Relay 域名，使用专用上传格式`);
          // Crossbell Relay 需要明确指定 filename 和 Content-Type header
          formData.append("file", fileBuffer, {
            filename: filename,
            contentType: mimetype,
            knownLength: fileBuffer.length,
          });
        } else {
          // 标准格式
          formData.append("file", fileBuffer, {
            filename,
            contentType: mimetype,
          });
        }

        // 构建请求配置
        let requestUrl = ipfsUploadUrl;
        const requestConfig: any = {
          headers: {
            ...formData.getHeaders(),
            "User-Agent": ipfsUserAgent,
          },
          timeout: 30000, // 30秒超时
        };

        // 根据域名调整请求配置
        if (isCrossbellRelay) {
          // Crossbell Relay 使用简洁的 URL，不需要额外查询参数
          // 保持原始 URL，不添加额外参数
          logger.info(`[IPFS] Crossbell Relay 请求配置:`, {
            url: requestUrl,
            filename: filename,
            mimetype: mimetype,
            size: fileBuffer.length,
          });
        } else {
          // 其他 IPFS 网关使用标准参数
          requestUrl = `${ipfsUploadUrl}?stream-channels=true&pin=false&wrap-with-directory=false&progress=false`;
          requestConfig.headers.Origin = origin;
        }

        // 发送请求到IPFS
        const response = await require("axios").post(requestUrl, formData, requestConfig);

        // 根据域名适配不同的响应格式
        let cid: string;
        let web2url: string;
        let fileSize: string;

        if (isCrossbellRelay) {
          // Crossbell Relay 响应格式: { "status": "ok", "cid": "...", "url": "ipfs://...", "web2url": "https://...", "fileSize": "..." }
          cid = response.data.cid || "";
          web2url = response.data.web2url || `https://ipfs.crossbell.io/ipfs/${cid}`;
          fileSize = response.data.fileSize || fileBuffer.length.toString();
          logger.info(`[IPFS] Crossbell Relay 上传成功: ${filename}, CID: ${cid}, 文件大小: ${fileSize} bytes`);
        } else {
          // 标准 IPFS API 响应格式: { "Name": "文件名", "Hash": "CID", "Size": "文件大小" }
          cid = response.data.Hash || "";
          web2url = `https://ipfs.hapxs.com/ipfs/${cid}`;
          fileSize = response.data.Size || fileBuffer.length.toString();
          logger.info(`[IPFS] 标准 IPFS 上传成功: ${filename}, CID: ${cid}, 文件大小: ${fileSize} bytes`);
        }

        logger.info(`[IPFS] API响应:`, response.data);

        // 构建标准化的响应格式
        const uploadResponse = {
          status: "success",
          cid,
          url: `ipfs://${cid}`,
          web2url,
          fileSize,
          gnfd_id: null,
          gnfd_txn: null,
        };

        // 上传成功后生成短链（仅当 options.shortLink 为 true 时）
        let shortUrl = "";
        if (options?.shortLink && web2url) {
          try {
            // 使用迁移服务自动修正目标URL
            const fixedTarget = shortUrlMigrationService.fixTargetUrlBeforeSave(web2url);

            // 使用短链服务创建短链，确保并发安全
            shortUrl = await ShortUrlService.createShortUrl(
              fixedTarget,
              options.userId || "admin",
              options.username || "admin",
            );

            logger.info("[ShortLink] 短链创建成功", {
              target: fixedTarget,
              userId: options.userId,
              username: options.username,
            });
          } catch (err) {
            logger.error("[ShortLink] 短链创建失败", {
              target: web2url,
              error: err instanceof Error ? err.message : String(err),
            });
            // 不抛出错误，继续返回IPFS上传结果
          }
        }
        return { ...uploadResponse, shortUrl };
      } catch (error: unknown) {
        lastError = error;
        const errorMessage = error instanceof Error ? error.message : String(error);
        const statusCode = (error as any)?.response?.status;

        // 如果是403错误，提供详细的调试信息
        if (statusCode === 403) {
          try {
            // 构建完整的URL
            const fullUrl = `${ipfsUploadUrl}?stream-channels=true&pin=false&wrap-with-directory=false&progress=false`;

            // 生成curl命令用于调试
            const curlCommand = IPFSService.generateCurlCommand(fullUrl, ipfsUserAgent, filename, mimetype);

            logger.error(`[IPFS] 403错误 - 详细调试信息 (第${attempt + 1}次): ${filename}`, {
              error: errorMessage,
              statusCode,
              attempt: attempt + 1,
              maxRetries: MAX_RETRIES,
              requestDetails: {
                ipfsUploadUrl,
                ipfsUserAgent,
                filename,
                mimetype,
                fileSize: fileBuffer.length,
                fullUrl,
                queryParams: {
                  "stream-channels": "true",
                  pin: "false",
                  "wrap-with-directory": "false",
                  progress: "false",
                },
              },
              curlCommand,
              timestamp: new Date().toISOString(),
            });
          } catch (debugError) {
            logger.error(`[IPFS] 403错误 - 无法生成调试信息 (第${attempt + 1}次): ${filename}`, {
              error: errorMessage,
              statusCode,
              attempt: attempt + 1,
              maxRetries: MAX_RETRIES,
              debugError: debugError instanceof Error ? debugError.message : String(debugError),
              timestamp: new Date().toISOString(),
            });
          }
        } else {
          // 非403错误的常规日志
          logger.error(`[IPFS] 上传失败 (第${attempt + 1}次): ${filename}`, {
            error: errorMessage,
            statusCode,
            attempt: attempt + 1,
            maxRetries: MAX_RETRIES,
          });
        }

        // 如果是503或500错误，说明服务不可用，可以尝试备用方案
        if (statusCode === 503 || statusCode === 500) {
          logger.warn(`[IPFS] 主服务不可用 (${statusCode})，尝试备用方案`);
          try {
            return await IPFSService.uploadToBackup(fileBuffer, filename, mimetype, options, cfToken);
          } catch (backupError) {
            logger.error(
              `[IPFS] 备用方案也失败: ${backupError instanceof Error ? backupError.message : String(backupError)}`,
            );
            lastError = new Error(`IPFS服务暂时不可用，请稍后重试。错误详情: ${errorMessage}`);
          }
        }

        if (attempt < MAX_RETRIES) {
          const delay = (attempt + 1) * 2000; // 递增延迟：2秒、4秒
          logger.info(`[IPFS] ${delay}ms后重试上传`);
          await new Promise((res) => setTimeout(res, delay));
        }
      }
    }

    // 所有重试都失败了
    const finalError = lastError instanceof Error ? lastError.message : String(lastError);
    logger.error(`[IPFS] 所有上传尝试都失败: ${filename}`, { finalError });
    throw new Error(`IPFS上传失败: ${finalError}`);
  }

  /**
   * 优化SVG文件内容
   * @param content SVG文件内容
   * @returns 优化后的SVG内容
   */
  private static optimizeSVGContent(content: string): string {
    try {
      // 使用 JSDOM 移除注释，避免基于正则的多字符清理导致的遗漏
      try {
        const dom = new JSDOM(content, { contentType: "image/svg+xml" });
        const doc = dom.window.document;
        const walker = doc.createTreeWalker(doc, dom.window.NodeFilter.SHOW_COMMENT);
        const toRemove: Comment[] = [] as unknown as Comment[];
        while (walker.nextNode()) {
          toRemove.push(walker.currentNode as Comment);
        }
        toRemove.forEach((node) => node.parentNode?.removeChild(node));
        // 使用序列化后的 SVG 作为后续处理输入
        content = doc.documentElement ? doc.documentElement.outerHTML : content;
      } catch {
        // 忽略解析失败，继续后续清理
      }

      // 移除潜在的危险属性 - 使用更严格的正则表达式
      // 使用更安全的清理方法
      content = IPFSService.safeRemoveEventHandlers(content);
      content = IPFSService.safeRemoveDangerousProtocols(content);
      content = IPFSService.safeRemoveDangerousTags(content);
      content = IPFSService.safeRemoveExternalReferences(content);

      // 使用额外的安全清理
      content = IPFSService.performAdditionalSanitization(content);

      // 最终使用 DOMPurify 清理，避免使用不可靠的 HTML 正则
      content = IPFSService.sanitizeSVGWithDOMPurify(content);

      logger.info("[IPFS] SVG文件内容优化完成");
      return content;
    } catch (error) {
      logger.warn("[IPFS] SVG文件内容优化失败，使用原始内容:", error instanceof Error ? error.message : String(error));
      return content;
    }
  }

  // 使用 DOMPurify 进行 SVG 安全清理
  private static sanitizeSVGWithDOMPurify(content: string): string {
    const DOMPurify = IPFSService.getDOMPurify();
    return DOMPurify.sanitize(content, {
      USE_PROFILES: { svg: true, svgFilters: true, html: false },
      FORBID_TAGS: ["script", "iframe", "object", "embed", "link", "meta", "style", "foreignObject"],
      FORBID_ATTR: [/^on/i, "href", "xlink:href", "src", "style"],
      ALLOW_UNKNOWN_PROTOCOLS: false,
      // 禁止一切 URI（包括 http/https/data/javascript 等）
      ALLOWED_URI_REGEXP: /^(?!)$/,
      KEEP_CONTENT: false,
    } as any);
  }

  /**
   * 安全移除事件处理器
   * @param content SVG文件内容
   * @returns 清理后的SVG内容
   */
  private static safeRemoveEventHandlers(content: string): string {
    try {
      const dom = new JSDOM(content, { contentType: "image/svg+xml" });
      const doc = dom.window.document;
      const elements = doc.querySelectorAll("*");
      for (const el of Array.from(elements)) {
        const toRemove: string[] = [];
        for (const attr of Array.from(el.attributes)) {
          if (/^on/i.test(attr.name)) {
            toRemove.push(attr.name);
          }
        }
        toRemove.forEach((name) => el.removeAttribute(name));
      }
      return doc.documentElement ? doc.documentElement.outerHTML : content;
    } catch {
      return content;
    }
  }

  /**
   * 安全移除危险协议
   * @param content SVG文件内容
   * @returns 清理后的SVG内容
   */
  private static safeRemoveDangerousProtocols(content: string): string {
    try {
      const dom = new JSDOM(content, { contentType: "image/svg+xml" });
      const doc = dom.window.document;
      const elements = doc.querySelectorAll("*");
      const hasUnsafeProtocol = (val: string) =>
        /^[a-zA-Z][a-zA-Z0-9+.-]*\s*:/i.test(val) && !val.trim().startsWith("#");
      for (const el of Array.from(elements)) {
        const toRemove: string[] = [];
        for (const attr of Array.from(el.attributes)) {
          const name = attr.name;
          const value = attr.value || "";
          if (hasUnsafeProtocol(value)) {
            toRemove.push(name);
            continue;
          }
          if (name.toLowerCase() === "style") {
            // 移除包含外部协议的 url() 引用
            if (/url\(\s*["']?\s*(https?:|data:|javascript:|vbscript:)/i.test(value)) {
              toRemove.push(name);
            }
          }
        }
        toRemove.forEach((n) => el.removeAttribute(n));
      }
      return doc.documentElement ? doc.documentElement.outerHTML : content;
    } catch {
      return content;
    }
  }

  /**
   * 安全移除危险标签
   * @param content SVG文件内容
   * @returns 清理后的SVG内容
   */
  private static safeRemoveDangerousTags(content: string): string {
    try {
      const dom = new JSDOM(content, { contentType: "image/svg+xml" });
      const doc = dom.window.document;
      const forbiddenTags = ["script", "iframe", "object", "embed", "link", "meta", "style", "foreignObject"];
      for (const tag of forbiddenTags) {
        doc.querySelectorAll(tag).forEach((el) => el.remove());
      }
      return doc.documentElement ? doc.documentElement.outerHTML : content;
    } catch {
      return content;
    }
  }

  /**
   * 安全移除外部引用
   * @param content SVG文件内容
   * @returns 清理后的SVG内容
   */
  private static safeRemoveExternalReferences(content: string): string {
    try {
      const dom = new JSDOM(content, { contentType: "image/svg+xml" });
      const doc = dom.window.document;
      const elements = doc.querySelectorAll("*");
      for (const el of Array.from(elements)) {
        // href/src/xlink:href 仅保留内部引用 #id
        ["href", "xlink:href", "src"].forEach((name) => {
          const val = el.getAttribute(name);
          if (val && !val.trim().startsWith("#")) {
            el.removeAttribute(name);
          }
        });
        // style 中的外部 url() 引用不允许
        const style = el.getAttribute("style");
        if (style && /url\(\s*["']?\s*https?:/i.test(style)) {
          el.removeAttribute("style");
        }
      }
      return doc.documentElement ? doc.documentElement.outerHTML : content;
    } catch {
      return content;
    }
  }

  /**
   * 执行额外的安全清理，确保SVG内容安全
   * @param content SVG文件内容
   * @returns 清理后的SVG内容
   */
  private static performAdditionalSanitization(content: string): string {
    // 使用循环确保所有内容都被清理
    content = IPFSService.safeRemoveCDATA(content);
    content = IPFSService.safeRemoveDataAttributes(content);
    content = IPFSService.safeRemoveExternalUrls(content);
    content = IPFSService.safeRemoveEncodedContent(content);
    content = IPFSService.safeRemoveComments(content);

    return content;
  }

  /**
   * 安全移除CDATA部分
   * @param content SVG文件内容
   * @returns 清理后的SVG内容
   */
  private static safeRemoveCDATA(content: string): string {
    let previousContent = "";
    while (previousContent !== content) {
      previousContent = content;
      content = content.replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, "");
    }
    return content;
  }

  /**
   * 安全移除data属性
   * @param content SVG文件内容
   * @returns 清理后的SVG内容
   */
  private static safeRemoveDataAttributes(content: string): string {
    let previousContent = "";
    while (previousContent !== content) {
      previousContent = content;
      content = content.replace(/\s*data-[^=]*\s*=\s*["'][^"']*["']/gi, "");
    }
    return content;
  }

  /**
   * 安全移除外部URL
   * @param content SVG文件内容
   * @returns 清理后的SVG内容
   */
  private static safeRemoveExternalUrls(content: string): string {
    let previousContent = "";
    while (previousContent !== content) {
      previousContent = content;
      content = content.replace(/url\s*\(\s*["']?https?:\/\//gi, "url(");
      content = content.replace(/href\s*=\s*["']?https?:\/\//gi, "href=");
      content = content.replace(/src\s*=\s*["']?https?:\/\//gi, "src=");
    }
    return content;
  }

  /**
   * 安全移除编码内容
   * @param content SVG文件内容
   * @returns 清理后的SVG内容
   */
  private static safeRemoveEncodedContent(content: string): string {
    let previousContent = "";
    while (previousContent !== content) {
      previousContent = content;
      // 移除所有可能的编码绕过
      content = content.replace(/&#x?[0-9a-f]+;/gi, "");
      content = content.replace(/\\x[0-9a-f]{2}/gi, "");
      content = content.replace(/\\u[0-9a-f]{4}/gi, "");
      content = content.replace(/\\u\{[0-9a-f]+\}/gi, "");
      content = content.replace(/&[a-z]+;/gi, "");
    }
    return content;
  }

  /**
   * 安全移除注释
   * @param content SVG文件内容
   * @returns 清理后的SVG内容
   */
  private static safeRemoveComments(content: string): string {
    let previousContent = "";
    while (previousContent !== content) {
      previousContent = content;
      content = content.replace(/\/\*[\s\S]*?\*\//g, "");
      content = content.replace(/\/\/.*$/gm, "");
    }
    return content;
  }

  /**
   * 验证SVG文件内容
   * @param fileBuffer 文件缓冲区
   */
  private static validateSVGContent(fileBuffer: Buffer): void {
    try {
      const content = fileBuffer.toString("utf-8");

      // 检查是否包含基本的SVG标签
      if (!content.includes("<svg") || !content.includes("</svg>")) {
        throw new Error("无效的SVG文件：缺少SVG标签");
      }

      // 检查文件大小（SVG文件通常不应该太大）
      if (content.length > 1024 * 1024) {
        // 1MB
        throw new Error("SVG文件过大，可能包含恶意内容");
      }
      // 使用 JSDOM 进行结构化校验
      const dom = new JSDOM(content, { contentType: "image/svg+xml" });
      const doc = dom.window.document;

      // 禁止的标签
      const forbiddenTags = ["script", "iframe", "object", "embed", "link", "meta", "style", "foreignObject"];
      if (doc.querySelector(forbiddenTags.join(","))) {
        throw new Error("SVG文件包含禁止的标签");
      }

      // 遍历所有元素，检查属性安全性
      const elements = doc.querySelectorAll("*");
      for (const el of Array.from(elements)) {
        for (const attr of Array.from(el.attributes)) {
          const name = attr.name;
          const value = attr.value || "";
          // 禁止事件处理器
          if (/^on/i.test(name)) {
            throw new Error(`SVG文件包含事件处理器属性: ${name}`);
          }
          // 禁止危险引用属性（仅允许内部引用 #id）
          if (["href", "xlink:href", "src", "style"].includes(name)) {
            if (!value.trim().startsWith("#")) {
              throw new Error(`SVG文件包含外部引用或危险属性: ${name}`);
            }
          }
          // 禁止任何包含外部 url(http/https) 的属性值
          if (/url\(\s*["']?https?:/i.test(value)) {
            throw new Error("SVG文件包含外部URL引用");
          }
          // 禁止任何带有协议的值（如 javascript:, data:, vbscript:, http: 等），除非是内部引用
          if (/^[a-zA-Z][a-zA-Z0-9+.-]*\s*:/i.test(value) && !value.trim().startsWith("#")) {
            throw new Error("SVG文件包含不安全的URI协议");
          }
        }
      }

      logger.info("[IPFS] SVG文件内容验证通过");
    } catch (error) {
      logger.error("[IPFS] SVG文件内容验证失败:", error instanceof Error ? error.message : String(error));
      throw new Error(`SVG文件验证失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 规范化文件名，特别是处理SVG文件的中文名称
   * @param filename 原始文件名
   * @param mimetype 文件类型
   * @returns 规范化后的文件名
   */
  private static normalizeFilename(filename: string, mimetype: string): string {
    // 移除文件扩展名
    const nameWithoutExt = filename.replace(/\.[^/.]+$/, "");
    const ext = filename.match(/\.[^/.]+$/)?.[0] || "";

    // 如果是SVG文件，特殊处理中文名称
    if (mimetype.toLowerCase() === "image/svg+xml" || ext.toLowerCase() === ".svg") {
      // 检测是否包含中文字符
      const hasChinese = /[\u4e00-\u9fff]/.test(nameWithoutExt);

      if (hasChinese) {
        // 生成一个基于时间戳和随机数的英文名称
        const timestamp = Date.now();
        const randomId = nanoid(8);
        return `svg_${timestamp}_${randomId}.svg`;
      }
    }

    // 对于其他文件，清理特殊字符但保留原始名称
    let cleanedName = nameWithoutExt;

    // 如果名称为空或只包含特殊字符，生成一个默认名称
    if (!cleanedName || cleanedName.trim() === "") {
      const timestamp = Date.now();
      const randomId = nanoid(8);
      cleanedName = `file_${timestamp}_${randomId}`;
    } else {
      // 清理特殊字符但保留中文
      cleanedName = cleanedName
        .replace(/[^\w\u4e00-\u9fff\-_]/g, "_") // 只保留字母、数字、中文、连字符和下划线
        .replace(/_+/g, "_") // 将多个连续下划线替换为单个
        .replace(/^_|_$/g, ""); // 移除开头和结尾的下划线
    }

    return `${cleanedName}${ext}`;
  }

  /**
   * 设置IPFS上传URL配置
   * @param url IPFS上传URL
   * @returns 设置结果
   */
  public static async setIPFSUploadURL(url: string): Promise<boolean> {
    try {
      if (!url || typeof url !== "string" || url.trim().length === 0) {
        throw new Error("IPFS上传URL不能为空");
      }

      const trimmedUrl = url.trim();

      // 验证URL格式
      try {
        new URL(trimmedUrl);
      } catch {
        throw new Error("IPFS上传URL格式无效");
      }

      // 确保MongoDB连接
      await ensureMongoConnected();

      // 更新或创建配置
      await IPFSSettingModel.findOneAndUpdate(
        { key: "IPFS_UPLOAD_URL" },
        {
          key: "IPFS_UPLOAD_URL",
          value: trimmedUrl,
          updatedAt: new Date(),
        },
        { upsert: true, new: true },
      );

      logger.info("[IPFS] IPFS_UPLOAD_URL配置已更新:", trimmedUrl);
      return true;
    } catch (error) {
      logger.error("[IPFS] 设置IPFS_UPLOAD_URL失败:", error);
      throw error;
    }
  }

  /**
   * 设置IPFS User-Agent配置
   * @param userAgent User-Agent字符串
   * @returns 设置结果
   */
  public static async setIPFSUserAgent(userAgent: string): Promise<boolean> {
    try {
      if (!userAgent || typeof userAgent !== "string" || userAgent.trim().length === 0) {
        throw new Error("IPFS User-Agent 不能为空");
      }

      const trimmedUA = userAgent.trim();
      if (trimmedUA.length > 256) {
        throw new Error("IPFS User-Agent 长度不能超过256字符");
      }

      // 确保MongoDB连接
      await ensureMongoConnected();

      // 更新或创建配置
      await IPFSSettingModel.findOneAndUpdate(
        { key: "IPFS_UA" },
        {
          key: "IPFS_UA",
          value: trimmedUA,
          updatedAt: new Date(),
        },
        { upsert: true, new: true },
      );

      logger.info("[IPFS] IPFS_UA 配置已更新:", trimmedUA);
      return true;
    } catch (error) {
      logger.error("[IPFS] 设置IPFS_UA失败:", error);
      throw error;
    }
  }

  /**
   * 获取当前IPFS上传URL配置
   * @returns 当前配置的URL
   * @throws 如果配置未设置
   */
  public static async getCurrentIPFSUploadURL(): Promise<string> {
    try {
      return await getIPFSUploadURL();
    } catch (error) {
      logger.error("[IPFS] 获取当前IPFS配置失败:", error instanceof Error ? error.message : String(error));
      throw new Error("IPFS_UPLOAD_URL配置未设置，请先使用setIPFSUploadURL方法设置配置");
    }
  }

  /**
   * 获取当前IPFS User-Agent配置
   * @returns 当前配置的User-Agent（若未设置则返回默认UA）
   */
  public static async getCurrentIPFSUserAgent(): Promise<string> {
    return await getIPFSUserAgent();
  }

  /**
   * 设置UA绕过关键字配置
   * @param keyword UA绕过关键字
   * @returns 设置结果
   */
  public static async setBypassUAKeyword(keyword: string): Promise<boolean> {
    try {
      if (!keyword || typeof keyword !== "string" || keyword.trim().length === 0) {
        throw new Error("UA绕过关键字不能为空");
      }

      const trimmedKeyword = keyword.trim();
      if (trimmedKeyword.length > 100) {
        throw new Error("UA绕过关键字长度不能超过100字符");
      }

      // 确保MongoDB连接
      await ensureMongoConnected();

      // 更新或创建配置
      await IPFSSettingModel.findOneAndUpdate(
        { key: "IPFS_BYPASS_UA_KEYWORD" },
        {
          key: "IPFS_BYPASS_UA_KEYWORD",
          value: trimmedKeyword,
          updatedAt: new Date(),
        },
        { upsert: true, new: true },
      );

      logger.info("[IPFS] IPFS_BYPASS_UA_KEYWORD 配置已更新:", trimmedKeyword);
      return true;
    } catch (error) {
      logger.error("[IPFS] 设置IPFS_BYPASS_UA_KEYWORD失败:", error);
      throw error;
    }
  }

  /**
   * 设置文件类型限制配置
   * @param allowAll 是否允许所有文件类型
   * @returns 设置结果
   */
  public static async setAllowAllFileTypes(allowAll: boolean): Promise<boolean> {
    try {
      // 确保MongoDB连接
      await ensureMongoConnected();

      // 更新或创建配置
      await IPFSSettingModel.findOneAndUpdate(
        { key: "IPFS_ALLOW_ALL_FILE_TYPES" },
        {
          key: "IPFS_ALLOW_ALL_FILE_TYPES",
          value: allowAll ? "true" : "false",
          updatedAt: new Date(),
        },
        { upsert: true, new: true },
      );

      logger.info("[IPFS] IPFS_ALLOW_ALL_FILE_TYPES 配置已更新:", allowAll);
      return true;
    } catch (error) {
      logger.error("[IPFS] 设置IPFS_ALLOW_ALL_FILE_TYPES失败:", error);
      throw error;
    }
  }

  /**
   * 获取当前UA绕过关键字配置
   * @returns 当前配置的关键字（若未设置则返回null）
   */
  public static async getCurrentBypassUAKeyword(): Promise<string | null> {
    return await getBypassUAKeyword();
  }

  /**
   * 获取当前文件类型限制配置
   * @returns 是否允许所有文件类型
   */
  public static async getCurrentAllowAllFileTypes(): Promise<boolean> {
    return await getAllowAllFileTypes();
  }

  /**
   * 设置开发环境跳过 Turnstile 验证配置
   * @param skipTurnstile 是否跳过 Turnstile 验证
   * @returns 设置结果
   */
  public static async setDevSkipTurnstile(skipTurnstile: boolean): Promise<boolean> {
    try {
      // 确保MongoDB连接
      await ensureMongoConnected();

      // 更新或创建配置
      await IPFSSettingModel.findOneAndUpdate(
        { key: "IPFS_DEV_SKIP_TURNSTILE" },
        {
          key: "IPFS_DEV_SKIP_TURNSTILE",
          value: skipTurnstile ? "true" : "false",
          updatedAt: new Date(),
        },
        { upsert: true, new: true },
      );

      logger.info("[IPFS] IPFS_DEV_SKIP_TURNSTILE 配置已更新:", skipTurnstile);
      return true;
    } catch (error) {
      logger.error("[IPFS] 设置IPFS_DEV_SKIP_TURNSTILE失败:", error);
      throw error;
    }
  }

  /**
   * 获取当前开发环境跳过 Turnstile 验证配置
   * @returns 是否跳过 Turnstile 验证（开发环境默认 true）
   */
  public static async getCurrentDevSkipTurnstile(): Promise<boolean> {
    return await getDevSkipTurnstile();
  }

  /**
   * 生成curl命令用于调试IPFS上传请求
   */
  private static generateCurlCommand(url: string, userAgent: string, filename: string, mimetype: string): string {
    // 解析URL获取基础URL和查询参数
    const urlObj = new URL(url);
    const origin = `${urlObj.protocol}//${urlObj.host}`;

    // 构建curl命令
    const curlCommand = [
      "curl -X POST",
      `'${url}'`,
      `-H 'User-Agent: ${userAgent}'`,
      `-H 'accept-language: zh-CN,zh;q=0.9,en;q=0.8'`,
      `-H 'origin: ${origin}'`,
      `-H 'priority: u=1, i'`,
      `-H 'referer: ${origin}/'`,
      `-H 'sec-ch-ua: "Not;A=Brand";v="99", "Google Chrome";v="139", "Chromium";v="139"'`,
      `-H 'sec-ch-ua-mobile: ?0'`,
      `-H 'sec-ch-ua-platform: "Windows"'`,
      `-H 'sec-fetch-dest: empty'`,
      `-H 'sec-fetch-mode: cors'`,
      `-H 'sec-fetch-site: same-origin'`,
      `-F 'file=@"${filename}";filename="${filename}";headers="Content-Type: ${mimetype}"'`,
    ].join(" ");

    return curlCommand;
  }

  /**
   * 从Express请求中提取文件信息
   * @param req Express请求对象
   * @returns 文件信息
   */
  public static extractFileFromRequest(req: Request): {
    buffer: Buffer;
    filename: string;
    mimetype: string;
  } {
    // 这里需要根据实际的文件上传中间件来提取文件
    // 假设使用multer中间件
    const file = (req as any).file;

    if (!file) {
      throw new Error("未找到上传的文件");
    }

    return {
      buffer: file.buffer,
      filename: file.originalname,
      mimetype: file.mimetype,
    };
  }
}
