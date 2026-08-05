import crypto from "node:crypto";
import { Backup } from "../../models/lumen/index.js";
import { ApiError } from "./errors.js";

// ── Public API ──────────────────────────────────────────────────────────

/**
 * Save a backup payload for a user.
 */
export async function saveBackup(
  userId: string,
  request: {
    deviceInstallationId: string;
    schemaVersion: number;
    exportedAt: number;
    backup: unknown;
  },
) {
  if (!request.deviceInstallationId || typeof request.deviceInstallationId !== "string") {
    throw ApiError.badRequest("deviceInstallationId is required");
  }

  const now = Date.now();

  const doc = await Backup.create({
    _id: crypto.randomUUID(),
    userId,
    deviceInstallationId: request.deviceInstallationId,
    schemaVersion: request.schemaVersion ?? 1,
    exportedAt: request.exportedAt || now,
    uploadedAt: now,
    backup: request.backup,
  });

  return {
    id: doc._id,
    userId: doc.userId,
    schemaVersion: doc.schemaVersion,
    exportedAt: doc.exportedAt,
    uploadedAt: doc.uploadedAt,
    size: JSON.stringify(request.backup).length,
  };
}

/**
 * Get the latest backup for a user.
 */
export async function latestBackup(userId: string) {
  const backup = await Backup.findOne({ userId })
    .sort({ uploadedAt: -1 })
    .lean()
    .exec();

  if (!backup) {
    throw ApiError.notFound("No backup found for this user");
  }

  return {
    id: backup._id,
    userId: backup.userId,
    deviceInstallationId: backup.deviceInstallationId,
    schemaVersion: backup.schemaVersion,
    exportedAt: backup.exportedAt,
    uploadedAt: backup.uploadedAt,
    backup: backup.backup,
  };
}