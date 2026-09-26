/**
 * Project-Lumen 设备与会话接口（S-03）。
 *
 * 形状刻意与 `/api/auth/sessions` 对齐（devices[] / 409 CURRENT_SESSION_PROTECTED），
 * 让 Project-Lumen 的账号卡片可以复用 Synapse「设备与会话」面板的展示与交互语义。
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { requireAuth } from "../../middleware/lumen/index.js";
import { LumenSessionError, listLumenDevices, revokeLumenDevice } from "../../services/lumen/session.service.js";

const router = Router();

const DEVICE_KEY_PATTERN = /^[a-f0-9]{40}$/;

function currentToken(req: Request): string | undefined {
  return req.lumenSession?._id;
}

router.get("/", requireAuth(), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.lumenUserId;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized", reasonCode: "missing_user_context" });
      return;
    }
    const devices = await listLumenDevices(userId, currentToken(req));
    res.json({ success: true, devices });
  } catch (error) {
    next(error);
  }
});

router.post("/:deviceKey/revoke", requireAuth(), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.lumenUserId;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized", reasonCode: "missing_user_context" });
      return;
    }
    const deviceKey = typeof req.params.deviceKey === "string" ? req.params.deviceKey : "";
    if (!DEVICE_KEY_PATTERN.test(deviceKey)) {
      res.status(400).json({ error: "设备标识无效" });
      return;
    }
    const result = await revokeLumenDevice(userId, deviceKey, currentToken(req));
    res.json({ success: true, ...result });
  } catch (error) {
    if (error instanceof LumenSessionError) {
      const status = error.code === "CURRENT_SESSION_PROTECTED" ? 409 : 404;
      res.status(status).json({ error: error.message, code: error.code });
      return;
    }
    next(error);
  }
});

export default router;
