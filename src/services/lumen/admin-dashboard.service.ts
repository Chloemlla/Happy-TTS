import {
  User,
  Entitlement,
  SyncChange,
  Backup,
  TelemetryUpload,
  FaceAnalysisFrame,
  VisionStreamSession,
  LifecycleEvent,
  DeviceControlPolicy,
  AdminSession,
  AdminAccessAudit,
  AdminActionAudit,
  AdminCrashReport,
  AdminApiMetric,
  AdminSyncMetric,
  AdminTemplate,
  AdminTelemetry,
  AdminRelease,
  AdminSecurityAllowlist,
} from "../../models/lumen/index.js";

// ── Public API ──────────────────────────────────────────────────────────

/**
 * Aggregate a full admin dashboard snapshot from all collections.
 */
export async function adminDashboardSnapshot() {
  const now = Date.now();

  const [
    recentUsers,
    userCount,
    entitlements,
    accessAudit,
    actionAudit,
    crashReports,
    apiMetrics,
    syncMetrics,
    templates,
    telemetry,
    releases,
    allowlist,
    backups,
    devices,
    visionSessions,
    lifecycleEvents,
    deviceControlPolicies,
    syncChanges,
    faceAnalysisFrames,
    telemetryUploads,
    totalSessionsCount,
    totalBackupsCount,
    totalTelemetryCount,
    totalFaceFramesCount,
    totalLifecycleEventsCount,
    totalSyncChangesCount,
  ] = await Promise.all([
    // Recent 25 users
    User.find().sort({ createdAt: -1 }).limit(25).lean().exec(),

    // Total user count
    User.countDocuments().exec(),

    // Recent entitlements
    Entitlement.find().sort({ purchasedAt: -1 }).limit(25).lean().exec(),

    // Recent access audit
    AdminAccessAudit.find().sort({ at: -1 }).limit(25).lean().exec(),

    // Recent action audit
    AdminActionAudit.find().sort({ recordedAt: -1 }).limit(25).lean().exec(),

    // Crash reports
    AdminCrashReport.find().sort({ lastSeenAt: -1 }).limit(25).lean().exec(),

    // API metrics
    AdminApiMetric.find().sort({ sampledAt: -1 }).limit(25).lean().exec(),

    // Sync metrics
    AdminSyncMetric.find().sort({ sampledAt: -1 }).limit(25).lean().exec(),

    // Templates
    AdminTemplate.find().sort({ updatedAt: -1 }).limit(25).lean().exec(),

    // Telemetry aggregates
    AdminTelemetry.find().sort({ sampledAt: -1 }).limit(25).lean().exec(),

    // Releases
    AdminRelease.find().sort({ createdAt: -1 }).limit(25).lean().exec(),

    // Security allowlist
    AdminSecurityAllowlist.find().sort({ updatedAt: -1 }).limit(25).lean().exec(),

    // Backups
    Backup.find().sort({ uploadedAt: -1 }).limit(25).lean().exec(),

    // Device registrations (from User model)
    User.find({ deviceInstallationId: { $exists: true, $ne: null } })
      .sort({ updatedAt: -1 })
      .limit(25)
      .lean()
      .exec(),

    // Vision sessions
    VisionStreamSession.find().sort({ lastHeartbeatAt: -1 }).limit(25).lean().exec(),

    // Lifecycle events
    LifecycleEvent.find().sort({ receivedAt: -1 }).limit(25).lean().exec(),

    // Device control policies
    DeviceControlPolicy.find().limit(100).lean().exec(),

    // Recent sync changes
    SyncChange.find().sort({ cursor: -1 }).limit(25).lean().exec(),

    // Recent face analysis frames
    FaceAnalysisFrame.find().sort({ receivedAt: -1 }).limit(25).lean().exec(),

    // Recent telemetry uploads
    TelemetryUpload.find().sort({ receivedAt: -1 }).limit(25).lean().exec(),

    // G7-35: summary totals must be real counts, not `limit(25)` array lengths.
    VisionStreamSession.countDocuments().exec(),
    Backup.countDocuments().exec(),
    TelemetryUpload.countDocuments().exec(),
    FaceAnalysisFrame.countDocuments().exec(),
    LifecycleEvent.countDocuments().exec(),
    SyncChange.countDocuments().exec(),
  ]);

  // Compute sync times from user data.
  const syncTimes = recentUsers
    .filter((u) => u.updatedAt)
    .map((u) => ({
      userId: u._id,
      email: u.email,
      lastSyncAt: new Date(u.updatedAt!).toISOString(),
    }));

  // G7-36: derive feature flags from the stored device-control policy instead of
  // a third hardcoded copy that drifts from config.service.ts / the admin write
  // path. The dashboard is read-only, so it simply mirrors what the client sees.
  const globalPolicy = deviceControlPolicies.find((p) => p.scope === "global") || deviceControlPolicies[0];
  const silentVision = globalPolicy?.silentVision;
  const lifecycleLock = globalPolicy?.lifecycleLock;
  const dashboardFlags = [
    { key: "cloud_sync", enabled: true, payload: { scope: ["settings", "stats", "templates", "goals", "plans"] } },
    { key: "remote_entitlements", enabled: true, payload: { source: "server" } },
    { key: "telemetry_upload", enabled: true, payload: { requiresConsent: true, rateLimitPerMinute: 12 } },
    { key: "face_analysis_upload", enabled: true, payload: { status: "active", endpoint: "/api/lumen/face-analysis/frames", requiresExplicitConsent: silentVision?.requiresExplicitConsent ?? true } },
    { key: "privileged_silent_vision", enabled: silentVision?.enabled ?? false, payload: { status: silentVision?.enabled ? "active" : "opt_in", exclusiveAccess: silentVision?.exclusiveAccess ?? false, noSurfacePreview: silentVision?.noSurfacePreview ?? false, analyzerOnly: silentVision?.analyzerOnly ?? true, requiresExplicitConsent: silentVision?.requiresExplicitConsent ?? true, endpoint: "/api/lumen/device-control/vision" } },
    { key: "enforced_lifecycle_lock", enabled: lifecycleLock?.enabled ?? false, payload: { status: lifecycleLock?.enabled ? "active" : "opt_in", selfHealOnKill: lifecycleLock?.selfHealOnKill ?? false, interceptUserStop: lifecycleLock?.interceptUserStop ?? false, antiUninstallIntent: lifecycleLock?.antiUninstallIntent ?? false, reportEvents: lifecycleLock?.reportEvents ?? true, endpoint: "/api/lumen/device-control/lifecycle" } },
  ];

  return {
    snapshotAt: new Date(now).toISOString(),
    summary: {
      totalUsers: userCount,
      totalSessions: totalSessionsCount,
      totalBackups: totalBackupsCount,
      totalTelemetry: totalTelemetryCount,
      totalFaceFrames: totalFaceFramesCount,
      totalLifecycleEvents: totalLifecycleEventsCount,
      totalSyncChanges: totalSyncChangesCount,
    },
    users: {
      recent: recentUsers.map((u) => ({
        id: u._id,
        email: u.email,
        emailVerified: u.emailVerified,
        deviceInstallationId: u.deviceInstallationId,
        deviceFingerprint: u.deviceFingerprint,
        deviceAssetModel: u.deviceAssetModel,
        deviceAssetVersionCode: u.deviceAssetVersionCode,
        createdAt: u.createdAt ? new Date(u.createdAt).toISOString() : null,
        updatedAt: u.updatedAt ? new Date(u.updatedAt).toISOString() : null,
      })),
      total: userCount,
    },
    syncTimes,
    featureFlags: dashboardFlags,
    entitlements: entitlements.map((e) => ({
      id: e._id,
      userId: e.userId,
      source: e.source,
      productId: e.productId,
      tier: e.tier,
      status: e.status,
      purchasedAt: e.purchasedAt ? new Date(e.purchasedAt).toISOString() : null,
      expiresAt: e.expiresAt ? new Date(e.expiresAt).toISOString() : null,
      lastVerifiedAt: e.lastVerifiedAt ? new Date(e.lastVerifiedAt).toISOString() : null,
    })),
    accessAudit: accessAudit.map((a) => ({
      id: a._id,
      at: a.at ? new Date(a.at).toISOString() : null,
      userId: a.userId,
      endpoint: a.endpoint,
      ip: a.ip,
      geo: a.geo,
      status: a.status,
    })),
    purchaseAudit: actionAudit
      .filter((a) => a.action === "change-plan" || a.action === "revoke-pro")
      .map((a) => ({
        id: a._id,
        operator: a.operator,
        action: a.action,
        payload: a.payload,
        recordedAt: a.recordedAt ? new Date(a.recordedAt).toISOString() : null,
      })),
    backups: backups.map((b) => ({
      id: b._id,
      userId: b.userId,
      schemaVersion: b.schemaVersion,
      uploadedAt: b.uploadedAt ? new Date(b.uploadedAt).toISOString() : null,
    })),
    crashGroups: crashReports.map((c) => ({
      id: c._id,
      groupKey: c.groupKey,
      versionCode: c.versionCode,
      count: c.count,
      affectedUsers: c.affectedUsers,
      risk: c.risk,
      cleanStack: c.cleanStack,
      lastSeenAt: c.lastSeenAt ? new Date(c.lastSeenAt).toISOString() : null,
    })),
    apiMetrics: apiMetrics.map((m) => ({
      id: m._id,
      endpoint: m.endpoint,
      qps: m.qps,
      p95Ms: m.p95Ms,
      status2xx: m.status2xx,
      status4xx: m.status4xx,
      status5xx: m.status5xx,
      sampledAt: m.sampledAt ? new Date(m.sampledAt).toISOString() : null,
    })),
    syncMetrics: syncMetrics.map((m) => ({
      id: m._id,
      endpoint: m.endpoint,
      averagePayloadKb: m.averagePayloadKb,
      largestPayloadKb: m.largestPayloadKb,
      p95Ms: m.p95Ms,
      rejectedPayloads: m.rejectedPayloads,
      sampledAt: m.sampledAt ? new Date(m.sampledAt).toISOString() : null,
    })),
    templates: templates.map((t) => ({
      id: t._id,
      name: t.name,
      tier: t.tier,
      countdownStyle: t.countdownStyle,
      color: t.color,
      locales: t.locales,
      updatedAt: t.updatedAt ? new Date(t.updatedAt).toISOString() : null,
    })),
    audioMatrix: [], // Placeholder — audio matrix is not yet implemented.
    telemetry: telemetry.map((t) => ({
      id: t._id,
      label: t.label,
      value: t.value,
      rangeDays: t.rangeDays,
      sampledAt: t.sampledAt ? new Date(t.sampledAt).toISOString() : null,
    })),
    releases: releases.map((r) => ({
      id: r._id,
      versionCode: r.versionCode,
      versionName: r.versionName,
      channel: r.channel,
      releaseUrl: r.releaseUrl,
      rollout: r.rollout,
      forceUpdate: r.forceUpdate,
      createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : null,
      assets: r.assets?.map((a) => ({
        abi: a.abi,
        name: a.name,
        url: a.url,
        sha256: a.sha256,
        sizeBytes: a.sizeBytes,
        contentType: a.contentType,
      })),
      patches: r.patches?.map((p) => ({
        fromVersionCode: p.fromVersionCode,
        fromSha256: p.fromSha256,
        toSha256: p.toSha256,
        patchUrl: p.patchUrl,
        patchSha256: p.patchSha256,
        algorithm: p.algorithm,
        sizeBytes: p.sizeBytes,
      })),
    })),
    allowlist: allowlist.map((a) => ({
      id: a._id,
      origin: a.origin,
      protocol: a.protocol,
      risk: a.risk,
      updatedAt: a.updatedAt ? new Date(a.updatedAt).toISOString() : null,
    })),
    devices: devices.map((d) => ({
      userId: d._id,
      email: d.email,
      deviceInstallationId: d.deviceInstallationId,
      deviceFingerprint: d.deviceFingerprint,
      deviceAssetModel: d.deviceAssetModel,
      deviceAssetVersionCode: d.deviceAssetVersionCode,
      lastSeenAt: d.updatedAt ? new Date(d.updatedAt).toISOString() : null,
    })),
    visionSessions: visionSessions.map((s) => ({
      id: s._id,
      userId: s.userId,
      deviceInstallationId: s.deviceInstallationId,
      status: s.status,
      startedAt: s.startedAt ? new Date(s.startedAt).toISOString() : null,
      lastHeartbeatAt: s.lastHeartbeatAt ? new Date(s.lastHeartbeatAt).toISOString() : null,
      framesCaptured: s.framesCaptured,
      framesUploaded: s.framesUploaded,
    })),
    lifecycleEvents: lifecycleEvents.map((e) => ({
      id: e._id,
      userId: e.userId,
      deviceInstallationId: e.deviceInstallationId,
      eventType: e.eventType,
      processName: e.processName,
      reason: e.reason,
      selfHealed: e.selfHealed,
      restartCount: e.restartCount,
      receivedAt: e.receivedAt ? new Date(e.receivedAt).toISOString() : null,
    })),
    deviceControlPolicy: deviceControlPolicies.map((p) => ({
      id: p._id,
      scope: p.scope,
      userId: p.userId,
      deviceInstallationId: p.deviceInstallationId,
      silentVision: p.silentVision,
      lifecycleLock: p.lifecycleLock,
      updatedAt: p.updatedAt ? new Date(p.updatedAt).toISOString() : null,
      updatedBy: p.updatedBy,
    })),
  };
}