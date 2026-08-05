import { Router, type Request, type Response, type NextFunction } from "express";
import { User } from "../../models/lumen/index.js";
import { requireAuth } from "../../middleware/lumen/index.js";

const router = Router();

router.post("/register", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.lumenUserId;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized", reasonCode: "auth_required" });
      return;
    }

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
      res.status(400).json({ error: "Bad Request", reasonCode: "device_installation_id_required", message: "deviceInstallationId is required and must be a non-empty string" });
      return;
    }

    const normalizedDeviceId = deviceInstallationId.trim();
    const normalizedFingerprint = deviceFingerprint && typeof deviceFingerprint === "string"
      ? deviceFingerprint.trim()
      : undefined;
    const normalizedModel = model && typeof model === "string"
      ? model.trim()
      : undefined;
    const normalizedVersionCode = versionCode && typeof versionCode === "number"
      ? versionCode
      : undefined;

    // Build update document matching Rust UserRecord fields.
    const update: Record<string, unknown> = {
      deviceInstallationId: normalizedDeviceId,
      updatedAt: Date.now(),
    };

    if (normalizedFingerprint) {
      update.deviceFingerprint = normalizedFingerprint;
    }
    if (normalizedModel) {
      update.deviceAssetModel = normalizedModel;
    }
    if (normalizedVersionCode) {
      update.deviceAssetVersionCode = normalizedVersionCode;
    }
    if (localSecurityConfig && typeof localSecurityConfig === "string") {
      update.deviceAssetSecurityConfig = localSecurityConfig.trim();
    }
    if (securityEvidence && typeof securityEvidence === "object") {
      update.deviceSecurityEvidence = securityEvidence;
    }

    const user = await User.findByIdAndUpdate(userId, { $set: update }, { new: true }).lean().exec();

    if (!user) {
      res.status(404).json({ error: "Not Found", reasonCode: "user_not_found" });
      return;
    }

    res.json({
      id: user._id,
      deviceInstallationId: user.deviceInstallationId,
      deviceFingerprint: user.deviceFingerprint || null,
      model: user.deviceAssetModel || null,
      versionCode: user.deviceAssetVersionCode || null,
      registeredAt: Date.now(),
    });
  } catch (error) {
    next(error);
  }
});

export default router;