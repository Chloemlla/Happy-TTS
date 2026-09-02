// Compatibility env accessors for non-secret defaults.
// Security-critical secrets (JWT_SECRET, SIGN_SECRET_KEY, ADMIN_PASSWORD, INTERNAL_SERVICE_TOKEN)
// must be validated and consumed through src/config/config.ts, not ad-hoc process.env defaults.

import path from "node:path";
import fs from "node:fs";
import dotenv from "dotenv";
import { PROTECTED_ENV_KEYS } from "./protectedEnvKeys";

// 加载环境变量
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const adminEnvPath = path.resolve(__dirname, "../../data/env.admin.json");

// 配置源优先级（高 → 低）：管理后台写的 env.admin.json > 真实进程环境变量 > .env > 本文件默认值。
// adminController.setEnv 落盘的同时也写 process.env，重启后必须由本函数重放才能维持同一优先级，
// 否则管理员改的值重启即回滚。
// 硬约束：必须早于任何对 process.env 的快照 —— 最早的快照点是 config.ts 的 envSchema.parse，
// 晚于它则 config.* 永远看不到后台配置（G8-08 即此）。dotenv 不覆盖已存在的键，所以本函数
// 与 dotenv.config() 的先后不影响结果。
export function applyAdminEnvOverlay(): void {
  if (!fs.existsSync(adminEnvPath)) return;
  try {
    const adminEnvs: Array<{ key: string; value: string }> = JSON.parse(
      fs.readFileSync(adminEnvPath, "utf-8"),
    );
    for (const entry of adminEnvs) {
      if (!entry.key || entry.value === undefined) continue;
      // 写入侧已拦掉这些键，但这份文件也可能是手工编辑或旧版本留下的，重放侧必须再拦一次。
      if (PROTECTED_ENV_KEYS.has(entry.key.trim().toUpperCase())) continue;
      process.env[entry.key] = entry.value;
    }
  } catch {
    // env.admin.json 损坏时静默忽略，不阻塞启动
  }
}

applyAdminEnvOverlay();

// 设置默认值
const rpOriginDefault = "https://tts.chloemlla.com";

// 一律用 getter 在读取时解析：导入期定格会同时丢掉上面的重放和管理后台运行期的改动，也会与
// src/utils/nexaiWebAuthn.ts 对同一批键的惰性读取分歧（两套 WebAuthn 拿到不同的 RP_ID）。
export const env = {
  // ============================================
  // Passkey 相关配置 - 统一 RP_ID 模式
  // ============================================
  // RP_ID 用于所有前端的 Passkey 操作
  // 所有四个前端创建的 Passkey 都会使用这个 RP_ID
  // 因此它们可以在任何前端中互相使用
  get RP_ID(): string {
    return process.env.RP_ID || "tts.chloemlla.com";
  },

  // RP_ORIGIN 必须与 RP_ID 对应
  // 格式: https://domain (必须是 HTTPS 在生产环境)
  get RP_ORIGIN(): string {
    return process.env.RP_ORIGIN || rpOriginDefault;
  },

  // RP_ORIGIN_MODE 模式选择
  // - 'fixed': 使用配置的固定值（推荐用于多前端单后端架构）
  // - 'dynamic': 从客户端请求动态获取（推荐用于多后端架构）
  get RP_ORIGIN_MODE(): string {
    return process.env.RP_ORIGIN_MODE || "fixed";
  },

  // 允许的 Origin 列表（用于 CORS 和验证）
  // 包含所有四个前端域名和后端域名
  get ALLOWED_ORIGINS(): string {
    return process.env.ALLOWED_ORIGINS || "https://tts.chloemlla.com,https://chloemlla.com,https://*.chloemlla.com";
  },
};
