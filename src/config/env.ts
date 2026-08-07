// Compatibility env accessors for non-secret defaults.
// Security-critical secrets (JWT_SECRET, SIGN_SECRET_KEY, ADMIN_PASSWORD, INTERNAL_SERVICE_TOKEN)
// must be validated and consumed through src/config/config.ts, not ad-hoc process.env defaults.

import path from "node:path";
import fs from "node:fs";
import dotenv from "dotenv";

// 加载环境变量
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

// 加载运行时配置（通过管理后台写入的 env.admin.json），覆盖 .env 默认值
const adminEnvPath = path.resolve(__dirname, "../../data/env.admin.json");
if (fs.existsSync(adminEnvPath)) {
  try {
    const adminEnvs: Array<{ key: string; value: string }> = JSON.parse(
      fs.readFileSync(adminEnvPath, "utf-8"),
    );
    for (const entry of adminEnvs) {
      if (entry.key && entry.value !== undefined) {
        process.env[entry.key] = entry.value;
      }
    }
  } catch {
    // env.admin.json 损坏时静默忽略，不阻塞启动
  }
}

// 设置默认值
const rpOriginDefault = "https://tts.chloemlla.com";

export const env = {
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  OPENAI_BASE_URL: process.env.OPENAI_BASE_URL,
  PORT: process.env.PORT || "3000",
  // ============================================
  // Passkey 相关配置 - 统一 RP_ID 模式
  // ============================================
  // RP_ID 用于所有前端的 Passkey 操作
  // 所有四个前端创建的 Passkey 都会使用这个 RP_ID
  // 因此它们可以在任何前端中互相使用
  RP_ID: process.env.RP_ID || "tts.chloemlla.com",

  // RP_ORIGIN 必须与 RP_ID 对应
  // 格式: https://domain (必须是 HTTPS 在生产环境)
  RP_ORIGIN: process.env.RP_ORIGIN || rpOriginDefault,

  // RP_ORIGIN_MODE 模式选择
  // - 'fixed': 使用配置的固定值（推荐用于多前端单后端架构）
  // - 'dynamic': 从客户端请求动态获取（推荐用于多后端架构）
  RP_ORIGIN_MODE: process.env.RP_ORIGIN_MODE || "fixed",

  // 允许的 Origin 列表（用于 CORS 和验证）
  // 包含所有四个前端域名和后端域名
  ALLOWED_ORIGINS:
    process.env.ALLOWED_ORIGINS ||
    "https://tts.chloemlla.com,https://chloemlla.com,https://*.chloemlla.com",

  USER_STORAGE_MODE: "mongo",
};
