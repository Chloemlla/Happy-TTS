import { Router, type Request, type Response, type NextFunction } from "express";
import { requireAuth, requireDeviceSecurity, requirePlusEntitlement } from "../../middleware/lumen/index.js";
import { backupsService } from "../../services/lumen/index.js";

const router = Router();

router.post("/", requireAuth(), requireDeviceSecurity(), requirePlusEntitlement(), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { deviceInstallationId, schemaVersion, exportedAt, backup } = req.body;
    const userId = req.lumenUserId;
    if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
    const result = await backupsService.saveBackup(userId, {
      deviceInstallationId,
      schemaVersion,
      exportedAt,
      backup,
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.get("/latest", requireAuth(), requireDeviceSecurity(), requirePlusEntitlement(), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.lumenUserId;
    if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
    const result = await backupsService.latestBackup(userId);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

export default router;