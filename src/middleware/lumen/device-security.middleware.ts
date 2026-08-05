import type { NextFunction, Request, Response } from "express";
import { User } from "../../models/lumen/index.js";

/**
 * Device security evidence middleware.
 *
 * Requires that `requireAuth()` has already run (i.e. `req.lumenUserId` is
 * set).  Validates the stored `securityEvidence` on the user record:
 *   - status must be "clean"
 *   - completed must be true
 *   - rooted must be false
 *   - suspicious must be false
 *   - hardwareIntegrityOk must not be false
 *   - selinuxEnforcing must not be false
 *   - teeAttestationOk must not be false
 *   - evidence must be at most 15 minutes old
 *   - requested deviceInstallationId must match the user's record
 *
 * Response: 403 with reasonCode "device_security_required" on failure.
 */
export function requireDeviceSecurity(): (req: Request, res: Response, next: NextFunction) => void {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.lumenUserId) {
        res.status(401).json({ error: "Unauthorized", reasonCode: "auth_required" });
        return;
      }

      const requestedDeviceId = req.body?.deviceInstallationId as string | undefined;
      if (!requestedDeviceId || requestedDeviceId.trim() === "") {
        res.status(403).json({
          error: "Forbidden",
          reasonCode: "device_security_required",
          message: "A recent verified device security status is required for this operation.",
        });
        return;
      }

      // Fetch the user's stored security evidence.
      const user = await User.findById(req.lumenUserId).lean().exec();
      if (!user) {
        res.status(403).json({
          error: "Forbidden",
          reasonCode: "device_security_required",
          message: "A recent verified device security status is required for this operation.",
        });
        return;
      }

      // Validate device installation ID matches.
      if (requestedDeviceId.trim() !== user.deviceInstallationId) {
        res.status(403).json({
          error: "Forbidden",
          reasonCode: "device_security_required",
          message: "A recent verified device security status is required for this operation.",
        });
        return;
      }

      const evidence = user.deviceSecurityEvidence;
      if (!evidence || typeof evidence !== "object") {
        res.status(403).json({
          error: "Forbidden",
          reasonCode: "device_security_required",
          message: "A recent verified device security status is required for this operation.",
        });
        return;
      }

      const now = Date.now();
      const observedAt = typeof evidence.observedAt === "number" ? evidence.observedAt : 0;

      const clean =
        evidence.status === "clean" &&
        evidence.completed === true &&
        evidence.rooted === false &&
        evidence.suspicious === false &&
        evidence.hardwareIntegrityOk !== false &&
        evidence.selinuxEnforcing !== false &&
        evidence.teeAttestationOk !== false &&
        observedAt > 0 &&
        now - observedAt <= 15 * 60 * 1000;

      if (!clean) {
        res.status(403).json({
          error: "Forbidden",
          reasonCode: "device_security_required",
          message: "A recent verified device security status is required for this operation.",
        });
        return;
      }

      req.lumenSecurityEvidence = {
        status: evidence.status,
        verified: true,
        completed: evidence.completed,
        rooted: evidence.rooted,
        suspicious: evidence.suspicious,
        hardwareIntegrityOk: evidence.hardwareIntegrityOk,
        selinuxEnforcing: evidence.selinuxEnforcing,
        teeAttestationOk: evidence.teeAttestationOk,
        observedAt,
        scannerVersion: evidence.scannerVersion || "",
      };

      next();
    } catch (error) {
      next(error);
    }
  };
}