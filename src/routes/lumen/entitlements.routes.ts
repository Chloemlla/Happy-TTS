import { Router, type Request, type Response, type NextFunction } from "express";
import { requireAuth } from "../../middleware/lumen/index.js";
import { entitlementsService } from "../../services/lumen/index.js";

const router = Router();

router.get("/", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = (req as any).user;
    const result = await entitlementsService.listEntitlements(user.id);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

export default router;