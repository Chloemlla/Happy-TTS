/**
 * FBI通缉犯索引监控和维护脚本
 * 用于分析索引使用情况，识别未使用的索引，监控数据库性能
 */

import FBIWantedModel from "../models/fbiWantedModel";
import { connectMongo } from "../services/mongoService";
import logger from "../utils/logger";

/**
 * 分析索引使用统计
 */
export async function analyzeIndexUsage(): Promise<any[]> {
  try {
    const collection = FBIWantedModel.collection;

    // 获取所有索引统计
    const stats = await collection.aggregate([{ $indexStats: {} }]).toArray();

    logger.info("=".repeat(60));
    logger.info("FBI Wanted 索引使用统计:");
    logger.info("=".repeat(60));

    stats.forEach((stat: any) => {
      logger.info(`\n索引名称: ${stat.name}`);
      logger.info(`  访问次数: ${stat.accesses.ops}`);
      logger.info(`  最后访问: ${stat.accesses.since}`);
    });

    // 识别未使用的索引
    const unusedIndexes = stats.filter((stat: any) => stat.accesses.ops === 0);
    if (unusedIndexes.length > 0) {
      logger.warn("\n" + "=".repeat(60));
      logger.warn("⚠️  未使用的索引（考虑删除）:");
      logger.warn("=".repeat(60));
      unusedIndexes.forEach((stat: any) => {
        logger.warn(`  - ${stat.name}`);
      });
    } else {
      logger.info("\n✅ 所有索引都在使用中");
    }

    return stats;
  } catch (error) {
    logger.error("分析索引使用失败:", error);
    throw error;
  }
}

/**
 * 检查索引和集合大小
 */
export async function checkIndexSize(): Promise<any> {
  try {
    const stats: any = await (FBIWantedModel.collection as any).stats();

    logger.info("\n" + "=".repeat(60));
    logger.info("FBI Wanted 集合统计:");
    logger.info("=".repeat(60));
    logger.info(`  文档数量: ${stats.count}`);
    logger.info(`  平均文档大小: ${(stats.avgObjSize / 1024).toFixed(2)} KB`);
    logger.info(`  数据大小: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
    logger.info(`  索引数量: ${stats.nindexes}`);
    logger.info(`  索引大小: ${(stats.totalIndexSize / 1024 / 1024).toFixed(2)} MB`);

    // 警告：如果索引大小超过数据大小的50%
    const indexRatio = (stats.totalIndexSize / stats.size) * 100;
    logger.info(`  索引占比: ${indexRatio.toFixed(2)}%`);

    if (indexRatio > 50) {
      logger.warn("\n⚠️  警告: 索引大小超过数据大小的50%，建议检查索引必要性");
    } else {
      logger.info("\n✅ 索引大小在合理范围内");
    }

    return stats;
  } catch (error) {
    logger.error("获取集合统计失败:", error);
    throw error;
  }
}

/**
 * 列出所有索引
 */
export async function listAllIndexes(): Promise<any[]> {
  try {
    const indexes = await FBIWantedModel.collection.indexes();

    logger.info("\n" + "=".repeat(60));
    logger.info("FBI Wanted 所有索引:");
    logger.info("=".repeat(60));

    indexes.forEach((index: any, i: number) => {
      logger.info(`\n${i + 1}. ${index.name}`);
      logger.info(`   键: ${JSON.stringify(index.key)}`);
      if (index.unique) logger.info("   特性: 唯一索引");
      if (index.sparse) logger.info("   特性: 稀疏索引");
      if (index.expireAfterSeconds) logger.info(`   特性: TTL索引 (${index.expireAfterSeconds}秒)`);
      if (index.weights) logger.info(`   权重: ${JSON.stringify(index.weights)}`);
    });

    return indexes;
  } catch (error) {
    logger.error("列出索引失败:", error);
    throw error;
  }
}

/**
 * 重建索引
 */
export async function rebuildIndexes(): Promise<void> {
  try {
    logger.info("\n" + "=".repeat(60));
    logger.info("开始重建FBI Wanted索引...");
    logger.info("=".repeat(60));

    // 删除旧索引（除了_id）
    const indexes = await FBIWantedModel.collection.indexes();
    for (const index of indexes) {
      if (index.name && index.name !== "_id_") {
        logger.info(`删除索引: ${index.name}`);
        await FBIWantedModel.collection.dropIndex(index.name);
      }
    }

    // 触发索引重建
    logger.info("\n重新创建索引...");
    await FBIWantedModel.syncIndexes();

    logger.info("\n✅ FBI Wanted索引重建完成");
  } catch (error) {
    logger.error("重建索引失败:", error);
    throw error;
  }
}

/**
 * 运行完整的索引分析报告
 */
export async function runFullAnalysis(): Promise<void> {
  try {
    await connectMongo();

    logger.info("\n" + "█".repeat(60));
    logger.info("FBI WANTED 数据库索引分析报告");
    logger.info("█".repeat(60));

    // 1. 集合统计
    await checkIndexSize();

    // 2. 列出所有索引
    await listAllIndexes();

    // 3. 索引使用统计
    await analyzeIndexUsage();

    logger.info("\n" + "█".repeat(60));
    logger.info("分析报告完成");
    logger.info("█".repeat(60) + "\n");
  } catch (error) {
    logger.error("运行分析失败:", error);
    throw error;
  }
}

/**
 * 定期执行索引分析（用于cron job）
 */
export async function scheduleIndexAnalysis(intervalDays: number = 7): Promise<NodeJS.Timeout> {
  const intervalMs = intervalDays * 24 * 60 * 60 * 1000;

  logger.info(`设置定期索引分析，间隔: ${intervalDays} 天`);

  return setInterval(async () => {
    try {
      await runFullAnalysis();
    } catch (error) {
      logger.error("定期索引分析失败:", error);
    }
  }, intervalMs);
}

// 如果直接运行此脚本，执行完整分析
if (require.main === module) {
  runFullAnalysis()
    .then(() => {
      logger.info("分析完成，退出...");
      process.exit(0);
    })
    .catch((error) => {
      logger.error("分析失败:", error);
      process.exit(1);
    });
}

export default {
  analyzeIndexUsage,
  checkIndexSize,
  listAllIndexes,
  rebuildIndexes,
  runFullAnalysis,
  scheduleIndexAnalysis,
};
