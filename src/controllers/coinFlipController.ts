import type { Request, Response } from "express";
import * as coinFlipService from "../services/coinFlipService";
import { firstString, firstStringOr } from "../utils/httpParam";
import logger from "../utils/logger";

const RESULT_ID_PATTERN = /^[A-Za-z0-9-]{6,64}$/;

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

export class CoinFlipController {
  // 抛硬币：公开接口，登录用户会记录 userId/username
  public async flip(req: Request, res: Response): Promise<void> {
    try {
      const user = (req as Request & { user?: { id?: string; username?: string } }).user;
      const record = await coinFlipService.flipCoin(user ? { id: user.id, username: user.username } : undefined);
      res.json({ success: true, data: record });
    } catch (error) {
      logger.error("抛硬币失败:", error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "服务器错误",
      });
    }
  }

  // 按唯一结果 ID 查询单次结果：公开接口
  public async getResult(req: Request, res: Response): Promise<void> {
    try {
      const resultId = firstStringOr(req.params.resultId);
      if (!resultId || !RESULT_ID_PATTERN.test(resultId)) {
        res.status(400).json({ success: false, error: "结果 ID 非法" });
        return;
      }
      const record = await coinFlipService.getCoinFlipResult(resultId);
      if (!record) {
        res.status(404).json({ success: false, error: "结果不存在" });
        return;
      }
      res.json({ success: true, data: record });
    } catch (error) {
      logger.error("查询抛硬币结果失败:", error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "服务器错误",
      });
    }
  }

  // 管理员分页查看全部结果
  public async listResults(req: Request, res: Response): Promise<void> {
    try {
      const page = parsePositiveInt(firstString(req.query.page), 1);
      const pageSize = parsePositiveInt(firstString(req.query.pageSize), 20);
      const data = await coinFlipService.listCoinFlipResults(page, pageSize);
      res.json({ success: true, data });
    } catch (error) {
      logger.error("查询抛硬币列表失败:", error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "服务器错误",
      });
    }
  }

  // 管理员查看统计信息
  public async getStatistics(_req: Request, res: Response): Promise<void> {
    try {
      const data = await coinFlipService.getCoinFlipStatistics();
      res.json({ success: true, data });
    } catch (error) {
      logger.error("查询抛硬币统计失败:", error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "服务器错误",
      });
    }
  }
}

export const coinFlipController = new CoinFlipController();
