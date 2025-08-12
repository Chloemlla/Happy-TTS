import { Router } from 'express';
import { ShortUrlController } from '../controllers/shortUrlController';
import { authMiddleware, adminAuthMiddleware } from '../middleware/authMiddleware';

const router = Router();

// 短链重定向（公开访问）
router.get('/:code', ShortUrlController.redirectToTarget);

// 用户短链管理（需要登录）
router.get('/shorturls', ShortUrlController.getUserShortUrls);
router.delete('/shorturls/:code', ShortUrlController.deleteShortUrl);
router.delete('/shorturls/batch', ShortUrlController.batchDeleteShortUrls);

// 管理员功能：导出所有短链数据
router.get('/admin/export', authMiddleware, adminAuthMiddleware, ShortUrlController.exportAllShortUrls);

// 管理员功能：删除所有短链数据
router.delete('/admin/deleteall', authMiddleware, adminAuthMiddleware, ShortUrlController.deleteAllShortUrls);

// 管理员功能：导入短链数据
router.post('/admin/import', authMiddleware, adminAuthMiddleware, ShortUrlController.importShortUrls);

export default router;