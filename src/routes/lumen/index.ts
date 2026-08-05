import { Router } from "express";
import healthRoutes from "./health.routes.js";
import authRoutes from "./auth.routes.js";
import meRoutes from "./me.routes.js";
import devicesRoutes from "./devices.routes.js";
import entitlementsRoutes from "./entitlements.routes.js";
import purchasesRoutes from "./purchases.routes.js";
import syncRoutes from "./sync.routes.js";
import backupsRoutes from "./backups.routes.js";
import telemetryRoutes from "./telemetry.routes.js";
import faceAnalysisRoutes from "./face-analysis.routes.js";
import privilegedControlRoutes from "./privileged-control.routes.js";
import adminRoutes from "./admin.routes.js";
import platformRoutes from "./platform.routes.js";

const router = Router();

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
v1Router.use("/face-analysis", faceAnalysisRoutes);
v1Router.use("/device-control", privilegedControlRoutes);
v1Router.use("/admin", adminRoutes);
v1Router.use("/", platformRoutes);

// Mount the v1 router at /api/lumen
router.use("/api/lumen", v1Router);

// Mount health routes at /api/health
router.use("/api/health", healthRoutes);

export default router;