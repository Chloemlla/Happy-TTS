import { Router, type Request, type Response, type NextFunction } from "express";
import { requireAuth, requireDeviceSecurity, requirePlusEntitlement } from "../../middleware/lumen/index.js";
import { syncService } from "../../services/lumen/index.js";

const router = Router();

router.get("/changes", requireAuth(), requireDeviceSecurity(), requirePlusEntitlement(), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { since } = req.query;
    const userId = req.lumenUserId;
    if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
    const result = await syncService.changesSince(userId, since as string);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.post("/push", requireAuth(), requireDeviceSecurity(), requirePlusEntitlement(), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { changes, cursor, deviceInstallationId } = req.body;
    const userId = req.lumenUserId;
    if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
    const result = await syncService.pushChanges(userId, changes, cursor, deviceInstallationId);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

export default router;