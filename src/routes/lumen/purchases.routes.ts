import { Router, type Request, type Response, type NextFunction } from "express";
import { requireAuth, requireDeviceSecurity } from "../../middleware/lumen/index.js";
import { entitlementsService } from "../../services/lumen/index.js";

const router = Router();

router.post("/google/verify", requireAuth, requireDeviceSecurity, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { productId, purchaseToken, deviceInstallationId } = req.body;
    const userId = req.lumenUserId;
    if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
    const result = await entitlementsService.verifyGooglePurchase(
      userId,
      productId,
      purchaseToken,
      deviceInstallationId,
    );
    res.json(result);
  } catch (error) {
    next(error);
  }
});

export default router;