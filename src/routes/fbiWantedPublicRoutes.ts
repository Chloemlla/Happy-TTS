import express from 'express';
import { fbiWantedController } from '../controllers/fbiWantedController';
import { createLimiter } from '../middleware/rateLimiter';

// 仅公开接口，不做任何鉴权
const publicRouter = express.Router();

// 速率限制器（公开接口）
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

publicRouter.get('/', publicListLimiter, fbiWantedController.getAllWanted);
publicRouter.get('/statistics', publicStatisticsLimiter, fbiWantedController.getStatistics);
publicRouter.get('/:id', publicDetailLimiter, fbiWantedController.getWantedById);

export default publicRouter;
