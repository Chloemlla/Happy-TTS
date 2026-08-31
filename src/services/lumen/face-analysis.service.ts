import crypto from "node:crypto";
import { FaceAnalysisFrame } from "../../models/lumen/index.js";
import { getDeviceControlPolicy } from "./privileged-control.service.js";
import { sanitizeTelemetryUpload } from "./telemetry.service.js";
import { ApiError } from "./errors.js";

// ── Constants ───────────────────────────────────────────────────────────
const MAX_FRAMES_PER_HOUR = 60;
const RATE_WINDOW_MS = 60 * 60 * 1000;

/** Sanitize a free-form client field that may be an object, array, or scalar. */
function sanitizeUnknown(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) {
    return value.map((item) =>
      item !== null && typeof item === "object"
        ? sanitizeTelemetryUpload(item as Record<string, unknown>)
        : item,
    );
  }
  return sanitizeTelemetryUpload(value as Record<string, unknown>);
}

// ── Public API ──────────────────────────────────────────────────────────

/**
 * Record a face analysis frame from a user's device.
 *
 * G7-07: the previous implementation only validated deviceInstallationId and
 * stored `faces`/`processingMetrics` unchecked. This version:
 *  - validates the frame envelope (width/height/byteSize/encoding),
 *  - enforces a per-user+device rate limit (server-side key — the id is still
 *    client-supplied, so this is a soft bound; a TTL index on receivedAt is the
 *    hard backstop, see model change),
 *  - enforces the silent-vision consent gate so face data never outranks plain
 *    telemetry,
 *  - runs `faces`/`processingMetrics` through the same sanitizer as telemetry.
 */
export async function recordFaceAnalysisFrame(
  userId: string,
  request: {
    deviceInstallationId: string;
    capturedAt: string;
    frame: {
      width: number;
      height: number;
      byteSize: number;
      dataBase64: string;
      encoding: string;
    };
    faces?: unknown;
    processingMetrics?: unknown;
  },
) {
  if (!request.deviceInstallationId || typeof request.deviceInstallationId !== "string") {
    throw ApiError.badRequest("deviceInstallationId is required");
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
  if (typeof byteSize !== "number" || !Number.isFinite(byteSize) || byteSize <= 0) {
    throw ApiError.badRequest("frame.byteSize must be a positive number");
  }
  const maxBytes = 2.8 * 1024 * 1024;
  const actualBytes = Buffer.byteLength(dataBase64, "base64");
  if (actualBytes > maxBytes) {
    throw ApiError.badRequest(`frame size exceeds maximum of ${maxBytes} bytes`);
  }
  if (byteSize !== actualBytes) {
    throw ApiError.badRequest("frame.byteSize does not match the actual payload size");
  }

  // Consent gate (shared with privileged-control, G7-05): biometric data must
  // never be accepted while the policy requires explicit consent.
  const policy = await getDeviceControlPolicy(userId, request.deviceInstallationId);
  if (policy.silentVision.requiresExplicitConsent) {
    throw ApiError.forbidden("Explicit user consent is required for face analysis", "consent_required");
  }

  // Rate limit: per user+device within a rolling hour. This mirrors the crash
  // path; the deviceInstallationId is client-supplied so this is a soft bound.
  const windowStart = Date.now() - RATE_WINDOW_MS;
  const recentCount = await FaceAnalysisFrame.countDocuments({
    userId,
    deviceInstallationId: request.deviceInstallationId,
    receivedAt: { $gte: windowStart },
  }).exec();
  if (recentCount >= MAX_FRAMES_PER_HOUR) {
    throw ApiError.tooManyRequests(`Face analysis frame rate limit exceeded (${MAX_FRAMES_PER_HOUR}/hour)`);
  }

  const now = Date.now();
  const doc = await FaceAnalysisFrame.create({
    _id: crypto.randomUUID(),
    userId,
    deviceInstallationId: request.deviceInstallationId,
    receivedAt: now,
    payload: {
      capturedAt: request.capturedAt,
      frame: {
        width,
        height,
        byteSize,
        encoding,
      },
      // G7-07: sanitize free-form client fields with the telemetry sanitizer so
      // arbitrary structures/sizes cannot bypass the limits.
      faces: sanitizeUnknown(request.faces),
      processingMetrics: sanitizeUnknown(request.processingMetrics),
    },
  });

  return {
    accepted: true,
    id: doc._id,
    receivedAt: now,
  };
}
