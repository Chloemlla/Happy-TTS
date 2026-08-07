import { Router, type Request, type Response, type NextFunction } from "express";
import { requireAuth, requireDeviceSecurity } from "../../middleware/lumen/index.js";
import { faceAnalysisService } from "../../services/lumen/index.js";

const MAX_FRAME_BYTE_SIZE = 2.8 * 1024 * 1024; // 2.8 MB

const router = Router();

router.post("/frames", requireAuth(), requireDeviceSecurity(), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { deviceInstallationId, capturedAt, frame, faces, processingMetrics } = req.body;

    // Validate required fields
    if (!deviceInstallationId || typeof deviceInstallationId !== "string") {
      res.status(400).json({ error: "deviceInstallationId is required and must be a string" });
      return;
    }
    if (!capturedAt || typeof capturedAt !== "string") {
      res.status(400).json({ error: "capturedAt is required and must be an ISO string" });
      return;
    }
    if (!frame || typeof frame !== "object") {
      res.status(400).json({ error: "frame is required and must be an object" });
      return;
    }

    // Validate frame fields
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

    // Validate frame size limit
    if (byteSize > MAX_FRAME_BYTE_SIZE) {
      res.status(413).json({ error: `frame.byteSize exceeds maximum of ${MAX_FRAME_BYTE_SIZE} bytes` });
      return;
    }

    const userId = req.lumenUserId;
    if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
    const result = await faceAnalysisService.recordFaceAnalysisFrame(userId, {
      deviceInstallationId,
      capturedAt,
      frame,
      faces,
      processingMetrics,
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
});

export default router;