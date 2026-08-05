import { Router, type Request, type Response, type NextFunction } from "express";
import { requireAuth } from "../../middleware/lumen/index.js";
import { User } from "../../models/lumen/index.js";

const router = Router();

router.get("/", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.lumenUserId;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized", reasonCode: "auth_required" });
      return;
    }

    const user = await User.findById(userId).lean().exec();
    if (!user) {
      res.status(404).json({ error: "Not Found", reasonCode: "user_not_found" });
      return;
    }

    res.json({
      id: user._id,
      email: user.email,
      createdAt: user.createdAt || null,
      deviceInstallationId: user.deviceInstallationId,
    });
  } catch (error) {
    next(error);
  }
});

export default router;