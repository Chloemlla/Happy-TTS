import ShortUrlModel from '../models/shortUrlModel';
import { TransactionService } from './transactionService';
import logger from '../utils/logger';
const nanoid = require('nanoid').nanoid;

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
      const shortUrl = await ShortUrlModel.findOne({ code });
      if (!shortUrl) {
        logger.warn('短链不存在', { code });
        return null;
      }
      
      logger.info('获取短链成功', { code, target: shortUrl.target });
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
      const query: any = { code };
      if (userId) {
        query.userId = userId; // 只能删除自己的短链
      }
      
      const result = await ShortUrlModel.findOneAndDelete(query);
      if (!result) {
        logger.warn('删除短链失败：短链不存在或无权限', { code, userId });
        return false;
      }
      
      logger.info('删除短链成功', { code, userId });
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
      const skip = (page - 1) * limit;
      
      const [shortUrls, total] = await Promise.all([
        ShortUrlModel.find({ userId })
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit),
        ShortUrlModel.countDocuments({ userId })
      ]);
      
      logger.info('获取用户短链列表成功', { userId, page, total });
      
      return {
        shortUrls: shortUrls.map(url => url.toObject()),
        total,
        page,
        limit
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
      const query: any = { code: { $in: codes } };
      if (userId) {
        query.userId = userId;
      }
      
      const result = await ShortUrlModel.deleteMany(query);
      
      logger.info('批量删除短链成功', { 
        codes, 
        userId, 
        deletedCount: result.deletedCount 
      });
      
      return result.deletedCount;
    } catch (error) {
      logger.error('批量删除短链失败:', error);
      throw error;
    }
  }
} 