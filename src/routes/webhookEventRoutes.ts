import { type Request, type Response, Router } from "express";
import { authenticateAdmin } from "../middleware/auth";
import { WebhookEventService } from "../services/webhookEventService";
import { firstString, firstStringOr } from "../utils/httpParam";

const router = Router();

// List with pagination & filters
router.get("/", authenticateAdmin, async (req: Request, res: Response) => {
  try {
    const page = parseInt(firstStringOr(req.query.page, "1"), 10);
    const pageSize = parseInt(firstStringOr(req.query.pageSize, "20"), 10);
    // 可选过滤：routeKey, type, status
    const routeKeyParam = firstString(req.query.routeKey);
    const type = firstString(req.query.type) || undefined;
    const status = firstString(req.query.status) || undefined;
    // 支持 routeKey=null 表示未分组
    const routeKey = routeKeyParam === "null" ? null : routeKeyParam || undefined;
    const result = await WebhookEventService.list({ page, pageSize, routeKey, type, status });
    res.json({ success: true, ...result });
  } catch (e) {
    res.status(500).json({ success: false, error: e instanceof Error ? e.message : String(e) });
  }
});

// Group list by routeKey
router.get("/groups", authenticateAdmin, async (_req: Request, res: Response) => {
  try {
    const rows = await WebhookEventService.groups();
    res.json({ success: true, groups: rows });
  } catch (e) {
    res.status(500).json({ success: false, error: e instanceof Error ? e.message : String(e) });
  }
});

// Get by id
router.get("/:id", authenticateAdmin, async (req: Request, res: Response) => {
  try {
    const id = firstString(req.params.id);
    if (!id) return res.status(400).json({ success: false, error: "Invalid ID" });
    const item = await WebhookEventService.get(id);
    if (!item) return res.status(404).json({ success: false, error: "Not Found" });
    res.json({ success: true, item });
  } catch (e) {
    res.status(500).json({ success: false, error: e instanceof Error ? e.message : String(e) });
  }
});

// Create (manual add)
router.post("/", authenticateAdmin, async (req: Request, res: Response) => {
  try {
    const created = await WebhookEventService.create(req.body);
    res.json({ success: true, item: created });
  } catch (e) {
    res.status(500).json({ success: false, error: e instanceof Error ? e.message : String(e) });
  }
});

// Update
router.put("/:id", authenticateAdmin, async (req: Request, res: Response) => {
  try {
    const id = firstString(req.params.id);
    if (!id) return res.status(400).json({ success: false, error: "Invalid ID" });
    const updated = await WebhookEventService.update(id, req.body);
    if (!updated) return res.status(404).json({ success: false, error: "Not Found" });
    res.json({ success: true, item: updated });
  } catch (e) {
    res.status(500).json({ success: false, error: e instanceof Error ? e.message : String(e) });
  }
});

// Delete
router.delete("/:id", authenticateAdmin, async (req: Request, res: Response) => {
  try {
    const id = firstString(req.params.id);
    if (!id) return res.status(400).json({ success: false, error: "Invalid ID" });
    await WebhookEventService.remove(id);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e instanceof Error ? e.message : String(e) });
  }
});

export default router;
