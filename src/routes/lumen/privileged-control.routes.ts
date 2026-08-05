import { Router, type Request, type Response, type NextFunction } from "express";
import { requireAuth, deviceSecurity } from "../../middleware/lumen/index.js";
import { privilegedControlService } from "../../services/lumen/index.js";

const MAX_FRAME_BYTE_SIZE = 2.8 * 1024 * 1024; // 2.8 MB

const router = Router();

router.get("/policy", requireAuth, deviceSecurity, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { deviceInstallationId } = req.query;
    const user = (req as any).user;
    const result = await privilegedControlService.getDeviceControlPolicy(
      user.id,
      deviceInstallationId as string,
    );
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.post("/vision/sessions", requireAuth, deviceSecurity, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = (req as any).user;
    const result = await privilegedControlService.startVisionSession(user.id, req.body);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.post("/vision/heartbeat", requireAuth, deviceSecurity, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = (req as any).user;
    const result = await privilegedControlService.heartbeatVisionSession(user.id, req.body);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.post("/vision/frames", requireAuth, deviceSecurity, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { frame } = req.body;
    if (!frame || typeof frame !== "object") {
      res.status(400).json({ error: "frame is required and must be an object" });
      return;
    }
    const { width, height, byteSize, dataBase64, encoding } = frame;
    if (typeof width !== "number" || width <= 0) {
      res.status(400).json({ error: "frame.width must be a positive number" });
      return;
    }
    if (typeof height !== "number" || height <= 0) {
      res.status(400).json({ error: "frame.height must be a positive number" });
      return;
    }
    if (typeof byteSize !== "number" || byteSize <= 0) {
      res.status(400).json({ error: "frame.byteSize must be a positive number" });
      return;
    }
    if (typeof dataBase64 !== "string" || dataBase64.length === 0) {
      res.status(400).json({ error: "frame.dataBase64 must be a non-empty string" });
      return;
    }
    if (encoding !== "base64") {
      res.status(400).json({ error: "frame.encoding must be \"base64\"" });
      return;
    }
    if (byteSize > MAX_FRAME_BYTE_SIZE) {
      res.status(413).json({ error: `frame.byteSize exceeds maximum of ${MAX_FRAME_BYTE_SIZE} bytes` });
      return;
    }
    const user = (req as any).user;
    const result = await privilegedControlService.uploadVisionFrame(user.id, req.body, "default");
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.post("/vision/surface-frames", requireAuth, deviceSecurity, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { frame } = req.body;
    if (!frame || typeof frame !== "object") {
      res.status(400).json({ error: "frame is required and must be an object" });
      return;
    }
    const { width, height, byteSize, dataBase64, encoding } = frame;
    if (typeof width !== "number" || width <= 0) {
      res.status(400).json({ error: "frame.width must be a positive number" });
      return;
    }
    if (typeof height !== "number" || height <= 0) {
      res.status(400).json({ error: "frame.height must be a positive number" });
      return;
    }
    if (typeof byteSize !== "number" || byteSize <= 0) {
      res.status(400).json({ error: "frame.byteSize must be a positive number" });
      return;
    }
    if (typeof dataBase64 !== "string" || dataBase64.length === 0) {
      res.status(400).json({ error: "frame.dataBase64 must be a non-empty string" });
      return;
    }
    if (encoding !== "base64") {
      res.status(400).json({ error: "frame.encoding must be \"base64\"" });
      return;
    }
    if (byteSize > MAX_FRAME_BYTE_SIZE) {
      res.status(413).json({ error: `frame.byteSize exceeds maximum of ${MAX_FRAME_BYTE_SIZE} bytes` });
      return;
    }
    const user = (req as any).user;
    const result = await privilegedControlService.uploadVisionFrame(user.id, req.body, "surface");
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.post("/lifecycle/events", requireAuth, deviceSecurity, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = (req as any).user;
    const result = await privilegedControlService.recordLifecycleEvent(user.id, req.body);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

export default router;