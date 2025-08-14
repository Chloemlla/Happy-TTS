import express from 'express';
import { fbiWantedController } from '../controllers/fbiWantedController';
import { authenticateToken } from '../middleware/authenticateToken';
import { authenticateAdmin } from '../middleware/auth';
import { createLimiter } from '../middleware/rateLimiter';
import multer from 'multer';

const router = express.Router();

// 文件上传中间件（内存存储，限制5MB）
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

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

// 针对头像上传的更严格限流（避免文件上传被滥用）
const uploadPhotoLimiter = createLimiter({
    windowMs: 15 * 60 * 1000,
    max: 20,
    routeName: 'fbi.admin.photo_upload',
    message: '头像上传过于频繁，请稍后再试'
});

router.get('/', adminLimiter, authenticateToken, authenticateAdmin, fbiWantedController.getAllWanted);
router.get('/statistics', adminLimiter, authenticateToken, authenticateAdmin, fbiWantedController.getStatistics);
router.get('/:id', adminLimiter, authenticateToken, authenticateAdmin, fbiWantedController.getWantedById);
router.post('/', adminLimiter, authenticateToken, authenticateAdmin, fbiWantedController.createWanted);
router.put('/:id', adminLimiter, authenticateToken, authenticateAdmin, fbiWantedController.updateWanted);
router.patch('/:id/status', adminLimiter, authenticateToken, authenticateAdmin, fbiWantedController.updateWantedStatus);
router.patch('/:id/photo', uploadPhotoLimiter, authenticateToken, authenticateAdmin, upload.single('photo'), fbiWantedController.updateWantedPhoto);
router.delete('/multiple', adminLimiter, authenticateToken, authenticateAdmin, fbiWantedController.deleteMultiple);
router.delete('/:id', adminLimiter, authenticateToken, authenticateAdmin, fbiWantedController.deleteWanted);
router.post('/batch-delete', adminLimiter, authenticateToken, authenticateAdmin, fbiWantedController.batchDeleteWanted);

export default router;
