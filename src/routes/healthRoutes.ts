import { Router } from "express";
import { getStartupDiagnosticsReport } from "../config/startupDiagnostics";
import { authenticateToken } from "../middleware/authenticateToken";
import { isConnected as isMongoConnected } from "../services/mongoService";
import { wsService } from "../services/wsService";

const router = Router();

function buildPublicHealthPayload() {
  const mongo = isMongoConnected();
  const report = getStartupDiagnosticsReport();
  const requiredFailures = report?.summary.requiredFailures || 0;
  const status = mongo && requiredFailures === 0 ? "ok" : "degraded";

  return {
    status,
    mongo: mongo ? "connected" : "disconnected",
    timestamp: new Date().toISOString(),
  } as const;
}

function buildDetailedHealthPayload() {
  const publicPayload = buildPublicHealthPayload();
  const report = getStartupDiagnosticsReport();

  return {
    ...publicPayload,
    uptime: process.uptime(),
    wsConnections: wsService.getConnectionCount(),
    startupReadiness: report?.summary || null,
    dependencies: report?.dependencies || [],
  };
}

// Public liveness/readiness: coarse status only. Keep probe-friendly semantics.
router.get("/", (_req, res) => {
  const payload = buildPublicHealthPayload();
  res.status(payload.status === "ok" ? 200 : 503).json(payload);
});

// Detailed diagnostics require an authenticated admin session.
router.get("/details", authenticateToken, (req, res) => {
  const user = (req as { user?: { role?: string } }).user;
  if (!user || user.role !== "admin") {
    return res.status(403).json({ error: "需要管理员权限" });
  }

  const payload = buildDetailedHealthPayload();
  return res.status(payload.status === "ok" ? 200 : 503).json(payload);
});

export default router;
