import express from 'express';
import { fbiWantedController } from '../controllers/fbiWantedController';
import { authenticateToken } from '../middleware/authenticateToken';
import { authenticateAdmin } from '../middleware/auth';
import { createLimiter } from '../middleware/rateLimiter';

const router = express.Router();

// 公开路由 - 获取通缉犯列表和详情（供公众查看）
const publicListLimiter = createLimiter({
    windowMs: 60 * 1000,
    max: 60,
    routeName: 'fbi.public.list',
    message: '请求过于频繁，请稍后再试'
});
const publicStatisticsLimiter = createLimiter({
    windowMs: 60 * 1000,
    max: 30,
    routeName: 'fbi.public.statistics',
    message: '请求过于频繁，请稍后再试'
});
const publicDetailLimiter = createLimiter({
    windowMs: 60 * 1000,
    max: 60,
    routeName: 'fbi.public.detail',
    message: '请求过于频繁，请稍后再试'
});

router.get('/public', publicListLimiter, fbiWantedController.getAllWanted);
router.get('/public/:id', publicDetailLimiter, fbiWantedController.getWantedById);
router.get('/public/statistics', publicStatisticsLimiter, fbiWantedController.getStatistics);

// 管理员路由 - 需要认证和管理员权限

// 管理员专用路由
const adminLimiter = createLimiter({
    windowMs: 5 * 60 * 1000,
    max: 100,
    routeName: 'fbi.admin',
    message: '管理员操作过于频繁，请稍后再试'
});

router.get('/', authenticateToken, authenticateAdmin, adminLimiter, fbiWantedController.getAllWanted);
router.get('/statistics', authenticateToken, authenticateAdmin, adminLimiter, fbiWantedController.getStatistics);
router.get('/:id', authenticateToken, authenticateAdmin, adminLimiter, fbiWantedController.getWantedById);
router.post('/', authenticateToken, authenticateAdmin, adminLimiter, fbiWantedController.createWanted);
router.put('/:id', authenticateToken, authenticateAdmin, adminLimiter, fbiWantedController.updateWanted);
router.patch('/:id/status', authenticateToken, authenticateAdmin, adminLimiter, fbiWantedController.updateWantedStatus);
router.delete('/multiple', authenticateToken, authenticateAdmin, adminLimiter, fbiWantedController.deleteMultiple);
router.delete('/:id', authenticateToken, authenticateAdmin, adminLimiter, fbiWantedController.deleteWanted);
router.post('/batch-delete', authenticateToken, authenticateAdmin, adminLimiter, fbiWantedController.batchDeleteWanted);

export default router;
