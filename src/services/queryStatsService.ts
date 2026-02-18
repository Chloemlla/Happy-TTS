import fs from "node:fs";
import path from "node:path";
import type { Model } from "mongoose";
import logger from "../utils/logger";
import { mongoose } from "./mongoService";

export interface QueryStats {
  productId: string;
  queryCount: number;
  officialQueryCount?: number; // 官方API返回的查询次数
  firstQueried: Date;
  lastQueried: Date;
  ipAddresses: string[]; // 记录查询的IP地址（用于统计分析）
}

export interface QueryHistoryRecord {
  productId: string;
  timestamp: Date;
  ipAddress: string;
  userAgent?: string;
}

// Mongoose 文档类型
interface IQueryStatsDoc {
  productId: string;
  queryCount: number;
  officialQueryCount?: number;
  firstQueried: Date;
  lastQueried: Date;
  ipAddresses: string[];
}

interface IQueryHistoryDoc {
  productId: string;
  timestamp: Date;
  ipAddress: string;
  userAgent?: string;
}

// MongoDB Schema for query statistics
const QueryStatsSchema = new mongoose.Schema<IQueryStatsDoc>(
  {
    productId: { type: String, required: true, unique: true, index: true },
    queryCount: { type: Number, default: 0 },
    officialQueryCount: { type: Number },
    firstQueried: { type: Date, default: Date.now },
    lastQueried: { type: Date, default: Date.now },
    ipAddresses: [{ type: String }],
  },
  {
    collection: "anta_query_stats",
    timestamps: true,
  },
);

// MongoDB Schema for query history
const QueryHistorySchema = new mongoose.Schema<IQueryHistoryDoc>(
  {
    productId: { type: String, required: true, index: true },
    timestamp: { type: Date, default: Date.now },
    ipAddress: { type: String, required: true },
    userAgent: { type: String },
  },
  {
    collection: "anta_query_history",
    timestamps: true,
  },
);

const QueryStatsModel: Model<IQueryStatsDoc> =
  (mongoose.models.AntaQueryStats as Model<IQueryStatsDoc>) ||
  mongoose.model<IQueryStatsDoc>("AntaQueryStats", QueryStatsSchema);
const QueryHistoryModel: Model<IQueryHistoryDoc> =
  (mongoose.models.AntaQueryHistory as Model<IQueryHistoryDoc>) ||
  mongoose.model<IQueryHistoryDoc>("AntaQueryHistory", QueryHistorySchema);

export class QueryStatsService {
  private static readonly STATS_FILE = path.join(process.cwd(), "data", "anta-query-stats.json");
  private static readonly HISTORY_FILE = path.join(process.cwd(), "data", "anta-query-history.json");
  private static readonly STORAGE_MODE = process.env.USER_STORAGE_MODE || "file"; // 'file' 或 'mongo'
  private static readonly MAX_IPS = 100; // 每个产品最多记录的唯一IP数量

  private static ensureDataDir() {
    const dir = path.dirname(QueryStatsService.STATS_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  /**
   * 记录产品查询并更新统计信息
   * @param productId 产品ID
   * @param ipAddress 查询者IP地址
   * @param userAgent 用户代理字符串
   * @param officialQueryCount 官方API返回的查询次数（可选）
   * @returns 更新后的查询次数
   */
  public static async recordQuery(
    productId: string,
    ipAddress: string,
    userAgent?: string,
    officialQueryCount?: number,
  ): Promise<number> {
    try {
      logger.info("记录安踏产品查询", { productId, ipAddress, officialQueryCount });

      if ((QueryStatsService.STORAGE_MODE || "").toLowerCase() === "mongo") {
        return await QueryStatsService.recordQueryMongo(productId, ipAddress, userAgent, officialQueryCount);
      } else {
        return await QueryStatsService.recordQueryFile(productId, ipAddress, userAgent, officialQueryCount);
      }
    } catch (error) {
      logger.error("记录安踏产品查询失败", {
        productId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * 获取某产品的统计信息
   */
  public static async getStats(productId: string): Promise<QueryStats | null> {
    try {
      if ((QueryStatsService.STORAGE_MODE || "").toLowerCase() === "mongo") {
        const doc = (await QueryStatsModel.findOne({ productId }).lean()) as IQueryStatsDoc | null;
        if (!doc) return null;
        return {
          productId: doc.productId,
          queryCount: doc.queryCount,
          officialQueryCount: doc.officialQueryCount,
          firstQueried: doc.firstQueried,
          lastQueried: doc.lastQueried,
          ipAddresses: doc.ipAddresses || [],
        } as QueryStats;
      } else {
        QueryStatsService.ensureDataDir();
        if (!fs.existsSync(QueryStatsService.STATS_FILE)) return null;
        const raw = fs.readFileSync(QueryStatsService.STATS_FILE, "utf-8");
        const data = raw ? (JSON.parse(raw) as Record<string, QueryStats>) : ({} as any);
        const stat = data[productId];
        return stat || null;
      }
    } catch (error) {
      logger.error("获取安踏产品统计失败", {
        productId,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * 获取查询次数最多的产品
   */
  public static async getTopProducts(limit = 10): Promise<QueryStats[]> {
    try {
      if ((QueryStatsService.STORAGE_MODE || "").toLowerCase() === "mongo") {
        const docs = (await QueryStatsModel.find({}).sort({ queryCount: -1 }).limit(limit).lean()) as IQueryStatsDoc[];
        return docs.map(
          (d) =>
            ({
              productId: d.productId,
              queryCount: d.queryCount,
              officialQueryCount: d.officialQueryCount,
              firstQueried: d.firstQueried,
              lastQueried: d.lastQueried,
              ipAddresses: d.ipAddresses || [],
            }) as QueryStats,
        );
      } else {
        QueryStatsService.ensureDataDir();
        if (!fs.existsSync(QueryStatsService.STATS_FILE)) return [];
        const raw = fs.readFileSync(QueryStatsService.STATS_FILE, "utf-8");
        const data = raw ? (JSON.parse(raw) as Record<string, QueryStats>) : ({} as any);
        const list = Object.values(data) as QueryStats[];
        return list.sort((a, b) => (b.queryCount || 0) - (a.queryCount || 0)).slice(0, limit);
      }
    } catch (error) {
      logger.error("获取安踏产品Top统计失败", { error: error instanceof Error ? error.message : String(error) });
      return [];
    }
  }

  /**
   * 获取最近的查询历史
   */
  public static async getRecentHistory(productId?: string, limit = 50): Promise<QueryHistoryRecord[]> {
    try {
      if ((QueryStatsService.STORAGE_MODE || "").toLowerCase() === "mongo") {
        // 安全地构建查询条件，防止NoSQL注入攻击
        let query: any = {};
        if (productId && typeof productId === "string") {
          // 验证和清理productId以防止注入攻击
          const sanitizedProductId = productId.replace(/[^a-zA-Z0-9\-_.]/g, "");
          if (sanitizedProductId.length > 0 && sanitizedProductId.length <= 50) {
            query = { productId: sanitizedProductId };
          }
        }
        const docs = (await QueryHistoryModel.find(query)
          .sort({ timestamp: -1 })
          .limit(limit)
          .lean()) as IQueryHistoryDoc[];
        return docs.map(
          (d) =>
            ({
              productId: d.productId,
              timestamp: d.timestamp,
              ipAddress: d.ipAddress,
              userAgent: d.userAgent,
            }) as QueryHistoryRecord,
        );
      } else {
        QueryStatsService.ensureDataDir();
        if (!fs.existsSync(QueryStatsService.HISTORY_FILE)) return [];
        const raw = fs.readFileSync(QueryStatsService.HISTORY_FILE, "utf-8");
        const list = raw ? (JSON.parse(raw) as QueryHistoryRecord[]) : [];
        const filtered = productId ? list.filter((x) => x.productId === productId) : list;
        return filtered
          .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
          .slice(0, limit);
      }
    } catch (error) {
      logger.error("获取安踏产品查询历史失败", {
        productId,
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  // ------------------ Private helpers ------------------
  private static async recordQueryFile(
    productId: string,
    ipAddress: string,
    userAgent?: string,
    officialQueryCount?: number,
  ): Promise<number> {
    QueryStatsService.ensureDataDir();

    // 读取现有统计
    let stats: Record<string, QueryStats> = {};
    try {
      if (fs.existsSync(QueryStatsService.STATS_FILE)) {
        const raw = fs.readFileSync(QueryStatsService.STATS_FILE, "utf-8");
        stats = raw ? JSON.parse(raw) : {};
      }
    } catch (e) {
      logger.warn("读取统计文件失败，重置为{}", { error: e instanceof Error ? e.message : String(e) });
      stats = {};
    }

    const now = new Date();
    const existing = stats[productId];
    if (!existing) {
      stats[productId] = {
        productId,
        queryCount: 1,
        officialQueryCount,
        firstQueried: now as any,
        lastQueried: now as any,
        ipAddresses: ipAddress ? [ipAddress] : [],
      };
    } else {
      existing.queryCount = (existing.queryCount || 0) + 1;
      existing.lastQueried = now as any;
      // 更新官方查询次数（如果提供）
      if (officialQueryCount !== undefined) {
        existing.officialQueryCount = officialQueryCount;
      }
      if (ipAddress) {
        const set = new Set(existing.ipAddresses || []);
        set.add(ipAddress);
        // 控制大小
        const arr = Array.from(set);
        if (arr.length > QueryStatsService.MAX_IPS) arr.splice(0, arr.length - QueryStatsService.MAX_IPS);
        existing.ipAddresses = arr;
      }
      stats[productId] = existing;
    }

    // 写回统计文件
    try {
      fs.writeFileSync(QueryStatsService.STATS_FILE, JSON.stringify(stats, null, 2), "utf-8");
    } catch (e) {
      logger.error("写入统计文件失败", { error: e instanceof Error ? e.message : String(e) });
    }

    // 追加历史记录
    try {
      let history: QueryHistoryRecord[] = [];
      if (fs.existsSync(QueryStatsService.HISTORY_FILE)) {
        const raw = fs.readFileSync(QueryStatsService.HISTORY_FILE, "utf-8");
        history = raw ? JSON.parse(raw) : [];
      }
      history.push({ productId, timestamp: now as any, ipAddress, userAgent });
      // 控制文件大小（最多保存最近5000条）
      if (history.length > 5000) {
        history = history.slice(history.length - 5000);
      }
      fs.writeFileSync(QueryStatsService.HISTORY_FILE, JSON.stringify(history, null, 2), "utf-8");
    } catch (e) {
      logger.warn("写入历史文件失败", { error: e instanceof Error ? e.message : String(e) });
    }

    return stats[productId].queryCount;
  }

  private static async recordQueryMongo(
    productId: string,
    ipAddress: string,
    userAgent?: string,
    officialQueryCount?: number,
  ): Promise<number> {
    const now = new Date();
    // 构建更新操作
    const updateOps: any = {
      $inc: { queryCount: 1 },
      $setOnInsert: { firstQueried: now },
      $set: { lastQueried: now },
      $addToSet: { ipAddresses: ipAddress },
    };

    // 如果提供了官方查询次数，则更新它
    if (officialQueryCount !== undefined) {
      updateOps.$set.officialQueryCount = officialQueryCount;
    }

    // 更新/插入统计
    const updated = (await QueryStatsModel.findOneAndUpdate({ productId }, updateOps, {
      new: true,
      upsert: true,
    }).lean()) as IQueryStatsDoc | null;

    // 写入历史
    try {
      await QueryHistoryModel.create({ productId, timestamp: now, ipAddress, userAgent });
    } catch (e) {
      logger.warn("写入Mongo历史记录失败", { error: e instanceof Error ? e.message : String(e) });
    }

    return updated?.queryCount || 1;
  }
}
