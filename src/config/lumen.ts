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

// Production hardening: dangerous defaults (a known admin password, a hardcoded
// request-signing key, an empty outemail key that silently enables the dev login
// code, and the universal "000000" dev code) must never hold in production.
// Mirrors the fail-fast style of src/config/config.ts for ADMIN_PASSWORD / JWT_SECRET.
const isProduction = process.env.NODE_ENV === "production";

const devLoginCode = process.env.LUMEN_DEV_LOGIN_CODE || "";

export const lumenConfig = {
  adminPassword: process.env.LUMEN_ADMIN_PASSWORD || (isProduction ? "" : "change-me"),
  adminUsername: process.env.LUMEN_ADMIN_USERNAME || "admin",
  adminAutomationToken: process.env.LUMEN_ADMIN_AUTOMATION_TOKEN || "",

  requestSigningSecret:
    process.env.LUMEN_REQUEST_SIGNING_SECRET || (isProduction ? "" : "project-lumen-local-request-signing-key"),
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

  // In production this resolves to "" so `code === lumenConfig.devLoginCode` can never match.
  devLoginCode: isProduction ? "" : devLoginCode,

  requestTimestampSkewSeconds: intFromEnv(process.env.LUMEN_REQUEST_TIMESTAMP_SKEW_SECONDS, 300, 300),

  allowPublicReleaseCheck: boolFromEnv(process.env.LUMEN_ALLOW_PUBLIC_RELEASE_CHECK, true),

  outemailFrom: process.env.LUMEN_OUTEMAIL_FROM || "noreply",
  outemailDisplayName: process.env.LUMEN_OUTEMAIL_DISPLAY_NAME || "Project Lumen",
  outemailDomain: process.env.LUMEN_OUTEMAIL_DOMAIN || "",
  outemailTimeoutSeconds: intFromEnv(process.env.LUMEN_OUTEMAIL_TIMEOUT_SECONDS, 10),
  outemailBaseUrl: process.env.LUMEN_OUTEMAIL_BASE_URL || "https://tts.chloemlla.com",
} as const;

if (isProduction) {
  const problems: string[] = [];
  if (!process.env.LUMEN_ADMIN_PASSWORD || lumenConfig.adminPassword.length < 12) {
    problems.push(
      "LUMEN_ADMIN_PASSWORD must be set to a strong value (>=12 chars) in production",
    );
  }
  if (!process.env.LUMEN_REQUEST_SIGNING_SECRET || lumenConfig.requestSigningSecret.length < 32) {
    problems.push(
      "LUMEN_REQUEST_SIGNING_SECRET must be set (>=32 chars) in production",
    );
  }
  if (process.env.LUMEN_DEV_LOGIN_CODE !== undefined && process.env.LUMEN_DEV_LOGIN_CODE !== "") {
    problems.push("LUMEN_DEV_LOGIN_CODE must not be set in production");
  }
  if (!process.env.LUMEN_OUTEMAIL_API_KEY) {
    problems.push(
      "LUMEN_OUTEMAIL_API_KEY must be set in production (an empty value enables the dev login code path)",
    );
  }
  if (problems.length > 0) {
    throw new Error(
      "[lumen] Insecure production configuration:\n- " + problems.join("\n- "),
    );
  }
}

export type LumenConfig = typeof lumenConfig;