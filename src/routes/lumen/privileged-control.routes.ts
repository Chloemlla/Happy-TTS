import { Router, type Request, type Response, type NextFunction } from "express";
import { requireAuth, requireDeviceSecurity } from "../../middleware/lumen/index.js";
import { privilegedControlService } from "../../services/lumen/index.js";

const MAX_FRAME_BYTE_SIZE = 2.8 * 1024 * 1024; // 2.8 MB

const router = Router();

router.get("/policy", requireAuth(), requireDeviceSecurity(), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { deviceInstallationId } = req.query;
    const userId = req.lumenUserId;
    if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
    const result = await privilegedControlService.getDeviceControlPolicy(
      userId,
      deviceInstallationId as string,
    );
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.post("/vision/sessions", requireAuth(), requireDeviceSecurity(), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.lumenUserId;
    if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
    const result = await privilegedControlService.startVisionSession(userId, req.body);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.post("/vision/heartbeat", requireAuth(), requireDeviceSecurity(), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.lumenUserId;
    if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
    const result = await privilegedControlService.heartbeatVisionSession(userId, req.body);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.post("/vision/frames", requireAuth(), requireDeviceSecurity(), async (req: Request, res: Response, next: NextFunction) => {
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
      res.status(400).json({ error: 'frame.encoding must be "base64"' });
      return;
    }
    if (byteSize > MAX_FRAME_BYTE_SIZE) {
      res.status(413).json({ error: `frame.byteSize exceeds maximum of ${MAX_FRAME_BYTE_SIZE} bytes` });
      return;
    }
    const userId = req.lumenUserId;
    if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
    const result = await privilegedControlService.uploadVisionFrame(userId, req.body, "default");
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.post("/vision/surface-frames", requireAuth(), requireDeviceSecurity(), async (req: Request, res: Response, next: NextFunction) => {
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
      res.status(400).json({ error: 'frame.encoding must be "base64"' });
      return;
    }
    if (byteSize > MAX_FRAME_BYTE_SIZE) {
      res.status(413).json({ error: `frame.byteSize exceeds maximum of ${MAX_FRAME_BYTE_SIZE} bytes` });
      return;
    }
    const userId = req.lumenUserId;
    if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
    const result = await privilegedControlService.uploadVisionFrame(userId, req.body, "surface");
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.post("/lifecycle/events", requireAuth(), requireDeviceSecurity(), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.lumenUserId;
    if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
    const result = await privilegedControlService.recordLifecycleEvent(userId, req.body);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

export default router;