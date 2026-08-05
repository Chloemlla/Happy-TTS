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

// ── Helpers ─────────────────────────────────────────────────────────────

/**
 * Sanitize a telemetry upload payload.
 *
 * - Trims strings
 * - Truncates arrays to MAX_ARRAY_LENGTH
 * - Validates package names (alphanumeric + dots)
 * - Clamps numeric values (0–100)
 * - Validates device fingerprints (64 hex chars)
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
    } else if (Array.isArray(value)) {
      sanitized[key] = value.slice(0, MAX_ARRAY_LENGTH);
    } else if (value !== null && typeof value === "object") {
      sanitized[key] = truncateObject(value as Record<string, unknown>, 1);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

function truncateObject(
  obj: Record<string, unknown>,
  depth: number,
): Record<string, unknown> {
  if (depth > MAX_PAYLOAD_DEPTH) return { __truncated: true };

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === "string") {
      result[key] = value.slice(0, MAX_STRING_LENGTH);
    } else if (Array.isArray(value)) {
      result[key] = value.slice(0, MAX_ARRAY_LENGTH);
    } else if (value !== null && typeof value === "object") {
      result[key] = truncateObject(value as Record<string, unknown>, depth + 1);
    } else {
      result[key] = value;
    }
  }
  return result;
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

  // Rate limit: 60 per hour per user.
  const windowStart = Date.now() - TELEMETRY_WINDOW_MS;
  const recentCount = await TelemetryUpload.countDocuments({
    userId,
    deviceInstallationId: request.deviceInstallationId,
    receivedAt: { $gte: windowStart },
  }).exec();

  if (recentCount >= MAX_TELEMETRY_PER_HOUR) {
    throw ApiError.tooManyRequests("Telemetry rate limit exceeded (60/hour)");
  }

  const sanitizedPayload = request.payload
    ? sanitizeTelemetryUpload(request.payload as Record<string, unknown>)
    : {};

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
  const filter: Record<string, unknown> = { userId };
  if (deviceInstallationId) {
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