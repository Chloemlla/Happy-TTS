import crypto from "node:crypto";
import { Counter, SyncChange, type ISyncChange } from "../../models/lumen/index.js";
import { ApiError } from "./errors.js";
import logger from "../../utils/logger.js";

// ── Public API ──────────────────────────────────────────────────────────

/**
 * Reserve a range of cursor values from the atomic counter.
 * Returns the starting cursor (inclusive). The caller gets `count` cursor
 * values starting from the returned number.
 */
export async function reserveSyncCursors(count: number): Promise<number> {
  const result = await Counter.findByIdAndUpdate(
    "sync_cursor",
    { $inc: { value: count } },
    { new: true, upsert: true },
  ).lean();

  const current = result?.value ?? count;
  return current - count + 1;
}

/**
 * Push a batch of sync changes from the client.
 *
 * 1. Reserves a contiguous cursor range atomically.
 * 2. Creates SyncChange documents for each change.
 * 3. Returns the accepted count and the next cursor.
 */
export async function pushChanges(
  userId: string,
  changes: Array<{
    collection: string;
    operation: string;
    remoteId: string;
    payload: unknown;
    deviceInstallationId: string;
    updatedAt: number;
  }>,
  cursor?: string,
  deviceInstallationId?: string,
) {
  if (!Array.isArray(changes) || changes.length === 0) {
    throw ApiError.badRequest("changes must be a non-empty array");
  }

  if (changes.length > 1000) {
    throw ApiError.badRequest("Too many changes in one push (max 1000)");
  }

  const startCursor = await reserveSyncCursors(changes.length);
  const now = Date.now();

  const docs: Array<{
    _id: string;
    userId: string;
    cursor: string;
    change: {
      collection: string;
      operation: string;
      remoteId: string;
      payload: unknown;
      deviceInstallationId: string;
      updatedAt: number;
    };
  }> = [];

  for (let i = 0; i < changes.length; i++) {
    const ch = changes[i];
    const cursorValue = String(startCursor + i);

    docs.push({
      _id: crypto.randomUUID(),
      userId,
      cursor: cursorValue,
      change: {
        collection: ch.collection,
        operation: ch.operation,
        remoteId: ch.remoteId,
        payload: ch.payload,
        deviceInstallationId: ch.deviceInstallationId || deviceInstallationId || "",
        updatedAt: ch.updatedAt || now,
      },
    });
  }

  await SyncChange.insertMany(docs);

  logger.info("[Lumen Sync] Changes pushed", {
    userId,
    count: docs.length,
    cursorStart: startCursor,
  });

  return {
    accepted: docs.length,
    nextCursor: String(startCursor + docs.length),
  };
}

/**
 * Fetch changes since a given cursor value, sorted ascending.
 */
export async function changesSince(userId: string, since: string) {
  const sinceNum = since ? parseInt(since, 10) : 0;
  if (isNaN(sinceNum)) {
    throw ApiError.badRequest("Invalid cursor value");
  }

  const changes = await SyncChange.find({
    userId,
    cursor: { $gt: String(sinceNum) },
  })
    .sort({ cursor: 1 })
    .limit(500)
    .lean()
    .exec();

  const nextCursor = changes.length > 0
    ? changes[changes.length - 1].cursor
    : String(sinceNum);

  return {
    changes: changes.map((c) => ({
      cursor: c.cursor,
      collection: c.change.collection,
      operation: c.change.operation,
      remoteId: c.change.remoteId,
      payload: c.change.payload,
      deviceInstallationId: c.change.deviceInstallationId,
      updatedAt: c.change.updatedAt,
    })),
    nextCursor,
    serverTime: Date.now(),
  };
}