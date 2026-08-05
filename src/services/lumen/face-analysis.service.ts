import crypto from "node:crypto";
import { FaceAnalysisFrame } from "../../models/lumen/index.js";
import { ApiError } from "./errors.js";

// ── Public API ──────────────────────────────────────────────────────────

/**
 * Record a face analysis frame from a user's device.
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

  const now = Date.now();
  const doc = await FaceAnalysisFrame.create({
    _id: crypto.randomUUID(),
    userId,
    deviceInstallationId: request.deviceInstallationId,
    receivedAt: now,
    payload: {
      capturedAt: request.capturedAt,
      frame: {
        width: request.frame.width,
        height: request.frame.height,
        byteSize: request.frame.byteSize,
        encoding: request.frame.encoding,
      },
      faces: request.faces,
      processingMetrics: request.processingMetrics,
    },
  });

  return {
    accepted: true,
    id: doc._id,
    receivedAt: now,
  };
}