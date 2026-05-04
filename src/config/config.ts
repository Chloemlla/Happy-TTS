import path from "node:path";
import dotenv from "dotenv";
import { z } from "zod";
import { RuntimeConfigService } from "../services/runtimeConfigService";
import {
  buildRuntimeConfigDefaults,
  type DeepLXRuntimeConfig,
  type GoogleAuthRuntimeConfig,
  type IpqsRuntimeConfig,
  type LinuxDoRuntimeConfig,
  type NexaiRuntimeConfig,
  type TtsRuntimeConfig,
} from "./runtimeConfigDefaults";

dotenv.config();

const DEV_JWT_SECRET = "yb56beb12b35ab636b66c4f9fc168646785a8e85a";

const stringToBoolean = z
  .union([z.boolean(), z.string(), z.number()])
  .optional()
  .transform((value) => {
    if (typeof value === "boolean") return value;
    if (typeof value === "number") return value !== 0;
    if (typeof value === "string") return !["false", "0", "no", "off", ""].includes(value.trim().toLowerCase());
    return undefined;
  });

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
    GENERATION_CODE: z.string().optional().default("admin"),
    JWT_SECRET: optionalTrimmedString,
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
  });

const parsedEnv = envSchema.parse(process.env);

const baseUrl = parsedEnv.VITE_API_URL || parsedEnv.BASE_URL || "https://tts.chloemlla.com";
const frontendBaseUrl = parsedEnv.FRONTEND_URL || "https://tts.chloemlla.com";
const openaiApiKey = parsedEnv.OPENAI_KEY || parsedEnv.OPENAI_API_KEY;
const jwtSecret = parsedEnv.NODE_ENV === "production" ? parsedEnv.JWT_SECRET! : parsedEnv.JWT_SECRET || DEV_JWT_SECRET;
const adminPassword = parsedEnv.NODE_ENV === "production" ? parsedEnv.ADMIN_PASSWORD! : parsedEnv.ADMIN_PASSWORD || "admin";

export const compileTimeConfig = Object.freeze({
  timezone: "Asia/Shanghai",
  audioDir: path.join(process.cwd(), "finish"),
  dataDir: path.join(process.cwd(), "data"),
  logsDir: path.join(process.cwd(), "logs"),
  runtimeMutableKeys: ["IPQS", "LINUXDO", "GOOGLE_AUTH", "DEEPLX", "NEXAI"] as const,
});

const runtimeDefaults = buildRuntimeConfigDefaults({
  baseUrl,
  frontendBaseUrl,
  jwtSecret,
  generationCode: parsedEnv.GENERATION_CODE,
});

RuntimeConfigService.configureDefaults(runtimeDefaults);

export const startupConfig = Object.freeze({
  nodeEnv: parsedEnv.NODE_ENV,
  port: parsedEnv.PORT,
  baseUrl,
  frontendBaseUrl,
  adminUsername: parsedEnv.ADMIN_USERNAME,
  adminPassword,
  generationCode: parsedEnv.GENERATION_CODE,
  jwtSecret,
  jwtExpiresIn: "24h",
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
  ipBanStorage: parsedEnv.REDIS_URL ? ("redis" as const) : ("mongo" as const),
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
  generationCode: startupConfig.generationCode,
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
};

export type AppConfig = typeof config;
