import { Router } from 'express';
import { ShortUrlController } from '../controllers/shortUrlController';
import { authMiddleware, adminAuthMiddleware } from '../middleware/authMiddleware';
import { createLimiter } from '../middleware/rateLimiter';

const router = Router();

// 速率限制器
const redirectLimiter = createLimiter({
    windowMs: 60 * 1000, // 1分钟
    max: 120,
    routeName: 'shorturl.redirect',
    message: '访问过于频繁，请稍后再试'
});

const userManageLimiter = createLimiter({
    windowMs: 60 * 1000, // 1分钟
    max: 30,
    routeName: 'shorturl.userManage',
    message: '操作过于频繁，请稍后再试'
});

const adminLimiter = createLimiter({
    windowMs: 5 * 60 * 1000, // 5分钟
    max: 50,
    routeName: 'shorturl.admin',
    message: '管理员操作过于频繁，请稍后再试'
});

// 短链重定向（公开访问）
router.get('/:code', redirectLimiter, ShortUrlController.redirectToTarget);

// 用户短链管理（需要登录）
router.get('/shorturls', authMiddleware, userManageLimiter, ShortUrlController.getUserShortUrls);
router.delete('/shorturls/:code', authMiddleware, userManageLimiter, ShortUrlController.deleteShortUrl);
router.delete('/shorturls/batch', authMiddleware, userManageLimiter, ShortUrlController.batchDeleteShortUrls);

// 管理员功能：导出所有短链数据
router.get('/admin/export', authMiddleware, adminAuthMiddleware, adminLimiter, ShortUrlController.exportAllShortUrls);

// 管理员功能：删除所有短链数据
router.delete('/admin/deleteall', authMiddleware, adminAuthMiddleware, adminLimiter, ShortUrlController.deleteAllShortUrls);

// 管理员功能：导入短链数据
router.post('/admin/import', authMiddleware, adminAuthMiddleware, adminLimiter, ShortUrlController.importShortUrls);

export default router;