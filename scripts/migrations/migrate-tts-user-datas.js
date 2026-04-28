#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const dotenv = require("dotenv");

dotenv.config();

const MIGRATION_NAME = "tts-user-datas-v1";
const LOCK_COLLECTION = "_migration_locks";

function parseArgs(argv) {
  const args = {
    dryRun: false,
    reportFile: "",
    lockTimeoutMs: 30 * 60 * 1000,
    sampleSize: 10,
  };

  for (const arg of argv) {
    if (arg === "--dry-run") {
      args.dryRun = true;
      continue;
    }
    if (arg.startsWith("--report-file=")) {
      args.reportFile = arg.slice("--report-file=".length);
      continue;
    }
    if (arg.startsWith("--lock-timeout-ms=")) {
      const value = Number(arg.slice("--lock-timeout-ms=".length));
      if (!Number.isFinite(value) || value <= 0) {
        throw new Error("`--lock-timeout-ms` 必须是正整数");
      }
      args.lockTimeoutMs = value;
      continue;
    }
    if (arg.startsWith("--sample-size=")) {
      const value = Number(arg.slice("--sample-size=".length));
      if (!Number.isFinite(value) || value < 0) {
        throw new Error("`--sample-size` 必须是非负整数");
      }
      args.sampleSize = value;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }
    throw new Error(`未知参数: ${arg}`);
  }

  return args;
}

function printHelp() {
  console.log(`
Usage:
  npm run migrate:tts-user-datas -- [--dry-run] [--report-file=path] [--lock-timeout-ms=1800000] [--sample-size=10]

Options:
  --dry-run              只生成迁移计划和报告，不写入、不删源集合
  --report-file=PATH     将迁移报告写入指定 JSON 文件
  --lock-timeout-ms=N    锁过期时间，默认 1800000 毫秒
  --sample-size=N        报告中抽样展示的文档数量，默认 10
`);
}

function getMongoConfig() {
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI || "mongodb://localhost:27017";
  const database = process.env.MONGO_DB || "tts";
  return { uri, database };
}

async function acquireLock(db, ownerId, lockTimeoutMs) {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + lockTimeoutMs);
  const locks = db.collection(LOCK_COLLECTION);
  const lockDoc = {
    _id: MIGRATION_NAME,
    ownerId,
    startedAt: now,
    updatedAt: now,
    expiresAt,
    hostname: process.env.COMPUTERNAME || process.env.HOSTNAME || "unknown",
    pid: process.pid,
    createdAt: now,
  };

  try {
    await locks.insertOne(lockDoc);
    return lockDoc;
  } catch (error) {
    if (error?.code !== 11000) {
      throw error;
    }
  }

  const existingLock = await locks.findOne({ _id: MIGRATION_NAME });
  if (!existingLock) {
    throw new Error("读取迁移锁失败");
  }

  if (existingLock.ownerId === ownerId) {
    return existingLock;
  }

  if (existingLock.expiresAt && new Date(existingLock.expiresAt).getTime() > now.getTime()) {
    throw new Error(`迁移锁已被其他实例占用: ${existingLock.ownerId}`);
  }

  const takeover = await locks.findOneAndReplace(
    {
      _id: MIGRATION_NAME,
      ownerId: existingLock.ownerId,
      expiresAt: existingLock.expiresAt,
    },
    lockDoc,
    { returnDocument: "after" },
  );

  if (!takeover || takeover.ownerId !== ownerId) {
    throw new Error("迁移锁抢占失败，可能有其他实例正在并发执行");
  }

  return takeover;
}

async function releaseLock(db, ownerId) {
  await db.collection(LOCK_COLLECTION).deleteOne({ _id: MIGRATION_NAME, ownerId });
}

async function collectMigrationPlan(ttsCollection, userDatasCollection, sampleSize) {
  const sourceDocs = await ttsCollection.find({}, { projection: { _id: 1 } }).toArray();
  const sourceIds = sourceDocs.map((doc) => doc._id);
  const sourceCount = sourceIds.length;

  if (sourceCount === 0) {
    return {
      sourceCount,
      targetCountBefore: await userDatasCollection.countDocuments(),
      missingIds: [],
      missingCount: 0,
      sampleDocs: [],
      action: "noop-empty-source",
    };
  }

  const existingIds = await userDatasCollection
    .find({ _id: { $in: sourceIds } }, { projection: { _id: 1 } })
    .toArray();
  const existingIdSet = new Set(existingIds.map((doc) => String(doc._id)));
  const missingIds = sourceIds.filter((id) => !existingIdSet.has(String(id)));
  const sampleDocs =
    sampleSize > 0
      ? await ttsCollection.find({}, { limit: sampleSize }).project({ _id: 1, userId: 1, createdAt: 1 }).toArray()
      : [];

  return {
    sourceCount,
    targetCountBefore: await userDatasCollection.countDocuments(),
    missingIds,
    missingCount: missingIds.length,
    sampleDocs,
    action: missingIds.length === 0 ? "verify-and-drop-source" : "upsert-missing-and-drop-source",
  };
}

async function executeMigration(ttsCollection, userDatasCollection, missingIds) {
  if (missingIds.length === 0) {
    return {
      migratedDocs: 0,
      upsertedCount: 0,
      modifiedCount: 0,
    };
  }

  const docsToMigrate = await ttsCollection.find({ _id: { $in: missingIds } }).toArray();
  if (docsToMigrate.length === 0) {
    return {
      migratedDocs: 0,
      upsertedCount: 0,
      modifiedCount: 0,
    };
  }

  const operations = docsToMigrate.map((doc) => ({
    replaceOne: {
      filter: { _id: doc._id },
      replacement: doc,
      upsert: true,
    },
  }));

  const result = await userDatasCollection.bulkWrite(operations, { ordered: false });
  return {
    migratedDocs: docsToMigrate.length,
    upsertedCount: result.upsertedCount || 0,
    modifiedCount: result.modifiedCount || 0,
  };
}

async function verifyAllDocumentsPresent(ttsCollection, userDatasCollection) {
  const sourceIds = await ttsCollection.find({}, { projection: { _id: 1 } }).toArray();
  if (sourceIds.length === 0) {
    return { verified: true, missingCount: 0 };
  }

  const targetMatches = await userDatasCollection
    .find({ _id: { $in: sourceIds.map((doc) => doc._id) } }, { projection: { _id: 1 } })
    .toArray();

  return {
    verified: targetMatches.length === sourceIds.length,
    missingCount: sourceIds.length - targetMatches.length,
  };
}

async function run() {
  const startedAt = new Date();
  const options = parseArgs(process.argv.slice(2));
  const ownerId = `${MIGRATION_NAME}:${process.pid}:${crypto.randomUUID()}`;
  const { uri, database } = getMongoConfig();
  const { MongoClient } = require("mongodb");
  const client = new MongoClient(uri);
  let db;

  const report = {
    migration: MIGRATION_NAME,
    dryRun: options.dryRun,
    ownerId,
    database,
    startedAt: startedAt.toISOString(),
    finishedAt: "",
    status: "running",
    sourceCollection: "tts",
    targetCollection: "user_datas",
    lockCollection: LOCK_COLLECTION,
    lockTimeoutMs: options.lockTimeoutMs,
    summary: {},
    sampleDocs: [],
    errors: [],
  };

  try {
    await client.connect();
    db = client.db(database);

    const lock = await acquireLock(db, ownerId, options.lockTimeoutMs);
    report.lock = {
      ownerId: lock.ownerId,
      startedAt: lock.startedAt instanceof Date ? lock.startedAt.toISOString() : lock.startedAt,
      expiresAt: lock.expiresAt instanceof Date ? lock.expiresAt.toISOString() : lock.expiresAt,
    };

    const ttsCollection = db.collection("tts");
    const userDatasCollection = db.collection("user_datas");
    const plan = await collectMigrationPlan(ttsCollection, userDatasCollection, options.sampleSize);

    report.sampleDocs = plan.sampleDocs;
    report.summary = {
      sourceCount: plan.sourceCount,
      targetCountBefore: plan.targetCountBefore,
      missingCount: plan.missingCount,
      action: plan.action,
    };

    if (plan.sourceCount === 0) {
      report.status = "noop";
      return report;
    }

    if (options.dryRun) {
      report.status = "dry-run";
      report.summary = {
        ...report.summary,
        wouldMigrateCount: plan.missingCount,
        wouldDropSource: true,
      };
      return report;
    }

    const migrationResult = await executeMigration(ttsCollection, userDatasCollection, plan.missingIds);
    const verification = await verifyAllDocumentsPresent(ttsCollection, userDatasCollection);
    if (!verification.verified) {
      throw new Error(`迁移校验失败，仍有 ${verification.missingCount} 条文档未出现在 user_datas`);
    }

    const dropResult = await ttsCollection.drop().catch((error) => {
      if (error && (error.codeName === "NamespaceNotFound" || /ns not found/i.test(String(error.message)))) {
        return false;
      }
      throw error;
    });

    report.status = "migrated";
    report.summary = {
      ...report.summary,
      migratedDocs: migrationResult.migratedDocs,
      upsertedCount: migrationResult.upsertedCount,
      modifiedCount: migrationResult.modifiedCount,
      verificationMissingCount: verification.missingCount,
      targetCountAfter: await userDatasCollection.countDocuments(),
      sourceDropped: dropResult !== false,
    };
    return report;
  } catch (error) {
    report.status = "failed";
    report.errors.push(error instanceof Error ? error.message : String(error));
    throw error;
  } finally {
    report.finishedAt = new Date().toISOString();
    if (db) {
      try {
        await releaseLock(db, ownerId);
      } catch (error) {
        report.errors.push(`释放迁移锁失败: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    if (options.reportFile) {
      const resolvedPath = path.resolve(options.reportFile);
      fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
      fs.writeFileSync(resolvedPath, JSON.stringify(report, null, 2));
    }
    console.log(JSON.stringify(report, null, 2));
    await client.close();
  }
}

run()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error(`[Migration] ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
