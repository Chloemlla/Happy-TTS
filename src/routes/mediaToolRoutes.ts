import { type Request, type RequestHandler } from "express";
import { authenticateAdmin, authenticateSuperAdmin } from "../middleware/auth";
import { createMediaToolRouter } from "../mediaTool/http/mediaToolHttp";
import { ensureMediaJobRecovery, getMediaToolRunner, getServerMediaJobStore, getServerMediaSettingsStore, getServerTranscriptStore } from "../mediaTool/serverRuntime";

const router = createMediaToolRouter({
  mode: "server",
  store: getServerMediaJobStore(),
  transcripts: getServerTranscriptStore(),
  settingsStore: getServerMediaSettingsStore(),
  runner: getMediaToolRunner(),
  requireAdmin: authenticateAdmin as unknown as RequestHandler,
  requireSuper: authenticateSuperAdmin as unknown as RequestHandler,
  identity: (req: Request) => {
    const user = (req as Request & { user?: { username?: string; role?: string; id?: string } }).user;
    return user?.username || user?.id || "admin";
  },
});

// 进程重启自恢复(admin + 用户两类任务共用一个 runner,见 serverRuntime.ts)
ensureMediaJobRecovery();

export default router;
