import { Router, type Request, type Response, type NextFunction } from "express";
import { requireAuth } from "../../middleware/lumen/index.js";

const router = Router();

router.get("/", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = (req as any).user;
    res.json({
      id: user.id,
      email: user.email,
      createdAt: user.createdAt,
      deviceInstallationId: user.deviceInstallationId,
    });
  } catch (error) {
    next(error);
  }
});

export default router;