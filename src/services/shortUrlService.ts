import ShortUrlModel, { type IShortUrl } from "../models/shortUrlModel";
import logger from "../utils/logger";
import { TransactionService } from "./transactionService";

const nanoid = require("nanoid").nanoid;
const crypto = require("node:crypto");

import { mongoose } from "./mongoService";

// 定义短链数据的精简类型
type ShortUrlData = Pick<IShortUrl, "code" | "target" | "userId" | "username" | "createdAt">;

// 自定义并发限制器类
class ConcurrencyLimiter {
  private queue: Array<() => void> = [];
  private running = 0;

  constructor(private limit: number) {}

  async run<T>(fn: () => Promise<T>): Promise<T> {
    while (this.running >= this.limit) {
      await new Promise<void>((resolve) => this.queue.push(resolve));
    }

    this.running++;
    try {
      return await fn();
    } finally {
      this.running--;
      const resolve = this.queue.shift();
      if (resolve) resolve();
    }
  }
}

// 短链服务设置（支持从 MongoDB 读取 AES_KEY，优先于环境变量）
interface ShortUrlSettingDoc {
  key: string;
  value: string;
  updatedAt?: Date;
}
const ShortUrlSettingSchema = new mongoose.Schema<ShortUrlSettingDoc>(
  {
    key: { type: String, default: "AES_KEY" },
    value: { type: String, required: true },
    updatedAt: { type: Date, default: Date.now },
  },
  { collection: "shorturl_settings" },
);
const ShortUrlSettingModel =
  (mongoose.models.ShortUrlSetting as mongoose.Model<ShortUrlSettingDoc>) ||
  mongoose.model<ShortUrlSettingDoc>("ShortUrlSetting", ShortUrlSettingSchema);

async function getShortUrlAesKey(): Promise<string | null> {
  try {
    if (mongoose.connection.readyState === 1) {
      // 使用严格的查询条件，防止NoSQL注入
      const doc = (await ShortUrlSettingModel.findOne({
        key: { $eq: "AES_KEY" },
      })
        .lean()
        .exec()) as ShortUrlSettingDoc | null;
      if (doc && typeof doc.value === "string" && doc.value.trim().length > 0) {
        const trimmedValue = doc.value.trim();
        // 验证AES密钥格式，防止恶意数据
        if (trimmedValue.length >= 16 && trimmedValue.length <= 256) {
          return trimmedValue;
        }
      }
    }
  } catch (e) {
    logger.error("读取短链 AES_KEY 失败，回退到环境变量", e);
  }
  const envKey = process.env.AES_KEY?.trim();
  return envKey && envKey.length >= 16 && envKey.length <= 256 ? envKey : null;
}

export class ShortUrlService {
  // 预编译的正则表达式，避免重复编译
  private static readonly CODE_REGEX = /^[a-zA-Z0-9_-]+$/;
  private static readonly USERID_REGEX = /^[a-zA-Z0-9_-]+$/;
  private static readonly URL_MAX_LENGTH = 2000;
  private static readonly CODE_MAX_LENGTH = 50;
  private static readonly USERID_MAX_LENGTH = 100;
  private static readonly USERNAME_MAX_LENGTH = 100;

  // AES 密钥缓存
  private static aesKeyCache: { value: string | null; timestamp: number } | null = null;
  private static readonly AES_KEY_CACHE_TTL = 300000; // 5分钟

  // 获取缓存的 AES 密钥
  private static async getCachedAesKey(): Promise<string | null> {
    const now = Date.now();
    if (
      ShortUrlService.aesKeyCache &&
      now - ShortUrlService.aesKeyCache.timestamp < ShortUrlService.AES_KEY_CACHE_TTL
    ) {
      return ShortUrlService.aesKeyCache.value;
    }

    const key = await getShortUrlAesKey();
    ShortUrlService.aesKeyCache = { value: key, timestamp: now };
    return key;
  }

  /**
   * 生成唯一的短链代码 - 多种去重策略
   * 策略1: 基础 nanoid 重试（6位）
   * 策略2: 增加代码长度（7-8位）
   * 策略3: 添加时间戳后缀
   * 策略4: 使用哈希算法
   */
  private static async generateUniqueCode(target: string, userId: string, session: any): Promise<string> {
    // 策略1: 基础 nanoid(6) 重试
    const baseLength = 6;
    const baseRetries = 5;

    for (let i = 0; i < baseRetries; i++) {
      const code = nanoid(baseLength);
      const existing = await ShortUrlModel.findOne({ code }).session(session);
      if (!existing) {
        logger.debug(`[短链服务] 策略1成功: nanoid(${baseLength}), 重试${i}次`);
        return code;
      }
    }

    // 策略2: 增加代码长度到 7 位
    const mediumLength = 7;
    const mediumRetries = 5;

    for (let i = 0; i < mediumRetries; i++) {
      const code = nanoid(mediumLength);
      const existing = await ShortUrlModel.findOne({ code }).session(session);
      if (!existing) {
        logger.debug(`[短链服务] 策略2成功: nanoid(${mediumLength}), 重试${i}次`);
        return code;
      }
    }

    // 策略3: 增加到 8 位
    const longLength = 8;
    const longRetries = 5;

    for (let i = 0; i < longRetries; i++) {
      const code = nanoid(longLength);
      const existing = await ShortUrlModel.findOne({ code }).session(session);
      if (!existing) {
        logger.debug(`[短链服务] 策略3成功: nanoid(${longLength}), 重试${i}次`);
        return code;
      }
    }

    // 策略4: 添加时间戳后缀（使用 Base36 编码的短时间戳）
    const timestamp = Date.now();
    const timeCode = (timestamp % 1000000).toString(36); // 6位时间戳

    for (let i = 0; i < 3; i++) {
      const randomPart = nanoid(4);
      const code = `${randomPart}${timeCode}`; // 总长度约10位
      const existing = await ShortUrlModel.findOne({ code }).session(session);
      if (!existing) {
        logger.debug(`[短链服务] 策略4成功: 时间戳后缀, 重试${i}次`);
        return code;
      }
    }

    // 策略5: 使用哈希算法（基于 target + userId + timestamp）
    const hashInput = `${target}_${userId}_${timestamp}_${Math.random()}`;
    const hash = crypto
      .createHash("sha256")
      .update(hashInput)
      .digest("base64")
      .replace(/[+/=]/g, "") // 移除特殊字符
      .substring(0, 10); // 取前10位

    const existing = await ShortUrlModel.findOne({ code: hash }).session(session);
    if (!existing) {
      logger.debug("[短链服务] 策略5成功: 哈希算法");
      return hash;
    }

    // 策略6: 最后的保底策略 - UUID 截取
    const uuid = crypto.randomUUID().replace(/-/g, "").substring(0, 12);
    const finalCode = uuid;

    const finalCheck = await ShortUrlModel.findOne({ code: finalCode }).session(session);
    if (!finalCheck) {
      logger.warn("[短链服务] 使用策略6: UUID保底策略");
      return finalCode;
    }

    // 如果所有策略都失败（极端情况）
    throw new Error("无法生成唯一的短链代码，所有策略均失败，请稍后重试");
  }

  /**
   * 创建短链，使用事务和多种去重策略确保并发安全
   */
  static async createShortUrl(target: string, userId: string, username: string): Promise<string> {
    try {
      const shortUrlData = await TransactionService.executeTransaction(async (session) => {
        // 使用多种策略生成唯一代码
        const code = await ShortUrlService.generateUniqueCode(target, userId, session);

        // 最终安全检查：创建前再次验证代码是否已存在
        const existingCode = await ShortUrlModel.findOne({ code }).session(session);
        if (existingCode) {
          logger.error("[短链服务] 最终检查发现代码已存在", { code });
          throw new Error(`短链代码 ${code} 已存在，请重试`);
        }

        const doc = await ShortUrlModel.create(
          [
            {
              code,
              target,
              userId,
              username,
            },
          ],
          { session },
        );

        logger.info("[短链服务] 短链创建成功", {
          code,
          codeLength: code.length,
          target,
          userId,
          username,
        });

        return doc[0];
      });

      return `${process.env.VITE_API_URL || process.env.BASE_URL || "https://api.hapxs.com"}/s/${shortUrlData.code}`;
    } catch (error) {
      logger.error("[短链服务] 短链创建失败:", error);
      throw error;
    }
  }

  /**
   * 根据代码获取短链信息
   */
  static async getShortUrlByCode(code: string) {
    try {
      // 输入验证
      if (!code || typeof code !== "string" || code.trim().length === 0) {
        logger.warn("无效的短链代码", { code });
        return null;
      }

      const trimmedCode = code.trim();

      // 使用预编译的正则表达式验证代码格式
      if (!ShortUrlService.CODE_REGEX.test(trimmedCode)) {
        logger.warn("短链代码格式无效", { code: trimmedCode });
        return null;
      }

      // 限制代码长度，防止内存占用过大
      if (trimmedCode.length > 50) {
        logger.warn("短链代码长度超限", { code: trimmedCode });
        return null;
      }

      // 使用 lean() 减少内存占用，hint() 强制使用索引，select() 只查询需要的字段
      const shortUrl = (await ShortUrlModel.findOne({ code: trimmedCode })
        .select("code target userId username")
        .hint({ code: 1 })
        .lean()
        .exec()) as ShortUrlData | null;
      if (!shortUrl) {
        logger.warn("短链不存在", { code: trimmedCode });
        return null;
      }

      logger.info("获取短链成功", { code: trimmedCode, target: shortUrl.target });
      return shortUrl;
    } catch (error) {
      logger.error("获取短链失败:", error);
      throw error;
    }
  }

  /**
   * 删除短链
   */
  static async deleteShortUrl(code: string, userId?: string) {
    try {
      // 输入验证
      if (!code || typeof code !== "string" || code.trim().length === 0) {
        logger.warn("无效的短链代码", { code });
        return false;
      }

      const trimmedCode = code.trim();

      // 使用预编译的正则表达式验证代码格式
      if (!ShortUrlService.CODE_REGEX.test(trimmedCode)) {
        logger.warn("短链代码格式无效", { code: trimmedCode });
        return false;
      }

      // 限制代码长度，防止内存占用过大
      if (trimmedCode.length > 50) {
        logger.warn("短链代码长度超限", { code: trimmedCode });
        return false;
      }

      // 构建安全的查询对象，防止NoSQL注入
      const query: { code: string; userId?: string } = { code: trimmedCode };
      if (userId && typeof userId === "string" && userId.trim().length > 0) {
        const trimmedUserId = userId.trim();
        // 使用预编译的正则表达式验证userId格式
        if (!ShortUrlService.USERID_REGEX.test(trimmedUserId) || trimmedUserId.length > 100) {
          logger.warn("用户ID格式无效", { userId: trimmedUserId });
          return false;
        }
        query.userId = trimmedUserId; // 只能删除自己的短链
      }

      const result = await ShortUrlModel.findOneAndDelete(query);
      if (!result) {
        logger.warn("删除短链失败：短链不存在或无权限", { code: trimmedCode, userId });
        return false;
      }

      logger.info("删除短链成功", { code: trimmedCode, userId });
      return true;
    } catch (error) {
      logger.error("删除短链失败:", error);
      throw error;
    }
  }

  /**
   * 获取用户的短链列表
   */
  static async getUserShortUrls(userId: string, page: number = 1, limit: number = 10) {
    try {
      // 输入验证
      if (!userId || typeof userId !== "string" || userId.trim().length === 0) {
        throw new Error("无效的用户ID");
      }

      const trimmedUserId = userId.trim();

      // 使用预编译的正则表达式验证userId格式
      if (!ShortUrlService.USERID_REGEX.test(trimmedUserId) || trimmedUserId.length > 100) {
        throw new Error("用户ID格式无效");
      }

      const validatedPage = Math.max(1, parseInt(String(page), 10) || 1);
      const validatedLimit = Math.min(50, Math.max(1, parseInt(String(limit), 10) || 10)); // 降低最大限制
      const skip = (validatedPage - 1) * validatedLimit;

      // 防止过大的skip值导致性能问题
      if (skip > 10000) {
        throw new Error("页码过大，请使用更小的页码");
      }

      const [shortUrls, total] = await Promise.all([
        ShortUrlModel.find({ userId: trimmedUserId })
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(validatedLimit)
          .select("code target userId username createdAt")
          .lean<ShortUrlData[]>() // 使用泛型确保类型（数组）
          .exec(),
        ShortUrlModel.countDocuments({ userId: trimmedUserId }),
      ]);

      logger.info("获取用户短链列表成功", { userId: trimmedUserId, page: validatedPage, total });

      return {
        shortUrls,
        total,
        page: validatedPage,
        limit: validatedLimit,
      };
    } catch (error) {
      logger.error("获取用户短链列表失败:", error);
      throw error;
    }
  }

  /**
   * 批量删除短链 - 使用 bulkWrite 优化性能
   */
  static async batchDeleteShortUrls(codes: string[], userId?: string) {
    try {
      // 输入验证
      if (!Array.isArray(codes) || codes.length === 0) {
        throw new Error("请提供有效的短链代码列表");
      }

      // 验证和清理代码列表
      const validCodes = codes
        .filter(
          (code) =>
            typeof code === "string" &&
            code.trim().length > 0 &&
            code.trim().length <= ShortUrlService.CODE_MAX_LENGTH &&
            ShortUrlService.CODE_REGEX.test(code.trim()),
        )
        .map((code) => code.trim());

      if (validCodes.length === 0) {
        throw new Error("没有有效的短链代码");
      }

      // 限制批量删除的数量，防止DoS攻击
      if (validCodes.length > 50) {
        throw new Error("批量删除数量不能超过50个");
      }

      // 验证用户ID
      let trimmedUserId: string | undefined;
      if (userId && typeof userId === "string" && userId.trim().length > 0) {
        trimmedUserId = userId.trim();
        if (
          !ShortUrlService.USERID_REGEX.test(trimmedUserId) ||
          trimmedUserId.length > ShortUrlService.USERID_MAX_LENGTH
        ) {
          throw new Error("用户ID格式无效");
        }
      }

      // 使用 bulkWrite 批量删除，性能更好
      const bulkOps = validCodes.map((code) => {
        const filter: any = { code };
        if (trimmedUserId) {
          filter.userId = trimmedUserId;
        }
        return {
          deleteOne: { filter },
        };
      });

      const result = await ShortUrlModel.bulkWrite(bulkOps, {
        ordered: false, // 非顺序执行，提升并发性能
        writeConcern: { w: 1 }, // 降低写入关注级别
      });

      logger.info("批量删除短链成功", {
        codes: validCodes,
        userId: trimmedUserId,
        deletedCount: result.deletedCount,
      });

      return result.deletedCount || 0;
    } catch (error) {
      logger.error("批量删除短链失败:", error);
      throw error;
    }
  }

  /**
   * 导出所有短链数据（管理员功能）- 使用流式处理
   */
  static async exportAllShortUrls() {
    try {
      // 限制导出数量，防止滥用
      const maxExportCount = 50000; // 提高上限，因为使用流式处理
      const count = await ShortUrlModel.countDocuments({});

      if (count > maxExportCount) {
        throw new Error(`导出数量过大（${count}），请联系管理员或分批导出`);
      }

      if (count === 0) {
        return { content: "", count: 0 };
      }

      const baseUrl = process.env.VITE_API_URL || process.env.BASE_URL || "https://api.hapxs.com";
      const exportTime = new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });

      // 使用数组拼接，先生成头部
      const contentParts: string[] = [];
      contentParts.push(`短链数据导出报告\n导出时间: ${exportTime}\n总数量: ${count} 个短链\n${"=".repeat(50)}\n\n`);

      // 使用 cursor 流式处理，避免一次性加载所有数据
      const cursor = ShortUrlModel.find({})
        .sort({ createdAt: -1 })
        .select("code target userId username createdAt")
        .lean()
        .cursor({ batchSize: 100 }); // 批量大小100

      let index = 0;
      const separator = "=".repeat(50);

      // 流式处理每个文档
      for await (const link of cursor) {
        index++;
        const parts = [
          `${index}. 短链信息\n`,
          `   短链码: ${link.code}\n`,
          `   完整短链: ${baseUrl}/s/${link.code}\n`,
          `   目标地址: ${link.target}\n`,
          `   创建时间: ${new Date(link.createdAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}\n`,
        ];

        if (link.username) {
          parts.push(`   创建用户: ${link.username}\n`);
        }
        if (link.userId) {
          parts.push(`   用户ID: ${link.userId}\n`);
        }
        parts.push("\n");

        contentParts.push(parts.join(""));

        // 每处理500条记录后记录进度
        if (index % 500 === 0) {
          logger.debug(`导出进度: ${index}/${count}`);
        }
      }

      // 添加尾部
      contentParts.push(`${separator}\n导出完成 - 共 ${index} 个短链\n`);

      const content = contentParts.join("");

      logger.info("导出所有短链数据成功", { count: index });

      // 使用数据库/环境变量提供的 AES_KEY 进行 AES 加密（如果提供）
      const aesKeyEnv = await ShortUrlService.getCachedAesKey();
      if (aesKeyEnv && aesKeyEnv.length > 0) {
        try {
          const key = crypto.createHash("sha256").update(aesKeyEnv, "utf8").digest();
          const iv = crypto.randomBytes(16);
          const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
          const encrypted = Buffer.concat([cipher.update(Buffer.from(content, "utf8")), cipher.final()]);

          logger.info("短链导出内容已使用AES加密");
          return {
            content: encrypted.toString("base64"),
            count: index,
            encrypted: true,
            iv: iv.toString("base64"),
          } as any;
        } catch (encErr) {
          logger.error("导出内容加密失败，返回未加密内容", encErr);
          return { content, count: index };
        }
      }

      return { content, count: index };
    } catch (error) {
      logger.error("导出所有短链数据失败:", error);
      throw error;
    }
  }

  /**
   * 删除所有短链数据（管理员功能）
   */
  static async deleteAllShortUrls() {
    try {
      const result = await ShortUrlModel.deleteMany({});

      logger.info("删除所有短链数据成功", { deletedCount: result.deletedCount });

      return {
        deletedCount: result.deletedCount,
      };
    } catch (error) {
      logger.error("删除所有短链数据失败:", error);
      throw error;
    }
  }

  /**
   * 导入短链数据（管理员功能）- 异步并发处理
   */
  static async importShortUrls(content: string) {
    try {
      // 1) 如果检测到加密导出，尝试使用 AES_KEY 自动解密
      const trimmed = content.trim();
      const looksEncryptedHeader = trimmed.startsWith("# ShortUrl Export (Encrypted)");
      const looksEncryptedJson = (() => {
        try {
          const obj = JSON.parse(trimmed);
          return !!(obj && (obj.encrypted || (obj.iv && (obj.content || obj.cipher || obj.cipherText))));
        } catch {
          return false;
        }
      })();

      if (looksEncryptedHeader || looksEncryptedJson) {
        const aesKey = (await getShortUrlAesKey())?.trim();
        if (!aesKey) {
          throw new Error(
            "检测到加密导出文件，但未配置 AES_KEY，无法自动解密。请设置环境变量 AES_KEY 或离线解密后再导入",
          );
        }

        const tryDecrypt = (raw: string): string | null => {
          try {
            // 尝试 JSON 包装格式 { encrypted: true, iv, content|cipher|cipherText }
            try {
              const obj = JSON.parse(raw);
              const ivB64 = (obj.iv || obj.IV || "").toString();
              const dataB64 = (obj.content || obj.cipher || obj.cipherText || "").toString();
              if (ivB64 && dataB64) {
                const key = crypto.createHash("sha256").update(aesKey!, "utf8").digest();
                const iv = Buffer.from(ivB64, "base64");
                const encrypted = Buffer.from(dataB64, "base64");
                const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
                const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
                return decrypted;
              }
            } catch {
              /* 不是JSON，继续其他格式解析 */
            }

            // 尝试头部标记格式
            // 可能包含："IV: <base64>" 与 "Ciphertext-Base64:"（多行）或 "Cipher:"/"Content:"/"Data:"（单行）
            const ivMatch = raw.match(/^\s*iv\s*:\s*(\S.*?)\s*$/im);
            // 先尝试单行 data
            const singleLineDataMatch = raw.match(
              /^\s*(?:cipher(?:text)?|content|data)(?:-base64)?\s*:\s*(\S.*?)\s*$/im,
            );
            if (ivMatch && singleLineDataMatch) {
              const ivB64 = ivMatch[1].trim();
              const dataB64 = singleLineDataMatch[1].trim();
              const key = crypto.createHash("sha256").update(aesKey!, "utf8").digest();
              const iv = Buffer.from(ivB64, "base64");
              const encrypted = Buffer.from(dataB64, "base64");
              const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
              const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
              return decrypted;
            }

            // 若为多行 Ciphertext-Base64: 形式，则收集该行之后的所有非空行作为 Base64 拼接
            if (ivMatch) {
              const lines = raw.split(/\r?\n/);
              let dataStart = -1;
              for (let i = 0; i < lines.length; i++) {
                if (/^\s*cipher(?:text)?(?:-base64)?\s*:\s*$/i.test(lines[i])) {
                  dataStart = i + 1;
                  break;
                }
              }
              if (dataStart !== -1) {
                const b64Parts: string[] = [];
                for (let i = dataStart; i < lines.length; i++) {
                  const l = lines[i];
                  // 遇到看起来像新的键:值头或文件结尾则停止
                  if (/^\s*\w[\w\- ]*\s*:\s*\S*/.test(l)) break;
                  if (l.trim().length === 0) continue;
                  b64Parts.push(l.trim());
                }
                if (b64Parts.length > 0) {
                  const ivB64 = ivMatch[1].trim();
                  const dataB64 = b64Parts.join("");
                  const key = crypto.createHash("sha256").update(aesKey!, "utf8").digest();
                  const iv = Buffer.from(ivB64, "base64");
                  const encrypted = Buffer.from(dataB64, "base64");
                  const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
                  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
                  return decrypted;
                }
              }
            }

            return null;
          } catch (e) {
            logger.error("自动解密短链导出内容失败", e);
            return null;
          }
        };

        const decrypted = tryDecrypt(trimmed);
        if (!decrypted) {
          throw new Error("检测到加密导出文件，自动解密失败。请确认 AES_KEY 是否正确或离线解密后再导入");
        }

        logger.info("已自动解密加密的短链导出内容，继续解析导入");
        content = decrypted;
      }

      const linksToImport: any[] = [];

      // 2) 优先尝试 JSON 数组导入 [{ code, target, ... }]
      const tryJson = content.trim().startsWith("[") || content.trim().startsWith("{");
      if (tryJson) {
        try {
          const parsed = JSON.parse(content);
          const arr = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.items) ? parsed.items : null;
          if (Array.isArray(arr)) {
            for (const item of arr) {
              if (item && typeof item === "object" && item.code && item.target) {
                linksToImport.push({
                  code: String(item.code).trim(),
                  target: String(item.target).trim(),
                  userId: item.userId ? String(item.userId).trim() : undefined,
                  username: item.username ? String(item.username).trim() : undefined,
                });
              }
            }
          }
        } catch {
          // 不是有效JSON，继续走文本解析
        }
      }

      // 3) 按照“导出报告”文本格式解析（原有格式）
      if (linksToImport.length === 0) {
        const lines = content.split("\n");
        let currentLink: any = {};

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line) continue;

          // 匹配短链信息的开始
          if (line.match(/^\d+\.\s*短链信息$/)) {
            if (currentLink.code && currentLink.target) {
              linksToImport.push({ ...currentLink });
            }
            currentLink = {};
            continue;
          }

          // 解析各个字段（宽松匹配：允许不同语言/空格）
          const codeMatch = line.match(/^(?:短链码|code)\s*:\s*(\S.*)$/i);
          const targetMatch = line.match(/^(?:目标地址|target|url)\s*:\s*(\S.*)$/i);
          const userMatch = line.match(/^(?:创建用户|username|user)\s*:\s*(\S.*)$/i);
          const userIdMatch = line.match(/^(?:用户ID|userId|uid)\s*:\s*(\S.*)$/i);

          if (codeMatch) {
            currentLink.code = codeMatch[1].trim();
          } else if (targetMatch) {
            currentLink.target = targetMatch[1].trim();
          } else if (userMatch) {
            currentLink.username = userMatch[1].trim();
          } else if (userIdMatch) {
            currentLink.userId = userIdMatch[1].trim();
          }
        }

        if (currentLink.code && currentLink.target) {
          linksToImport.push({ ...currentLink });
        }
      }

      // 4) 回退：成对提取“短链码/目标地址”或“code/target”，即使没有分块标题
      if (linksToImport.length === 0) {
        const lines = content
          .split("\n")
          .map((l) => l.trim())
          .filter(Boolean);
        let pending: any = {};
        for (const line of lines) {
          const codeMatch = line.match(/^(?:短链码|code)\s*:\s*(\S.*)$/i);
          const targetMatch = line.match(/^(?:目标地址|target|url)\s*:\s*(\S.*)$/i);
          const userMatch = line.match(/^(?:创建用户|username|user)\s*:\s*(\S.*)$/i);
          const userIdMatch = line.match(/^(?:用户ID|userId|uid)\s*:\s*(\S.*)$/i);

          if (codeMatch) pending.code = codeMatch[1].trim();
          if (targetMatch) pending.target = targetMatch[1].trim();
          if (userMatch) pending.username = userMatch[1].trim();
          if (userIdMatch) pending.userId = userIdMatch[1].trim();

          if (pending.code && pending.target) {
            linksToImport.push({ ...pending });
            pending = {};
          }
        }
      }

      // 5) 没有解析出任何有效链接时，尝试解析 CSV/TSV（header 包含 code/target）
      if (linksToImport.length === 0) {
        const firstLine = content.split("\n")[0] || "";
        if (/code\s*[,\t]\s*target/i.test(firstLine)) {
          const rows = content.split(/\r?\n/).filter(Boolean);
          // 跳过表头
          for (let i = 1; i < rows.length; i++) {
            const cols = rows[i].split(/[\t,]/).map((v) => v.trim());
            if (cols.length >= 2 && cols[0] && cols[1]) {
              linksToImport.push({ code: cols[0], target: cols[1] });
            }
          }
        }
      }

      // 6) 异步并发处理所有链接
      const results = await ShortUrlService.processLinksAsync(linksToImport);

      logger.info("导入短链数据完成", {
        importedCount: results.importedCount,
        skippedCount: results.skippedCount,
        errorCount: results.errorCount,
        totalLinks: linksToImport.length,
      });

      return results;
    } catch (error) {
      logger.error("导入短链数据失败:", error);
      throw error;
    }
  }

  /**
   * 异步并发处理多个链接 - 使用自定义并发限制器
   */
  private static async processLinksAsync(links: any[]): Promise<{
    importedCount: number;
    skippedCount: number;
    errorCount: number;
    errors: string[];
  }> {
    // 限制导入数量，防止内存溢出
    if (links.length > 5000) {
      throw new Error(`导入数量过大（${links.length}），请分批导入，单次最多5000条`);
    }

    const concurrencyLimit = 10; // 并发限制为10
    const limiter = new ConcurrencyLimiter(concurrencyLimit);
    const errors: string[] = [];
    let importedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    // 使用并发限制器处理所有链接
    const promises = links.map((linkData, index) =>
      limiter.run(async () => {
        try {
          const result = await ShortUrlService.processImportLinkAsync(linkData);

          // 记录进度（每100条）
          if ((index + 1) % 100 === 0) {
            logger.info(`导入进度: ${index + 1}/${links.length}`);
          }

          return result;
        } catch (error) {
          return {
            skipped: false,
            error: `短链码 ${linkData.code}: ${error instanceof Error ? error.message : String(error)}`,
          };
        }
      }),
    );

    // 等待所有任务完成
    const results = await Promise.all(promises);

    // 统计结果
    results.forEach((result) => {
      if (result.error) {
        errors.push(result.error);
        errorCount++;
      } else if (result.skipped) {
        skippedCount++;
      } else {
        importedCount++;
      }
    });

    return {
      importedCount,
      skippedCount,
      errorCount,
      errors: errors.slice(0, 50), // 返回最多50条错误信息
    };
  }

  /**
   * 处理单个导入链接 - 异步版本
   */
  private static async processImportLinkAsync(linkData: any): Promise<{ skipped: boolean; error?: string }> {
    try {
      // 验证必需字段
      if (!linkData.code || !linkData.target) {
        throw new Error("缺少必需的短链码或目标地址");
      }

      // 过滤掉 undefined 或空值
      if (
        linkData.code === "undefined" ||
        linkData.target === "undefined" ||
        !linkData.code.trim() ||
        !linkData.target.trim()
      ) {
        throw new Error("短链码或目标地址包含无效值");
      }

      const trimmedCode = linkData.code.trim();
      const trimmedTarget = linkData.target.trim();

      // 验证短链码格式和长度
      if (!ShortUrlService.CODE_REGEX.test(trimmedCode) || trimmedCode.length > ShortUrlService.CODE_MAX_LENGTH) {
        throw new Error("短链码格式无效或长度超限");
      }

      // 验证目标地址格式和长度
      if (trimmedTarget.length > ShortUrlService.URL_MAX_LENGTH) {
        throw new Error("目标地址长度超限");
      }

      try {
        new URL(trimmedTarget);
      } catch {
        throw new Error("目标地址格式无效");
      }

      // 验证用户信息
      let validUserId = "admin";
      let validUsername = "admin";

      if (linkData.userId && typeof linkData.userId === "string") {
        const trimmedUserId = linkData.userId.trim();
        if (
          !ShortUrlService.USERID_REGEX.test(trimmedUserId) ||
          trimmedUserId.length > ShortUrlService.USERID_MAX_LENGTH
        ) {
          throw new Error("用户ID格式无效");
        }
        validUserId = trimmedUserId;
      }

      if (linkData.username && typeof linkData.username === "string") {
        const trimmedUsername = linkData.username.trim();
        if (trimmedUsername.length > ShortUrlService.USERNAME_MAX_LENGTH) {
          throw new Error("用户名长度超限");
        }
        validUsername = trimmedUsername;
      }

      // 使用lean()检查是否已存在，减少内存占用
      const existing = (await ShortUrlModel.findOne({ code: trimmedCode }).lean().exec()) as Pick<
        IShortUrl,
        "code"
      > | null;
      if (existing) {
        logger.info(`跳过重复短链: ${trimmedCode}`);
        return { skipped: true };
      }

      // 创建新的短链记录
      await ShortUrlModel.create({
        code: trimmedCode,
        target: trimmedTarget,
        userId: validUserId,
        username: validUsername,
        createdAt: new Date(),
      });

      logger.debug(`成功导入短链: ${trimmedCode}`);
      return { skipped: false };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.warn(`导入链接失败 ${linkData.code}: ${errorMessage}`);
      return { skipped: false, error: errorMessage };
    }
  }
}
