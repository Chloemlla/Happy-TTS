import crypto from "node:crypto";
import { logger } from "./logger";
import CoinFlipModel from "../models/coinFlipModel";

export type CoinFlipResult = "heads" | "tails";

export interface CoinFlipRecord {
  resultId: string;
  result: CoinFlipResult;
  userId?: string;
  username?: string;
  createdAt: Date;
}

export interface CoinFlipListPage {
  items: CoinFlipRecord[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CoinFlipStatistics {
  total: number;
  heads: number;
  tails: number;
  headsRatio: number;
}

const MAX_PAGE_SIZE = 100;

function clampPage(value: number): number {
  return Number.isFinite(value) && value >= 1 ? Math.floor(value) : 1;
}

function clampPageSize(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 20;
  return Math.min(value, MAX_PAGE_SIZE);
}

function toRecord(doc: any): CoinFlipRecord {
  return {
    resultId: doc.resultId,
    result: doc.result,
    userId: doc.userId ?? undefined,
    username: doc.username ?? undefined,
    createdAt: doc.createdAt,
  };
}

// 抛硬币并持久化：结果用加密安全随机数，结果 ID 用随机 hex + 唯一索引兜底重试
export async function flipCoin(user?: { id?: string; username?: string }): Promise<CoinFlipRecord> {
  const result: CoinFlipResult = crypto.randomInt(0, 2) === 0 ? "heads" : "tails";
  const createdAt = new Date();

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const resultId = `flip-${crypto.randomBytes(8).toString("hex")}`;
    try {
      const doc = await CoinFlipModel.create({
        resultId,
        result,
        userId: user?.id || undefined,
        username: user?.username || undefined,
        createdAt,
      });
      return toRecord(doc);
    } catch (error: any) {
      if (error?.code === 11000) {
        // 唯一索引冲突（并发生成同一 ID 概率极低）时换一个 ID 重试
        logger.warn("coin-flip resultId 唯一索引冲突，重试", { resultId });
        continue;
      }
      logger.error("保存抛硬币结果失败:", error);
      throw new Error("抛硬币结果保存失败，请稍后重试");
    }
  }

  throw new Error("抛硬币结果保存失败，请稍后重试");
}

export async function getCoinFlipResult(resultId: string): Promise<CoinFlipRecord | null> {
  const doc = await CoinFlipModel.findOne({ resultId }).lean();
  return doc ? toRecord(doc) : null;
}

export async function listCoinFlipResults(page: number, pageSize: number): Promise<CoinFlipListPage> {
  const safePage = clampPage(page);
  const safePageSize = clampPageSize(pageSize);

  const [docs, total] = await Promise.all([
    CoinFlipModel.find()
      .sort({ createdAt: -1 })
      .skip((safePage - 1) * safePageSize)
      .limit(safePageSize)
      .lean(),
    CoinFlipModel.countDocuments(),
  ]);

  return {
    items: docs.map(toRecord),
    total,
    page: safePage,
    pageSize: safePageSize,
  };
}

export async function getCoinFlipStatistics(): Promise<CoinFlipStatistics> {
  const [heads, total] = await Promise.all([
    CoinFlipModel.countDocuments({ result: "heads" }),
    CoinFlipModel.countDocuments(),
  ]);
  const tails = total - heads;
  return {
    total,
    heads,
    tails,
    headsRatio: total > 0 ? heads / total : 0,
  };
}
