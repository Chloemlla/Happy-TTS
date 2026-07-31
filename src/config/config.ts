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
  type LinuxDoCreditRuntimeConfig,
  type NexaiRuntimeConfig,
  type NexaiSigningRuntimeConfig,
  type TtsRuntimeConfig,
} from "./runtimeConfigDefaults";
import type { TtsProviderRuntimeConfig } from "./ttsProviderConfig";
import {
  isGenerationCodeConfigured,
  normalizeGenerationCode,
  validateGenerationCodeStrength,
} from "../utils/generationCodePolicy";

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
    // Google Identity Services (Web application client IDs)
    GOOGLE_CLIENT_ID: optionalTrimmedString,
    NEXAI_GOOGLE_CLIENT_ID: optionalTrimmedString,
    SYNAPSE_ANDROID_PACKAGE_NAME: optionalTrimmedString,
    SYNAPSE_ANDROID_SHA256_CERT_FINGERPRINTS: optionalTrimmedString,
    SYNAPSE_ANDROID_GOOGLE_CLIENT_ID: optionalTrimmedString,
    SYNAPSE_ANDROID_DISABLED: stringToBoolean,
    NEXAI_GITHUB_CLIENT_ID: optionalTrimmedString,
    NEXAI_GITHUB_CLIENT_SECRET: optionalTrimmedString,
    NEXAI_FRONTEND_URL: z.string().url().optional(),
    // NexAI request-signature middleware. Kept as loose strings (not z.enum/z.coerce) so a
    // malformed value degrades to the safe default instead of crashing startup.
    NEXAI_REQUEST_SIGNING: optionalTrimmedString,
    NEXAI_APP_SIGN_SECRET: optionalTrimmedString,
    NEXAI_APP_SIGN_SECRET_PREV: optionalTrimmedString,
    NEXAI_SIG_MAX_DRIFT_MS: optionalTrimmedString,
    OPENAI_API_KEY: optionalTrimmedString,
    OPENAI_KEY: optionalTrimmedString,
    OPENAI_BASE_URL: z.string().url().optional(),
    OPENAI_MODEL: z.string().optional().default("tts-1"),
    OPENAI_VOICE: z.string().optional().default("alloy"),
    OPENAI_RESPONSE_FORMAT: z.string().optional().default("mp3"),
    OPENAI_SPEED: z.string().optional().default("1.0"),
    TTS_PROVIDER: optionalTrimmedString,
    TTS_DEFAULT_MODEL: optionalTrimmedString,
    FISH_AUDIO_API_KEY: optionalTrimmedString,
    FISH_AUDIO_BASE_URL: optionalTrimmedString,
    FISH_AUDIO_REFERENCE_ID: optionalTrimmedString,
    FISH_AUDIO_MODEL: optionalTrimmedString,
    ADMIN_USERNAME: z.string().optional().default("admin"),
    ADMIN_PASSWORD: optionalTrimmedString,
    ADMIN_OPERATION_PASSWORD: optionalTrimmedString,
    // Empty = shared/anonymous generation-code gate not configured.
    // Never default to a predictable value such as "admin".
    GENERATION_CODE: optionalTrimmedString,
    JWT_SECRET: optionalTrimmedString,
    SIGN_SECRET_KEY: optionalTrimmedString,
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
    SERVER_PASSWORD: optionalTrimmedString,
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
    // LINUX DO Credit (积分支付)
    LINUXDO_CREDIT_ENABLED: stringToBoolean,
    LINUXDO_CREDIT_PID: optionalTrimmedString,
    LINUXDO_CREDIT_KEY: optionalTrimmedString,
    LINUXDO_CREDIT_PROTOCOL: z.enum(["epay", "ldc"]).optional(),
    LINUXDO_CREDIT_GATEWAY_BASE: z.string().url().optional(),
    LINUXDO_CREDIT_PRIVATE_KEY: optionalTrimmedString,
    LINUXDO_CREDIT_RATE: z.coerce.number().positive().max(1_000_000).optional(),
    LINUXDO_CREDIT_MAX_MONEY: z.coerce.number().positive().max(1_000_000).optional(),
    LINUXDO_CREDIT_NOTIFY_URL: z.string().url().optional(),
    LINUXDO_CREDIT_RETURN_URL: z.string().url().optional(),
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
    const generationCode = normalizeGenerationCode(env.GENERATION_CODE);
    if (generationCode) {
      const strength = validateGenerationCodeStrength(generationCode);
      if (!strength.ok) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["GENERATION_CODE"],
          message: strength.reason,
        });
      }
    }

    // Missing credentials must not prevent the HTTP process from starting. Security-critical
    // capabilities either use a process-local high-entropy secret (JWT) or remain disabled
    // until an administrator supplies the corresponding credential.
    if (!env.MONGO_URI && !env.MONGODB_URI) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["MONGO_URI"],
        message: "Application requires MONGO_URI or MONGODB_URI",
      });
    }

  });

const parsedEnv = envSchema.parse(process.env);

const baseUrl = parsedEnv.VITE_API_URL || parsedEnv.BASE_URL || "https://tts.chloemlla.com";
const frontendBaseUrl = parsedEnv.FRONTEND_URL || "https://tts.chloemlla.com";
const openaiApiKey = parsedEnv.OPENAI_KEY || parsedEnv.OPENAI_API_KEY;
const jwtSecretConfigured = Boolean(parsedEnv.JWT_SECRET);
const jwtSecret = parsedEnv.JWT_SECRET || generateEphemeralSecret();
const signSecretKey = parsedEnv.SIGN_SECRET_KEY || "";
const adminPassword = parsedEnv.ADMIN_PASSWORD || "";
const adminOperationPassword = parsedEnv.ADMIN_OPERATION_PASSWORD || adminPassword;
const serverPassword = parsedEnv.SERVER_PASSWORD || "";
const publicShortUrlEnabled = parsedEnv.PUBLIC_SHORT_URL_ENABLED === true;
const publicShortUrlPassword = parsedEnv.PUBLIC_SHORT_URL_PASSWORD;
const rustServicesEnabledByDefault = defaultRustServicesEnabled(parsedEnv.NODE_ENV);
const embeddedRustServicesEnabled = parsedEnv.RUST_EMBEDDED_SERVICES_ENABLED ?? rustServicesEnabledByDefault;
const requestedRustServices = {
  networkTools: parsedEnv.RUST_NETWORK_TOOLS_ENABLED ?? rustServicesEnabledByDefault,
  audioWorker: parsedEnv.RUST_AUDIO_WORKER_ENABLED ?? rustServicesEnabledByDefault,
  fileWorker: parsedEnv.RUST_FILE_WORKER_ENABLED ?? rustServicesEnabledByDefault,
  dataTools: parsedEnv.RUST_DATA_TOOLS_ENABLED ?? rustServicesEnabledByDefault,
  securityWorker: parsedEnv.RUST_SECURITY_WORKER_ENABLED ?? rustServicesEnabledByDefault,
};
const externalRustServicesRequested =
  !embeddedRustServicesEnabled && Object.values(requestedRustServices).some(Boolean);
const externalRustServicesConfigured = !externalRustServicesRequested || Boolean(parsedEnv.INTERNAL_SERVICE_TOKEN);
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
  runtimeMutableKeys: ["IPQS", "LINUXDO", "GOOGLE_AUTH", "DEEPLX", "NEXAI", "TTS", "TTS_PROVIDER", "EMAIL", "ADMIN_SECURITY", "SYNAPSE_ANDROID", "NEXAI_SIGNING"] as const,
});

const runtimeDefaults = buildRuntimeConfigDefaults({
  baseUrl,
  frontendBaseUrl,
  jwtSecret,
  adminPassword: adminOperationPassword,
  serverStatusPassword: serverPassword,
  publicShortUrlEnabled,
  publicShortUrlPassword,
  generationCode: normalizeGenerationCode(parsedEnv.GENERATION_CODE),
  ttsProvider: parsedEnv.TTS_PROVIDER,
  ttsDefaultModel: parsedEnv.TTS_DEFAULT_MODEL,
  openAiDefaultModel: parsedEnv.OPENAI_MODEL,
  fishAudioApiKey: parsedEnv.FISH_AUDIO_API_KEY,
  fishAudioBaseUrl: parsedEnv.FISH_AUDIO_BASE_URL,
  fishAudioReferenceId: parsedEnv.FISH_AUDIO_REFERENCE_ID,
  fishAudioModel: parsedEnv.FISH_AUDIO_MODEL,
  email: emailRuntimeDefaults,
  googleClientId: parsedEnv.GOOGLE_CLIENT_ID,
  nexaiGoogleClientId: parsedEnv.NEXAI_GOOGLE_CLIENT_ID || parsedEnv.GOOGLE_CLIENT_ID,
  synapseAndroidPackageName: parsedEnv.SYNAPSE_ANDROID_PACKAGE_NAME,
  synapseAndroidSha256CertFingerprints: parseCsv(
    parsedEnv.SYNAPSE_ANDROID_SHA256_CERT_FINGERPRINTS,
    [],
  ),
  synapseAndroidGoogleClientId: parsedEnv.SYNAPSE_ANDROID_GOOGLE_CLIENT_ID,
  synapseAndroidDisabled: parsedEnv.SYNAPSE_ANDROID_DISABLED,
});

// LINUX DO Credit merchant credentials come from env (not Mongo runtime mutable keys).
runtimeDefaults.linuxdoCredit = {
  ...runtimeDefaults.linuxdoCredit,
  enabled: parsedEnv.LINUXDO_CREDIT_ENABLED === true,
  pid: parsedEnv.LINUXDO_CREDIT_PID || "",
  key: parsedEnv.LINUXDO_CREDIT_KEY || "",
  protocol: parsedEnv.LINUXDO_CREDIT_PROTOCOL || "epay",
  gatewayBase: (parsedEnv.LINUXDO_CREDIT_GATEWAY_BASE || runtimeDefaults.linuxdoCredit.gatewayBase).replace(
    /\/+$/,
    "",
  ),
  privateKey: (parsedEnv.LINUXDO_CREDIT_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
  creditRate: parsedEnv.LINUXDO_CREDIT_RATE || runtimeDefaults.linuxdoCredit.creditRate,
  maxMoney: parsedEnv.LINUXDO_CREDIT_MAX_MONEY || runtimeDefaults.linuxdoCredit.maxMoney,
  notifyUrl: parsedEnv.LINUXDO_CREDIT_NOTIFY_URL || runtimeDefaults.linuxdoCredit.notifyUrl,
  returnUrl: parsedEnv.LINUXDO_CREDIT_RETURN_URL || runtimeDefaults.linuxdoCredit.returnUrl,
};

const linuxDoCreditConfig: LinuxDoCreditRuntimeConfig = { ...runtimeDefaults.linuxdoCredit };

// NexAI request-signature defaults come from env; a stored NEXAI_SIGNING doc overrides them
// at runtime (see src/middleware/nexaiRequestSignature.ts).
runtimeDefaults.nexaiSigning = {
  ...runtimeDefaults.nexaiSigning,
  mode: ((): NexaiSigningRuntimeConfig["mode"] => {
    const raw = (parsedEnv.NEXAI_REQUEST_SIGNING || "").toLowerCase();
    return raw === "off" || raw === "soft" || raw === "enforce" ? raw : runtimeDefaults.nexaiSigning.mode;
  })(),
  appSignSecret: parsedEnv.NEXAI_APP_SIGN_SECRET || "",
  appSignSecretPrev: parsedEnv.NEXAI_APP_SIGN_SECRET_PREV || "",
  maxDriftMs: ((): number => {
    const n = Number(parsedEnv.NEXAI_SIG_MAX_DRIFT_MS);
    return Number.isFinite(n) && n > 0 ? Math.round(n) : runtimeDefaults.nexaiSigning.maxDriftMs;
  })(),
};

RuntimeConfigService.configureDefaults(runtimeDefaults);

export const startupConfig = Object.freeze({
  nodeEnv: parsedEnv.NODE_ENV,
  port: parsedEnv.PORT,
  baseUrl,
  frontendBaseUrl,
  adminUsername: parsedEnv.ADMIN_USERNAME,
  adminPassword,
  jwtSecret,
  signSecretKey,
  configuredSecrets: {
    openaiApiKey: Boolean(openaiApiKey),
    jwtSecret: jwtSecretConfigured,
    signSecretKey: Boolean(parsedEnv.SIGN_SECRET_KEY),
    adminPassword: Boolean(parsedEnv.ADMIN_PASSWORD),
    adminOperationPassword: Boolean(parsedEnv.ADMIN_OPERATION_PASSWORD || parsedEnv.ADMIN_PASSWORD),
    serverPassword: Boolean(parsedEnv.SERVER_PASSWORD),
    passwordEncryptionKey: Boolean(process.env.PASSWORD_ENCRYPTION_KEY || process.env.AES_KEY || parsedEnv.JWT_SECRET),
    internalServiceToken: Boolean(parsedEnv.INTERNAL_SERVICE_TOKEN),
  },
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
  serverPassword,
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
    externalServicesConfigured: externalRustServicesConfigured,
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
      enabled: requestedRustServices.networkTools && externalRustServicesConfigured,
      url: parsedEnv.RUST_NETWORK_TOOLS_URL,
      timeoutMs: parsedEnv.RUST_NETWORK_TOOLS_TIMEOUT_MS,
      maxResponseBytes: parsedEnv.RUST_NETWORK_TOOLS_MAX_RESPONSE_BYTES,
      fallbackEnabled: parsedEnv.RUST_NETWORK_TOOLS_FALLBACK_ENABLED ?? true,
      blockPrivateTargets: parsedEnv.RUST_NETWORK_TOOLS_BLOCK_PRIVATE_TARGETS ?? true,
    },
    audioWorker: {
      enabled: requestedRustServices.audioWorker && externalRustServicesConfigured,
      url: parsedEnv.RUST_AUDIO_WORKER_URL,
      timeoutMs: parsedEnv.RUST_AUDIO_WORKER_TIMEOUT_MS,
      maxBytes: parsedEnv.RUST_AUDIO_WORKER_MAX_BYTES,
      operations: parseCsv(parsedEnv.RUST_AUDIO_WORKER_OPERATIONS, ["passthrough", "analyze"]),
      fallbackEnabled: parsedEnv.RUST_AUDIO_WORKER_FALLBACK_ENABLED ?? true,
    },
    fileWorker: {
      enabled: requestedRustServices.fileWorker && externalRustServicesConfigured,
      url: parsedEnv.RUST_FILE_WORKER_URL,
      timeoutMs: parsedEnv.RUST_FILE_WORKER_TIMEOUT_MS,
      maxBytes: parsedEnv.RUST_FILE_WORKER_MAX_BYTES,
      fallbackEnabled: parsedEnv.RUST_FILE_WORKER_FALLBACK_ENABLED ?? true,
    },
    dataTools: {
      enabled: requestedRustServices.dataTools && externalRustServicesConfigured,
      url: parsedEnv.RUST_DATA_TOOLS_URL,
      timeoutMs: parsedEnv.RUST_DATA_TOOLS_TIMEOUT_MS,
      maxBytes: parsedEnv.RUST_DATA_TOOLS_MAX_BYTES,
      maxItems: parsedEnv.RUST_DATA_TOOLS_MAX_ITEMS,
      fallbackEnabled: parsedEnv.RUST_DATA_TOOLS_FALLBACK_ENABLED ?? true,
    },
    securityWorker: {
      enabled: requestedRustServices.securityWorker && externalRustServicesConfigured,
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
  get synapseAndroid() {
    return RuntimeConfigService.getCachedConfig().synapseAndroid;
  },
  get deeplx(): DeepLXRuntimeConfig {
    return RuntimeConfigService.getCachedConfig().deeplx;
  },
  get nexai(): NexaiRuntimeConfig {
    return RuntimeConfigService.getCachedConfig().nexai;
  },
  get nexaiSigning(): NexaiSigningRuntimeConfig {
    return RuntimeConfigService.getCachedConfig().nexaiSigning;
  },
  get tts(): TtsRuntimeConfig {
    return RuntimeConfigService.getCachedConfig().tts;
  },
  get ttsProvider(): TtsProviderRuntimeConfig {
    return RuntimeConfigService.getCachedConfig().ttsProvider;
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
  signSecretKey: startupConfig.signSecretKey,
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
  /** LINUX DO Credit merchant config (env-backed). */
  get linuxdoCredit(): LinuxDoCreditRuntimeConfig {
    return linuxDoCreditConfig;
  },
  get googleAuth() {
    return runtimeMutableConfig.googleAuth;
  },
  get synapseAndroid() {
    return runtimeMutableConfig.synapseAndroid;
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
  get generationCodeConfigured() {
    return isGenerationCodeConfigured(runtimeMutableConfig.tts.generationCode);
  },
};

export type AppConfig = typeof config;
