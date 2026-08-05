import { Router, type Request, type Response, type NextFunction } from "express";
import { requireAuth, deviceSecurity, plusEntitlement } from "../../middleware/lumen/index.js";
import { backupsService } from "../../services/lumen/index.js";

const router = Router();

router.post("/", requireAuth, deviceSecurity, plusEntitlement, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { deviceInstallationId, schemaVersion, exportedAt, backup } = req.body;
    const user = (req as any).user;
    const result = await backupsService.saveBackup(user.id, {
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

router.get("/latest", requireAuth, deviceSecurity, plusEntitlement, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = (req as any).user;
    const result = await backupsService.latestBackup(user.id);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

export default router;