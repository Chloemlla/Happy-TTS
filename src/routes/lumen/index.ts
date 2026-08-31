import { Router } from "express";
import type { RequestHandler } from "express";
import { isLumenEnabled } from "../../config/lumen.js";
import { lumenLimiter } from "../../middleware/routeLimiters.js";
import healthRoutes from "./health.routes.js";
import authRoutes from "./auth.routes.js";
import meRoutes from "./me.routes.js";
import devicesRoutes from "./devices.routes.js";
import entitlementsRoutes from "./entitlements.routes.js";
import purchasesRoutes from "./purchases.routes.js";
import syncRoutes from "./sync.routes.js";
import backupsRoutes from "./backups.routes.js";
import telemetryRoutes from "./telemetry.routes.js";
import crashRoutes from "./crash.routes.js";
import faceAnalysisRoutes from "./face-analysis.routes.js";
import privilegedControlRoutes from "./privileged-control.routes.js";
import adminRoutes from "./admin.routes.js";
import platformRoutes from "./platform.routes.js";

const router = Router();

// Fail-closed gate: when Lumen is not enabled the whole subsystem returns 503.
// Scoped to the /api/lumen prefix (the router is mounted at "/" in app.ts, so an
// unscoped gate would block every host route). Enabled state is read per request,
// so the admin UI can turn Lumen on without a redeploy.
const lumenGate: RequestHandler = (_req, res, next) => {
  if (!isLumenEnabled()) {
    res.status(503).json({
      error: "Lumen 未启用",
      message: "Lumen 服务未启用，请在环境变量 LUMEN_ENABLED=true 或管理后台「Lumen 服务端配置」中启用。",
    });
    return;
  }
  next();
};
router.use("/api/lumen", lumenGate);

// Build the /api/v1 sub-router with all versioned routes
const v1Router = Router();
v1Router.use("/auth", authRoutes);
v1Router.use("/me", meRoutes);
v1Router.use("/devices", devicesRoutes);
v1Router.use("/entitlements", entitlementsRoutes);
v1Router.use("/purchases", purchasesRoutes);
v1Router.use("/sync", syncRoutes);
v1Router.use("/backups", backupsRoutes);
v1Router.use("/telemetry", telemetryRoutes);
v1Router.use("/crash-report", crashRoutes);
v1Router.use("/face-analysis", faceAnalysisRoutes);
v1Router.use("/device-control", privilegedControlRoutes);
v1Router.use("/admin", adminRoutes);
v1Router.use("/", platformRoutes);

// Mount the v1 router at /api/lumen, with the Lumen rate limiter scoped to it
// so non-Lumen routes on the host (TTS, static, etc.) are not throttled by it.
router.use("/api/lumen", lumenLimiter, v1Router);

// Mount lumen health at a path that doesn't collide with the canonical
// /api/health (mounted earlier by the pre-parser phase) so this router is reachable.
router.use("/api/lumen/health", healthRoutes);

export default router;