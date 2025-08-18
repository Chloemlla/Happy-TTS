import { Router, Request, Response } from 'express';
import { authenticateToken } from '../middleware/authenticateToken';
import { authenticateAdmin } from '../middleware/auth';
import { dataCollectionLimiter } from '../middleware/routeLimiters';
import { dataCollectionService } from '../services/dataCollectionService';
import logger from '../utils/logger';

const router = Router();

// Admin-only guard
const guard = [dataCollectionLimiter, authenticateToken, authenticateAdmin] as const;

// GET /api/data-collection/admin/stats
router.get('/stats', ...guard, async (req: Request, res: Response) => {
  try {
    const stats = await dataCollectionService.stats();
    res.json({ success: true, data: stats });
  } catch (e: any) {
    logger.error('[DataCollectionAdmin] stats error:', e);
    res.status(500).json({ success: false, message: e?.message || 'stats error' });
  }
});

// GET /api/data-collection/admin
router.get('/', ...guard, async (req: Request, res: Response) => {
  try {
    const { page, limit, userId, action, start, end, sort } = req.query as any;
    const result = await dataCollectionService.list({
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      userId,
      action,
      start,
      end,
      sort: sort === 'asc' ? 'asc' : 'desc',
    });
    res.json({ success: true, ...result });
  } catch (e: any) {
    logger.error('[DataCollectionAdmin] list error:', e);
    res.status(500).json({ success: false, message: e?.message || 'list error' });
  }
});

// POST /api/data-collection/admin
router.post('/', ...guard, async (req: Request, res: Response) => {
  try {
    const { userId, action, timestamp, details } = (req.body || {}) as any;
    const payload = {
      userId,
      action,
      timestamp: timestamp || new Date().toISOString(),
      details: details ?? {},
    };
    const result = await dataCollectionService.saveData(payload, 'mongo');
    res.json({ success: true, result });
  } catch (e: any) {
    logger.error('[DataCollectionAdmin] create error:', e);
    res.status(400).json({ success: false, message: e?.message || 'create error' });
  }
});

// GET /api/data-collection/admin/:id
router.get('/:id', ...guard, async (req: Request, res: Response) => {
  try {
    const item = await dataCollectionService.getById(req.params.id);
    if (!item) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, data: item });
  } catch (e: any) {
    logger.error('[DataCollectionAdmin] getById error:', e);
    res.status(500).json({ success: false, message: e?.message || 'get error' });
  }
});

// GET /api/data-collection/admin/:id/raw
router.get('/:id/raw', ...guard, async (req: Request, res: Response) => {
  try {
    const item = await dataCollectionService.getById(req.params.id);
    if (!item) return res.status(404).json({ success: false, message: 'Not found' });
    const raw = dataCollectionService.decryptRawDetails(item);
    if (!raw) return res.status(404).json({ success: false, message: 'No raw available' });
    res.json({ success: true, data: raw });
  } catch (e: any) {
    logger.error('[DataCollectionAdmin] getRaw error:', e);
    res.status(500).json({ success: false, message: e?.message || 'raw error' });
  }
});

// DELETE /api/data-collection/admin/:id
router.delete('/:id', ...guard, async (req: Request, res: Response, next) => {
  try {
    if (req.params.id === 'all') return next();
    const result = await dataCollectionService.deleteById(req.params.id);
    res.json({ success: result.deleted });
  } catch (e: any) {
    logger.error('[DataCollectionAdmin] deleteById error:', e);
    res.status(500).json({ success: false, message: e?.message || 'delete error' });
  }
});

// POST /api/data-collection/admin/delete-batch
router.post('/delete-batch', ...guard, async (req: Request, res: Response) => {
  try {
    const { ids } = (req.body || {}) as { ids?: string[] };
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, message: 'ids required' });
    }
    const result = await dataCollectionService.deleteBatch(ids);
    res.json({ success: true, ...result });
  } catch (e: any) {
    logger.error('[DataCollectionAdmin] deleteBatch error:', e);
    res.status(500).json({ success: false, message: e?.message || 'delete batch error' });
  }
});

// DELETE /api/data-collection/admin/all
router.delete('/all', ...guard, async (req: Request, res: Response) => {
  try {
    const { confirm } = (req.body || {}) as { confirm?: boolean };
    const { statusCode, body } = await dataCollectionService.deleteAllAction({ confirm });
    logger.info('[DataCollectionAdmin] deleteAllAction', { statusCode, body });
    res.status(statusCode).json(body);
  } catch (e: any) {
    logger.error('[DataCollectionAdmin] deleteAll error:', e);
    res.status(500).json({ success: false, message: e?.message || 'delete all error' });
  }
});

export default router;
