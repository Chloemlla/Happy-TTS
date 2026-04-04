import path from "node:path";
import dotenv from "dotenv";
import {
  buildRuntimeConfigDefaults,
  type DeepLXRuntimeConfig,
  type GoogleAuthRuntimeConfig,
  type IpqsRuntimeConfig,
  type LinuxDoRuntimeConfig,
  type NexaiRuntimeConfig,
} from "./runtimeConfigDefaults";
import { RuntimeConfigService } from "../services/runtimeConfigService";
import { MYSQL_DATABASE } from "./env";

dotenv.config();

const baseUrl =
  process.env.VITE_API_URL ||
  process.env.BASE_URL ||
  "https://api.951100.xyz";

const frontendBaseUrl = process.env.FRONTEND_URL || "https://tts.951100.xyz";

const jwtSecret =
  process.env.NODE_ENV === "production"
    ? process.env.JWT_SECRET ||
      (() => {
        throw new Error("Production requires JWT_SECRET");
      })()
    : process.env.JWT_SECRET || "yb56beb12b35ab636b66c4f9fc168646785a8e85a";

const runtimeDefaults = buildRuntimeConfigDefaults({
  baseUrl,
  frontendBaseUrl,
  jwtSecret,
});

RuntimeConfigService.configureDefaults(runtimeDefaults);

function getRuntimeIpqsConfig(): IpqsRuntimeConfig {
  return RuntimeConfigService.getCachedConfig().ipqs;
}

function getRuntimeLinuxDoConfig(): LinuxDoRuntimeConfig {
  return RuntimeConfigService.getCachedConfig().linuxdo;
}

function getRuntimeGoogleAuthConfig(): GoogleAuthRuntimeConfig {
  return RuntimeConfigService.getCachedConfig().googleAuth;
}

function getRuntimeDeepLXConfig(): DeepLXRuntimeConfig {
  return RuntimeConfigService.getCachedConfig().deeplx;
}

function getRuntimeNexaiConfig(): NexaiRuntimeConfig {
  return RuntimeConfigService.getCachedConfig().nexai;
}

export const config = {
  port: process.env.PORT || 3000,
  openaiApiKey: process.env.OPENAI_KEY,
  openaiModel: process.env.OPENAI_MODEL || "tts-1",
  openaiVoice: process.env.OPENAI_VOICE || "alloy",
  openaiResponseFormat: process.env.OPENAI_RESPONSE_FORMAT || "mp3",
  openaiSpeed: process.env.OPENAI_SPEED || "1.0",
  audioDir: path.join(process.cwd(), "finish"),
  adminUsername: process.env.ADMIN_USERNAME || "admin",
  adminPassword:
    process.env.NODE_ENV === "production"
      ? process.env.ADMIN_PASSWORD ||
        (() => {
          throw new Error("Production requires ADMIN_PASSWORD");
        })()
      : process.env.ADMIN_PASSWORD || "admin",
  localIps: ["127.0.0.1", "localhost", "::1"],
  baseUrl,
  generationCode: process.env.GENERATION_CODE || "admin",
  jwtSecret,
  jwtExpiresIn: "24h",
  bcryptSaltRounds: 12,
  loginRateLimit: {
    windowMs: 15 * 60 * 1000,
    max: 5,
  },
  registerRateLimit: {
    windowMs: 60 * 60 * 1000,
    max: 3,
  },
  userStorageMode: process.env.USER_STORAGE_MODE || "file",
  turnstile: {
    secretKey: process.env.TURNSTILE_SECRET_KEY || "",
    siteKey: process.env.TURNSTILE_SITE_KEY || "",
  },
  mysql: {
    host: process.env.MYSQL_HOST || "localhost",
    port: process.env.MYSQL_PORT || 3306,
    user: process.env.MYSQL_USER || "root",
    password: process.env.MYSQL_PASSWORD || "root",
    database: MYSQL_DATABASE,
  },
  redis: {
    url: process.env.REDIS_URL || "",
    enabled: !!process.env.REDIS_URL,
  },
  ipBanStorage: process.env.REDIS_URL ? "redis" : "mongo",
  enableFirstVisitVerification:
    process.env.ENABLE_FIRST_VISIT_VERIFICATION !== "false",
  get ipqs() {
    return getRuntimeIpqsConfig();
  },
  frontendBaseUrl,
  get linuxdo() {
    return getRuntimeLinuxDoConfig();
  },
  get googleAuth() {
    return getRuntimeGoogleAuthConfig();
  },
  get deeplx() {
    return getRuntimeDeepLXConfig();
  },
  auditLogMasking: process.env.AUDIT_LOG_MASKING !== "false",
  get nexai() {
    return getRuntimeNexaiConfig();
  },
};
