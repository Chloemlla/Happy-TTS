import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';

const router = Router();

router.get('/status', authMiddleware, (req, res) => {
  res.json({ status: 'ok' });
});

export default router; 