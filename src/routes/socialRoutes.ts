import { Router } from 'express';
import { SocialController } from '../controllers/socialController';

const router = Router();

/**
 * @route GET /api/social/weibo-hot
 * @desc 微博热搜
 * @access Public
 */
router.get('/weibo-hot', SocialController.weiboHot);

/**
 * @route GET /api/social/baidu-hot
 * @desc 百度热搜
 * @access Public
 */
router.get('/baidu-hot', SocialController.baiduHot);

export default router; 