#!/usr/bin/env node
/**
 * D3 (G8-06 / G8-22 / G8-29 / G7-25): backfill the `ttlExpireAt` TTL anchor on the
 * lumen ingestion collections and on verification_tokens.
 *
 * Why a separate field: those collections store time as epoch-millis Numbers, and
 * Mongo TTL only works on BSON Date. `receivedAt` / `lastSeenAt` are returned verbatim
 * in API responses read by the published Project-Lumen SDK, so they stay Numbers and
 * `ttlExpireAt: Date` carries the TTL instead. Documents with no `ttlExpireAt` are
 * never reaped, which is why existing rows need this backfill to come under retention.
 *
 * Plain node + mongodb driver, like the other scripts here: the production image ships
 * only obfuscated dist/, so this must not import from src/. The retention defaults below
 * therefore duplicate src/config/lumenRetention.ts — keep the two in sync.
 *
 * Dry run by default. `--apply` writes.
 *
 *   node scripts/migrations/backfill-lumen-ttl.js
 *   node scripts/migrations/backfill-lumen-ttl.js --apply
 *   node scripts/migrations/backfill-lumen-ttl.js --apply --dedupe-crash-reports
 *
 * Idempotent: the update only matches documents that have no `ttlExpireAt` yet.
 *
 * IRREVERSIBLE SIDE EFFECT: a backfilled document whose retention window has already
 * passed is deleted by the TTL monitor within about a minute. The dry run reports that
 * count as `wouldExpireImmediately` per collection — read it before using --apply.
 */
const { MongoClient } = require("mongodb");

const DAY_MS = 24 * 60 * 60 * 1000;

function retentionDays(envVar, fallback) {
  const raw = process.env[envVar];
  if (raw === undefined || raw === "") return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed) || parsed < 0) return fallback;
  return parsed;
}

// timeField is epoch millis; ttlExpireAt becomes timeField + days.
const RETENTION_TARGETS = [
  { collection: "vision_stream_frames", timeField: "receivedAt", days: retentionDays("LUMEN_RETENTION_VISION_FRAME_DAYS", 7) },
  { collection: "face_analysis_frames", timeField: "receivedAt", days: retentionDays("LUMEN_RETENTION_FACE_FRAME_DAYS", 7) },
  { collection: "telemetry_uploads", timeField: "receivedAt", days: retentionDays("LUMEN_RETENTION_TELEMETRY_DAYS", 30) },
  { collection: "lifecycle_events", timeField: "receivedAt", days: retentionDays("LUMEN_RETENTION_LIFECYCLE_DAYS", 30) },
  { collection: "crash_reports", timeField: "receivedAt", days: retentionDays("LUMEN_RETENTION_CRASH_REPORT_DAYS", 90) },
  { collection: "admin_crash_reports", timeField: "lastSeenAt", days: retentionDays("LUMEN_RETENTION_CRASH_GROUP_DAYS", 180) },
  { collection: "sync_changes", timeField: "change.updatedAt", days: retentionDays("LUMEN_RETENTION_SYNC_CHANGE_DAYS", 0) },
];

// verification_tokens.expiresAt is already an absolute expiry, so it maps straight across.
const ABSOLUTE_TARGETS = [{ collection: "verification_tokens", timeField: "expiresAt" }];

function getMongoConfig() {
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("缺少 MONGO_URI / MONGODB_URI 环境变量");
  }
  return { uri, database: process.env.MONGO_DB || "tts" };
}

function parseArgs(argv) {
  const args = { apply: false, dedupeCrashReports: false };
  for (const arg of argv) {
    if (arg === "--apply") {
      args.apply = true;
    } else if (arg === "--dedupe-crash-reports") {
      args.dedupeCrashReports = true;
    } else if (arg === "--help" || arg === "-h") {
      console.log("Usage: node scripts/migrations/backfill-lumen-ttl.js [--apply] [--dedupe-crash-reports]");
      process.exit(0);
    } else {
      throw new Error(`未知参数: ${arg}`);
    }
  }
  return args;
}

/** Groups of crash_reports sharing {userId, reportId}: the unique index cannot build while any exist. */
async function findCrashReportDuplicates(db) {
  return db
    .collection("crash_reports")
    .aggregate([
      { $group: { _id: { userId: "$userId", reportId: "$reportId" }, ids: { $push: "$_id" }, count: { $sum: 1 } } },
      { $match: { count: { $gt: 1 } } },
    ])
    .toArray();
}

/** Keeps the newest report per {userId, reportId} and drops the rest. */
async function dedupeCrashReports(db, groups) {
  const collection = db.collection("crash_reports");
  let deleted = 0;
  for (const group of groups) {
    const docs = await collection
      .find({ _id: { $in: group.ids } }, { projection: { _id: 1, receivedAt: 1 } })
      .sort({ receivedAt: -1 })
      .toArray();
    const stale = docs.slice(1).map((doc) => doc._id);
    if (stale.length === 0) continue;
    const result = await collection.deleteMany({ _id: { $in: stale } });
    deleted += result.deletedCount || 0;
  }
  return deleted;
}

async function inspect(db, target, retentionMs, now) {
  const collection = db.collection(target.collection);
  const missing = { ttlExpireAt: { $exists: false } };
  const [total, pending, malformed, wouldExpireImmediately] = await Promise.all([
    collection.countDocuments({}),
    collection.countDocuments({ ...missing, [target.timeField]: { $type: "number" } }),
    collection.countDocuments({ ...missing, [target.timeField]: { $not: { $type: "number" } } }),
    collection.countDocuments({ ...missing, [target.timeField]: { $type: "number", $lte: now - retentionMs } }),
  ]);
  return { collection: target.collection, total, pending, malformed, wouldExpireImmediately };
}

async function backfill(db, target, retentionMs) {
  const result = await db.collection(target.collection).updateMany(
    { ttlExpireAt: { $exists: false }, [target.timeField]: { $type: "number" } },
    [{ $set: { ttlExpireAt: { $add: [{ $toDate: `$${target.timeField}` }, retentionMs] } } }],
  );
  return result.modifiedCount || 0;
}

async function main() {
  const { apply, dedupeCrashReports: shouldDedupe } = parseArgs(process.argv.slice(2));
  const { uri, database } = getMongoConfig();
  const client = new MongoClient(uri);
  const now = Date.now();

  try {
    await client.connect();
    const db = client.db(database);

    const duplicateGroups = await findCrashReportDuplicates(db);
    const duplicateExtras = duplicateGroups.reduce((sum, group) => sum + (group.count - 1), 0);

    const report = { apply, database, collections: [], skipped: [] };

    for (const target of RETENTION_TARGETS) {
      if (target.days <= 0) {
        report.skipped.push({ collection: target.collection, reason: "retention disabled (0 days)" });
        continue;
      }
      const retentionMs = target.days * DAY_MS;
      const row = await inspect(db, target, retentionMs, now);
      row.retentionDays = target.days;
      if (apply) row.backfilled = await backfill(db, target, retentionMs);
      report.collections.push(row);
    }

    for (const target of ABSOLUTE_TARGETS) {
      const row = await inspect(db, target, 0, now);
      row.retentionDays = "absolute (expiresAt)";
      if (apply) row.backfilled = await backfill(db, target, 0);
      report.collections.push(row);
    }

    report.crashReportDuplicates = {
      // CrashReportSchema.index({userId,reportId},{unique:true}) cannot build while these exist;
      // mongoose only logs the failure, so the index would stay silently missing.
      groups: duplicateGroups.length,
      redundantDocuments: duplicateExtras,
      deleted: apply && shouldDedupe ? await dedupeCrashReports(db, duplicateGroups) : 0,
    };

    console.log(JSON.stringify(report, null, 2));
    if (!apply) {
      console.log("\nDry run. Re-run with --apply to write. Check wouldExpireImmediately first: those documents are deleted by the TTL monitor within about a minute.");
    }
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error("[backfill-lumen-ttl] failed", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
