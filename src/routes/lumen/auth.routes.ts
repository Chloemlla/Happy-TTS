import { Router, type Request, type Response, type NextFunction } from "express";
import { authService } from "../../services/lumen/index.js";
import { resolveLumenClientInfo } from "../../utils/lumenClientIdentity";

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
    // S-02：官方客户端身份随登录一起落库，否则「设备与会话」认不出
    // 「Project-Lumen / Android」。header 里的 X-Device-Id 优先于 body，和主账号一致。
    const identity = resolveLumenClientInfo(req);
    const result = await authService.verifyEmailLogin(
      email,
      requestId,
      code,
      deviceInstallationId || identity.deviceInstallationId,
      identity,
    );
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.post("/session/refresh", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { refreshToken, deviceInstallationId } = req.body;
    const identity = resolveLumenClientInfo(req);
    const result = await authService.refreshSession(
      refreshToken,
      deviceInstallationId || identity.deviceInstallationId,
      identity,
    );
    res.json(result);
  } catch (error) {
    next(error);
  }
});

export default router;
