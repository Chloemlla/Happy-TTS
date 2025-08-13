import ShortUrlModel from '../models/shortUrlModel';
import { TransactionService } from './transactionService';
import logger from '../utils/logger';
const nanoid = require('nanoid').nanoid;
const crypto = require('crypto');

export class ShortUrlService {
  /**
   * 创建短链，使用事务确保并发安全
   */
  static async createShortUrl(target: string, userId: string, username: string): Promise<string> {
    try {
      const shortUrlData = await TransactionService.executeTransaction(async (session) => {
        // 生成唯一代码，使用重试机制避免并发冲突
        let code = nanoid(6);
        let retries = 0;
        const maxRetries = 10;

        while (retries < maxRetries) {
          const existingCode = await ShortUrlModel.findOne({ code }).session(session);
          if (!existingCode) {
            break; // 找到唯一代码
          }
          code = nanoid(6);
          retries++;
        }

        if (retries >= maxRetries) {
          throw new Error('无法生成唯一的短链代码，请重试');
        }

        const doc = await ShortUrlModel.create([{
          code,
          target,
          userId,
          username
        }], { session });

        logger.info('短链创建成功', {
          code,
          target,
          userId,
          username
        });

        return doc[0];
      });

      return `${process.env.VITE_API_URL || process.env.BASE_URL || 'https://api.hapxs.com'}/s/${shortUrlData.code}`;
    } catch (error) {
      logger.error('短链创建失败:', error);
      throw error;
    }
  }

  /**
   * 根据代码获取短链信息
   */
  static async getShortUrlByCode(code: string) {
    try {
      // 输入验证
      if (!code || typeof code !== 'string' || code.trim().length === 0) {
        logger.warn('无效的短链代码', { code });
        return null;
      }

      const trimmedCode = code.trim();

      // 验证代码格式（只允许字母、数字、连字符和下划线）
      if (!/^[a-zA-Z0-9_-]+$/.test(trimmedCode)) {
        logger.warn('短链代码格式无效', { code: trimmedCode });
        return null;
      }

      const shortUrl = await ShortUrlModel.findOne({ code: trimmedCode });
      if (!shortUrl) {
        logger.warn('短链不存在', { code: trimmedCode });
        return null;
      }

      logger.info('获取短链成功', { code: trimmedCode, target: shortUrl.target });
      return shortUrl.toObject();
    } catch (error) {
      logger.error('获取短链失败:', error);
      throw error;
    }
  }

  /**
   * 删除短链
   */
  static async deleteShortUrl(code: string, userId?: string) {
    try {
      // 输入验证
      if (!code || typeof code !== 'string' || code.trim().length === 0) {
        logger.warn('无效的短链代码', { code });
        return false;
      }

      const trimmedCode = code.trim();

      // 验证代码格式
      if (!/^[a-zA-Z0-9_-]+$/.test(trimmedCode)) {
        logger.warn('短链代码格式无效', { code: trimmedCode });
        return false;
      }

      const query: any = { code: trimmedCode };
      if (userId && typeof userId === 'string' && userId.trim().length > 0) {
        query.userId = userId.trim(); // 只能删除自己的短链
      }

      const result = await ShortUrlModel.findOneAndDelete(query);
      if (!result) {
        logger.warn('删除短链失败：短链不存在或无权限', { code: trimmedCode, userId });
        return false;
      }

      logger.info('删除短链成功', { code: trimmedCode, userId });
      return true;
    } catch (error) {
      logger.error('删除短链失败:', error);
      throw error;
    }
  }

  /**
   * 获取用户的短链列表
   */
  static async getUserShortUrls(userId: string, page: number = 1, limit: number = 10) {
    try {
      // 输入验证
      if (!userId || typeof userId !== 'string' || userId.trim().length === 0) {
        throw new Error('无效的用户ID');
      }

      const trimmedUserId = userId.trim();
      const validatedPage = Math.max(1, parseInt(String(page)) || 1);
      const validatedLimit = Math.min(100, Math.max(1, parseInt(String(limit)) || 10));
      const skip = (validatedPage - 1) * validatedLimit;

      const [shortUrls, total] = await Promise.all([
        ShortUrlModel.find({ userId: trimmedUserId })
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(validatedLimit),
        ShortUrlModel.countDocuments({ userId: trimmedUserId })
      ]);

      logger.info('获取用户短链列表成功', { userId: trimmedUserId, page: validatedPage, total });

      return {
        shortUrls: shortUrls.map(url => url.toObject()),
        total,
        page: validatedPage,
        limit: validatedLimit
      };
    } catch (error) {
      logger.error('获取用户短链列表失败:', error);
      throw error;
    }
  }

  /**
   * 批量删除短链
   */
  static async batchDeleteShortUrls(codes: string[], userId?: string) {
    try {
      // 输入验证
      if (!Array.isArray(codes) || codes.length === 0) {
        throw new Error('请提供有效的短链代码列表');
      }

      // 验证和清理代码列表
      const validCodes = codes.filter(code =>
        typeof code === 'string' &&
        code.trim().length > 0 &&
        /^[a-zA-Z0-9_-]+$/.test(code.trim())
      ).map(code => code.trim());

      if (validCodes.length === 0) {
        throw new Error('没有有效的短链代码');
      }

      // 限制批量删除的数量，防止DoS攻击
      if (validCodes.length > 100) {
        throw new Error('批量删除数量不能超过100个');
      }

      const query: any = { code: { $in: validCodes } };
      if (userId && typeof userId === 'string' && userId.trim().length > 0) {
        query.userId = userId.trim();
      }

      const result = await ShortUrlModel.deleteMany(query);

      logger.info('批量删除短链成功', {
        codes: validCodes,
        userId,
        deletedCount: result.deletedCount
      });

      return result.deletedCount;
    } catch (error) {
      logger.error('批量删除短链失败:', error);
      throw error;
    }
  }

  /**
   * 导出所有短链数据（管理员功能）
   */
  static async exportAllShortUrls() {
    try {
      const shortUrls = await ShortUrlModel.find({})
        .sort({ createdAt: -1 })
        .lean();

      if (shortUrls.length === 0) {
        return {
          content: '',
          count: 0
        };
      }

      // 生成导出内容
      const baseUrl = process.env.VITE_API_URL || process.env.BASE_URL || 'https://api.hapxs.com';
      const exportTime = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });

      let content = `短链数据导出报告\n`;
      content += `导出时间: ${exportTime}\n`;
      content += `总数量: ${shortUrls.length} 个短链\n`;
      content += `${'='.repeat(50)}\n\n`;

      shortUrls.forEach((link, index) => {
        content += `${index + 1}. 短链信息\n`;
        content += `   短链码: ${link.code}\n`;
        content += `   完整短链: ${baseUrl}/s/${link.code}\n`;
        content += `   目标地址: ${link.target}\n`;
        content += `   创建时间: ${new Date(link.createdAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}\n`;
        if (link.username) {
          content += `   创建用户: ${link.username}\n`;
        }
        if (link.userId) {
          content += `   用户ID: ${link.userId}\n`;
        }
        content += `\n`;
      });

      content += `${'='.repeat(50)}\n`;
      content += `导出完成 - 共 ${shortUrls.length} 个短链\n`;

      logger.info('导出所有短链数据成功', { count: shortUrls.length });

      // 使用环境变量 AES_KEY 进行 AES 加密（如果提供）
      const aesKeyEnv = process.env.AES_KEY;
      if (aesKeyEnv && aesKeyEnv.trim().length > 0) {
        try {
          // 生成 32 字节密钥（SHA-256）
          const key = crypto.createHash('sha256').update(aesKeyEnv, 'utf8').digest();
          // 生成随机 IV（16 字节）
          const iv = crypto.randomBytes(16);
          const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
          const encrypted = Buffer.concat([
            cipher.update(Buffer.from(content, 'utf8')),
            cipher.final(),
          ]);
          const ivBase64 = iv.toString('base64');
          const cipherTextBase64 = encrypted.toString('base64');

          logger.info('短链导出内容已使用AES加密');
          return {
            content: cipherTextBase64,
            count: shortUrls.length,
            encrypted: true,
            iv: ivBase64,
          } as any;
        } catch (encErr) {
          logger.error('导出内容加密失败，返回未加密内容', encErr);
          // 若加密失败则回退为明文
          return {
            content,
            count: shortUrls.length
          };
        }
      }

      // 未设置 AES_KEY，直接返回明文
      return {
        content,
        count: shortUrls.length
      };
    } catch (error) {
      logger.error('导出所有短链数据失败:', error);
      throw error;
    }
  }

  /**
   * 删除所有短链数据（管理员功能）
   */
  static async deleteAllShortUrls() {
    try {
      const result = await ShortUrlModel.deleteMany({});

      logger.info('删除所有短链数据成功', { deletedCount: result.deletedCount });

      return {
        deletedCount: result.deletedCount
      };
    } catch (error) {
      logger.error('删除所有短链数据失败:', error);
      throw error;
    }
  }

  /**
   * 导入短链数据（管理员功能）- 异步并发处理
   */
  static async importShortUrls(content: string) {
    try {
      const lines = content.split('\n');
      const linksToImport: any[] = [];
      let currentLink: any = {};

      // 解析导出格式的数据，收集所有链接
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

        if (!line) continue;

        // 匹配短链信息的开始
        if (line.match(/^\d+\.\s*短链信息$/)) {
          // 保存上一个链接（如果有的话）
          if (currentLink.code && currentLink.target) {
            linksToImport.push({ ...currentLink });
          }
          currentLink = {};
          continue;
        }

        // 解析各个字段
        if (line.startsWith('短链码: ')) {
          currentLink.code = line.replace('短链码: ', '').trim();
        } else if (line.startsWith('目标地址: ')) {
          currentLink.target = line.replace('目标地址: ', '').trim();
        } else if (line.startsWith('创建用户: ')) {
          currentLink.username = line.replace('创建用户: ', '').trim();
        } else if (line.startsWith('用户ID: ')) {
          currentLink.userId = line.replace('用户ID: ', '').trim();
        }
      }

      // 处理最后一个链接
      if (currentLink.code && currentLink.target) {
        linksToImport.push({ ...currentLink });
      }

      // 异步并发处理所有链接
      const results = await this.processLinksAsync(linksToImport);

      logger.info('导入短链数据完成', {
        importedCount: results.importedCount,
        skippedCount: results.skippedCount,
        errorCount: results.errorCount,
        totalLinks: linksToImport.length
      });

      return results;
    } catch (error) {
      logger.error('导入短链数据失败:', error);
      throw error;
    }
  }

  /**
   * 异步并发处理多个链接
   */
  private static async processLinksAsync(links: any[]): Promise<{
    importedCount: number;
    skippedCount: number;
    errorCount: number;
    errors: string[];
  }> {
    const batchSize = 10; // 每批处理10个链接，避免过载
    const errors: string[] = [];
    let importedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    // 分批处理链接
    for (let i = 0; i < links.length; i += batchSize) {
      const batch = links.slice(i, i + batchSize);

      // 并发处理当前批次
      const batchPromises = batch.map(async (linkData) => {
        try {
          const result = await this.processImportLinkAsync(linkData);
          return result;
        } catch (error) {
          return {
            skipped: false,
            error: `短链码 ${linkData.code}: ${error instanceof Error ? error.message : String(error)}`
          };
        }
      });

      // 等待当前批次完成
      const batchResults = await Promise.all(batchPromises);

      // 统计结果
      batchResults.forEach(result => {
        if (result.error) {
          errors.push(result.error);
          errorCount++;
        } else if (result.skipped) {
          skippedCount++;
        } else {
          importedCount++;
        }
      });

      // 记录批次进度
      logger.info(`处理批次 ${Math.floor(i / batchSize) + 1}/${Math.ceil(links.length / batchSize)}`, {
        batchSize: batch.length,
        processed: i + batch.length,
        total: links.length
      });
    }

    return {
      importedCount,
      skippedCount,
      errorCount,
      errors: errors.slice(0, 10) // 只返回前10个错误
    };
  }

  /**
   * 处理单个导入链接 - 异步版本
   */
  private static async processImportLinkAsync(linkData: any): Promise<{ skipped: boolean; error?: string }> {
    return new Promise(async (resolve) => {
      try {
        // 验证必需字段
        if (!linkData.code || !linkData.target) {
          throw new Error('缺少必需的短链码或目标地址');
        }

        // 过滤掉 undefined 或空值
        if (linkData.code === 'undefined' || linkData.target === 'undefined' ||
          !linkData.code.trim() || !linkData.target.trim()) {
          throw new Error('短链码或目标地址包含无效值');
        }

        // 验证短链码格式
        if (!/^[a-zA-Z0-9_-]+$/.test(linkData.code)) {
          throw new Error('短链码格式无效');
        }

        // 验证目标地址格式
        try {
          new URL(linkData.target);
        } catch {
          throw new Error('目标地址格式无效');
        }

        // 异步检查是否已存在 - 如果存在则跳过，不抛出错误
        const existing = await ShortUrlModel.findOne({ code: linkData.code });
        if (existing) {
          logger.info(`跳过重复短链: ${linkData.code}`);
          resolve({ skipped: true });
          return;
        }

        // 异步创建新的短链记录
        await ShortUrlModel.create({
          code: linkData.code,
          target: linkData.target,
          userId: linkData.userId || 'admin',
          username: linkData.username || 'admin',
          createdAt: new Date()
        });

        logger.debug(`成功导入短链: ${linkData.code}`);
        resolve({ skipped: false });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.warn(`导入链接失败 ${linkData.code}: ${errorMessage}`);
        resolve({ skipped: false, error: errorMessage });
      }
    });
  }

  /**
   * 处理单个导入链接 - 保留原有同步版本用于兼容
   */
  private static async processImportLink(linkData: any): Promise<{ skipped: boolean }> {
    // 验证必需字段
    if (!linkData.code || !linkData.target) {
      throw new Error('缺少必需的短链码或目标地址');
    }

    // 过滤掉 undefined 或空值
    if (linkData.code === 'undefined' || linkData.target === 'undefined' ||
      !linkData.code.trim() || !linkData.target.trim()) {
      throw new Error('短链码或目标地址包含无效值');
    }

    // 验证短链码格式
    if (!/^[a-zA-Z0-9_-]+$/.test(linkData.code)) {
      throw new Error('短链码格式无效');
    }

    // 验证目标地址格式
    try {
      new URL(linkData.target);
    } catch {
      throw new Error('目标地址格式无效');
    }

    // 检查是否已存在 - 如果存在则跳过，不抛出错误
    const existing = await ShortUrlModel.findOne({ code: linkData.code });
    if (existing) {
      logger.info(`跳过重复短链: ${linkData.code}`);
      return { skipped: true };
    }

    // 创建新的短链记录
    await ShortUrlModel.create({
      code: linkData.code,
      target: linkData.target,
      userId: linkData.userId || 'admin',
      username: linkData.username || 'admin',
      createdAt: new Date()
    });

    return { skipped: false };
  }
}