import crypto from "node:crypto";
import { TelemetryUpload, type ITelemetryUpload } from "../../models/lumen/index.js";
import { ApiError } from "./errors.js";
import logger from "../../utils/logger.js";

// ── Constants ───────────────────────────────────────────────────────────
const MAX_TELEMETRY_PER_HOUR = 60;
const TELEMETRY_WINDOW_MS = 60 * 60 * 1000;
const MAX_STRING_LENGTH = 500;
const MAX_ARRAY_LENGTH = 50;
const MAX_PAYLOAD_DEPTH = 5;
const MAX_SERIALIZED_PAYLOAD_BYTES = 1024 * 1024; // 1MB hard cap after sanitization

// ── Helpers ─────────────────────────────────────────────────────────────

/**
 * Recursively sanitize a single value.
 * G7-49: arrays are NOT a bypass — every element is recursively run through the
 * same string/object/array truncation as the top level.
 */
function sanitizeValue(value: unknown, depth: number): unknown {
  if (typeof value === "string") {
    return value.trim().slice(0, MAX_STRING_LENGTH);
  }
  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_ARRAY_LENGTH)
      .map((item) => sanitizeValue(item, depth + 1));
  }
  if (value !== null && typeof value === "object") {
    if (depth > MAX_PAYLOAD_DEPTH) return { __truncated: true };
    const result: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      result[key] = sanitizeValue(entry, depth + 1);
    }
    return result;
  }
  return value;
}

/**
 * Sanitize a telemetry upload payload.
 *
 * - Trims strings
 * - Truncates arrays to MAX_ARRAY_LENGTH AND truncates each element
 * - Validates package names (alphanumeric + dots)
 * - Clamps numeric values (0–100)
 * - Validates device fingerprints (64 hex chars)
 * - Caps the serialized size of the whole payload (G7-49)
 */
function sanitizeTelemetryUpload(payload: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(payload)) {
    if (typeof value === "string") {
      const trimmed = value.trim().slice(0, MAX_STRING_LENGTH);

      // Validate device fingerprint (64 hex chars).
      if (key === "deviceFingerprint" || key === "fingerprint") {
        if (!/^[0-9a-f]{64}$/i.test(trimmed)) {
          sanitized[key] = "invalid";
          continue;
        }
      }

      // Validate package name.
      if (key === "packageName" || key === "package") {
        if (!/^[a-zA-Z][a-zA-Z0-9.]*$/.test(trimmed)) {
          sanitized[key] = "invalid";
          continue;
        }
      }

      sanitized[key] = trimmed;
    } else if (typeof value === "number") {
      // Clamp values that look like percentages to 0–100.
      if (key.startsWith("pct") || key.endsWith("Percent") || key.endsWith("Level")) {
        sanitized[key] = Math.max(0, Math.min(100, value));
      } else {
        sanitized[key] = value;
      }
    } else if (value !== null && typeof value === "object") {
      sanitized[key] = sanitizeValue(value, 1);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

// ── Public API ──────────────────────────────────────────────────────────

/**
 * Record a telemetry upload.
 *
 * Validates deviceInstallationId, enforces a 60/hour rate limit, sanitizes
 * the payload, and persists the record.
 */
export async function recordTelemetryUpload(
  userId: string,
  request: {
    deviceInstallationId?: string;
    payload?: Record<string, unknown>;
  },
) {
  if (!request.deviceInstallationId || typeof request.deviceInstallationId !== "string") {
    throw ApiError.badRequest("deviceInstallationId is required");
  }

  // Rate limit: 60 per hour per user. G7-26: keyed on userId (server-authenticated)
  // instead of the client-supplied deviceInstallationId, which a client could
  // rotate to reset the window at will.
  const windowStart = Date.now() - TELEMETRY_WINDOW_MS;
  const recentCount = await TelemetryUpload.countDocuments({
    userId,
    receivedAt: { $gte: windowStart },
  }).exec();

  if (recentCount >= MAX_TELEMETRY_PER_HOUR) {
    throw ApiError.tooManyRequests("Telemetry rate limit exceeded (60/hour)");
  }

  const sanitizedPayload = request.payload
    ? sanitizeTelemetryUpload(request.payload as Record<string, unknown>)
    : {};

  // G7-49: hard cap on the serialized payload — per-field truncation alone is
  // not enough because array elements previously bypassed it.
  if (JSON.stringify(sanitizedPayload).length > MAX_SERIALIZED_PAYLOAD_BYTES) {
    throw ApiError.badRequest("Telemetry payload exceeds the maximum allowed size");
  }

  const now = Date.now();
  const doc = await TelemetryUpload.create({
    _id: crypto.randomUUID(),
    userId,
    deviceInstallationId: request.deviceInstallationId,
    receivedAt: now,
    payload: sanitizedPayload,
  });

  return {
    accepted: true,
    id: doc._id,
    receivedAt: now,
  };
}

/**
 * Get the latest 20 telemetry debug items for a user.
 * Filters by userId for security, and optionally by deviceInstallationId.
 */
export async function latestTelemetryDebugItems(
  userId: string,
  deviceInstallationId?: string,
) {
  if (typeof userId !== "string") throw new Error("Invalid userId");
  const filter: Record<string, unknown> = { userId: String(userId) };
  if (typeof deviceInstallationId === "string") {
    filter.deviceInstallationId = deviceInstallationId;
  }

  const items = await TelemetryUpload.find(filter)
    .sort({ receivedAt: -1 })
    .limit(20)
    .lean()
    .exec();

  return items.map((item) => ({
    id: item._id,
    deviceInstallationId: item.deviceInstallationId,
    receivedAt: item.receivedAt,
    payload: item.payload,
  }));
}

export { sanitizeTelemetryUpload };