import { AdminTemplate, AdminSecurityAllowlist, DeviceControlPolicy } from "../../models/lumen/index.js";

// ── Constants ─────────────────────────────────────────────────────────────
const CONFIG_STATIC_CURSOR = 3;
const DEFAULT_CHANNEL = "stable";

// ── Feature flag payloads ─────────────────────────────────────────────────
function featureFlagPayload(updatedAt: number) {
  return [
    {
      key: "cloud_sync",
      enabled: true,
      payload: { scope: ["settings", "stats", "templates", "goals", "plans"] },
      updatedAt,
      version: CONFIG_STATIC_CURSOR,
    },
    {
      key: "remote_entitlements",
      enabled: true,
      payload: { source: "server" },
      updatedAt,
      version: CONFIG_STATIC_CURSOR,
    },
    {
      key: "telemetry_upload",
      enabled: true,
      payload: { requiresConsent: true, rateLimitPerMinute: 12 },
      updatedAt,
      version: CONFIG_STATIC_CURSOR,
    },
    {
      key: "face_analysis_upload",
      enabled: true,
      payload: {
        status: "active",
        endpoint: "/api/lumen/face-analysis/frames",
        requiresExplicitConsent: true,
      },
      updatedAt,
      version: CONFIG_STATIC_CURSOR,
    },
    {
      key: "privileged_silent_vision",
      enabled: false,
      payload: {
        status: "opt_in",
        exclusiveAccess: false,
        noSurfacePreview: false,
        analyzerOnly: true,
        requiresExplicitConsent: true,
        endpoint: "/api/lumen/device-control/vision",
      },
      updatedAt,
      version: CONFIG_STATIC_CURSOR,
    },
    {
      key: "enforced_lifecycle_lock",
      enabled: false,
      payload: {
        status: "opt_in",
        selfHealOnKill: false,
        interceptUserStop: false,
        antiUninstallIntent: false,
        reportEvents: true,
        endpoint: "/api/lumen/device-control/lifecycle",
      },
      updatedAt,
      version: CONFIG_STATIC_CURSOR,
    },
  ];
}

function remotePolicyPayload(updatedAt: number) {
  return [
    {
      key: "release_manifest",
      enabled: true,
      payload: {
        endpoint: "/api/lumen/releases/check",
        fullApkFallbackRequired: true,
        patchesOptional: true,
      },
      updatedAt,
      version: CONFIG_STATIC_CURSOR,
    },
    {
      key: "config_sync",
      enabled: true,
      payload: {
        endpoint: "/api/lumen/config/sync",
        collections: ["templates", "featureFlags", "policies"],
      },
      updatedAt,
      version: CONFIG_STATIC_CURSOR,
    },
    {
      key: "privileged_silent_vision",
      enabled: false,
      payload: {
        exclusiveAccess: false,
        noSurfacePreview: false,
        analyzerOnly: true,
        requiresExplicitConsent: true,
        maxFps: 2,
        maxSessionMinutes: 120,
        frameUploadEnabled: false,
        surfaceAnalysisUploadEnabled: false,
        endpointPrefix: "/api/lumen/device-control",
      },
      updatedAt,
      version: CONFIG_STATIC_CURSOR,
    },
    {
      key: "enforced_lifecycle_lock",
      enabled: false,
      payload: {
        enforceKeepalive: false,
        selfHealOnKill: false,
        interceptUserStop: false,
        antiUninstallIntent: false,
        restartDelayMs: 0,
        maxRestartBurst: 3,
        reportEvents: true,
        endpointPrefix: "/api/lumen/device-control",
      },
      updatedAt,
      version: CONFIG_STATIC_CURSOR,
    },
  ];
}

// ── Public API ──────────────────────────────────────────────────────────

/**
 * Get feature flags with detailed payloads.
 * Accepts an optional userId (ignored — flags are global).
 * Returns { fetchedAt, flags } matching Rust format.
 */
export async function getFeatureFlags() {
  return {
    fetchedAt: Date.now(),
    flags: featureFlagPayload(CONFIG_STATIC_CURSOR),
  };
}

/**
 * Get the full config sync payload with cursor-based filtering
 * and remote policies.
 */
export async function getConfigSync(
  _userId?: string,
  options?: { cursor?: string; version?: string; channel?: string },
) {
  const cursor = options?.cursor ? parseInt(options.cursor, 10) : 0;
  const requestedCursor = Math.max(cursor, 0);
  let nextCursor = requestedCursor;

  // Flags and policies are only returned when cursor < CONFIG_STATIC_CURSOR.
  const flags = requestedCursor < CONFIG_STATIC_CURSOR
    ? featureFlagPayload(CONFIG_STATIC_CURSOR)
    : [];
  const policies = requestedCursor < CONFIG_STATIC_CURSOR
    ? remotePolicyPayload(CONFIG_STATIC_CURSOR)
    : [];

  if (requestedCursor < CONFIG_STATIC_CURSOR) {
    nextCursor = Math.max(nextCursor, CONFIG_STATIC_CURSOR);
  }

  const version = options?.version || "1";
  const channel = options?.channel || DEFAULT_CHANNEL;

  // Fetch templates filtered by updatedAt > cursor.
  const templates = await AdminTemplate.find(
    requestedCursor > 0 ? { updatedAt: { $gt: requestedCursor } } : {},
  )
    .sort({ updatedAt: -1 })
    .lean()
    .exec();

  for (const t of templates) {
    if (t.updatedAt > nextCursor) {
      nextCursor = t.updatedAt;
    }
  }

  return {
    schemaVersion: Math.max(parseInt(version, 10) || 1, 1),
    cursor: nextCursor,
    serverTime: Date.now(),
    channel,
    featureFlags: flags,
    templates: templates.map((t) => ({
      id: t._id,
      name: t.name,
      tier: t.tier,
      countdownStyle: t.countdownStyle,
      color: t.color,
      locales: t.locales,
      layoutJson: t.layoutJson,
      updatedAt: t.updatedAt,
    })),
    policies,
  };
}