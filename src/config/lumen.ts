import dotenv from "dotenv";

dotenv.config();

function boolFromEnv(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === "") return fallback;
  return !["false", "0", "no", "off", ""].includes(value.trim().toLowerCase());
}

function intFromEnv(value: string | undefined, fallback: number, max?: number): number {
  if (value === undefined || value === "") return fallback;
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) return fallback;
  if (max !== undefined) return Math.min(parsed, max);
  return parsed;
}

export const lumenConfig = {
  adminPassword: process.env.LUMEN_ADMIN_PASSWORD || "change-me",
  adminUsername: process.env.LUMEN_ADMIN_USERNAME || "admin",
  adminAutomationToken: process.env.LUMEN_ADMIN_AUTOMATION_TOKEN || "",

  requestSigningSecret: process.env.LUMEN_REQUEST_SIGNING_SECRET || "project-lumen-local-request-signing-key",
  requireRequestSigning: boolFromEnv(process.env.LUMEN_REQUIRE_REQUEST_SIGNING, false),

  acceptUnverifiedPurchases: boolFromEnv(process.env.LUMEN_ACCEPT_UNVERIFIED_PURCHASES, false),

  outemailApiKey: process.env.LUMEN_OUTEMAIL_API_KEY || "",
  outemailApiUrl: process.env.LUMEN_OUTEMAIL_API_URL || "",

  appVersion: process.env.LUMEN_APP_VERSION || "0.1.0",

  sessionTtlDays: intFromEnv(process.env.LUMEN_SESSION_TTL_DAYS, 90),
  loginCodeTtlSeconds: intFromEnv(process.env.LUMEN_LOGIN_CODE_TTL_SECONDS, 300),

  adminSessionTtlSeconds: intFromEnv(process.env.LUMEN_ADMIN_SESSION_TTL_SECONDS, 3600),
  adminRefreshTtlSeconds: intFromEnv(process.env.LUMEN_ADMIN_REFRESH_TTL_SECONDS, 604800),

  accessTokenTtlSeconds: intFromEnv(process.env.LUMEN_ACCESS_TOKEN_TTL_SECONDS, 7200, 7200),
  refreshTokenTtlSeconds: intFromEnv(process.env.LUMEN_REFRESH_TOKEN_TTL_SECONDS, 2592000, 2592000),

  devLoginCode: process.env.LUMEN_DEV_LOGIN_CODE || "000000",

  requestTimestampSkewSeconds: intFromEnv(process.env.LUMEN_REQUEST_TIMESTAMP_SKEW_SECONDS, 300, 300),

  allowPublicReleaseCheck: boolFromEnv(process.env.LUMEN_ALLOW_PUBLIC_RELEASE_CHECK, true),

  outemailFrom: process.env.LUMEN_OUTEMAIL_FROM || "noreply",
  outemailDisplayName: process.env.LUMEN_OUTEMAIL_DISPLAY_NAME || "Project Lumen",
  outemailDomain: process.env.LUMEN_OUTEMAIL_DOMAIN || "",
  outemailTimeoutSeconds: intFromEnv(process.env.LUMEN_OUTEMAIL_TIMEOUT_SECONDS, 10),
  outemailBaseUrl: process.env.LUMEN_OUTEMAIL_BASE_URL || "https://tts.chloemlla.com",
} as const;

export type LumenConfig = typeof lumenConfig;