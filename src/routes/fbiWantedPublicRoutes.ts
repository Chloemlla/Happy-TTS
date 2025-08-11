import express from 'express';
import { fbiWantedController } from '../controllers/fbiWantedController';

// 仅公开接口，不做任何鉴权
const publicRouter = express.Router();

publicRouter.get('/', fbiWantedController.getAllWanted);
publicRouter.get('/statistics', fbiWantedController.getStatistics);
publicRouter.get('/:id', fbiWantedController.getWantedById);

export default publicRouter;
