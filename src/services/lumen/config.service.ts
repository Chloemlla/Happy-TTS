import { AdminTemplate, AdminSecurityAllowlist, DeviceControlPolicy } from "../../models/lumen/index.js";

// ── Static feature flags ────────────────────────────────────────────────
const STATIC_FEATURE_FLAGS = [
  { key: "sync", enabled: true, description: "Cloud sync of app data" },
  { key: "backups", enabled: true, description: "Cloud backup and restore" },
  { key: "telemetry", enabled: true, description: "Usage telemetry collection" },
  { key: "face_analysis", enabled: true, description: "Face analysis and distance estimation" },
  { key: "silent_vision", enabled: false, description: "Silent vision mode (behind entitlement)" },
  { key: "lifecycle_management", enabled: true, description: "Process lifecycle management" },
  { key: "device_security", enabled: true, description: "Device security evidence attestation" },
  { key: "release_updates", enabled: true, description: "Over-the-air update checks" },
  { key: "admin_dashboard", enabled: true, description: "Web admin dashboard" },
];

// ── Public API ──────────────────────────────────────────────────────────

/**
 * Get the static list of feature flags.
 * Accepts an optional userId (ignored — flags are global).
 */
export async function getFeatureFlags(_userId?: string): Promise<Array<{ key: string; enabled: boolean; description: string }>> {
  return STATIC_FEATURE_FLAGS;
}

/**
 * Get the full config sync payload.
 * Accepts an optional userId (ignored — config is global).
 */
export async function getConfigSync(
  _userId?: string,
  options?: { cursor?: string; version?: string; channel?: string },
) {
  const cursor = options?.cursor;
  const version = options?.version;
  const channel = options?.channel;
  const [templates, policies, allowlist] = await Promise.all([
    AdminTemplate.find().sort({ updatedAt: -1 }).lean().exec(),
    DeviceControlPolicy.find({ scope: "global" }).lean().exec(),
    AdminSecurityAllowlist.find().sort({ updatedAt: -1 }).lean().exec(),
  ]);

  const featureFlags = await getFeatureFlags();

  return {
    schemaVersion: version || "1.0",
    cursor: cursor || "0",
    serverTime: new Date().toISOString(),
    channel: channel || "stable",
    featureFlags,
    templates: templates.map((t) => ({
      id: t._id,
      name: t.name,
      tier: t.tier,
      countdownStyle: t.countdownStyle,
      color: t.color,
      locales: t.locales,
      layout: t.layoutJson,
      updatedAt: t.updatedAt,
    })),
    policies: policies.map((p) => ({
      scope: p.scope,
      silentVision: p.silentVision,
      lifecycleLock: p.lifecycleLock,
      updatedAt: p.updatedAt,
    })),
  };
}