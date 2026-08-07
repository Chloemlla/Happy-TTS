#!/usr/bin/env node
/**
 * 一次性迁移: 将所有 role === "admin" 用户提升为 superadmin(双层管理员架构)。
 *
 * 与 migrate-tts-user-datas.js 同为纯 node 脚本, 可在生产容器内直接运行:
 *   - 不依赖 src/ 源码(生产镜像只有混淆后的 dist/, 无 src/)
 *   - 直接用 mongodb 驱动操作 user_datas 集合(mongodb 是直接依赖)
 *   - 幂等: 重复执行时 role === "admin" 已无匹配, matched=0
 *
 * 部署顺序: 先跑本迁移, 再让现有 admin 用户保留写权限(新代码要求写操作是 superadmin)。
 */
const { MongoClient } = require("mongodb");

function getMongoConfig() {
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("缺少 MONGO_URI / MONGODB_URI 环境变量");
  }
  const database = process.env.MONGO_DB || "tts";
  return { uri, database };
}

function parseArgs(argv) {
  const args = { dryRun: false };
  for (const arg of argv) {
    if (arg === "--dry-run") {
      args.dryRun = true;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      console.log("Usage: npm run migrate:admin-to-superadmin -- [--dry-run]");
      process.exit(0);
    }
    throw new Error(`未知参数: ${arg}`);
  }
  return args;
}

async function main() {
  const { dryRun } = parseArgs(process.argv.slice(2));
  const { uri, database } = getMongoConfig();
  const client = new MongoClient(uri);

  try {
    await client.connect();
    const users = client.db(database).collection("user_datas");

    const total = await users.countDocuments();
    const admins = await users.countDocuments({ role: "admin" });

    if (dryRun) {
      console.log(JSON.stringify({ success: true, dryRun: true, total, wouldUpgrade: admins, skipped: total - admins }, null, 2));
      return;
    }

    const result = await users.updateMany({ role: "admin" }, { $set: { role: "superadmin" } });
    console.log(
      JSON.stringify(
        {
          success: true,
          dryRun: false,
          total,
          upgraded: result.modifiedCount,
          matched: result.matchedCount,
          skipped: total - admins,
        },
        null,
        2,
      ),
    );
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error("[migrate-admin-to-superadmin] failed", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
