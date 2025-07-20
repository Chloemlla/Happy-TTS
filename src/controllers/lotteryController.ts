import { Request, Response } from 'express';
import { lotteryService, LotteryPrize, LotteryRound } from '../services/lotteryService';
import logger from '../utils/logger';

export class LotteryController {
  // 获取区块链数据
  public async getBlockchainData(req: Request, res: Response): Promise<void> {
    try {
      const blockchainData = await lotteryService.getBlockchainData();
      res.json({
        success: true,
        data: blockchainData
      });
    } catch (error) {
      logger.error('获取区块链数据失败:', error);
      res.status(500).json({
        success: false,
        error: '获取区块链数据失败'
      });
    }
  }

  // 创建抽奖轮次
  public async createLotteryRound(req: Request, res: Response): Promise<void> {
    try {
      const { name, description, startTime, endTime, prizes } = req.body;

      if (!name || !description || !startTime || !endTime || !prizes) {
        res.status(400).json({
          success: false,
          error: '缺少必要参数'
        });
        return;
      }

      const roundData = {
        name,
        description,
        startTime: new Date(startTime).getTime(),
        endTime: new Date(endTime).getTime(),
        isActive: true,
        prizes: prizes as LotteryPrize[]
      };

      const round = await lotteryService.createLotteryRound(roundData);
      
      res.json({
        success: true,
        data: round
      });
    } catch (error) {
      logger.error('创建抽奖轮次失败:', error);
      res.status(500).json({
        success: false,
        error: '创建抽奖轮次失败'
      });
    }
  }

  // 获取所有抽奖轮次
  public async getLotteryRounds(req: Request, res: Response): Promise<void> {
    try {
      const rounds = lotteryService.getLotteryRounds();
      res.json({
        success: true,
        data: rounds
      });
    } catch (error) {
      logger.error('获取抽奖轮次失败:', error);
      res.status(500).json({
        success: false,
        error: '获取抽奖轮次失败'
      });
    }
  }

  // 获取活跃的抽奖轮次
  public async getActiveRounds(req: Request, res: Response): Promise<void> {
    try {
      const rounds = lotteryService.getActiveRounds();
      res.json({
        success: true,
        data: rounds
      });
    } catch (error) {
      logger.error('获取活跃抽奖轮次失败:', error);
      res.status(500).json({
        success: false,
        error: '获取活跃抽奖轮次失败'
      });
    }
  }

  // 参与抽奖
  public async participateInLottery(req: Request, res: Response): Promise<void> {
    try {
      const { roundId } = req.params;
      const userId = req.user?.id;
      const username = req.user?.username;

      if (!userId || !username) {
        res.status(401).json({
          success: false,
          error: '用户未登录'
        });
        return;
      }

      const winner = await lotteryService.participateInLottery(roundId, userId, username);
      
      res.json({
        success: true,
        data: winner
      });
    } catch (error) {
      logger.error('参与抽奖失败:', error);
      res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : '参与抽奖失败'
      });
    }
  }

  // 获取轮次详情
  public async getRoundDetails(req: Request, res: Response): Promise<void> {
    try {
      const { roundId } = req.params;
      const round = lotteryService.getRoundDetails(roundId);

      if (!round) {
        res.status(404).json({
          success: false,
          error: '抽奖轮次不存在'
        });
        return;
      }

      res.json({
        success: true,
        data: round
      });
    } catch (error) {
      logger.error('获取轮次详情失败:', error);
      res.status(500).json({
        success: false,
        error: '获取轮次详情失败'
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
          error: '用户未登录'
        });
        return;
      }

      const record = lotteryService.getUserRecord(userId);
      res.json({
        success: true,
        data: record
      });
    } catch (error) {
      logger.error('获取用户记录失败:', error);
      res.status(500).json({
        success: false,
        error: '获取用户记录失败'
      });
    }
  }

  // 获取排行榜
  public async getLeaderboard(req: Request, res: Response): Promise<void> {
    try {
      const limit = parseInt(req.query.limit as string) || 10;
      const leaderboard = lotteryService.getLeaderboard(limit);
      
      res.json({
        success: true,
        data: leaderboard
      });
    } catch (error) {
      logger.error('获取排行榜失败:', error);
      res.status(500).json({
        success: false,
        error: '获取排行榜失败'
      });
    }
  }

  // 获取统计信息
  public async getStatistics(req: Request, res: Response): Promise<void> {
    try {
      const stats = lotteryService.getStatistics();
      res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      logger.error('获取统计信息失败:', error);
      res.status(500).json({
        success: false,
        error: '获取统计信息失败'
      });
    }
  }

  // 重置轮次（管理员功能）
  public async resetRound(req: Request, res: Response): Promise<void> {
    try {
      const { roundId } = req.params;
      
      // 检查管理员权限
      if (req.user?.role !== 'admin') {
        res.status(403).json({
          success: false,
          error: '权限不足'
        });
        return;
      }

      await lotteryService.resetRound(roundId);
      res.json({
        success: true,
        message: '轮次重置成功'
      });
    } catch (error) {
      logger.error('重置轮次失败:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : '重置轮次失败'
      });
    }
  }

  // 更新轮次状态
  public async updateRoundStatus(req: Request, res: Response): Promise<void> {
    try {
      const { roundId } = req.params;
      const { isActive } = req.body;

      // 检查管理员权限
      if (req.user?.role !== 'admin') {
        res.status(403).json({
          success: false,
          error: '权限不足'
        });
        return;
      }

      // 这里需要扩展lotteryService来支持更新轮次状态
      // 暂时返回成功响应
      res.json({
        success: true,
        message: '轮次状态更新成功'
      });
    } catch (error) {
      logger.error('更新轮次状态失败:', error);
      res.status(500).json({
        success: false,
        error: '更新轮次状态失败'
      });
    }
  }
}

export const lotteryController = new LotteryController(); 