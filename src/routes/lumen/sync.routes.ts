import { Router, type Request, type Response, type NextFunction } from "express";
import { requireAuth, deviceSecurity, plusEntitlement } from "../../middleware/lumen/index.js";
import { syncService } from "../../services/lumen/index.js";

const router = Router();

router.get("/changes", requireAuth, deviceSecurity, plusEntitlement, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { since } = req.query;
    const user = (req as any).user;
    const result = await syncService.changesSince(user.id, since as string);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.post("/push", requireAuth, deviceSecurity, plusEntitlement, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { changes, cursor, deviceInstallationId } = req.body;
    const user = (req as any).user;
    const result = await syncService.pushChanges(user.id, changes, cursor, deviceInstallationId);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

export default router;