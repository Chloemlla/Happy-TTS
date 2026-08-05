import { Router, type Request, type Response, type NextFunction } from "express";
import { authService } from "../../services/lumen/index.js";
import { rateLimiter } from "../../middleware/lumen/index.js";

const router = Router();

router.post("/email/start", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email } = req.body;
    const result = await authService.startEmailLogin(email);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.post("/email/verify", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, requestId, code, deviceInstallationId } = req.body;
    const result = await authService.verifyEmailLogin(email, requestId, code, deviceInstallationId);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.post("/session/refresh", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { refreshToken, deviceInstallationId } = req.body;
    const result = await authService.refreshSession(refreshToken, deviceInstallationId);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

export default router;