import { Router } from 'express';
import { ShortUrlController } from '../controllers/shortUrlController';

const router = Router();

// 短链重定向（公开访问）
router.get('/:code', ShortUrlController.redirectToTarget);

// 用户短链管理（需要登录）
router.get('/shorturls', ShortUrlController.getUserShortUrls);
router.delete('/shorturls/:code', ShortUrlController.deleteShortUrl);
router.delete('/shorturls/batch', ShortUrlController.batchDeleteShortUrls);

export default router; 