import { Router, type Request, type Response, type NextFunction } from "express";
import { requireAuth } from "../../middleware/lumen/index.js";
import { telemetryService } from "../../services/lumen/index.js";

const router = Router();

router.post("/", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.lumenUserId;
    if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
    const payload = req.body;
    const result = await telemetryService.recordTelemetryUpload(userId, payload);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.get("/debug/latest", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { deviceInstallationId } = req.query;
    const userId = req.lumenUserId;
    if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
    const result = await telemetryService.latestTelemetryDebugItems(
      userId,
      deviceInstallationId as string | undefined,
    );
    res.json(result);
  } catch (error) {
    next(error);
  }
});

export default router;