import { Router } from "express";
import { getStartupDiagnosticsReport } from "../config/startupDiagnostics";
import { isAdminRole } from "../middleware/auth";
import { authenticateToken } from "../middleware/authenticateToken";
import { adminLimiter, createLimiter } from "../middleware/routeLimiters";
import {
  getMissingConfigurationIssues,
  notifyAdminsForFrontendVisit,
} from "../services/configurationNoticeService";
import { isConnected as isMongoConnected } from "../services/mongoService";
import { wsService } from "../services/wsService";
import { getTtsProviderCapabilityReadiness } from "../tts/tts.readiness";
import logger from "../utils/logger";

const router = Router();
const frontendVisitLimiter = createLimiter({
  name: "frontend-configuration-visit",
  category: "status",
  profile: "relaxed",
  max: 20,
  message: "访问通知请求过于频繁，请稍后再试",
});

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

async function buildDetailedHealthPayload() {
  const publicPayload = buildPublicHealthPayload();
  const report = getStartupDiagnosticsReport();
  const ttsCapabilities = await getTtsProviderCapabilityReadiness().catch(() => [
    {
      name: "openai" as const,
      required: false as const,
      status: "skipped" as const,
      message: "OpenAI TTS 配置状态暂不可用",
      active: false,
      configured: false,
    },
    {
      name: "fish" as const,
      required: false as const,
      status: "skipped" as const,
      message: "Fish Audio TTS 配置状态暂不可用",
      active: false,
      configured: false,
    },
  ]);
  const nonTtsDependencies = (report?.dependencies || []).filter(
    (dependency) => dependency.name !== "openai" && dependency.name !== "fish",
  );

  return {
    ...publicPayload,
    uptime: process.uptime(),
    wsConnections: wsService.getConnectionCount(),
    startupReadiness: report?.summary || null,
    dependencies: [...nonTtsDependencies, ...ttsCapabilities],
  };
}

// Public liveness/readiness: coarse status only. Keep probe-friendly semantics.
router.get("/", (_req, res) => {
  const payload = buildPublicHealthPayload();
  res.status(payload.status === "ok" ? 200 : 503).json(payload);
});

// The frontend calls this once per browser session. The backend performs persistent,
// configuration-fingerprint deduplication before recording or pushing an admin notice.
router.post("/frontend-visit", frontendVisitLimiter, async (_req, res) => {
  try {
    await notifyAdminsForFrontendVisit();
    return res.status(202).json({ accepted: true });
  } catch (error) {
    logger.warn("[Config] Failed to process frontend visit configuration notice", {
      error: error instanceof Error ? error.message : String(error),
    });
    return res.status(503).json({ accepted: false });
  }
});

router.get("/configuration-notice", adminLimiter, authenticateToken, async (req, res) => {
  const user = (req as { user?: { role?: string } }).user;
  if (!user || !isAdminRole(user.role)) {
    return res.status(403).json({ error: "需要管理员权限" });
  }

  try {
    const issues = await getMissingConfigurationIssues();
    return res.json({ success: true, issues });
  } catch (error) {
    logger.warn("[Config] Failed to read configuration notice status", {
      error: error instanceof Error ? error.message : String(error),
    });
    return res.status(503).json({ success: false, error: "读取配置状态失败" });
  }
});

// Detailed diagnostics require an authenticated admin session.
router.get("/details", adminLimiter, authenticateToken, async (req, res) => {
  const user = (req as { user?: { role?: string } }).user;
  if (!user || !isAdminRole(user.role)) {
    return res.status(403).json({ error: "需要管理员权限" });
  }

  const payload = await buildDetailedHealthPayload();
  return res.status(payload.status === "ok" ? 200 : 503).json(payload);
});

export default router;
