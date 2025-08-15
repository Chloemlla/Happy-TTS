import { Router, Request, Response } from 'express';
import { authenticateAdmin } from '../middleware/auth';
import { WebhookEventService } from '../services/webhookEventService';

const router = Router();

// List with pagination
router.get('/', authenticateAdmin, async (req: Request, res: Response) => {
  try {
    const page = parseInt((req.query.page as string) || '1', 10);
    const pageSize = parseInt((req.query.pageSize as string) || '20', 10);
    const result = await WebhookEventService.list({ page, pageSize });
    res.json({ success: true, ...result });
  } catch (e) {
    res.status(500).json({ success: false, error: e instanceof Error ? e.message : String(e) });
  }
});

// Get by id
router.get('/:id', authenticateAdmin, async (req: Request, res: Response) => {
  try {
    const item = await WebhookEventService.get(req.params.id);
    if (!item) return res.status(404).json({ success: false, error: 'Not Found' });
    res.json({ success: true, item });
  } catch (e) {
    res.status(500).json({ success: false, error: e instanceof Error ? e.message : String(e) });
  }
});

// Create (manual add)
router.post('/', authenticateAdmin, async (req: Request, res: Response) => {
  try {
    const created = await WebhookEventService.create(req.body);
    res.json({ success: true, item: created });
  } catch (e) {
    res.status(500).json({ success: false, error: e instanceof Error ? e.message : String(e) });
  }
});

// Update
router.put('/:id', authenticateAdmin, async (req: Request, res: Response) => {
  try {
    const updated = await WebhookEventService.update(req.params.id, req.body);
    if (!updated) return res.status(404).json({ success: false, error: 'Not Found' });
    res.json({ success: true, item: updated });
  } catch (e) {
    res.status(500).json({ success: false, error: e instanceof Error ? e.message : String(e) });
  }
});

// Delete
router.delete('/:id', authenticateAdmin, async (req: Request, res: Response) => {
  try {
    await WebhookEventService.remove(req.params.id);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e instanceof Error ? e.message : String(e) });
  }
});

export default router;
