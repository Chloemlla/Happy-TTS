import path from "node:path";
import crypto from "node:crypto";
import dotenv from "dotenv";
import { z } from "zod";
import { RuntimeConfigService } from "../services/runtimeConfigService";
import {
  buildRuntimeConfigDefaults,
  type DeepLXRuntimeConfig,
  type AdminSecurityRuntimeConfig,
  type EmailRuntimeConfig,
  type GoogleAuthRuntimeConfig,
  type IpqsRuntimeConfig,
  type LinuxDoRuntimeConfig,
  type NexaiRuntimeConfig,
  type TtsRuntimeConfig,
} from "./runtimeConfigDefaults";

dotenv.config();

function generateEphemeralSecret(): string {
  return crypto.randomBytes(48).toString("hex");
}

const stringToBoolean = z
  .union([z.boolean(), z.string(), z.number()])
  .optional()
  .transform((value) => {
    if (typeof value === "boolean") return value;
    if (typeof value === "number") return value !== 0;
    if (typeof value === "string") return !["false", "0", "no", "off", ""].includes(value.trim().toLowerCase());
    return undefined;
  });

function defaultRustServicesEnabled(nodeEnv: string | undefined): boolean {
  return nodeEnv === "production";
}

function parseCsv(value: string | undefined, fallback: string[]): string[] {
  if (!value) return fallback;
  const parsed = value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  return parsed.length > 0 ? parsed : fallback;
}

const optionalTrimmedString = z
  .union([z.string(), z.undefined()])
  .optional()
  .transform((value) => {
    if (typeof value !== "string") return undefined;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  });

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).optional().default("development"),
    TZ: z.string().optional(),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    BASE_URL: z.string().url().optional(),
    VITE_API_URL: z.string().url().optional(),
    FRONTEND_URL: z.string().url().optional(),
    OPENAI_API_KEY: optionalTrimmedString,
    OPENAI_KEY: optionalTrimmedString,
    OPENAI_BASE_URL: z.string().url().optional(),
    OPENAI_MODEL: z.string().optional().default("tts-1"),
    OPENAI_VOICE: z.string().optional().default("alloy"),
    OPENAI_RESPONSE_FORMAT: z.string().optional().default("mp3"),
    OPENAI_SPEED: z.string().optional().default("1.0"),
    ADMIN_USERNAME: z.string().optional().default("admin"),
    ADMIN_PASSWORD: optionalTrimmedString,
    ADMIN_OPERATION_PASSWORD: optionalTrimmedString,
    GENERATION_CODE: z.string().optional().default("admin"),
    JWT_SECRET: optionalTrimmedString,
    JWT_EXPIRES_IN: z
      .string()
      .trim()
      .regex(/^\d+(ms|s|m|h|d|w|y)$/i, "JWT_EXPIRES_IN must be a duration like 30d, 12h, or 90m")
      .optional()
      .default("30d"),
    PUBLIC_SHORT_URL_ENABLED: stringToBoolean,
    PUBLIC_SHORT_URL_PASSWORD: optionalTrimmedString,
    REDIS_URL: z.string().url().optional(),
    MONGO_URI: optionalTrimmedString,
    MONGODB_URI: optionalTrimmedString,
    MONGO_DB: z.string().optional().default("tts"),
    TURNSTILE_SECRET_KEY: z.string().optional().default(""),
    TURNSTILE_SITE_KEY: z.string().optional().default(""),
    WAF_ENABLED: stringToBoolean,
    ENABLE_FIRST_VISIT_VERIFICATION: stringToBoolean,
    AUDIT_LOG_MASKING: stringToBoolean,
    SERVER_PASSWORD: z.string().optional().default("wmy"),
    RESEND_API_KEY: optionalTrimmedString,
    RESEND_DOMAIN: z.string().optional().default("chloemlla.com"),
    OUTEMAIL_ENABLED: stringToBoolean,
    VITE_OUTEMAIL_ENABLED: stringToBoolean,
    RESEND_OUTEMAIL_ENABLED: stringToBoolean,
    OUTEMAIL_DOMAIN: optionalTrimmedString,
    RESEND_DOMAIN_OUT: optionalTrimmedString,
    OUTEMAIL_API_KEY: optionalTrimmedString,
    RESEND_API_OUT: optionalTrimmedString,
    OUTEMAIL_CODE: z.string().optional().default(""),
    // ============================================
    // IPFS / ImageBed 上传相关配置
    // 这些键同时支持 MongoDB shorturl_settings 动态覆盖；
    // 当数据库未配置时，回退到此处的环境变量值。
    // ============================================
    IPFS_UPLOAD_URL: optionalTrimmedString,
    IPFS_UA: optionalTrimmedString,
    IPFS_BYPASS_UA_KEYWORD: optionalTrimmedString,
    IPFS_ALLOW_ALL_FILE_TYPES: stringToBoolean,
    IPFS_DEV_SKIP_TURNSTILE: stringToBoolean,
    IMAGE_BED_API_URL: z.string().url().optional().default("https://img.scdn.io/api/v1.php"),
    IMAGE_BED_CDN_DOMAIN: optionalTrimmedString,
    IMAGE_BED_STORAGE_DESTINATION: z.enum(["local", "telegram", "r2"]).optional(),
    IMAGE_BED_OUTPUT_FORMAT: z
      .enum(["auto", "jpg", "jpeg", "png", "webp", "gif", "webp_animated"])
      .optional(),
    INTERNAL_SERVICE_TOKEN: optionalTrimmedString,
    RUST_IPC_ENABLED: stringToBoolean,
    RUST_IPC_DIR: optionalTrimmedString,
    RUST_IPC_CHANNEL_BYTES: z.coerce
      .number()
      .int()
      .min(1024 * 1024)
      .max(2 * 1024 * 1024 * 1024)
      .optional()
      .default(256 * 1024 * 1024),
    RUST_NETWORK_TOOLS_ENABLED: stringToBoolean,
    RUST_NETWORK_TOOLS_URL: z.string().url().optional().default("http://127.0.0.1:4010"),
    RUST_NETWORK_TOOLS_TIMEOUT_MS: z.coerce.number().int().min(100).max(60000).optional().default(5000),
    RUST_NETWORK_TOOLS_MAX_RESPONSE_BYTES: z.coerce
      .number()
      .int()
      .min(1)
      .max(10 * 1024 * 1024)
      .optional()
      .default(1024 * 1024),
    RUST_NETWORK_TOOLS_FALLBACK_ENABLED: stringToBoolean,
    RUST_NETWORK_TOOLS_BLOCK_PRIVATE_TARGETS: stringToBoolean,
    RUST_EMBEDDED_SERVICES_ENABLED: stringToBoolean,
    RUST_NETWORK_TOOLS_BIN: optionalTrimmedString,
    RUST_AUDIO_WORKER_BIN: optionalTrimmedString,
    RUST_FILE_WORKER_BIN: optionalTrimmedString,
    RUST_DATA_TOOLS_BIN: optionalTrimmedString,
    RUST_SECURITY_WORKER_BIN: optionalTrimmedString,
    RUST_AUDIO_WORKER_ENABLED: stringToBoolean,
    RUST_AUDIO_WORKER_URL: z.string().url().optional().default("http://127.0.0.1:4020"),
    RUST_AUDIO_WORKER_TIMEOUT_MS: z.coerce.number().int().min(1000).max(300000).optional().default(30000),
    RUST_AUDIO_WORKER_MAX_BYTES: z.coerce
      .number()
      .int()
      .min(1)
      .max(100 * 1024 * 1024)
      .optional()
      .default(20 * 1024 * 1024),
    RUST_AUDIO_WORKER_OPERATIONS: z.string().optional(),
    RUST_AUDIO_WORKER_FALLBACK_ENABLED: stringToBoolean,
    RUST_FILE_WORKER_ENABLED: stringToBoolean,
    RUST_FILE_WORKER_URL: z.string().url().optional().default("http://127.0.0.1:4030"),
    RUST_FILE_WORKER_TIMEOUT_MS: z.coerce.number().int().min(1000).max(300000).optional().default(30000),
    RUST_FILE_WORKER_MAX_BYTES: z.coerce
      .number()
      .int()
      .min(1)
      .max(500 * 1024 * 1024)
      .optional()
      .default(50 * 1024 * 1024),
    RUST_FILE_WORKER_FALLBACK_ENABLED: stringToBoolean,
    RUST_DATA_TOOLS_ENABLED: stringToBoolean,
    RUST_DATA_TOOLS_URL: z.string().url().optional().default("http://127.0.0.1:4040"),
    RUST_DATA_TOOLS_TIMEOUT_MS: z.coerce.number().int().min(1000).max(300000).optional().default(30000),
    RUST_DATA_TOOLS_MAX_BYTES: z.coerce
      .number()
      .int()
      .min(1)
      .max(100 * 1024 * 1024)
      .optional()
      .default(20 * 1024 * 1024),
    RUST_DATA_TOOLS_MAX_ITEMS: z.coerce.number().int().min(1).max(100000).optional().default(1024),
    RUST_DATA_TOOLS_FALLBACK_ENABLED: stringToBoolean,
    RUST_SECURITY_WORKER_ENABLED: stringToBoolean,
    RUST_SECURITY_WORKER_URL: z.string().url().optional().default("http://127.0.0.1:4050"),
    RUST_SECURITY_WORKER_TIMEOUT_MS: z.coerce.number().int().min(100).max(60000).optional().default(5000),
    RUST_SECURITY_WORKER_MAX_TEXT_BYTES: z.coerce
      .number()
      .int()
      .min(1)
      .max(50 * 1024 * 1024)
      .optional()
      .default(2 * 1024 * 1024),
    RUST_SECURITY_WORKER_MAX_RULES: z.coerce.number().int().min(1).max(100000).optional().default(2048),
    RUST_SECURITY_WORKER_FALLBACK_ENABLED: stringToBoolean,
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === "production") {
      if (!env.JWT_SECRET) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["JWT_SECRET"],
          message: "Production requires JWT_SECRET",
        });
      }
      if (!env.ADMIN_PASSWORD) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["ADMIN_PASSWORD"],
          message: "Production requires ADMIN_PASSWORD",
        });
      }
      if (env.PUBLIC_SHORT_URL_ENABLED === true && !env.PUBLIC_SHORT_URL_PASSWORD) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["PUBLIC_SHORT_URL_PASSWORD"],
          message: "Production requires PUBLIC_SHORT_URL_PASSWORD when PUBLIC_SHORT_URL_ENABLED=true",
        });
      }
    }
    if (!env.MONGO_URI && !env.MONGODB_URI) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["MONGO_URI"],
        message: "Application requires MONGO_URI or MONGODB_URI",
      });
    }

    if (
      (env.OUTEMAIL_ENABLED === true || env.VITE_OUTEMAIL_ENABLED === true || env.RESEND_OUTEMAIL_ENABLED === true) &&
      !env.OUTEMAIL_DOMAIN &&
      !env.RESEND_DOMAIN_OUT &&
      !env.RESEND_DOMAIN
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["OUTEMAIL_DOMAIN"],
        message: "Out-email service requires OUTEMAIL_DOMAIN or RESEND_DOMAIN",
      });
    }

    const rustNetworkToolsEnabled =
      env.RUST_NETWORK_TOOLS_ENABLED ?? defaultRustServicesEnabled(env.NODE_ENV);
    const rustAudioWorkerEnabled =
      env.RUST_AUDIO_WORKER_ENABLED ?? defaultRustServicesEnabled(env.NODE_ENV);
    const rustFileWorkerEnabled =
      env.RUST_FILE_WORKER_ENABLED ?? defaultRustServicesEnabled(env.NODE_ENV);
    const rustDataToolsEnabled =
      env.RUST_DATA_TOOLS_ENABLED ?? defaultRustServicesEnabled(env.NODE_ENV);
    const rustSecurityWorkerEnabled =
      env.RUST_SECURITY_WORKER_ENABLED ?? defaultRustServicesEnabled(env.NODE_ENV);
    const embeddedRustServicesEnabled =
      env.RUST_EMBEDDED_SERVICES_ENABLED ?? defaultRustServicesEnabled(env.NODE_ENV);
    if (
      (rustNetworkToolsEnabled ||
        rustAudioWorkerEnabled ||
        rustFileWorkerEnabled ||
        rustDataToolsEnabled ||
        rustSecurityWorkerEnabled) &&
      !embeddedRustServicesEnabled &&
      !env.INTERNAL_SERVICE_TOKEN
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["INTERNAL_SERVICE_TOKEN"],
        message: "External Rust internal services require INTERNAL_SERVICE_TOKEN when enabled",
      });
    }
  });

const parsedEnv = envSchema.parse(process.env);

const baseUrl = parsedEnv.VITE_API_URL || parsedEnv.BASE_URL || "https://tts.chloemlla.com";
const frontendBaseUrl = parsedEnv.FRONTEND_URL || "https://tts.chloemlla.com";
const openaiApiKey = parsedEnv.OPENAI_KEY || parsedEnv.OPENAI_API_KEY;
const jwtSecret = parsedEnv.JWT_SECRET || generateEphemeralSecret();
const adminPassword = parsedEnv.NODE_ENV === "production" ? parsedEnv.ADMIN_PASSWORD! : parsedEnv.ADMIN_PASSWORD || "admin";
const adminOperationPassword = parsedEnv.ADMIN_OPERATION_PASSWORD || adminPassword;
const publicShortUrlEnabled = parsedEnv.PUBLIC_SHORT_URL_ENABLED === true;
const publicShortUrlPassword = parsedEnv.PUBLIC_SHORT_URL_PASSWORD;
const rustServicesEnabledByDefault = defaultRustServicesEnabled(parsedEnv.NODE_ENV);
const embeddedRustServicesEnabled = parsedEnv.RUST_EMBEDDED_SERVICES_ENABLED ?? rustServicesEnabledByDefault;
const rustIpcEnabled = parsedEnv.RUST_IPC_ENABLED ?? embeddedRustServicesEnabled;
const rustIpcDir = parsedEnv.RUST_IPC_DIR || path.join(process.cwd(), "data", "rust-ipc");
const internalServiceToken =
  parsedEnv.INTERNAL_SERVICE_TOKEN || (embeddedRustServicesEnabled ? generateEphemeralSecret() : "");
const emailRuntimeDefaults: EmailRuntimeConfig = {
  enabled: Boolean(parsedEnv.RESEND_API_KEY),
  resendDomain: parsedEnv.RESEND_DOMAIN,
  resendApiKey: parsedEnv.RESEND_API_KEY || "",
  quotaTotal: Number(process.env.RESEND_QUOTA_TOTAL) || 100,
  outemailEnabled:
    parsedEnv.OUTEMAIL_ENABLED === true ||
    parsedEnv.VITE_OUTEMAIL_ENABLED === true ||
    parsedEnv.RESEND_OUTEMAIL_ENABLED === true,
  outemailDomain: parsedEnv.OUTEMAIL_DOMAIN || parsedEnv.RESEND_DOMAIN_OUT || parsedEnv.RESEND_DOMAIN,
  outemailApiKey: parsedEnv.OUTEMAIL_API_KEY || parsedEnv.RESEND_API_OUT || parsedEnv.RESEND_API_KEY || "",
  outemailCode: parsedEnv.OUTEMAIL_CODE,
  outemailQuotaTotal: Number(process.env.OUTEMAIL_QUOTA_TOTAL || process.env.RESEND_QUOTA_TOTAL) || 100,
};

export const compileTimeConfig = Object.freeze({
  timezone: "Asia/Shanghai",
  audioDir: path.join(process.cwd(), "finish"),
  dataDir: path.join(process.cwd(), "data"),
  logsDir: path.join(process.cwd(), "logs"),
  runtimeMutableKeys: ["IPQS", "LINUXDO", "GOOGLE_AUTH", "DEEPLX", "NEXAI", "TTS", "EMAIL", "ADMIN_SECURITY"] as const,
});

const runtimeDefaults = buildRuntimeConfigDefaults({
  baseUrl,
  frontendBaseUrl,
  jwtSecret,
  adminPassword: adminOperationPassword,
  serverStatusPassword: parsedEnv.SERVER_PASSWORD,
  publicShortUrlEnabled,
  publicShortUrlPassword,
  generationCode: parsedEnv.GENERATION_CODE,
  email: emailRuntimeDefaults,
});

RuntimeConfigService.configureDefaults(runtimeDefaults);

export const startupConfig = Object.freeze({
  nodeEnv: parsedEnv.NODE_ENV,
  port: parsedEnv.PORT,
  baseUrl,
  frontendBaseUrl,
  adminUsername: parsedEnv.ADMIN_USERNAME,
  adminPassword,
  jwtSecret,
  jwtExpiresIn: parsedEnv.JWT_EXPIRES_IN,
  bcryptSaltRounds: 12,
  localIps: ["127.0.0.1", "localhost", "::1"],
  openai: {
    apiKey: openaiApiKey,
    baseUrl: parsedEnv.OPENAI_BASE_URL,
    model: parsedEnv.OPENAI_MODEL,
    voice: parsedEnv.OPENAI_VOICE,
    responseFormat: parsedEnv.OPENAI_RESPONSE_FORMAT,
    speed: parsedEnv.OPENAI_SPEED,
  },
  redis: {
    url: parsedEnv.REDIS_URL || "",
    enabled: Boolean(parsedEnv.REDIS_URL),
  },
  mongo: {
    uri: parsedEnv.MONGO_URI || parsedEnv.MONGODB_URI || "",
    database: parsedEnv.MONGO_DB,
  },
  turnstile: {
    secretKey: parsedEnv.TURNSTILE_SECRET_KEY,
    siteKey: parsedEnv.TURNSTILE_SITE_KEY,
  },
  security: {
    wafEnabled: parsedEnv.WAF_ENABLED ?? true,
    auditLogMasking: parsedEnv.AUDIT_LOG_MASKING ?? true,
    enableFirstVisitVerification: parsedEnv.ENABLE_FIRST_VISIT_VERIFICATION ?? true,
  },
  email: {
    resendApiKey: parsedEnv.RESEND_API_KEY,
    resendDomain: parsedEnv.RESEND_DOMAIN,
    outemail: {
      enabled:
        parsedEnv.OUTEMAIL_ENABLED === true ||
        parsedEnv.VITE_OUTEMAIL_ENABLED === true ||
        parsedEnv.RESEND_OUTEMAIL_ENABLED === true,
      domain: parsedEnv.OUTEMAIL_DOMAIN || parsedEnv.RESEND_DOMAIN_OUT || parsedEnv.RESEND_DOMAIN,
      apiKey: parsedEnv.OUTEMAIL_API_KEY || parsedEnv.RESEND_API_OUT || parsedEnv.RESEND_API_KEY,
      code: parsedEnv.OUTEMAIL_CODE,
    },
  },
  serverPassword: parsedEnv.SERVER_PASSWORD,
  publicShortUrl: {
    enabled: publicShortUrlEnabled,
    password: publicShortUrlPassword,
  },
  ipBanStorage: parsedEnv.REDIS_URL ? ("redis" as const) : ("mongo" as const),
  ipfs: {
    uploadUrl: parsedEnv.IPFS_UPLOAD_URL,
    userAgent: parsedEnv.IPFS_UA,
    bypassUaKeyword: parsedEnv.IPFS_BYPASS_UA_KEYWORD,
    allowAllFileTypes: parsedEnv.IPFS_ALLOW_ALL_FILE_TYPES,
    devSkipTurnstile: parsedEnv.IPFS_DEV_SKIP_TURNSTILE,
  },
  imageBed: {
    apiUrl: parsedEnv.IMAGE_BED_API_URL,
    cdnDomain: parsedEnv.IMAGE_BED_CDN_DOMAIN,
    storageDestination: parsedEnv.IMAGE_BED_STORAGE_DESTINATION,
    outputFormat: parsedEnv.IMAGE_BED_OUTPUT_FORMAT,
  },
  rustServices: {
    internalToken: internalServiceToken,
    ipc: {
      enabled: rustIpcEnabled,
      dir: rustIpcDir,
      channelBytes: parsedEnv.RUST_IPC_CHANNEL_BYTES,
    },
    embedded: {
      enabled: embeddedRustServicesEnabled,
      networkToolsBin: parsedEnv.RUST_NETWORK_TOOLS_BIN || "/usr/local/bin/network-tools",
      audioWorkerBin: parsedEnv.RUST_AUDIO_WORKER_BIN || "/usr/local/bin/audio-worker",
      fileWorkerBin: parsedEnv.RUST_FILE_WORKER_BIN || "/usr/local/bin/file-worker",
      dataToolsBin: parsedEnv.RUST_DATA_TOOLS_BIN || "/usr/local/bin/data-tools",
      securityWorkerBin: parsedEnv.RUST_SECURITY_WORKER_BIN || "/usr/local/bin/security-worker",
      generatedInternalToken: !parsedEnv.INTERNAL_SERVICE_TOKEN && embeddedRustServicesEnabled,
    },
    networkTools: {
      enabled: parsedEnv.RUST_NETWORK_TOOLS_ENABLED ?? rustServicesEnabledByDefault,
      url: parsedEnv.RUST_NETWORK_TOOLS_URL,
      timeoutMs: parsedEnv.RUST_NETWORK_TOOLS_TIMEOUT_MS,
      maxResponseBytes: parsedEnv.RUST_NETWORK_TOOLS_MAX_RESPONSE_BYTES,
      fallbackEnabled: parsedEnv.RUST_NETWORK_TOOLS_FALLBACK_ENABLED ?? true,
      blockPrivateTargets: parsedEnv.RUST_NETWORK_TOOLS_BLOCK_PRIVATE_TARGETS ?? true,
    },
    audioWorker: {
      enabled: parsedEnv.RUST_AUDIO_WORKER_ENABLED ?? rustServicesEnabledByDefault,
      url: parsedEnv.RUST_AUDIO_WORKER_URL,
      timeoutMs: parsedEnv.RUST_AUDIO_WORKER_TIMEOUT_MS,
      maxBytes: parsedEnv.RUST_AUDIO_WORKER_MAX_BYTES,
      operations: parseCsv(parsedEnv.RUST_AUDIO_WORKER_OPERATIONS, ["passthrough", "analyze"]),
      fallbackEnabled: parsedEnv.RUST_AUDIO_WORKER_FALLBACK_ENABLED ?? true,
    },
    fileWorker: {
      enabled: parsedEnv.RUST_FILE_WORKER_ENABLED ?? rustServicesEnabledByDefault,
      url: parsedEnv.RUST_FILE_WORKER_URL,
      timeoutMs: parsedEnv.RUST_FILE_WORKER_TIMEOUT_MS,
      maxBytes: parsedEnv.RUST_FILE_WORKER_MAX_BYTES,
      fallbackEnabled: parsedEnv.RUST_FILE_WORKER_FALLBACK_ENABLED ?? true,
    },
    dataTools: {
      enabled: parsedEnv.RUST_DATA_TOOLS_ENABLED ?? rustServicesEnabledByDefault,
      url: parsedEnv.RUST_DATA_TOOLS_URL,
      timeoutMs: parsedEnv.RUST_DATA_TOOLS_TIMEOUT_MS,
      maxBytes: parsedEnv.RUST_DATA_TOOLS_MAX_BYTES,
      maxItems: parsedEnv.RUST_DATA_TOOLS_MAX_ITEMS,
      fallbackEnabled: parsedEnv.RUST_DATA_TOOLS_FALLBACK_ENABLED ?? true,
    },
    securityWorker: {
      enabled: parsedEnv.RUST_SECURITY_WORKER_ENABLED ?? rustServicesEnabledByDefault,
      url: parsedEnv.RUST_SECURITY_WORKER_URL,
      timeoutMs: parsedEnv.RUST_SECURITY_WORKER_TIMEOUT_MS,
      maxTextBytes: parsedEnv.RUST_SECURITY_WORKER_MAX_TEXT_BYTES,
      maxRules: parsedEnv.RUST_SECURITY_WORKER_MAX_RULES,
      fallbackEnabled: parsedEnv.RUST_SECURITY_WORKER_FALLBACK_ENABLED ?? true,
    },
  },
});

export const runtimeMutableConfig = {
  defaults: runtimeDefaults,
  get ipqs(): IpqsRuntimeConfig {
    return RuntimeConfigService.getCachedConfig().ipqs;
  },
  get linuxdo(): LinuxDoRuntimeConfig {
    return RuntimeConfigService.getCachedConfig().linuxdo;
  },
  get googleAuth(): GoogleAuthRuntimeConfig {
    return RuntimeConfigService.getCachedConfig().googleAuth;
  },
  get deeplx(): DeepLXRuntimeConfig {
    return RuntimeConfigService.getCachedConfig().deeplx;
  },
  get nexai(): NexaiRuntimeConfig {
    return RuntimeConfigService.getCachedConfig().nexai;
  },
  get tts(): TtsRuntimeConfig {
    return RuntimeConfigService.getCachedConfig().tts;
  },
  get email(): EmailRuntimeConfig {
    return RuntimeConfigService.getCachedConfig().email;
  },
  get adminSecurity(): AdminSecurityRuntimeConfig {
    return RuntimeConfigService.getCachedConfig().adminSecurity;
  },
};

export const config = {
  port: startupConfig.port,
  openaiApiKey: startupConfig.openai.apiKey,
  openaiBaseUrl: startupConfig.openai.baseUrl,
  openaiModel: startupConfig.openai.model,
  openaiVoice: startupConfig.openai.voice,
  openaiResponseFormat: startupConfig.openai.responseFormat,
  openaiSpeed: startupConfig.openai.speed,
  audioDir: compileTimeConfig.audioDir,
  adminUsername: startupConfig.adminUsername,
  adminPassword: startupConfig.adminPassword,
  localIps: startupConfig.localIps,
  baseUrl: startupConfig.baseUrl,
  jwtSecret: startupConfig.jwtSecret,
  jwtExpiresIn: startupConfig.jwtExpiresIn,
  bcryptSaltRounds: startupConfig.bcryptSaltRounds,
  loginRateLimit: {
    windowMs: 15 * 60 * 1000,
    max: 5,
  },
  registerRateLimit: {
    windowMs: 60 * 60 * 1000,
    max: 3,
  },
  turnstile: startupConfig.turnstile,
  redis: startupConfig.redis,
  ipBanStorage: startupConfig.ipBanStorage,
  enableFirstVisitVerification: startupConfig.security.enableFirstVisitVerification,
  frontendBaseUrl: startupConfig.frontendBaseUrl,
  auditLogMasking: startupConfig.security.auditLogMasking,
  get adminOperationPassword() {
    return runtimeMutableConfig.adminSecurity.operationPassword;
  },
  get serverStatusPassword() {
    return runtimeMutableConfig.adminSecurity.serverStatusPassword;
  },
  get publicShortUrl() {
    const adminSecurity = runtimeMutableConfig.adminSecurity;
    return {
      enabled: adminSecurity.publicShortUrlEnabled,
      password: adminSecurity.publicShortUrlPassword,
    };
  },
  rustServices: startupConfig.rustServices,
  get ipqs() {
    return runtimeMutableConfig.ipqs;
  },
  get linuxdo() {
    return runtimeMutableConfig.linuxdo;
  },
  get googleAuth() {
    return runtimeMutableConfig.googleAuth;
  },
  get deeplx() {
    return runtimeMutableConfig.deeplx;
  },
  get nexai() {
    return runtimeMutableConfig.nexai;
  },
  get tts() {
    return runtimeMutableConfig.tts;
  },
  get generationCode() {
    return runtimeMutableConfig.tts.generationCode;
  },
};

export type AppConfig = typeof config;
