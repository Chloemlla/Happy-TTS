import {
  type INexaiEncryptedPayload,
  NexaiEncryptedSyncCounterModel,
  NexaiEncryptedSyncRecordModel,
} from "../models/nexaiEncryptedSyncModel";
import logger from "../utils/logger";

const SUPPORTED_CATEGORIES = new Set([
  "settings",
  "conversations",
  "notes",
  "translationHistory",
  "shortUrls",
  "savedPasswords",
]);

const SUPPORTED_ALGORITHMS = new Set(["XCHACHA20-POLY1305", "AES-256-GCM"]);
const DEFAULT_MAX_RECORDS_PER_REQUEST = 1000;
const DEFAULT_MAX_CIPHERTEXT_BYTES = 1024 * 1024;

export interface EncryptedSyncRecordInput {
  id?: unknown;
  recordId?: unknown;
  category?: unknown;
  updatedAt?: unknown;
  deleted?: unknown;
  crypto?: unknown;
  metadata?: unknown;
}

export interface EncryptedSyncRecordOutput {
  id: string;
  category: string;
  revision: number;
  updatedAt: string;
  deleted: boolean;
  crypto: INexaiEncryptedPayload;
  metadata?: unknown;
}

export interface EncryptedSyncConflict {
  category: string;
  id: string;
  serverUpdatedAt: string;
  clientUpdatedAt: string;
}

interface NormalizedRecord {
  recordId: string;
  category: string;
  updatedAt: string;
  deleted: boolean;
  crypto: INexaiEncryptedPayload;
  metadata?: unknown;
}

function httpError(message: string, statusCode = 400, code = "NEXAI_SYNC_V2_INVALID_REQUEST"): Error {
  return Object.assign(new Error(message), { statusCode, code });
}

function parsePositiveLimit(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function getMaxRecordsPerRequest(): number {
  return parsePositiveLimit(process.env.NEXAI_SYNC_V2_MAX_RECORDS, DEFAULT_MAX_RECORDS_PER_REQUEST);
}

function getMaxCiphertextBytes(): number {
  return parsePositiveLimit(process.env.NEXAI_SYNC_V2_MAX_CIPHERTEXT_BYTES, DEFAULT_MAX_CIPHERTEXT_BYTES);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireString(value: unknown, field: string, maxLength = 4096): string {
  if (typeof value !== "string" || !value.trim()) {
    throw httpError(`sync v2 record ${field} is required`);
  }

  const trimmed = value.trim();
  if (trimmed.length > maxLength) {
    throw httpError(`sync v2 record ${field} is too long`);
  }
  return trimmed;
}

function normalizeTimestamp(value: unknown): string {
  const timestamp = requireString(value, "updatedAt", 64);
  if (Number.isNaN(Date.parse(timestamp))) {
    throw httpError("sync v2 record updatedAt must be an ISO 8601 timestamp");
  }
  return timestamp;
}

function normalizeCrypto(value: unknown): INexaiEncryptedPayload {
  if (!isObject(value)) {
    throw httpError("sync v2 record crypto is required");
  }

  const alg = requireString(value.alg, "crypto.alg", 64).toUpperCase();
  if (!SUPPORTED_ALGORITHMS.has(alg)) {
    throw httpError(`unsupported sync v2 crypto alg: ${alg}`);
  }

  const ciphertext = requireString(value.ciphertext, "crypto.ciphertext", getMaxCiphertextBytes());
  if (Buffer.byteLength(ciphertext, "utf8") > getMaxCiphertextBytes()) {
    throw httpError("sync v2 record ciphertext is too large");
  }

  const payload: INexaiEncryptedPayload = {
    alg,
    kdf: requireString(value.kdf, "crypto.kdf", 64),
    keyId: requireString(value.keyId, "crypto.keyId", 256),
    nonce: requireString(value.nonce, "crypto.nonce", 512),
    ciphertext,
  };

  if (value.aad !== undefined && value.aad !== null && value.aad !== "") {
    payload.aad = requireString(value.aad, "crypto.aad", 4096);
  }

  return payload;
}

function normalizeRecord(input: EncryptedSyncRecordInput): NormalizedRecord {
  if (!isObject(input)) {
    throw httpError("sync v2 records must be objects");
  }

  const recordId = requireString(input.id ?? input.recordId, "id", 256);
  const category = requireString(input.category, "category", 128);
  if (!SUPPORTED_CATEGORIES.has(category)) {
    throw httpError(`unsupported sync v2 category: ${category}`);
  }

  return {
    recordId,
    category,
    updatedAt: normalizeTimestamp(input.updatedAt),
    deleted: input.deleted === true,
    crypto: normalizeCrypto(input.crypto),
    metadata: input.metadata,
  };
}

function normalizeRecords(value: unknown): NormalizedRecord[] {
  if (!Array.isArray(value)) {
    throw httpError("sync v2 records must be an array");
  }

  if (value.length > getMaxRecordsPerRequest()) {
    throw httpError("sync v2 request contains too many records");
  }

  const byKey = new Map<string, NormalizedRecord>();
  for (const item of value) {
    const record = normalizeRecord(item as EncryptedSyncRecordInput);
    byKey.set(`${record.category}:${record.recordId}`, record);
  }

  return Array.from(byKey.values());
}

function normalizeRevision(value: unknown): number {
  if (value === undefined || value === null || value === "") {
    return 0;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw httpError("sinceRevision must be a non-negative integer");
  }
  return parsed;
}

function compareTimestamps(left: string, right: string): number {
  const leftMs = Date.parse(left);
  const rightMs = Date.parse(right);
  if (!Number.isNaN(leftMs) && !Number.isNaN(rightMs)) {
    return leftMs - rightMs;
  }
  return left.localeCompare(right);
}

function serializeRecord(record: any): EncryptedSyncRecordOutput {
  return {
    id: record.recordId,
    category: record.category,
    revision: Number(record.revision ?? 0),
    updatedAt: record.updatedAt,
    deleted: Boolean(record.deleted),
    crypto: {
      alg: record.crypto.alg,
      kdf: record.crypto.kdf,
      keyId: record.crypto.keyId,
      nonce: record.crypto.nonce,
      aad: record.crypto.aad,
      ciphertext: record.crypto.ciphertext,
    },
    ...(record.metadata !== undefined ? { metadata: record.metadata } : {}),
  };
}

export class NexaiEncryptedSyncService {
  private static async getCurrentRevision(userId: string): Promise<number> {
    const counter = await NexaiEncryptedSyncCounterModel.findOne({ userId }).lean();
    return Number(counter?.revision ?? 0);
  }

  private static async allocateRevisions(userId: string, count: number): Promise<number[]> {
    if (count <= 0) {
      return [];
    }

    const counter = await NexaiEncryptedSyncCounterModel.findOneAndUpdate(
      { userId },
      { $inc: { revision: count } },
      { upsert: true, returnDocument: "after", lean: true },
    );
    const end = Number(counter?.revision ?? count);
    const start = end - count + 1;

    return Array.from({ length: count }, (_, index) => start + index);
  }

  static async putSnapshot(
    userId: string,
    body: { records?: unknown; deviceId?: unknown; snapshotId?: unknown },
  ): Promise<{ serverTime: string; revision: number }> {
    const records = normalizeRecords(body.records ?? []);
    const revisionCount = Math.max(records.length, 1);
    const revisions = await this.allocateRevisions(userId, revisionCount);
    const revision = revisions[revisions.length - 1] ?? (await this.getCurrentRevision(userId));

    await NexaiEncryptedSyncRecordModel.deleteMany({ userId });

    if (records.length > 0) {
      const deviceId = typeof body.deviceId === "string" ? body.deviceId : undefined;
      const snapshotId = typeof body.snapshotId === "string" ? body.snapshotId : undefined;
      await NexaiEncryptedSyncRecordModel.insertMany(
        records.map((record, index) => ({
          userId,
          category: record.category,
          recordId: record.recordId,
          revision: revisions[index],
          updatedAt: record.updatedAt,
          deleted: record.deleted,
          crypto: record.crypto,
          metadata: record.metadata,
          deviceId,
          snapshotId,
        })),
        { ordered: false },
      );
    }

    logger.info("[NexAI Sync V2] snapshot stored", { userId, records: records.length, revision });
    return { serverTime: new Date().toISOString(), revision };
  }

  static async getSnapshot(userId: string): Promise<{
    schemaVersion: 2;
    serverTime: string;
    revision: number;
    records: EncryptedSyncRecordOutput[];
  }> {
    const [revision, records] = await Promise.all([
      this.getCurrentRevision(userId),
      NexaiEncryptedSyncRecordModel.find({ userId }).sort({ revision: 1 }).lean(),
    ]);

    return {
      schemaVersion: 2,
      serverTime: new Date().toISOString(),
      revision,
      records: records.map(serializeRecord),
    };
  }

  static async getMeta(userId: string): Promise<{
    schemaVersion: 2;
    serverTime: string;
    revision: number;
    hasData: boolean;
    recordCount: number;
  }> {
    const [revision, recordCount] = await Promise.all([
      this.getCurrentRevision(userId),
      NexaiEncryptedSyncRecordModel.countDocuments({ userId }),
    ]);

    return {
      schemaVersion: 2,
      serverTime: new Date().toISOString(),
      revision,
      hasData: recordCount > 0,
      recordCount,
    };
  }

  static async incrementalSync(
    userId: string,
    body: { sinceRevision?: unknown; records?: unknown; deviceId?: unknown },
  ): Promise<{
    serverTime: string;
    revision: number;
    records: EncryptedSyncRecordOutput[];
    conflicts: EncryptedSyncConflict[];
  }> {
    const sinceRevision = normalizeRevision(body.sinceRevision);
    const records = normalizeRecords(body.records ?? []);
    const conflicts: EncryptedSyncConflict[] = [];
    const writableRecords: NormalizedRecord[] = [];

    for (const record of records) {
      const existing = await NexaiEncryptedSyncRecordModel.findOne({
        userId,
        category: record.category,
        recordId: record.recordId,
      }).lean();

      if (existing && compareTimestamps(existing.updatedAt, record.updatedAt) > 0) {
        if (Number(existing.revision ?? 0) > sinceRevision) {
          conflicts.push({
            category: record.category,
            id: record.recordId,
            serverUpdatedAt: existing.updatedAt,
            clientUpdatedAt: record.updatedAt,
          });
        }
        continue;
      }

      writableRecords.push(record);
    }

    const revisions = await this.allocateRevisions(userId, writableRecords.length);
    const deviceId = typeof body.deviceId === "string" ? body.deviceId : undefined;

    await Promise.all(
      writableRecords.map((record, index) =>
        NexaiEncryptedSyncRecordModel.updateOne(
          { userId, category: record.category, recordId: record.recordId },
          {
            $set: {
              revision: revisions[index],
              updatedAt: record.updatedAt,
              deleted: record.deleted,
              crypto: record.crypto,
              metadata: record.metadata,
              deviceId,
            },
          },
          { upsert: true },
        ),
      ),
    );

    const [revision, changedRecords] = await Promise.all([
      this.getCurrentRevision(userId),
      NexaiEncryptedSyncRecordModel.find({ userId, revision: { $gt: sinceRevision } }).sort({ revision: 1 }).lean(),
    ]);

    logger.info("[NexAI Sync V2] incremental sync complete", {
      userId,
      incoming: records.length,
      written: writableRecords.length,
      conflicts: conflicts.length,
      sinceRevision,
      revision,
    });

    return {
      serverTime: new Date().toISOString(),
      revision,
      records: changedRecords.map(serializeRecord),
      conflicts,
    };
  }

  static async deleteSnapshot(userId: string): Promise<{ serverTime: string; revision: number }> {
    const [revision] = await this.allocateRevisions(userId, 1);
    await NexaiEncryptedSyncRecordModel.deleteMany({ userId });

    logger.info("[NexAI Sync V2] snapshot deleted", { userId, revision });
    return { serverTime: new Date().toISOString(), revision };
  }
}
