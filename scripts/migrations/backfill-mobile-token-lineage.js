#!/usr/bin/env node
/**
 * P5-①: backfill `lineageId` on mobile_client_tokens.
 *
 * Why this is needed: `lineageId` arrived with the rotation lineage, so tokens issued
 * before it have no value. The runtime fallback (lineageIdOf in
 * src/services/mobileLoginService.ts) treats "this token's own hash" as the chain root,
 * which keeps a token together with the descendants it rotated into *after* the field
 * existed — but a pre-field token is NOT joined to the generations it had already
 * produced. This script walks the recorded chain (rotatedFrom) once and writes the true
 * chain root onto every generation, so "整链吊销" reaches the whole chain again.
 *
 * Plain node + mongodb driver, like the other scripts here: the production image ships
 * only obfuscated dist/, so this must not import from src/.
 *
 * Dry run by default. `--apply` writes.
 *
 *   node scripts/migrations/backfill-mobile-token-lineage.js
 *   node scripts/migrations/backfill-mobile-token-lineage.js --apply
 *
 * Idempotent: only documents whose `lineageId` is absent/null are written, so a second
 * run matches 0. Never merges two chains — a generation whose `rotatedFrom` is missing,
 * or points at a token no longer in the collection (it may have hit the 90-day TTL), is
 * treated as its own chain root, exactly like the runtime fallback.
 */
const { MongoClient } = require("mongodb");

const COLLECTION = "mobile_client_tokens";

function getMongoConfig() {
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("缺少 MONGO_URI / MONGODB_URI 环境变量");
  }
  const database = process.env.MONGO_DB || "tts";
  return { uri, database };
}

function parseArgs(argv) {
  const args = { apply: false };
  for (const arg of argv) {
    if (arg === "--apply") {
      args.apply = true;
      continue;
    }
    if (arg === "--dry-run") {
      args.apply = false;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      console.log("Usage: npm run migrate:mobile-token-lineage -- [--apply]");
      process.exit(0);
    }
    throw new Error(`未知参数: ${arg}`);
  }
  return args;
}

function needsLineage(doc) {
  return doc.lineageId === undefined || doc.lineageId === null || doc.lineageId === "";
}

/**
 * 沿 rotatedFrom 向上走到链根，返回该根应当写入的 lineageId。
 * 走到某个祖先本身已有 lineageId 就以它为准（部分迁移过的链不会被改写）。
 */
function resolveLineageId(hash, byHash) {
  let current = byHash.get(hash);
  const seen = new Set([hash]);
  while (current && current.rotatedFrom && byHash.has(current.rotatedFrom)) {
    const parent = byHash.get(current.rotatedFrom);
    if (parent.lineageId) return parent.lineageId;
    if (seen.has(parent.tokenHash)) break; // 环保护：正常数据不会有环
    seen.add(parent.tokenHash);
    current = parent;
  }
  return current.tokenHash;
}

async function main() {
  const { apply } = parseArgs(process.argv.slice(2));
  const { uri, database } = getMongoConfig();
  const client = new MongoClient(uri);

  try {
    await client.connect();
    const collection = client.db(database).collection(COLLECTION);

    const docs = await collection
      .find({}, { projection: { tokenHash: 1, lineageId: 1, rotatedFrom: 1, userId: 1 } })
      .toArray();
    const byHash = new Map(docs.map((doc) => [doc.tokenHash, doc]));
    const pending = docs.filter(needsLineage);

    console.log(`集合 ${database}.${COLLECTION}: 共 ${docs.length} 张令牌，缺 lineageId ${pending.length} 张。`);

    if (pending.length === 0) {
      console.log("无需回填。");
      return;
    }

    // lineageId → 需要写入的 tokenHash[]
    const byLineage = new Map();
    for (const doc of pending) {
      const lineageId = resolveLineageId(doc.tokenHash, byHash);
      if (!byLineage.has(lineageId)) byLineage.set(lineageId, []);
      byLineage.get(lineageId).push(doc.tokenHash);
    }

    console.log(`将回填为 ${byLineage.size} 条血缘。`);

    if (!apply) {
      let shown = 0;
      for (const [lineageId, hashes] of byLineage) {
        if (shown >= 5) break;
        console.log(`  ${lineageId} ← ${hashes.length} 张`);
        shown += 1;
      }
      if (byLineage.size > shown) console.log(`  … 其余 ${byLineage.size - shown} 条略`);
      console.log("这是 dry-run：未写入任何数据。加 --apply 才会落库。");
      return;
    }

    let modified = 0;
    for (const [lineageId, hashes] of byLineage) {
      const result = await collection.updateMany(
        // 只改还没回填的：重跑与并发写入都不会被覆盖。
        { tokenHash: { $in: hashes }, lineageId: null },
        { $set: { lineageId } },
      );
      modified += result.modifiedCount;
    }
    console.log(`已写入 ${modified} 张令牌的 lineageId。`);
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error("回填失败:", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
