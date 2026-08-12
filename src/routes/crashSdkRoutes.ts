import { Router } from "express";
import { crashSdkLimiter } from "../middleware/routeLimiters.js";
import { ApiError } from "../services/lumen/errors.js";
import { recordCrashReport } from "../services/lumen/index.js";

const router = Router();

/**
 * Anonymous, best-effort ingest for the lumen-crash-core SDK.
 *
 * The SDK POSTs every persisted crash/watchdog report here by default, with no
 * configuration and no Session. This route deliberately avoids requireAuth():
 * per-device rate limiting and reportId idempotency are enforced inside
 * recordCrashReport, and the anonymous userId is derived from the device ID.
 */
router.post("/v1/crash-report", crashSdkLimiter, async (req, res) => {
  try {
    const payload = (req.body ?? {}) as Record<string, unknown>;
    const deviceInstallationId =
      typeof payload.deviceInstallationId === "string" ? payload.deviceInstallationId.trim() : "";
    if (!deviceInstallationId) {
      res.status(400).json({ accepted: false, error: "deviceInstallationId is required" });
      return;
    }
    const userId = `sdk:${deviceInstallationId}`;
    const result = await recordCrashReport(
      userId,
      payload as unknown as Parameters<typeof recordCrashReport>[1],
    );
    res.status(200).json(result);
  } catch (error) {
    if (error instanceof ApiError) {
      res.status(error.statusCode).json({ accepted: false, error: error.message });
      return;
    }
    // Best-effort: never surface a 500 to the SDK; the client ignores failures.
    res.status(200).json({ accepted: false });
  }
});

export default router;
