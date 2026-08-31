import crypto from "node:crypto";
import { Backup } from "../../models/lumen/index.js";
import { ApiError } from "./errors.js";

// ── Constants ─────────────────────────────────────────────────────────────
const MAX_BACKUP_BYTES = 16 * 1024 * 1024; // 16MB single-backup cap
const MAX_BACKUPS_PER_USER = 5;

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

  // G7-47: compute the size before writing (the previous code serialized the
  // payload a second time AFTER persisting, just to report `size`) and reject
  // oversized backups instead of storing them.
  let serialized: string;
  try {
    serialized = JSON.stringify(request.backup);
  } catch {
    throw ApiError.badRequest("backup payload must be JSON-serializable");
  }
  const size = Buffer.byteLength(serialized, "utf8");
  if (size > MAX_BACKUP_BYTES) {
    throw ApiError.badRequest("Backup exceeds the maximum allowed size (16MB)");
  }

  const doc = await Backup.create({
    _id: crypto.randomUUID(),
    userId,
    deviceInstallationId: request.deviceInstallationId,
    schemaVersion: request.schemaVersion ?? 1,
    exportedAt: request.exportedAt || now,
    uploadedAt: now,
    backup: request.backup,
  });

  // G7-47: retention — keep only the most recent backups per user so a client
  // loop cannot grow the collection without bound.
  try {
    const older = await Backup.find({ userId })
      .sort({ uploadedAt: -1 })
      .skip(MAX_BACKUPS_PER_USER)
      .select({ _id: 1 })
      .lean()
      .exec();
    if (older.length > 0) {
      await Backup.deleteMany({ _id: { $in: older.map((o) => o._id) } });
    }
  } catch (error) {
    // Retention trimming must not fail the save.
  }

  return {
    id: doc._id,
    userId: doc.userId,
    schemaVersion: doc.schemaVersion,
    exportedAt: doc.exportedAt,
    uploadedAt: doc.uploadedAt,
    size,
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