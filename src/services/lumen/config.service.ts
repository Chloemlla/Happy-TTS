import { AdminTemplate } from "../../models/lumen/index.js";
import { getDeviceControlPolicy } from "./privileged-control.service.js";

// ── Constants ─────────────────────────────────────────────────────────────
const DEFAULT_CHANNEL = "stable";

// ── Feature flag payloads ─────────────────────────────────────────────────
// G7-36: the hardcoded copies below are fallback DEFAULTS only. The actual
// enabled state of privileged_silent_vision / enforced_lifecycle_lock is read
// from DeviceControlPolicy at request time so the client config never drifts
// from what the admin UI writes.
function featureFlagPayload(
  updatedAt: number,
  policy: Awaited<ReturnType<typeof getDeviceControlPolicy>>,
) {
  return [
    {
      key: "cloud_sync",
      enabled: true,
      payload: { scope: ["settings", "stats", "templates", "goals", "plans"] },
      updatedAt,
      version: cursorFor(updatedAt),
    },
    {
      key: "remote_entitlements",
      enabled: true,
      payload: { source: "server" },
      updatedAt,
      version: cursorFor(updatedAt),
    },
    {
      key: "telemetry_upload",
      enabled: true,
      payload: { requiresConsent: true, rateLimitPerMinute: 12 },
      updatedAt,
      version: cursorFor(updatedAt),
    },
    {
      key: "face_analysis_upload",
      enabled: true,
      payload: {
        status: "active",
        endpoint: "/api/lumen/face-analysis/frames",
        requiresExplicitConsent: policy.silentVision.requiresExplicitConsent,
      },
      updatedAt,
      version: cursorFor(updatedAt),
    },
    {
      key: "privileged_silent_vision",
      enabled: policy.silentVision.enabled,
      payload: {
        status: policy.silentVision.enabled ? "active" : "opt_in",
        exclusiveAccess: policy.silentVision.exclusiveAccess,
        noSurfacePreview: policy.silentVision.noSurfacePreview,
        analyzerOnly: policy.silentVision.analyzerOnly,
        requiresExplicitConsent: policy.silentVision.requiresExplicitConsent,
        endpoint: "/api/lumen/device-control/vision",
      },
      updatedAt,
      version: cursorFor(updatedAt),
    },
    {
      key: "enforced_lifecycle_lock",
      enabled: policy.lifecycleLock.enabled,
      payload: {
        status: policy.lifecycleLock.enabled ? "active" : "opt_in",
        selfHealOnKill: policy.lifecycleLock.selfHealOnKill,
        interceptUserStop: policy.lifecycleLock.interceptUserStop,
        antiUninstallIntent: policy.lifecycleLock.antiUninstallIntent,
        reportEvents: policy.lifecycleLock.reportEvents,
        endpoint: "/api/lumen/device-control/lifecycle",
      },
      updatedAt,
      version: cursorFor(updatedAt),
    },
  ];
}

function remotePolicyPayload(
  updatedAt: number,
  policy: Awaited<ReturnType<typeof getDeviceControlPolicy>>,
) {
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
      version: cursorFor(updatedAt),
    },
    {
      key: "config_sync",
      enabled: true,
      payload: {
        endpoint: "/api/lumen/config/sync",
        collections: ["templates", "featureFlags", "policies"],
      },
      updatedAt,
      version: cursorFor(updatedAt),
    },
    {
      key: "privileged_silent_vision",
      enabled: policy.silentVision.enabled,
      payload: {
        exclusiveAccess: policy.silentVision.exclusiveAccess,
        noSurfacePreview: policy.silentVision.noSurfacePreview,
        analyzerOnly: policy.silentVision.analyzerOnly,
        requiresExplicitConsent: policy.silentVision.requiresExplicitConsent,
        maxFps: policy.silentVision.maxFps,
        maxSessionMinutes: policy.silentVision.maxSessionMinutes,
        frameUploadEnabled: policy.silentVision.frameUploadEnabled,
        surfaceAnalysisUploadEnabled: policy.silentVision.surfaceAnalysisUploadEnabled,
        endpointPrefix: "/api/lumen/device-control",
      },
      updatedAt,
      version: cursorFor(updatedAt),
    },
    {
      key: "enforced_lifecycle_lock",
      enabled: policy.lifecycleLock.enabled,
      payload: {
        enforceKeepalive: policy.lifecycleLock.enforceKeepalive,
        selfHealOnKill: policy.lifecycleLock.selfHealOnKill,
        interceptUserStop: policy.lifecycleLock.interceptUserStop,
        antiUninstallIntent: policy.lifecycleLock.antiUninstallIntent,
        restartDelayMs: policy.lifecycleLock.restartDelayMs,
        maxRestartBurst: policy.lifecycleLock.maxRestartBurst,
        reportEvents: policy.lifecycleLock.reportEvents,
        endpointPrefix: "/api/lumen/device-control",
      },
      updatedAt,
      version: cursorFor(updatedAt),
    },
  ];
}

/**
 * G7-36: the cursor must advance when a stored policy changes, otherwise the
 * client would never re-pull flags after an admin flips silent vision. Policies
 * store `updatedAt` in epoch-milliseconds; templates store theirs the same way,
 * so we can use a single monotonically increasing cursor.
 */
function cursorFor(policyUpdatedAt: number): number {
  // Policies are stored with `updatedAt` as a number; 0 means "default".
  return policyUpdatedAt > 0 ? policyUpdatedAt : 3;
}

// ── Public API ──────────────────────────────────────────────────────────

/**
 * Get feature flags with detailed payloads.
 * Flags for privileged features are derived from the stored device-control
 * policy (global scope when no user context is supplied).
 * Returns { fetchedAt, flags } matching Rust format.
 */
export async function getFeatureFlags(userId?: string) {
  const policy = await getDeviceControlPolicy(userId || "", undefined);
  const updatedAt = cursorFor(policy.updatedAt);
  return {
    fetchedAt: Date.now(),
    flags: featureFlagPayload(updatedAt, policy),
  };
}

/**
 * Get the full config sync payload with cursor-based filtering
 * and remote policies.
 */
export async function getConfigSync(
  userId?: string,
  options?: { cursor?: string; version?: string; channel?: string },
) {
  const cursor = options?.cursor ? parseInt(options.cursor, 10) : 0;
  const requestedCursor = Math.max(cursor, 0);

  const policy = await getDeviceControlPolicy(userId || "", undefined);
  const policyUpdatedAt = cursorFor(policy.updatedAt);

  // Flags and policies are only returned when the client cursor is behind the
  // current policy/template watermark.
  const flags = requestedCursor < policyUpdatedAt
    ? featureFlagPayload(policyUpdatedAt, policy)
    : [];
  const policies = requestedCursor < policyUpdatedAt
    ? remotePolicyPayload(policyUpdatedAt, policy)
    : [];

  let nextCursor = Math.max(requestedCursor, 0);

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

  if (policyUpdatedAt > nextCursor) {
    nextCursor = policyUpdatedAt;
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
