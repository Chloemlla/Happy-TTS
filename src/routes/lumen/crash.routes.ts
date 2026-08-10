import { Router, type Request, type Response, type NextFunction } from "express";
import { requireAuth } from "../../middleware/lumen/index.js";
import { crashService } from "../../services/lumen/index.js";

const router = Router();

router.post("/", requireAuth(), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.lumenUserId;
    if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
    const payload = req.body;
    const result = await crashService.recordCrashReport(userId, payload);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

export default router;