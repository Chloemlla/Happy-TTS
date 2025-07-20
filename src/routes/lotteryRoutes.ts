import express from 'express';
import { lotteryController } from '../controllers/lotteryController';
import { authenticateToken } from '../middleware/authenticateToken';
import { rateLimit } from 'express-rate-limit';

const router = express.Router();

// 抽奖相关限流器
const lotteryLimiter = rateLimit({
  windowMs: 60 * 1000, // 1分钟
  max: 10, // 限制每个IP每分钟10次请求
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

// 公开接口 - 无需认证
router.get('/blockchain', lotteryLimiter, lotteryController.getBlockchainData.bind(lotteryController));
router.get('/rounds', lotteryLimiter, lotteryController.getLotteryRounds.bind(lotteryController));
router.get('/rounds/active', lotteryLimiter, lotteryController.getActiveRounds.bind(lotteryController));
router.get('/rounds/:roundId', lotteryLimiter, lotteryController.getRoundDetails.bind(lotteryController));
router.get('/leaderboard', lotteryLimiter, lotteryController.getLeaderboard.bind(lotteryController));
router.get('/statistics', lotteryLimiter, lotteryController.getStatistics.bind(lotteryController));

// 需要认证的接口
router.get('/user/record', authenticateToken, lotteryLimiter, lotteryController.getUserRecord.bind(lotteryController));
router.post('/rounds/:roundId/participate', authenticateToken, participationLimiter, lotteryController.participateInLottery.bind(lotteryController));

// 管理员接口
router.post('/rounds', authenticateToken, lotteryLimiter, lotteryController.createLotteryRound.bind(lotteryController));
router.put('/rounds/:roundId/status', authenticateToken, lotteryLimiter, lotteryController.updateRoundStatus.bind(lotteryController));
router.post('/rounds/:roundId/reset', authenticateToken, lotteryLimiter, lotteryController.resetRound.bind(lotteryController));

export default router; 