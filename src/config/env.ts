import dotenv from "dotenv";
import path from "path";

// 加载环境变量
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

// 设置默认值
const rpOriginDefault = "https://api.hapxs.com";

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
  RP_ID: process.env.RP_ID || "api.hapxs.com",

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
    "https://api.hapxs.com,https://tts.hapx.one,https://tts.hapxs.com,https://951100.xyz,https://tts.951100.xyz",

  USER_STORAGE_MODE: process.env.USER_STORAGE_MODE || "file",
};

export const MYSQL_HOST = process.env.MYSQL_HOST || "localhost";
export const MYSQL_PORT = process.env.MYSQL_PORT ? parseInt(process.env.MYSQL_PORT, 10) : 3306;
export const MYSQL_USER = process.env.MYSQL_USER || "root";
export const MYSQL_PASSWORD = process.env.MYSQL_PASSWORD || "";
export const MYSQL_DATABASE = process.env.MYSQL_DATABASE || "happy_tts";
// Turnstile 配置
export const TURNSTILE_SECRET_KEY = process.env.TURNSTILE_SECRET_KEY || "";
export const TURNSTILE_SITE_KEY = process.env.TURNSTILE_SITE_KEY || "";
