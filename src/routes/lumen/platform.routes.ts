import { Router, type Request, type Response, type NextFunction } from "express";
import { requireAuth } from "../../middleware/lumen/index.js";
import { configService, releaseService } from "../../services/lumen/index.js";

const router = Router();

// Static OpenAPI 3.0.3 spec
const OPENAPI_SPEC = {
  openapi: "3.0.3",
  info: {
    title: "Project Lumen API",
    version: "1.0.0",
    description: "API for Project Lumen — eye-care and screen-time management for Android",
  },
  servers: [{ url: "/api/lumen" }],
  paths: {
    "/auth/email/start": {
      post: { summary: "Start email login", tags: ["Auth"], requestBody: { content: { "application/json": { schema: { type: "object", properties: { email: { type: "string", format: "email" } }, required: ["email"] } } } }, responses: { "200": { description: "Login request ID" } } },
    },
    "/auth/email/verify": {
      post: { summary: "Verify email login code", tags: ["Auth"], requestBody: { content: { "application/json": { schema: { type: "object", properties: { email: { type: "string" }, requestId: { type: "string" }, code: { type: "string" }, deviceInstallationId: { type: "string" } }, required: ["email", "requestId", "code"] } } } }, responses: { "200": { description: "Session tokens" } } },
    },
    "/me": {
      get: { summary: "Get current user", tags: ["User"], security: [{ bearerAuth: [] }], responses: { "200": { description: "User profile" } } },
    },
    "/devices/register": {
      post: { summary: "Register device", tags: ["Devices"], security: [{ bearerAuth: [] }], responses: { "200": { description: "Device registration" } } },
    },
    "/entitlements": {
      get: { summary: "List entitlements", tags: ["Entitlements"], security: [{ bearerAuth: [] }], responses: { "200": { description: "Entitlement list" } } },
    },
    "/purchases/google/verify": {
      post: { summary: "Verify Google Play purchase", tags: ["Purchases"], security: [{ bearerAuth: [] }], responses: { "200": { description: "Purchase verification result" } } },
    },
    "/sync/changes": {
      get: { summary: "Get sync changes since cursor", tags: ["Sync"], security: [{ bearerAuth: [] }], responses: { "200": { description: "Changes" } } },
    },
    "/sync/push": {
      post: { summary: "Push sync changes", tags: ["Sync"], security: [{ bearerAuth: [] }], responses: { "200": { description: "Sync result" } } },
    },
    "/backups": {
      post: { summary: "Upload a full JSON cloud backup", tags: ["Backups"], security: [{ bearerAuth: [] }], responses: { "200": { description: "Backup saved" } } },
    },
    "/backups/latest": {
      get: { summary: "Fetch latest JSON cloud backup", tags: ["Backups"], security: [{ bearerAuth: [] }], responses: { "200": { description: "Latest backup" } } },
    },
    "/telemetry": {
      post: { summary: "Upload telemetry", tags: ["Telemetry"], security: [{ bearerAuth: [] }], responses: { "200": { description: "Telemetry recorded" } } },
    },
    "/face-analysis/frames": {
      post: { summary: "Record face analysis frame", tags: ["Face Analysis"], security: [{ bearerAuth: [] }], responses: { "200": { description: "Frame recorded" } } },
    },
    "/device-control/policy": {
      get: { summary: "Get device control policy", tags: ["Device Control"], security: [{ bearerAuth: [] }], responses: { "200": { description: "Policy" } } },
    },
    "/config/feature-flags": {
      get: { summary: "Get feature flags", tags: ["Config"], security: [{ bearerAuth: [] }], responses: { "200": { description: "Feature flags" } } },
    },
    "/config/sync": {
      get: { summary: "Get config sync", tags: ["Config"], security: [{ bearerAuth: [] }], responses: { "200": { description: "Config sync response" } } },
    },
    "/releases/check": {
      get: { summary: "Check for release update", tags: ["Releases"], responses: { "200": { description: "Release check result" } } },
    },
  },
  components: {
    securitySchemes: {
      bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
    },
  },
};

router.get("/openapi.json", (_req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(OPENAPI_SPEC);
  } catch (error) {
    next(error);
  }
});

router.get("/config/feature-flags", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.lumenUserId;
    if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
    const result = await configService.getFeatureFlags(userId);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.get("/config/sync", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { cursor, version, channel } = req.query;
    const userId = req.lumenUserId;
    if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
    const result = await configService.getConfigSync(userId, {
      cursor: cursor as string | undefined,
      version: version as string | undefined,
      channel: channel as string | undefined,
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.get("/releases/check", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { currentVersionCode, abi, channel, rolloutKey } = req.query;
    const result = await releaseService.checkRelease({
      currentVersionCode: currentVersionCode ? Number(currentVersionCode) : undefined,
      abi: abi as string | undefined,
      channel: channel as string | undefined,
      rolloutKey: rolloutKey as string | undefined,
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
});

export default router;