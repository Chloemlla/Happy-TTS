import express from 'express';
import { getModList, getModListJson, addMod, updateMod } from '../controllers/modlistController';
import { createLimiter } from '../middleware/rateLimiter';

const router = express.Router();

const modlistLimiter = createLimiter({
  windowMs: 60 * 1000, // 1分钟
  max: 20,
  routeName: 'modlist',
  message: 'MOD操作过于频繁，请稍后再试'
});

router.get('/', modlistLimiter, getModList);
router.get('/json', modlistLimiter, getModListJson);
router.post('/', modlistLimiter, addMod);
router.put('/:id', modlistLimiter, updateMod);

export default router; 