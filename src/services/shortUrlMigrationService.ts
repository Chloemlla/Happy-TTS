import mongoose from 'mongoose';
import logger from '../utils/logger';

// 短链映射Schema
const ShortUrlSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true },
  target: { type: String, required: true },
  userId: { type: String, default: 'admin' },
  username: { type: String, default: 'admin' },
  createdAt: { type: Date, default: Date.now }
}, { collection: 'short_urls' });

const ShortUrlModel = mongoose.models.ShortUrl || mongoose.model('ShortUrl', ShortUrlSchema);

class ShortUrlMigrationService {
  private static instance: ShortUrlMigrationService;
  private readonly OLD_DOMAIN = 'ipfs.crossbell.io';
  private readonly NEW_DOMAIN = 'ipfs.hapxs.com';

  private constructor() {}

  public static getInstance(): ShortUrlMigrationService {
    if (!ShortUrlMigrationService.instance) {
      ShortUrlMigrationService.instance = new ShortUrlMigrationService();
    }
    return ShortUrlMigrationService.instance;
  }

  /**
   * 检测并修正所有包含旧域名的短链
   */
  async detectAndFixOldDomainUrls(): Promise<{
    totalChecked: number;
    totalFixed: number;
    fixedUrls: Array<{ code: string; oldTarget: string; newTarget: string }>;
  }> {
    try {
      logger.info('[ShortUrlMigration] 开始检测和修正旧域名短链...');
      
      // 查找所有包含旧域名的记录
      // 修正：主机名正则应完整匹配域名（支持子域、端口、路径等），去除无用转义
      const oldDomainPattern = /(^|[\s/:;,.])ipfs\.crossbell\.io([\s/:;,.]|$)/i;
      const oldDomainRecords = await ShortUrlModel.find({
        target: { $regex: oldDomainPattern }
      });

      logger.info(`[ShortUrlMigration] 找到 ${oldDomainRecords.length} 条包含旧域名的记录`);

      const fixedUrls: Array<{ code: string; oldTarget: string; newTarget: string }> = [];
      let totalFixed = 0;

      for (const record of oldDomainRecords) {
        const oldTarget = record.target;
        const newTarget = oldTarget.replace(
          new RegExp(this.OLD_DOMAIN, 'gi'),
          this.NEW_DOMAIN
        );

        if (oldTarget !== newTarget) {
          try {
            await ShortUrlModel.updateOne(
              { _id: record._id },
              { $set: { target: newTarget } }
            );

            fixedUrls.push({
              code: record.code,
              oldTarget,
              newTarget
            });

            totalFixed++;
            logger.info(`[ShortUrlMigration] 已修正短链: ${record.code}`, {
              oldTarget,
              newTarget
            });
          } catch (error) {
            logger.error(`[ShortUrlMigration] 修正短链失败: ${record.code}`, error);
          }
        }
      }

      logger.info(`[ShortUrlMigration] 检测完成，共修正 ${totalFixed} 条记录`);

      return {
        totalChecked: oldDomainRecords.length,
        totalFixed,
        fixedUrls
      };
    } catch (error) {
      logger.error('[ShortUrlMigration] 检测和修正过程中发生错误:', error);
      throw error;
    }
  }

  /**
   * 在添加新短链前自动修正目标URL
   */
  fixTargetUrlBeforeSave(target: string): string {
    if (target.includes(this.OLD_DOMAIN)) {
      const fixedTarget = target.replace(
        new RegExp(this.OLD_DOMAIN, 'gi'),
        this.NEW_DOMAIN
      );
      
      logger.info('[ShortUrlMigration] 自动修正新短链目标URL', {
        original: target,
        fixed: fixedTarget
      });
      
      return fixedTarget;
    }
    
    return target;
  }

  /**
   * 获取迁移统计信息
   */
  async getMigrationStats(): Promise<{
    totalRecords: number;
    oldDomainRecords: number;
    newDomainRecords: number;
    otherDomainRecords: number;
    otherDomains: Array<{ domain: string; count: number }>;
  }> {
    try {
      const totalRecords = await ShortUrlModel.countDocuments();
      const oldDomainRecords = await ShortUrlModel.countDocuments({
        target: { $regex: this.OLD_DOMAIN, $options: 'i' }
      });
      const newDomainRecords = await ShortUrlModel.countDocuments({
        target: { $regex: this.NEW_DOMAIN, $options: 'i' }
      });
      const otherDomainRecords = totalRecords - oldDomainRecords - newDomainRecords;

      // 获取其他域名的详细信息
      const otherDomains: Array<{ domain: string; count: number }> = [];
      if (otherDomainRecords > 0) {
        // 使用聚合管道获取其他域名的统计
        const pipeline = [
          {
            $match: {
              target: {
                $not: {
                  $regex: `(${this.OLD_DOMAIN}|${this.NEW_DOMAIN})`,
                  $options: 'i'
                }
              }
            }
          },
          {
            $addFields: {
              domain: {
                $regexFind: {
                  input: '$target',
                  regex: /https?:\/\/([^\/]+)/i
                }
              }
            }
          },
          {
            $group: {
              _id: '$domain.match',
              count: { $sum: 1 }
            }
          },
          {
            $project: {
              domain: '$_id',
              count: 1,
              _id: 0
            }
          },
          {
            $sort: { count: -1 }
          }
        ] as any[];

        const domainStats = await ShortUrlModel.aggregate(pipeline);
        otherDomains.push(...domainStats);
      }

      return {
        totalRecords,
        oldDomainRecords,
        newDomainRecords,
        otherDomainRecords,
        otherDomains
      };
    } catch (error) {
      console.error('[ShortUrlMigration] 获取统计信息失败:', error);
      throw error;
    }
  }

  /**
   * 启动时自动检测和修正
   */
  async autoFixOnStartup(): Promise<void> {
    try {
      logger.info('[ShortUrlMigration] 启动时自动检测和修正短链...');
      
      const result = await this.detectAndFixOldDomainUrls();
      
      if (result.totalFixed > 0) {
        logger.info(`[ShortUrlMigration] 启动时自动修正完成，共修正 ${result.totalFixed} 条记录`);
      } else {
        logger.info('[ShortUrlMigration] 启动时检测完成，无需修正');
      }
    } catch (error) {
      logger.error('[ShortUrlMigration] 启动时自动修正失败:', error);
    }
  }
}

export const shortUrlMigrationService = ShortUrlMigrationService.getInstance(); 