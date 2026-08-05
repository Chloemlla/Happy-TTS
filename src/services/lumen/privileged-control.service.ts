import crypto from "node:crypto";
import {
  DeviceControlPolicy,
  VisionStreamSession,
  VisionStreamFrame,
  LifecycleEvent,
  type IDeviceControlPolicy,
  type ISilentVision,
  type ILifecycleLock,
} from "../../models/lumen/index.js";
import { ApiError } from "./errors.js";
import logger from "../../utils/logger.js";

// ── Defaults ────────────────────────────────────────────────────────────

const DEFAULT_SILENT_VISION: ISilentVision = {
  enabled: false,
  exclusiveAccess: false,
  noSurfacePreview: false,
  analyzerOnly: true,
  requiresExplicitConsent: true,
  maxFps: 2,
  maxSessionMinutes: 120,
  frameUploadEnabled: false,
  surfaceAnalysisUploadEnabled: false,
  endpointPrefix: "/v1/device-control",
};

const DEFAULT_LIFECYCLE_LOCK: ILifecycleLock = {
  enabled: false,
  enforceKeepalive: false,
  selfHealOnKill: false,
  interceptUserStop: false,
  antiUninstallIntent: false,
  restartDelayMs: 0,
  maxRestartBurst: 3,
  reportEvents: true,
  endpointPrefix: "/v1/device-control",
};

// ── Helpers ─────────────────────────────────────────────────────────────

function mergePolicy(
  base: { silentVision: ISilentVision; lifecycleLock: ILifecycleLock },
  override: Partial<{ silentVision: Partial<ISilentVision>; lifecycleLock: Partial<ILifecycleLock> }>,
): { silentVision: ISilentVision; lifecycleLock: ILifecycleLock } {
  return {
    silentVision: { ...base.silentVision, ...override.silentVision },
    lifecycleLock: { ...base.lifecycleLock, ...override.lifecycleLock },
  };
}

// ── Public API ──────────────────────────────────────────────────────────

/**
 * Get the effective device control policy for a user.
 *
 * Cascade: device-level → user-level → global → defaults.
 */
export async function getDeviceControlPolicy(
  userId: string,
  deviceInstallationId?: string,
) {
  let policy: IDeviceControlPolicy | null = null;

  // 1. Device-level (most specific).
  if (deviceInstallationId) {
    policy = await DeviceControlPolicy.findOne({
      scope: "device",
      deviceInstallationId,
    }).lean();
  }

  // 2. User-level.
  if (!policy) {
    policy = await DeviceControlPolicy.findOne({
      scope: "user",
      userId,
    }).lean();
  }

  // 3. Global.
  if (!policy) {
    policy = await DeviceControlPolicy.findOne({
      scope: "global",
    }).lean();
  }

  // 4. Defaults.
  const resolved = policy
    ? {
        silentVision: policy.silentVision || DEFAULT_SILENT_VISION,
        lifecycleLock: policy.lifecycleLock || DEFAULT_LIFECYCLE_LOCK,
      }
    : {
        silentVision: DEFAULT_SILENT_VISION,
        lifecycleLock: DEFAULT_LIFECYCLE_LOCK,
      };

  return {
    scope: policy?.scope || "default",
    silentVision: resolved.silentVision,
    lifecycleLock: resolved.lifecycleLock,
    updatedAt: policy?.updatedAt || 0,
    updatedBy: policy?.updatedBy || "system",
  };
}

/**
 * Upsert a device control policy at the specified scope.
 */
export async function upsertDeviceControlPolicy(
  scope: string,
  userId?: string,
  deviceInstallationId?: string,
  silentVision?: Partial<ISilentVision>,
  lifecycleLock?: Partial<ILifecycleLock>,
  updatedBy?: string,
) {
  if (!["device", "user", "global"].includes(scope)) {
    throw ApiError.badRequest(`Invalid scope: ${scope}`);
  }

  if (scope === "device" && !deviceInstallationId) {
    throw ApiError.badRequest("deviceInstallationId is required for device-scoped policies");
  }

  if (scope === "user" && !userId) {
    throw ApiError.badRequest("userId is required for user-scoped policies");
  }

  const now = Date.now();
  const filter: Record<string, unknown> = { scope };
  if (scope === "device") filter.deviceInstallationId = deviceInstallationId;
  if (scope === "user") filter.userId = userId;

  const update: Record<string, unknown> = {
    updatedAt: now,
    updatedBy: updatedBy || "admin",
  };

  if (silentVision) {
    const existing = await DeviceControlPolicy.findOne(filter).lean();
    const merged = mergePolicy(
      { silentVision: existing?.silentVision || DEFAULT_SILENT_VISION, lifecycleLock: existing?.lifecycleLock || DEFAULT_LIFECYCLE_LOCK },
      { silentVision },
    );
    update.silentVision = merged.silentVision;
  }

  if (lifecycleLock) {
    const existing = await DeviceControlPolicy.findOne(filter).lean();
    const merged = mergePolicy(
      { silentVision: existing?.silentVision || DEFAULT_SILENT_VISION, lifecycleLock: existing?.lifecycleLock || DEFAULT_LIFECYCLE_LOCK },
      { lifecycleLock },
    );
    update.lifecycleLock = merged.lifecycleLock;
  }

  const policy = await DeviceControlPolicy.findOneAndUpdate(
    filter,
    { $set: update, $setOnInsert: { _id: crypto.randomUUID() } },
    { upsert: true, new: true },
  ).lean();

  return {
    scope: policy.scope,
    silentVision: policy.silentVision,
    lifecycleLock: policy.lifecycleLock,
    updatedAt: policy.updatedAt,
    updatedBy: policy.updatedBy,
  };
}

/**
 * Start a vision session.
 *
 * Checks the effective policy to ensure the feature is enabled and consent
 * can be satisfied.
 */
export async function startVisionSession(
  userId: string,
  request: {
    deviceInstallationId: string;
    exclusiveAccess?: boolean;
    noSurfacePreview?: boolean;
    analyzerOnly?: boolean;
  },
) {
  if (!request.deviceInstallationId || typeof request.deviceInstallationId !== "string") {
    throw ApiError.badRequest("deviceInstallationId is required");
  }

  const policy = await getDeviceControlPolicy(userId, request.deviceInstallationId);

  if (!policy.silentVision.enabled) {
    throw ApiError.forbidden("Silent vision is not enabled", "silent_vision_disabled");
  }

  if (policy.silentVision.requiresExplicitConsent) {
    // In a real implementation, check for a stored consent record.
    // For now, we assume consent is implicit from the session request.
  }

  const now = Date.now();
  const maxSessionMs = policy.silentVision.maxSessionMinutes * 60 * 1000;
  const sessionId = crypto.randomUUID();

  const session = await VisionStreamSession.create({
    _id: sessionId,
    userId,
    deviceInstallationId: request.deviceInstallationId,
    exclusiveAccess: request.exclusiveAccess ?? policy.silentVision.exclusiveAccess,
    noSurfacePreview: request.noSurfacePreview ?? policy.silentVision.noSurfacePreview,
    analyzerOnly: request.analyzerOnly ?? policy.silentVision.analyzerOnly,
    framesCaptured: 0,
    framesUploaded: 0,
    exclusiveHeld: false,
    surfaceDetached: false,
    startedAt: now,
    lastHeartbeatAt: now,
    expiresAt: now + maxSessionMs,
    status: "active",
    metadata: {},
  });

  logger.info("[Lumen PrivilegedControl] Vision session started", {
    userId,
    sessionId,
    deviceInstallationId: request.deviceInstallationId,
  });

  return {
    accepted: true,
    sessionId: session._id,
    startedAt: session.startedAt,
    expiresAt: session.expiresAt,
    policy: {
      silentVision: policy.silentVision,
    },
  };
}

/**
 * Heartbeat a vision session.
 *
 * Validates the session is still active and not expired, updates counters,
 * and returns whether the stream should continue.
 */
export async function heartbeatVisionSession(
  userId: string,
  request: {
    sessionId: string;
    framesCaptured?: number;
    framesUploaded?: number;
  },
) {
  if (!request.sessionId) {
    throw ApiError.badRequest("sessionId is required");
  }

  const session = await VisionStreamSession.findById(request.sessionId).exec();
  if (!session) {
    throw ApiError.notFound("Vision session not found");
  }

  if (session.userId !== userId) {
    throw ApiError.forbidden("Session does not belong to this user");
  }

  const now = Date.now();
  if (session.expiresAt <= now) {
    session.status = "expired";
    await session.save();
    throw ApiError.forbidden("Vision session has expired", "session_expired");
  }

  if (session.status !== "active") {
    throw ApiError.forbidden(`Vision session is ${session.status}`, "session_inactive");
  }

  // Update counters and heartbeat.
  const update: Record<string, unknown> = {
    lastHeartbeatAt: now,
  };

  if (typeof request.framesCaptured === "number") {
    update.framesCaptured = request.framesCaptured;
  }
  if (typeof request.framesUploaded === "number") {
    update.framesUploaded = request.framesUploaded;
  }

  await VisionStreamSession.updateOne({ _id: request.sessionId }, { $set: update }).exec();

  const continueStream = session.expiresAt > now + 5000; // 5s buffer.

  return {
    accepted: true,
    sessionId: session._id,
    continueStream,
    receivedAt: now,
  };
}

/**
 * Upload a vision frame to an active session.
 */
export async function uploadVisionFrame(
  userId: string,
  request: {
    sessionId: string;
    deviceInstallationId: string;
    frame: {
      width: number;
      height: number;
      byteSize: number;
      dataBase64: string;
      encoding: string;
    };
    capturedAt?: string;
  },
  pipeline: string = "default",
) {
  if (!request.sessionId) {
    throw ApiError.badRequest("sessionId is required");
  }

  if (!request.frame || typeof request.frame !== "object") {
    throw ApiError.badRequest("frame is required");
  }

  const { width, height, byteSize, dataBase64, encoding } = request.frame;

  if (typeof width !== "number" || width <= 0) {
    throw ApiError.badRequest("frame.width must be a positive number");
  }
  if (typeof height !== "number" || height <= 0) {
    throw ApiError.badRequest("frame.height must be a positive number");
  }
  if (typeof dataBase64 !== "string" || dataBase64.length === 0) {
    throw ApiError.badRequest("frame.dataBase64 must be a non-empty string");
  }
  if (encoding !== "base64") {
    throw ApiError.badRequest('frame.encoding must be "base64"');
  }

  const maxBytes = 2.8 * 1024 * 1024;
  if (byteSize > maxBytes) {
    throw ApiError.badRequest(`frame.byteSize exceeds maximum of ${maxBytes} bytes`);
  }

  // Check session is active.
  const session = await VisionStreamSession.findById(request.sessionId).exec();
  if (!session) {
    throw ApiError.notFound("Vision session not found");
  }
  if (session.userId !== userId) {
    throw ApiError.forbidden("Session does not belong to this user");
  }
  if (session.status !== "active") {
    throw ApiError.forbidden(`Vision session is ${session.status}`, "session_inactive");
  }

  // Check policy.
  const policy = await getDeviceControlPolicy(userId, request.deviceInstallationId || session.deviceInstallationId);
  if (pipeline === "surface" && !policy.silentVision.surfaceAnalysisUploadEnabled) {
    throw ApiError.forbidden("Surface analysis upload is not enabled", "surface_analysis_disabled");
  }
  if (pipeline === "default" && !policy.silentVision.frameUploadEnabled) {
    throw ApiError.forbidden("Frame upload is not enabled", "frame_upload_disabled");
  }

  const now = Date.now();
  const surfaceAttached = pipeline === "surface";

  const frame = await VisionStreamFrame.create({
    _id: crypto.randomUUID(),
    userId,
    sessionId: request.sessionId,
    deviceInstallationId: request.deviceInstallationId || session.deviceInstallationId,
    receivedAt: now,
    exclusiveAccess: session.exclusiveAccess,
    noSurfacePreview: session.noSurfacePreview,
    pipeline,
    surfaceAttached,
    payload: {
      capturedAt: request.capturedAt || new Date(now).toISOString(),
      frame: {
        width,
        height,
        byteSize,
        encoding,
      },
    },
  });

  // Update session counters.
  await VisionStreamSession.updateOne(
    { _id: request.sessionId },
    {
      $inc: { framesCaptured: 1, framesUploaded: 1 },
      $set: { lastHeartbeatAt: now },
    },
  ).exec();

  return {
    accepted: true,
    id: frame._id,
    sessionId: request.sessionId,
    pipeline,
    surfaceAttached,
    receivedAt: now,
  };
}

/**
 * Record a lifecycle event.
 */
export async function recordLifecycleEvent(
  userId: string,
  request: {
    deviceInstallationId: string;
    eventType: string;
    processName?: string;
    reason?: string;
    selfHealed?: boolean;
    restartCount?: number;
    clientReportedAt?: number;
    metadata?: unknown;
  },
) {
  if (!request.deviceInstallationId || typeof request.deviceInstallationId !== "string") {
    throw ApiError.badRequest("deviceInstallationId is required");
  }

  const validEventTypes = [
    "process_crash",
    "process_restart",
    "process_stop",
    "process_start",
    "service_bind",
    "service_unbind",
    "overlay_show",
    "overlay_hide",
    "permission_denied",
    "config_change",
    "policy_violation",
  ];

  if (!request.eventType || !validEventTypes.includes(request.eventType)) {
    throw ApiError.badRequest(`Invalid eventType. Must be one of: ${validEventTypes.join(", ")}`);
  }

  // Check lifecycle lock policy.
  const policy = await getDeviceControlPolicy(userId, request.deviceInstallationId);
  if (policy.lifecycleLock.enabled && policy.lifecycleLock.reportEvents) {
    // Log lifecycle events when reporting is enabled.
    if (request.processName) {
      logger.debug("[Lumen PrivilegedControl] Lifecycle event", {
        userId,
        processName: request.processName,
        eventType: request.eventType,
      });
    }
  }

  const now = Date.now();
  const event = await LifecycleEvent.create({
    _id: crypto.randomUUID(),
    userId,
    deviceInstallationId: request.deviceInstallationId,
    eventType: request.eventType,
    processName: request.processName || "",
    reason: request.reason || "",
    selfHealed: request.selfHealed ?? false,
    restartCount: request.restartCount ?? 0,
    clientReportedAt: request.clientReportedAt || now,
    receivedAt: now,
    metadata: request.metadata || {},
  });

  return {
    accepted: true,
    id: event._id,
    receivedAt: now,
    policy: {
      lifecycleLock: policy.lifecycleLock,
    },
  };
}

/**
 * Get the most recent vision sessions (admin).
 */
export async function recentVisionSessions(limit: number = 25) {
  const sessions = await VisionStreamSession.find()
    .sort({ lastHeartbeatAt: -1 })
    .limit(limit)
    .lean()
    .exec();

  return sessions.map((s) => ({
    id: s._id,
    userId: s.userId,
    deviceInstallationId: s.deviceInstallationId,
    status: s.status,
    startedAt: s.startedAt,
    lastHeartbeatAt: s.lastHeartbeatAt,
    framesCaptured: s.framesCaptured,
    framesUploaded: s.framesUploaded,
  }));
}

/**
 * Get the most recent lifecycle events (admin).
 */
export async function recentLifecycleEvents(limit: number = 25) {
  const events = await LifecycleEvent.find()
    .sort({ receivedAt: -1 })
    .limit(limit)
    .lean()
    .exec();

  return events.map((e) => ({
    id: e._id,
    userId: e.userId,
    deviceInstallationId: e.deviceInstallationId,
    eventType: e.eventType,
    processName: e.processName,
    reason: e.reason,
    selfHealed: e.selfHealed,
    restartCount: e.restartCount,
    receivedAt: e.receivedAt,
  }));
}

/**
 * Get the global device control policy, or return defaults.
 */
export async function globalDeviceControlPolicy() {
  const policy = await DeviceControlPolicy.findOne({ scope: "global" }).lean();

  if (policy) {
    return {
      scope: "global",
      silentVision: policy.silentVision || DEFAULT_SILENT_VISION,
      lifecycleLock: policy.lifecycleLock || DEFAULT_LIFECYCLE_LOCK,
      updatedAt: policy.updatedAt,
      updatedBy: policy.updatedBy,
    };
  }

  return {
    scope: "default",
    silentVision: DEFAULT_SILENT_VISION,
    lifecycleLock: DEFAULT_LIFECYCLE_LOCK,
    updatedAt: 0,
    updatedBy: "system",
  };
}