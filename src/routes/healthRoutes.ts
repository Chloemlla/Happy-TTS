import { Router } from "express";
import { getStartupDiagnosticsReport } from "../config/startupDiagnostics";
import { isConnected as isMongoConnected } from "../services/mongoService";
import { wsService } from "../services/wsService";

const router = Router();

router.get("/", (_req, res) => {
  const mongo = isMongoConnected();
  const report = getStartupDiagnosticsReport();
  const requiredFailures = report?.summary.requiredFailures || 0;
  const status = mongo && requiredFailures === 0 ? "ok" : "degraded";

  res.status(status === "ok" ? 200 : 503).json({
    status,
    uptime: process.uptime(),
    mongo: mongo ? "connected" : "disconnected",
    wsConnections: wsService.getConnectionCount(),
    startupReadiness: report?.summary || null,
    dependencies: report?.dependencies || [],
    timestamp: new Date().toISOString(),
  });
});

export default router;

