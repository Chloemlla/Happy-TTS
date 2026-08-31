import dotenv from "dotenv";
import type { LumenRuntimeConfig } from "./runtimeConfigDefaults.js";

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

export interface LumenConfig extends LumenRuntimeConfig {}

const isProduction = process.env.NODE_ENV === "production";

/**
 * Build the Lumen config from environment variables. This is the seed value at
 * module load and the env-seeded default used by config.ts / runtime config. A
 * stored LUMEN runtime-config doc overrides individual fields via refreshLumenConfig.
 */
export function buildLumenConfigFromEnv(): LumenConfig {
  const devLoginCode = process.env.LUMEN_DEV_LOGIN_CODE || "";

  return {
    enabled: boolFromEnv(process.env.LUMEN_ENABLED, false),
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
  };
}

// Mutable so RuntimeConfigService can hot-apply a stored LUMEN doc (refreshLumenConfig).
// Consumers read properties per request, so updates take effect without a restart.
export const lumenConfig: LumenConfig = buildLumenConfigFromEnv();

export function refreshLumenConfig(next: Partial<LumenConfig>): void {
  Object.assign(lumenConfig, next);
}

/**
 * Whether the Lumen subsystem is active. An explicitly set LUMEN_ENABLED env var
 * is authoritative (deployment switch); otherwise the runtime config value wins,
 * so the admin UI can enable Lumen without a redeploy.
 */
export function isLumenEnabled(): boolean {
  const envValue = process.env.LUMEN_ENABLED;
  if (envValue !== undefined && envValue !== "") return boolFromEnv(envValue, false);
  return lumenConfig.enabled;
}

// Production hardening: dangerous defaults (a known admin password, a hardcoded
// request-signing key, an empty outemail key that silently enables the dev login
// code, and the universal "000000" dev code) must never hold when the deployment
// explicitly enables Lumen. The runtime-config write path validates the same
// invariants (setLumenSetting), so enabling Lumen later via the admin UI cannot
// introduce a weak config. Mirrors the fail-fast style of src/config/config.ts.
if (isProduction && isLumenEnabled()) {
  const cfg = lumenConfig;
  const problems: string[] = [];
  if (!cfg.adminPassword || cfg.adminPassword.length < 12) {
    problems.push(
      "LUMEN_ADMIN_PASSWORD must be set to a strong value (>=12 chars) in production",
    );
  }
  if (!cfg.requestSigningSecret || cfg.requestSigningSecret.length < 32) {
    problems.push(
      "LUMEN_REQUEST_SIGNING_SECRET must be set (>=32 chars) in production",
    );
  }
  if (!cfg.outemailApiKey) {
    problems.push(
      "LUMEN_OUTEMAIL_API_KEY must be set in production (an empty value enables the dev login code path)",
    );
  }
  if (cfg.devLoginCode) {
    problems.push("LUMEN_DEV_LOGIN_CODE must not be set in production");
  }
  if (problems.length > 0) {
    throw new Error(
      "[lumen] Insecure production configuration:\n- " + problems.join("\n- "),
    );
  }
}
