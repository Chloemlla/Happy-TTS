import { Router, type Request, type Response, type NextFunction } from "express";
import { requireAuth, deviceSecurity } from "../../middleware/lumen/index.js";
import { entitlementsService } from "../../services/lumen/index.js";

const router = Router();

router.post("/google/verify", requireAuth, deviceSecurity, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { productId, purchaseToken, deviceInstallationId } = req.body;
    const user = (req as any).user;
    const result = await entitlementsService.verifyGooglePurchase(
      user.id,
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