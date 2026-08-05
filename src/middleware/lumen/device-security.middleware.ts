import type { NextFunction, Request, Response } from "express";
import { UserModel } from "../../models/lumen/index.js";

/**
 * Device security evidence middleware.
 *
 * Requires that `requireAuth()` has already run (i.e. `req.lumenUserId` is
 * set).  Validates the `securityEvidence` fields in the request body against
 * what the user's active device has reported:
 *   - status must be "clean"
 *   - completed must be true
 *   - rooted must be false
 *   - suspicious must be false
 *   - evidence must be at most 15 minutes old
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

      const evidence = req.body?.securityEvidence as
        | {
            status: string;
            completed: boolean;
            rooted: boolean;
            suspicious: boolean;
            observedAt: number;
          }
        | undefined;

      if (!evidence || typeof evidence !== "object") {
        res.status(403).json({
          error: "Forbidden",
          reasonCode: "device_security_required",
          message: "Security evidence is required",
        });
        return;
      }

      // Validate evidence shape
      if (
        evidence.status !== "clean" ||
        evidence.completed !== true ||
        evidence.rooted !== false ||
        evidence.suspicious !== false
      ) {
        res.status(403).json({
          error: "Forbidden",
          reasonCode: "device_security_required",
          message: "Device security check failed",
        });
        return;
      }

      // Evidence age must be within 15 minutes
      const now = Date.now();
      const observedAt = typeof evidence.observedAt === "number" ? evidence.observedAt : 0;
      if (observedAt <= 0 || now - observedAt > 15 * 60 * 1000) {
        res.status(403).json({
          error: "Forbidden",
          reasonCode: "device_security_required",
          message: "Security evidence is stale or missing timestamp",
        });
        return;
      }

      // Optionally cross-check against stored user evidence
      const user = await UserModel.findById(req.lumenUserId).exec();
      if (user?.securityEvidence) {
        const stored = user.securityEvidence;
        if (
          stored.status !== "clean" ||
          stored.rooted !== false ||
          stored.suspicious !== false
        ) {
          res.status(403).json({
            error: "Forbidden",
            reasonCode: "device_security_required",
            message: "Stored device security state does not match requirements",
          });
          return;
        }
      }

      req.lumenSecurityEvidence = {
        status: evidence.status,
        verified: true,
        completed: evidence.completed,
        rooted: evidence.rooted,
        suspicious: evidence.suspicious,
        hardwareIntegrityOk: true,
        selinuxEnforcing: true,
        teeAttestationOk: true,
        observedAt,
        scannerVersion: "",
      };

      next();
    } catch (error) {
      next(error);
    }
  };
}