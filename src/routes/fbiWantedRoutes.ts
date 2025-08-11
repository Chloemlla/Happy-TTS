import express from 'express';
import { fbiWantedController } from '../controllers/fbiWantedController';
import { authenticateToken } from '../middleware/authenticateToken';
import { authenticateAdmin } from '../middleware/auth';

const router = express.Router();

// 公开路由 - 获取通缉犯列表和详情（供公众查看）
router.get('/public', fbiWantedController.getAllWanted);
router.get('/public/:id', fbiWantedController.getWantedById);
router.get('/public/statistics', fbiWantedController.getStatistics);

// 管理员路由 - 需要认证和管理员权限

// 管理员专用路由
router.get('/', authenticateToken, authenticateAdmin, fbiWantedController.getAllWanted);
router.get('/statistics', authenticateToken, authenticateAdmin, fbiWantedController.getStatistics);
router.get('/:id', authenticateToken, authenticateAdmin, fbiWantedController.getWantedById);
router.post('/', authenticateToken, authenticateAdmin, fbiWantedController.createWanted);
router.put('/:id', authenticateToken, authenticateAdmin, fbiWantedController.updateWanted);
router.patch('/:id/status', authenticateToken, authenticateAdmin, fbiWantedController.updateWantedStatus);
router.delete('/multiple', authenticateToken, authenticateAdmin, fbiWantedController.deleteMultiple);
router.delete('/:id', authenticateToken, authenticateAdmin, fbiWantedController.deleteWanted);
router.post('/batch-delete', authenticateToken, authenticateAdmin, fbiWantedController.batchDeleteWanted);

export default router;
