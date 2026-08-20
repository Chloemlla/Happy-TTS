import mongoose from "mongoose";
import logger from "../utils/logger";

// 短链映射Schema
const ShortUrlSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true },
    target: { type: String, required: true },
    userId: { type: String, default: "admin" },
    username: { type: String, default: "admin" },
    createdAt: { type: Date, default: Date.now },
  },
  { collection: "short_urls" },
);

const ShortUrlModel = mongoose.models.ShortUrl || mongoose.model("ShortUrl", ShortUrlSchema);

const OLD_DOMAIN_SOURCE = "ipfs\\.crossbell\\.io";
// String.replace 在调用前后会重置 lastIndex，因此这个全局正则可以跨调用安全复用
const OLD_DOMAIN_REPLACE_REGEX = new RegExp(OLD_DOMAIN_SOURCE, "gi");

class ShortUrlMigrationService {
  private static instance: ShortUrlMigrationService;
  private readonly OLD_DOMAIN = OLD_DOMAIN_SOURCE;
  private readonly OLD_DOMAIN_LITERAL = "ipfs.crossbell.io";
  private readonly NEW_DOMAIN = "ipfs.chloemlla.com";

  private constructor() {}

  /**
   * Escape a string for safe use in a regular expression.
   * Handles all regex meta-characters including backslash.
   */
  private escapeRegex(str: string): string {
    return str.replace(/[\\.*+?^${}()|[\]]/g, "\\$&");
  }

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
      logger.info("[ShortUrlMigration] 开始检测和修正旧域名短链...");

      // 查找所有包含旧域名的记录
      // 使用精确的主机名匹配：域名前必须是协议分隔符或行首，域名后必须是路径/端口/行尾
      const oldDomainPattern = new RegExp(`(?:^|//)${this.OLD_DOMAIN}(?=[:/?\\s]|$)`, "i");
      const oldDomainRecords = await ShortUrlModel.find({
        target: { $regex: oldDomainPattern },
      });

      logger.info(`[ShortUrlMigration] 找到 ${oldDomainRecords.length} 条包含旧域名的记录`);

      const candidates: Array<{ id: unknown; code: string; oldTarget: string; newTarget: string }> = [];

      for (const record of oldDomainRecords) {
        const oldTarget = record.target;
        const newTarget = oldTarget.replace(OLD_DOMAIN_REPLACE_REGEX, this.NEW_DOMAIN);

        if (oldTarget !== newTarget) {
          candidates.push({ id: record._id, code: record.code, oldTarget, newTarget });
        }
      }

      const failedIndexes = new Set<number>();
      if (candidates.length > 0) {
        const bulkOps = candidates.map((item) => ({
          updateOne: { filter: { _id: item.id }, update: { $set: { target: item.newTarget } } },
        }));

        try {
          await ShortUrlModel.bulkWrite(bulkOps, { ordered: false });
        } catch (error) {
          const writeErrors = (error as { writeErrors?: Array<any> })?.writeErrors;
          if (!writeErrors) {
            logger.error("[ShortUrlMigration] 批量修正短链失败", error);
            candidates.forEach((_, index) => failedIndexes.add(index));
          } else {
            for (const writeError of writeErrors) {
              const detail = writeError?.err ?? writeError;
              const failedIndex = typeof detail?.index === "number" ? detail.index : -1;
              failedIndexes.add(failedIndex);
              logger.error(
                `[ShortUrlMigration] 修正短链失败: ${candidates[failedIndex]?.code}`,
                detail?.errmsg ?? detail,
              );
            }
          }
        }
      }

      const fixedUrls = candidates
        .filter((_, index) => !failedIndexes.has(index))
        .map(({ code, oldTarget, newTarget }) => ({ code, oldTarget, newTarget }));
      const totalFixed = fixedUrls.length;

      if (totalFixed > 0) {
        logger.info(`[ShortUrlMigration] 已批量修正 ${totalFixed} 条短链`, {
          codes: fixedUrls.slice(0, 20).map((item) => item.code),
        });
      }

      logger.info(`[ShortUrlMigration] 检测完成，共修正 ${totalFixed} 条记录`);

      return {
        totalChecked: oldDomainRecords.length,
        totalFixed,
        fixedUrls,
      };
    } catch (error) {
      logger.error("[ShortUrlMigration] 检测和修正过程中发生错误:", error);
      throw error;
    }
  }

  /**
   * 在添加新短链前自动修正目标URL
   */
  fixTargetUrlBeforeSave(target: string): string {
    if (target.includes(this.OLD_DOMAIN_LITERAL)) {
      const fixedTarget = target.replace(OLD_DOMAIN_REPLACE_REGEX, this.NEW_DOMAIN);

      logger.info("[ShortUrlMigration] 自动修正新短链目标URL", {
        original: target,
        fixed: fixedTarget,
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
      // 单次聚合完成三项计数，避免三次全表 countDocuments
      const countFacet = (await ShortUrlModel.aggregate([
        {
          $facet: {
            total: [{ $count: "count" }],
            oldDomain: [{ $match: { target: { $regex: this.OLD_DOMAIN, $options: "i" } } }, { $count: "count" }],
            newDomain: [
              { $match: { target: { $regex: this.escapeRegex(this.NEW_DOMAIN), $options: "i" } } },
              { $count: "count" },
            ],
          },
        },
      ] as any[])) as Array<Record<string, Array<{ count?: number }>>>;
      const readCount = (key: string): number => countFacet?.[0]?.[key]?.[0]?.count ?? 0;

      const totalRecords = readCount("total");
      const oldDomainRecords = readCount("oldDomain");
      const newDomainRecords = readCount("newDomain");
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
                  $regex: `(${this.OLD_DOMAIN}|${this.escapeRegex(this.NEW_DOMAIN)})`,
                  $options: "i",
                },
              },
            },
          },
          {
            $addFields: {
              domain: {
                $regexFind: {
                  input: "$target",
                  regex: /https?:\/\/([^/]+)/i,
                },
              },
            },
          },
          {
            $group: {
              _id: "$domain.match",
              count: { $sum: 1 },
            },
          },
          {
            $project: {
              domain: "$_id",
              count: 1,
              _id: 0,
            },
          },
          {
            $sort: { count: -1 },
          },
        ] as any[];

        const domainStats = await ShortUrlModel.aggregate(pipeline);
        otherDomains.push(...domainStats);
      }

      return {
        totalRecords,
        oldDomainRecords,
        newDomainRecords,
        otherDomainRecords,
        otherDomains,
      };
    } catch (error) {
      console.error("[ShortUrlMigration] 获取统计信息失败:", error);
      throw error;
    }
  }

  /**
   * 启动时自动检测和修正
   */
  async autoFixOnStartup(): Promise<void> {
    try {
      logger.info("[ShortUrlMigration] 启动时自动检测和修正短链...");

      const result = await this.detectAndFixOldDomainUrls();

      if (result.totalFixed > 0) {
        logger.info(`[ShortUrlMigration] 启动时自动修正完成，共修正 ${result.totalFixed} 条记录`);
      } else {
        logger.info("[ShortUrlMigration] 启动时检测完成，无需修正");
      }
    } catch (error) {
      logger.error("[ShortUrlMigration] 启动时自动修正失败:", error);
    }
  }
}

export const shortUrlMigrationService = ShortUrlMigrationService.getInstance();
