import type { Request, Response } from "express";
import { isAdminRole, isSuperAdmin } from "../middleware/auth";
import { type LotteryPrize, lotteryService } from "../services/lotteryService";
import { firstString, firstStringOr } from "../utils/httpParam";
import logger from "../utils/logger";

// 简单WAF校验函数
function wafCheck(str: string, maxLen = 128): boolean {
  if (typeof str !== "string") return false;
  if (!str.trim() || str.length > maxLen) return false;
  if (/[<>{}"'`;\\]/.test(str)) return false;
  if (/\b(select|update|delete|insert|drop|union|script|alert|onerror|onload)\b/i.test(str)) return false;
  return true;
}

export class LotteryController {
  // 获取区块链数据
  public async getBlockchainData(_req: Request, res: Response): Promise<void> {
    try {
      const blockchainData = await lotteryService.getBlockchainData();
      res.json({
        success: true,
        data: blockchainData,
      });
    } catch (error) {
      logger.error("获取区块链数据失败:", error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "服务器错误",
      });
    }
  }

  // 创建抽奖轮次
  public async createLotteryRound(req: Request, res: Response): Promise<void> {
    logger.info("收到创建轮次请求", req.body);
    try {
      if (!isSuperAdmin(req)) {
        res.status(403).json({ success: false, error: "权限不足" });
        return;
      }
      let { name, description, startTime, endTime, prizes } = req.body;
      // WAF校验
      if (!wafCheck(name, 64) || !wafCheck(description, 256)) {
        res.status(400).json({ success: false, error: "参数非法" });
        return;
      }
      if (!Array.isArray(prizes) || prizes.length === 0) {
        res.status(400).json({ success: false, error: "奖品列表不能为空" });
        return;
      }
      for (const p of prizes) {
        if (!wafCheck(p.name, 64) || !wafCheck(p.description, 128)) {
          res.status(400).json({ success: false, error: "奖品参数非法" });
          return;
        }
        if (typeof p.value !== "number" || typeof p.probability !== "number" || typeof p.quantity !== "number") {
          res.status(400).json({ success: false, error: "奖品数值参数非法" });
          return;
        }
      }
      let warning = "";
      // 强制修正：开始时间不能晚于结束时间
      if (new Date(startTime).getTime() > new Date(endTime).getTime()) {
        [startTime, endTime] = [endTime, startTime];
        warning += "开始时间和结束时间已自动调整。";
      }
      // 强制修正：奖品概率和不能大于1
      const totalProb = prizes.reduce((sum: number, p: any) => sum + Number(p.probability), 0);
      if (totalProb > 1) {
        prizes = prizes.map((p: any) => ({ ...p, probability: Number(p.probability) / totalProb }));
        warning += "奖品概率已自动归一化。";
      }
      const roundData = {
        name,
        description,
        startTime: new Date(startTime).getTime(),
        endTime: new Date(endTime).getTime(),
        isActive: true,
        prizes: prizes as LotteryPrize[],
      };
      const round = await lotteryService.createLotteryRound(roundData);
      res.json({
        success: true,
        data: round,
        ...(warning ? { warning } : {}),
      });
    } catch (error) {
      logger.error("创建抽奖轮次失败:", error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "服务器错误",
      });
    }
  }

  // 获取所有抽奖轮次
  public async getLotteryRounds(req: Request, res: Response): Promise<void> {
    try {
      logger.debug("[Lottery] 开始处理抽奖轮次请求", {
        userId: req.user?.id,
        username: req.user?.username,
        role: req.user?.role,
        ip: req.ip,
      });

      const rounds = await lotteryService.getLotteryRounds();
      logger.debug("[Lottery] 获取到抽奖轮次数量", { count: rounds.length });

      // 检查是否为管理员用户
      if (req.user && isAdminRole(req.user.role)) {
        // Cookie 会话认证：管理员直接返回明文数据
        // 前端已移除 AES 解密逻辑，不再依赖 Bearer token 作为加密密钥
        logger.debug("[Lottery] 管理员用户，返回明文数据");
        res.json({
          success: true,
          data: rounds,
        });
      } else {
        // 普通用户或未登录用户，返回未加密数据
        logger.debug("[Lottery] 普通用户，返回未加密数据");
        res.json({
          success: true,
          data: rounds,
        });
      }
    } catch (error) {
      logger.error("获取抽奖轮次失败:", error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "服务器错误",
      });
    }
  }

  // 获取活跃的抽奖轮次
  public async getActiveRounds(_req: Request, res: Response): Promise<void> {
    try {
      const rounds = await lotteryService.getActiveRounds();
      res.json({
        success: true,
        data: rounds,
      });
    } catch (error) {
      logger.error("获取活跃抽奖轮次失败:", error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "服务器错误",
      });
    }
  }

  // 参与抽奖
  public async participateInLottery(req: Request, res: Response): Promise<void> {
    try {
      const roundId = firstString(req.params.roundId);
      const { cfToken } = req.body;
      const userId = req.user?.id;

      if (!roundId) {
        res.status(400).json({ success: false, message: "无效的轮次ID" });
        return;
      }
      const username = req.user?.username;

      if (!userId || !username) {
        res.status(401).json({
          success: false,
          error: "用户未登录",
        });
        return;
      }
      // WAF校验
      if (!wafCheck(roundId, 64) || !wafCheck(username, 64)) {
        res.status(400).json({ success: false, error: "参数非法" });
        return;
      }

      const winner = await lotteryService.participateInLottery(roundId, userId, username, cfToken, req.user?.role);

      res.json({
        success: true,
        data: winner,
      });
    } catch (error) {
      logger.error("参与抽奖失败:", error);
      // 处理 Turnstile 验证错误
      if (error instanceof Error) {
        if (error.message.includes("人机验证") || error.message.includes("Turnstile")) {
          res.status(400).json({
            success: false,
            error: error.message,
          });
          return;
        }
      }

      res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : "参与抽奖失败",
      });
    }
  }

  // 获取轮次详情
  public async getRoundDetails(req: Request, res: Response): Promise<void> {
    try {
      const roundId = firstString(req.params.roundId);
      if (!roundId) {
        res.status(400).json({ success: false, message: "无效的轮次ID" });
        return;
      }
      const round = await lotteryService.getRoundDetails(roundId);

      if (!round) {
        res.status(404).json({
          success: false,
          error: "抽奖轮次不存在",
        });
        return;
      }

      res.json({
        success: true,
        data: round,
      });
    } catch (error) {
      logger.error("获取轮次详情失败:", error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "服务器错误",
      });
    }
  }

  // 获取用户抽奖记录
  public async getUserRecord(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({
          success: false,
          error: "用户未登录",
        });
        return;
      }

      const record = await lotteryService.getUserRecord(userId);
      res.json({
        success: true,
        data: record,
      });
    } catch (error) {
      logger.error("获取用户记录失败:", error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "服务器错误",
      });
    }
  }

  // 获取排行榜
  public async getLeaderboard(req: Request, res: Response): Promise<void> {
    try {
      const limit = parseInt(firstStringOr(req.query.limit, "10"), 10) || 10;
      const leaderboard = await lotteryService.getLeaderboard(limit);

      res.json({
        success: true,
        data: leaderboard,
      });
    } catch (error) {
      logger.error("获取排行榜失败:", error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "服务器错误",
      });
    }
  }

  // 获取统计信息
  public async getStatistics(_req: Request, res: Response): Promise<void> {
    try {
      const stats = await lotteryService.getStatistics();
      res.json({
        success: true,
        data: stats,
      });
    } catch (error) {
      logger.error("获取统计信息失败:", error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "服务器错误",
      });
    }
  }

  // 重置轮次（管理员功能）
  public async resetRound(req: Request, res: Response): Promise<void> {
    try {
      const roundId = firstString(req.params.roundId);
      if (!roundId) {
        res.status(400).json({ success: false, message: "无效的轮次ID" });
        return;
      }

      // 检查管理员权限
      if (!isSuperAdmin(req)) {
        res.status(403).json({
          success: false,
          error: "权限不足",
        });
        return;
      }

      await lotteryService.resetRound(roundId);
      res.json({
        success: true,
        message: "轮次重置成功",
      });
    } catch (error) {
      logger.error("重置轮次失败:", error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "服务器错误",
      });
    }
  }

  // 更新轮次状态
  public async updateRoundStatus(req: Request, res: Response): Promise<void> {
    try {
      const roundId = firstString(req.params.roundId);
      const { isActive } = req.body;

      if (!roundId) {
        res.status(400).json({ success: false, message: "无效的轮次ID" });
        return;
      }

      if (typeof isActive !== "boolean") {
        res.status(400).json({ success: false, message: "isActive 必须为布尔值" });
        return;
      }

      // 检查管理员权限
      if (!isSuperAdmin(req)) {
        res.status(403).json({
          success: false,
          error: "权限不足",
        });
        return;
      }

      // G4-22: 调用真实的状态更新实现，不再返回假成功
      const round = await lotteryService.updateRoundStatus(roundId, isActive);
      res.json({
        success: true,
        data: round,
        message: "轮次状态更新成功",
      });
    } catch (error) {
      logger.error("更新轮次状态失败:", error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "服务器错误",
      });
    }
  }

  // 删除所有抽奖轮次
  public async deleteAllRounds(req: Request, res: Response): Promise<void> {
    try {
      // 仅管理员可操作
      if (!isSuperAdmin(req)) {
        res.status(403).json({ success: false, error: "权限不足" });
        return;
      }
      await lotteryService.deleteAllRounds();
      res.json({ success: true, message: "所有轮次已删除" });
    } catch (error) {
      logger.error("删除所有轮次失败:", error);
      res.status(500).json({ success: false, error: error instanceof Error ? error.message : "服务器错误" });
    }
  }
}

export const lotteryController = new LotteryController();
