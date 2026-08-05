import { Router, type Request, type Response, type NextFunction } from "express";
import { requireAuth } from "../../middleware/lumen/index.js";

const router = Router();

router.post("/register", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = (req as any).user;
    const {
      deviceInstallationId,
      deviceFingerprint,
      model,
      versionCode,
      localSecurityConfig,
      securityEvidence,
    } = req.body;

    // Validate required field
    if (!deviceInstallationId || typeof deviceInstallationId !== "string" || deviceInstallationId.trim().length === 0) {
      res.status(400).json({ error: "deviceInstallationId is required and must be a non-empty string" });
      return;
    }

    // Normalize deviceInstallationId
    const normalizedDeviceId = deviceInstallationId.trim();

    // Validate optional fields
    const normalizedFingerprint = deviceFingerprint && typeof deviceFingerprint === "string"
      ? deviceFingerprint.trim()
      : undefined;

    const normalizedModel = model && typeof model === "string"
      ? model.trim()
      : undefined;

    const normalizedVersionCode = versionCode && typeof versionCode === "number"
      ? versionCode
      : undefined;

    // Update user with device registration info
    // This is a placeholder — the actual service call would go here
    const response = {
      id: user.id,
      deviceInstallationId: normalizedDeviceId,
      deviceFingerprint: normalizedFingerprint || null,
      model: normalizedModel || null,
      versionCode: normalizedVersionCode || null,
      registeredAt: new Date().toISOString(),
    };

    res.json(response);
  } catch (error) {
    next(error);
  }
});

export default router;