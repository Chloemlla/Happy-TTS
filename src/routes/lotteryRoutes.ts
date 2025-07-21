import express from 'express';
import { lotteryController } from '../controllers/lotteryController';
import { authenticateToken } from '../middleware/authenticateToken';
import { rateLimit } from 'express-rate-limit';

const router = express.Router();

// 抽奖相关限流器
const lotteryLimiter = rateLimit({
  windowMs: 60 * 1000, // 1分钟
  max: 90, // 限制每个IP每分钟90次请求
  message: { error: '抽奖请求过于频繁，请稍后再试' },
  standardHeaders: true,
  legacyHeaders: false,
});

const participationLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5分钟
  max: 3, // 限制每个IP每5分钟3次参与抽奖
  message: { error: '参与抽奖过于频繁，请稍后再试' },
  standardHeaders: true,
  legacyHeaders: false,
});

// 公开接口 - 无需认证（已限流）
// 涉及数据库读取：区块链数据
router.get('/blockchain', lotteryLimiter, lotteryController.getBlockchainData.bind(lotteryController));
// 涉及数据库读取：所有抽奖轮次
router.get('/rounds', lotteryLimiter, lotteryController.getLotteryRounds.bind(lotteryController));
// 涉及数据库读取：活跃轮次
router.get('/rounds/active', lotteryLimiter, lotteryController.getActiveRounds.bind(lotteryController));
// 涉及数据库读取：单轮详情
router.get('/rounds/:roundId', lotteryLimiter, lotteryController.getRoundDetails.bind(lotteryController));
// 涉及数据库读取：排行榜
router.get('/leaderboard', lotteryLimiter, lotteryController.getLeaderboard.bind(lotteryController));
// 涉及数据库读取：统计信息
router.get('/statistics', lotteryLimiter, lotteryController.getStatistics.bind(lotteryController));

// 需要认证的接口（已限流）
// 涉及数据库读取：用户抽奖记录
router.get('/user/record', authenticateToken, lotteryLimiter, lotteryController.getUserRecord.bind(lotteryController));
// 涉及数据库写入：参与抽奖（更新用户、轮次等）
router.post('/rounds/:roundId/participate', authenticateToken, participationLimiter, lotteryController.participateInLottery.bind(lotteryController));

// 管理员接口（已限流）
// 涉及数据库写入：创建新抽奖轮次
router.post('/rounds', authenticateToken, lotteryLimiter, lotteryController.createLotteryRound.bind(lotteryController));
// 涉及数据库写入：更新轮次状态
router.put('/rounds/:roundId/status', authenticateToken, lotteryLimiter, lotteryController.updateRoundStatus.bind(lotteryController));
// 涉及数据库写入：重置轮次
router.post('/rounds/:roundId/reset', authenticateToken, lotteryLimiter, lotteryController.resetRound.bind(lotteryController));
// 删除所有轮次（仅管理员）
router.delete('/rounds', authenticateToken, lotteryLimiter, lotteryController.deleteAllRounds.bind(lotteryController));

export default router; 