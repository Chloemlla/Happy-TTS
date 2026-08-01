import {
  buildRuntimeConfigDefaults,
  cloneRuntimeConfigDefaults,
  type AdminSecurityRuntimeConfig,
  type DeepLXRuntimeConfig,
  type EmailRuntimeConfig,
  type GoogleAuthRuntimeConfig,
  type IpqsRuntimeConfig,
  type LinuxDoRuntimeConfig,
  type NexaiRuntimeConfig,
  type NexaiSigningRuntimeConfig,
  type RuntimeConfigDefaults,
  type SynapseAndroidRuntimeConfig,
  type TtsRuntimeConfig,
} from "../config/runtimeConfigDefaults";
import {
  mergeTtsProviderAdminUpdate,
  normalizeTtsProviderRuntimeConfig,
  type TtsProviderRuntimeConfig,
} from "../config/ttsProviderConfig";
import { formatFishAudioCatalogCurl } from "../config/fishAudioCatalog";
import { type RuntimeConfigKey, RuntimeConfigModel } from "../models/runtimeConfigModel";
import {
  assertStrongGenerationCode,
  normalizeGenerationCode,
} from "../utils/generationCodePolicy";
import logger from "../utils/logger";
import { normalizeScamalyticsUser, validateScamalyticsUser } from "../utils/scamalytics";
import { mongoose } from "./mongoService";

const FALLBACK_BASE_URL = "https://tts.chloemlla.com";
const FALLBACK_FRONTEND_URL = "https://tts.chloemlla.com";
const FALLBACK_JWT_SECRET = "yb56beb12b35ab636b66c4f9fc168646785a8e85a";
const DURATION_PATTERN = /^\d+[smhd]$/i;
const RESEND_API_KEY_PATTERN = /^re_\w{8,}/;
const DOMAIN_PATTERN = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;
const TRUSTED_DEEPLX_BASE_URL = "https://api.deeplx.org";

let runtimeConfigDefaults: RuntimeConfigDefaults = buildRuntimeConfigDefaults({
  baseUrl: FALLBACK_BASE_URL,
  frontendBaseUrl: FALLBACK_FRONTEND_URL,
  jwtSecret: FALLBACK_JWT_SECRET,
  adminPassword: "admin",
  serverStatusPassword: "wmy",
  publicShortUrlEnabled: false,
  publicShortUrlPassword: "",
  generationCode: "",
  email: {
    enabled: false,
    resendDomain: "chloemlla.com",
    resendApiKey: "",
    quotaTotal: 100,
    outemailEnabled: false,
    outemailDomain: "chloemlla.com",
    outemailApiKey: "",
    outemailCode: "",
    outemailQuotaTotal: 100,
  },
});

let runtimeConfigCache: RuntimeConfigDefaults = cloneRuntimeConfigDefaults(runtimeConfigDefaults);
const loadedKeys = new Set<RuntimeConfigKey>();
let initialized = false;

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function hasOwnKey(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function normalizeString(value: unknown, fallback: string, maxLength = 2048): string {
  if (typeof value !== "string") return fallback;
  return value.trim().slice(0, maxLength);
}

function normalizeOptionalString(value: unknown, fallback: string, maxLength = 2048): string {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed.slice(0, maxLength) : "";
}

function normalizeUrl(value: unknown, fallback: string): string {
  const candidate = normalizeString(value, fallback);
  if (!candidate) return fallback;

  try {
    const parsed = new URL(candidate);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return parsed.toString().replace(/\/+$/, "");
    }
  } catch (_error) {
    return fallback;
  }

  return fallback;
}

function normalizeDomain(value: unknown, fallback: string): string {
  const candidate = normalizeOptionalString(value, fallback, 253).toLowerCase();
  if (!candidate) return fallback;
  return DOMAIN_PATTERN.test(candidate) ? candidate : fallback;
}

function normalizeDuration(value: unknown, fallback: string): string {
  const candidate = normalizeString(value, fallback, 32);
  return DURATION_PATTERN.test(candidate) ? candidate : fallback;
}

function normalizeInteger(value: unknown, fallback: number, min: number, max: number): number {
  const candidate = Number(value);
  if (!Number.isFinite(candidate)) return fallback;
  return Math.min(max, Math.max(min, Math.round(candidate)));
}

function normalizeBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "on"].includes(normalized)) return true;
    if (["false", "0", "no", "off"].includes(normalized)) return false;
  }
  return fallback;
}

function normalizeStringArray(value: unknown, fallback: string[]): string[] {
  const source = Array.isArray(value) ? value : typeof value === "string" ? value.split(/[\r\n,]+/) : fallback;

  const normalized = source.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean);

  return Array.from(new Set(normalized));
}

function maskSecret(value: string): string {
  if (!value) return "";
  if (value.length <= 6) return "*".repeat(value.length);
  return `${value.slice(0, 2)}***${value.slice(-4)}`;
}

function buildDeepLXTranslateUrl(baseUrl: string, apiKey: string): string {
  const normalizedBaseUrl = baseUrl.replace(/\/+$/, "");
  const keySegment = apiKey.trim() || "<api-key>";
  return `${normalizedBaseUrl}/${keySegment}/translate`;
}

function normalizeDeepLXBaseUrl(value: unknown, fallback: string): string {
  const candidate = normalizeUrl(value, fallback);

  try {
    const parsed = new URL(candidate);
    if (
      parsed.protocol === "https:" &&
      parsed.hostname.toLowerCase() === "api.deeplx.org" &&
      !parsed.username &&
      !parsed.password &&
      (!parsed.pathname || parsed.pathname === "/")
    ) {
      return TRUSTED_DEEPLX_BASE_URL;
    }
  } catch {
    return fallback;
  }

  return fallback;
}

function normalizeStoredIpqsConfig(value: unknown, defaults = runtimeConfigDefaults.ipqs): IpqsRuntimeConfig {
  const raw = asObject(value);
  const apiKeys = normalizeStringArray(raw.apiKeys, defaults.apiKeys);
  const scamalyticsUser = normalizeScamalyticsUser(raw.scamalyticsUser, defaults.scamalyticsUser || "");
  const enabled = normalizeBoolean(raw.enabled, defaults.enabled);

  return {
    apiKeys,
    scamalyticsUser,
    enabled: enabled && (apiKeys.length > 0 || scamalyticsUser.length > 0),
    strictness: normalizeInteger(raw.strictness, defaults.strictness, 0, 3),
    allowPublicAccessPoints: normalizeBoolean(raw.allowPublicAccessPoints, defaults.allowPublicAccessPoints),
    lighterPenalties: normalizeBoolean(raw.lighterPenalties, defaults.lighterPenalties),
    timeoutMs: normalizeInteger(raw.timeoutMs, defaults.timeoutMs, 1000, 60000),
    monthlyQuotaPerKey: normalizeInteger(raw.monthlyQuotaPerKey, defaults.monthlyQuotaPerKey, 1, 1_000_000),
    challengeFraudScore: normalizeInteger(raw.challengeFraudScore, defaults.challengeFraudScore, 0, 100),
    tokenTtlMinutes: normalizeInteger(raw.tokenTtlMinutes, defaults.tokenTtlMinutes, 1, 1440),
    failOpen: normalizeBoolean(raw.failOpen, defaults.failOpen),
  };
}

function normalizeStoredLinuxDoConfig(value: unknown, defaults = runtimeConfigDefaults.linuxdo): LinuxDoRuntimeConfig {
  const raw = asObject(value);

  const normalizeLinuxDoFrontendCallbackUrl = (candidate: unknown, fallback: string): string => {
    const normalized = normalizeUrl(candidate, fallback);
    try {
      const url = new URL(normalized);
      url.pathname = "/auth/linuxdo/callback";
      url.search = "";
      url.hash = "";
      return url.toString();
    } catch {
      return fallback;
    }
  };

  return {
    clientId: normalizeOptionalString(raw.clientId, defaults.clientId, 512),
    clientSecret: normalizeOptionalString(raw.clientSecret, defaults.clientSecret, 1024),
    discoveryUrl: normalizeUrl(raw.discoveryUrl, defaults.discoveryUrl),
    scopes: normalizeString(raw.scopes, defaults.scopes, 512),
    authorizationEndpoint: normalizeUrl(raw.authorizationEndpoint, defaults.authorizationEndpoint),
    tokenEndpoint: normalizeUrl(raw.tokenEndpoint, defaults.tokenEndpoint),
    userEndpoint: normalizeUrl(raw.userEndpoint, defaults.userEndpoint),
    forumBaseUrl: normalizeUrl(raw.forumBaseUrl, defaults.forumBaseUrl),
    callbackUrl: normalizeUrl(raw.callbackUrl, defaults.callbackUrl),
    frontendCallbackUrl: normalizeLinuxDoFrontendCallbackUrl(
      raw.frontendCallbackUrl,
      defaults.frontendCallbackUrl,
    ),
  };
}

/** Google Identity Services requires a Web application OAuth client ID. */
export const GOOGLE_WEB_CLIENT_ID_PATTERN = /^[\w-]+\.apps\.googleusercontent\.com$/i;

export function isValidGoogleWebClientId(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  return GOOGLE_WEB_CLIENT_ID_PATTERN.test(trimmed);
}

/**
 * Extract client_id from admin form payloads or Google Cloud Console OAuth JSON.
 * Preference order follows GSI Web requirements:
 * 1) web.client_id (Web application)
 * 2) top-level clientId / client_id
 * 3) installed.client_id (Desktop) — last resort for diagnostics only
 */
export function extractGoogleAuthClientId(value: unknown): string {
  const raw = asObject(value);
  const web = asObject(raw.web);
  const installed = asObject(raw.installed);

  const webClientId = normalizeOptionalString(web.clientId ?? web.client_id, "", 512);
  if (webClientId) {
    return webClientId;
  }

  const plainClientId = normalizeOptionalString(raw.clientId ?? raw.client_id, "", 512);
  if (plainClientId) {
    return plainClientId;
  }

  return normalizeOptionalString(installed.clientId ?? installed.client_id, "", 512);
}

export function looksLikeGoogleOAuthClientJson(value: unknown): boolean {
  const raw = asObject(value);

  return hasOwnKey(raw, "web") || hasOwnKey(raw, "installed") || hasOwnKey(raw, "client_id") || hasOwnKey(raw, "clientId");
}

/**
 * Desktop/Installed-only OAuth client JSON is incompatible with GSI Web Sign-In.
 * Official guide: create a "Web application" OAuth client.
 */
export function isInstalledOnlyGoogleOAuthClientJson(value: unknown): boolean {
  const raw = asObject(value);
  if (!hasOwnKey(raw, "installed")) {
    return false;
  }
  if (hasOwnKey(raw, "web")) {
    return false;
  }

  const plainClientId = normalizeOptionalString(raw.clientId ?? raw.client_id, "", 512);
  return !plainClientId;
}

export function assertGoogleAuthClientIdForGsi(clientId: string, source: "json" | "form" = "form"): string {
  const normalized = clientId.trim();
  if (!normalized) {
    throw new Error(source === "json" ? "Google OAuth JSON 中缺少 client_id" : "Google Client ID 不能为空");
  }
  if (!isValidGoogleWebClientId(normalized)) {
    throw new Error(
      "Google Client ID 格式无效。GSI Web 登录需要形如 xxx.apps.googleusercontent.com 的 Web application Client ID。",
    );
  }
  return normalized;
}

function normalizeStoredGoogleAuthConfig(
  value: unknown,
  defaults = runtimeConfigDefaults.googleAuth,
): GoogleAuthRuntimeConfig {
  const extracted = extractGoogleAuthClientId(value);
  const candidate = extracted || defaults.clientId;
  return {
    clientId: isValidGoogleWebClientId(candidate) ? candidate.trim() : "",
  };
}

function normalizeStoredDeepLXConfig(value: unknown, defaults = runtimeConfigDefaults.deeplx): DeepLXRuntimeConfig {
  const raw = asObject(value);

  return {
    baseUrl: normalizeDeepLXBaseUrl(raw.baseUrl, defaults.baseUrl),
    apiKey: normalizeOptionalString(raw.apiKey, defaults.apiKey, 2048),
  };
}

function normalizeStoredNexaiConfig(value: unknown, defaults = runtimeConfigDefaults.nexai): NexaiRuntimeConfig {
  const raw = asObject(value);
  const google = asObject(raw.google);
  const github = asObject(raw.github);

  return {
    jwtSecret: normalizeOptionalString(raw.jwtSecret, defaults.jwtSecret, 1024),
    jwtExpiresIn: normalizeDuration(raw.jwtExpiresIn, defaults.jwtExpiresIn),
    refreshExpiresIn: normalizeDuration(raw.refreshExpiresIn, defaults.refreshExpiresIn),
    google: {
      clientId: normalizeOptionalString(google.clientId, defaults.google.clientId, 512),
    },
    github: {
      clientId: normalizeOptionalString(github.clientId, defaults.github.clientId, 512),
      clientSecret: normalizeOptionalString(github.clientSecret, defaults.github.clientSecret, 1024),
    },
    frontendUrl: normalizeUrl(raw.frontendUrl, defaults.frontendUrl),
  };
}

function normalizeStoredTtsConfig(value: unknown, defaults = runtimeConfigDefaults.tts): TtsRuntimeConfig {
  const raw = asObject(value);
  // Prefer stored value; fall back to env/runtime default. Strength is enforced on write
  // (setTtsSetting) and env parse — weak legacy stored values are treated as unset so the
  // shared-code gate stays closed rather than accepting a predictable code.
  const candidate = normalizeGenerationCode(
    typeof raw.generationCode === "string" && raw.generationCode.trim().length > 0
      ? raw.generationCode
      : defaults.generationCode,
  );
  let generationCode = "";
  if (candidate) {
    try {
      generationCode = assertStrongGenerationCode(candidate, "generationCode");
    } catch {
      logger.warn("[RuntimeConfig] Ignoring weak TTS generation code from storage/defaults");
      generationCode = "";
    }
  }

  return {
    generationCode,
  };
}

function normalizeStoredTtsProviderConfig(
  value: unknown,
  defaults = runtimeConfigDefaults.ttsProvider,
): TtsProviderRuntimeConfig {
  return normalizeTtsProviderRuntimeConfig(value, defaults);
}

function normalizeStoredEmailConfig(value: unknown, defaults = runtimeConfigDefaults.email): EmailRuntimeConfig {
  const raw = asObject(value);

  return {
    enabled: normalizeBoolean(raw.enabled, defaults.enabled),
    resendDomain: normalizeDomain(raw.resendDomain, defaults.resendDomain),
    resendApiKey: normalizeOptionalString(raw.resendApiKey, defaults.resendApiKey, 2048),
    quotaTotal: normalizeInteger(raw.quotaTotal, defaults.quotaTotal, 1, 1_000_000),
    outemailEnabled: normalizeBoolean(raw.outemailEnabled, defaults.outemailEnabled),
    outemailDomain: normalizeDomain(raw.outemailDomain, defaults.outemailDomain),
    outemailApiKey: normalizeOptionalString(raw.outemailApiKey, defaults.outemailApiKey, 2048),
    outemailCode: normalizeOptionalString(raw.outemailCode, defaults.outemailCode, 256),
    outemailQuotaTotal: normalizeInteger(raw.outemailQuotaTotal, defaults.outemailQuotaTotal, 1, 1_000_000),
  };
}

function normalizeStoredAdminSecurityConfig(
  value: unknown,
  defaults = runtimeConfigDefaults.adminSecurity,
): AdminSecurityRuntimeConfig {
  const raw = asObject(value);

  return {
    operationPassword: normalizeOptionalString(raw.operationPassword, defaults.operationPassword, 1024),
    serverStatusPassword: normalizeOptionalString(raw.serverStatusPassword, defaults.serverStatusPassword, 1024),
    publicShortUrlEnabled: normalizeBoolean(raw.publicShortUrlEnabled, defaults.publicShortUrlEnabled),
    publicShortUrlPassword: normalizeOptionalString(raw.publicShortUrlPassword, defaults.publicShortUrlPassword, 1024),
  };
}

async function readRuntimeConfigDoc(
  key: RuntimeConfigKey,
  options: {
    fallbackOnError?: () => { value: Record<string, unknown>; updatedAt?: Date } | null;
  } = {},
): Promise<{ value: Record<string, unknown>; updatedAt?: Date } | null> {
  if (mongoose.connection.readyState !== 1) {
    return options.fallbackOnError?.() ?? null;
  }

  try {
    const doc = await RuntimeConfigModel.findOne({ key }).lean().exec();
    if (!doc?.value || typeof doc.value !== "object") return null;

    return {
      value: doc.value as Record<string, unknown>,
      updatedAt: doc.updatedAt,
    };
  } catch (error) {
    logger.warn("[RuntimeConfig] Failed to read runtime configuration", {
      configKey: key,
      error: error instanceof Error ? error.message : String(error),
      fallback: options.fallbackOnError ? "cache-or-defaults" : "none",
    });
    if (options.fallbackOnError) return options.fallbackOnError();
    throw error;
  }
}


function normalizeSha256FingerprintList(value: unknown, fallback: string[]): string[] {
  const items: string[] = [];
  if (Array.isArray(value)) {
    for (const entry of value) {
      if (typeof entry === "string" && entry.trim()) {
        items.push(entry.trim());
      }
    }
  } else if (typeof value === "string" && value.trim()) {
    for (const entry of value.split(/[\n,]+/)) {
      if (entry.trim()) items.push(entry.trim());
    }
  }

  const normalized = Array.from(
    new Set(
      items
        .map((item) => {
          const trimmed = item.trim();
          if (!trimmed) return "";
          if (trimmed.includes(":")) return trimmed.toUpperCase();
          const compact = trimmed.replace(/[^0-9a-fA-F]/g, "");
          if (compact.length === 64 && /^[0-9a-fA-F]+$/.test(compact)) {
            return compact
              .toUpperCase()
              .match(/.{1,2}/g)!
              .join(":");
          }
          return trimmed.toUpperCase();
        })
        .filter(Boolean),
    ),
  );

  return normalized.length > 0 ? normalized : [...fallback];
}

function normalizeStoredSynapseAndroidConfig(
  value: unknown,
  defaults = runtimeConfigDefaults.synapseAndroid,
): SynapseAndroidRuntimeConfig {
  const obj = asObject(value);
  const packageName = normalizeOptionalString(obj.packageName, defaults.packageName, 200) || defaults.packageName;
  const googleClientId = normalizeOptionalString(
    obj.googleClientId ?? obj.clientId,
    defaults.googleClientId,
    256,
  );
  const disabled =
    obj.disabled === true || obj.disabled === "true" || obj.disabled === 1 || obj.disabled === "1";

  return {
    packageName,
    sha256CertFingerprints: normalizeSha256FingerprintList(
      obj.sha256CertFingerprints ?? obj.fingerprints,
      defaults.sha256CertFingerprints,
    ),
    googleClientId,
    disabled: Boolean(disabled),
  };
}

const NEXAI_SIGNING_MODES = ["off", "soft", "enforce"] as const;

function normalizeNexaiSigningMode(
  value: unknown,
  fallback: NexaiSigningRuntimeConfig["mode"],
): NexaiSigningRuntimeConfig["mode"] {
  const candidate = typeof value === "string" ? value.trim().toLowerCase() : "";
  return (NEXAI_SIGNING_MODES as readonly string[]).includes(candidate)
    ? (candidate as NexaiSigningRuntimeConfig["mode"])
    : fallback;
}

function normalizeStoredNexaiSigningConfig(
  value: unknown,
  defaults = runtimeConfigDefaults.nexaiSigning,
): NexaiSigningRuntimeConfig {
  const raw = asObject(value);

  return {
    mode: normalizeNexaiSigningMode(raw.mode, defaults.mode),
    appSignSecret: normalizeOptionalString(raw.appSignSecret, defaults.appSignSecret, 1024),
    appSignSecretPrev: normalizeOptionalString(raw.appSignSecretPrev, defaults.appSignSecretPrev, 1024),
    maxDriftMs: normalizeInteger(raw.maxDriftMs, defaults.maxDriftMs, 1000, 24 * 60 * 60 * 1000),
  };
}

function applyCacheForKey(key: RuntimeConfigKey, value: unknown): void {
  if (key === "IPQS") {
    runtimeConfigCache.ipqs = normalizeStoredIpqsConfig(value);
    return;
  }

  if (key === "LINUXDO") {
    runtimeConfigCache.linuxdo = normalizeStoredLinuxDoConfig(value);
    return;
  }

  if (key === "GOOGLE_AUTH") {
    runtimeConfigCache.googleAuth = normalizeStoredGoogleAuthConfig(value);
    return;
  }

  if (key === "DEEPLX") {
    runtimeConfigCache.deeplx = normalizeStoredDeepLXConfig(value);
    return;
  }

  if (key === "TTS") {
    runtimeConfigCache.tts = normalizeStoredTtsConfig(value);
    return;
  }

  if (key === "TTS_PROVIDER") {
    runtimeConfigCache.ttsProvider = normalizeStoredTtsProviderConfig(value);
    return;
  }

  if (key === "EMAIL") {
    runtimeConfigCache.email = normalizeStoredEmailConfig(value);
    return;
  }

  if (key === "ADMIN_SECURITY") {
    runtimeConfigCache.adminSecurity = normalizeStoredAdminSecurityConfig(value);
    return;
  }

  if (key === "SYNAPSE_ANDROID") {
    runtimeConfigCache.synapseAndroid = normalizeStoredSynapseAndroidConfig(value);
    return;
  }

  if (key === "NEXAI_SIGNING") {
    runtimeConfigCache.nexaiSigning = normalizeStoredNexaiSigningConfig(value);
    return;
  }

  runtimeConfigCache.nexai = normalizeStoredNexaiConfig(value);
}

export class RuntimeConfigService {
  static configureDefaults(defaults: RuntimeConfigDefaults): void {
    runtimeConfigDefaults = cloneRuntimeConfigDefaults(defaults);

    if (!loadedKeys.has("IPQS")) {
      runtimeConfigCache.ipqs = cloneRuntimeConfigDefaults(defaults).ipqs;
    }
    if (!loadedKeys.has("LINUXDO")) {
      runtimeConfigCache.linuxdo = cloneRuntimeConfigDefaults(defaults).linuxdo;
    }
    if (!loadedKeys.has("GOOGLE_AUTH")) {
      runtimeConfigCache.googleAuth = cloneRuntimeConfigDefaults(defaults).googleAuth;
    }
    if (!loadedKeys.has("DEEPLX")) {
      runtimeConfigCache.deeplx = cloneRuntimeConfigDefaults(defaults).deeplx;
    }
    if (!loadedKeys.has("NEXAI")) {
      runtimeConfigCache.nexai = cloneRuntimeConfigDefaults(defaults).nexai;
    }
    if (!loadedKeys.has("TTS")) {
      runtimeConfigCache.tts = cloneRuntimeConfigDefaults(defaults).tts;
    }
    if (!loadedKeys.has("TTS_PROVIDER")) {
      runtimeConfigCache.ttsProvider = cloneRuntimeConfigDefaults(defaults).ttsProvider;
    }
    if (!loadedKeys.has("EMAIL")) {
      runtimeConfigCache.email = cloneRuntimeConfigDefaults(defaults).email;
    }
    if (!loadedKeys.has("ADMIN_SECURITY")) {
      runtimeConfigCache.adminSecurity = cloneRuntimeConfigDefaults(defaults).adminSecurity;
    }
    if (!loadedKeys.has("SYNAPSE_ANDROID")) {
      runtimeConfigCache.synapseAndroid = cloneRuntimeConfigDefaults(defaults).synapseAndroid;
    }
    if (!loadedKeys.has("NEXAI_SIGNING")) {
      runtimeConfigCache.nexaiSigning = cloneRuntimeConfigDefaults(defaults).nexaiSigning;
    }
  }

  static getCachedConfig(): RuntimeConfigDefaults {
    return runtimeConfigCache;
  }

  static async initialize(force = false): Promise<void> {
    if (mongoose.connection.readyState !== 1) return;
    if (initialized && !force) return;

    const docs = await RuntimeConfigModel.find({
      key: { $in: ["IPQS", "LINUXDO", "GOOGLE_AUTH", "DEEPLX", "NEXAI", "TTS", "TTS_PROVIDER", "EMAIL", "ADMIN_SECURITY", "SYNAPSE_ANDROID", "NEXAI_SIGNING"] },
    })
      .lean()
      .exec();

    const nextCache = cloneRuntimeConfigDefaults(runtimeConfigDefaults);
    loadedKeys.clear();

    for (const doc of docs) {
      if (!doc?.key) continue;
      applyCacheForKey(doc.key as RuntimeConfigKey, doc.value);
      nextCache.ipqs = runtimeConfigCache.ipqs;
      nextCache.linuxdo = runtimeConfigCache.linuxdo;
      nextCache.googleAuth = runtimeConfigCache.googleAuth;
      nextCache.deeplx = runtimeConfigCache.deeplx;
      nextCache.nexai = runtimeConfigCache.nexai;
      nextCache.tts = runtimeConfigCache.tts;
      nextCache.ttsProvider = runtimeConfigCache.ttsProvider;
      nextCache.email = runtimeConfigCache.email;
      nextCache.adminSecurity = runtimeConfigCache.adminSecurity;
      nextCache.synapseAndroid = runtimeConfigCache.synapseAndroid;
      nextCache.nexaiSigning = runtimeConfigCache.nexaiSigning;
      loadedKeys.add(doc.key as RuntimeConfigKey);
    }

    runtimeConfigCache = nextCache;
    initialized = true;
    logger.info("[RuntimeConfig] Loaded runtime config from MongoDB", {
      loadedKeys: Array.from(loadedKeys),
    });
  }

  static async getIpqsSetting(): Promise<{
    setting: {
      config: Omit<IpqsRuntimeConfig, "apiKeys"> & {
        apiKeyCount: number;
        apiKeysMasked: string[];
      };
      updatedAt?: string;
    };
  }> {
    const doc = await readRuntimeConfigDoc("IPQS");
    const config = doc ? normalizeStoredIpqsConfig(doc.value) : runtimeConfigDefaults.ipqs;
    runtimeConfigCache.ipqs = config;

    return {
      setting: {
        config: {
          enabled: config.enabled,
          scamalyticsUser: config.scamalyticsUser,
          strictness: config.strictness,
          allowPublicAccessPoints: config.allowPublicAccessPoints,
          lighterPenalties: config.lighterPenalties,
          timeoutMs: config.timeoutMs,
          monthlyQuotaPerKey: config.monthlyQuotaPerKey,
          challengeFraudScore: config.challengeFraudScore,
          tokenTtlMinutes: config.tokenTtlMinutes,
          failOpen: config.failOpen,
          apiKeyCount: config.apiKeys.length,
          apiKeysMasked: config.apiKeys.map(maskSecret),
        },
        updatedAt: doc?.updatedAt?.toISOString(),
      },
    };
  }

  static async setIpqsSetting(input: Partial<IpqsRuntimeConfig>): Promise<{ updatedAt: string }> {
    const currentDoc = await readRuntimeConfigDoc("IPQS");
    const current = currentDoc ? normalizeStoredIpqsConfig(currentDoc.value) : runtimeConfigCache.ipqs;
    const apiKeys =
      input.apiKeys === undefined ? current.apiKeys : normalizeStringArray(input.apiKeys, current.apiKeys);
    const scamalyticsUser =
      input.scamalyticsUser === undefined
        ? current.scamalyticsUser
        : validateScamalyticsUser(input.scamalyticsUser) ||
          normalizeScamalyticsUser(runtimeConfigDefaults.ipqs.scamalyticsUser, "");
    const enabled = normalizeBoolean(input.enabled, current.enabled);

    if (enabled && apiKeys.length === 0 && !scamalyticsUser) {
      throw new Error("启用 IP 验证前至少需要配置一个 API Key 或 Scamalytics 用户名");
    }

    const nextConfig: IpqsRuntimeConfig = {
      apiKeys,
      scamalyticsUser,
      enabled: enabled && (apiKeys.length > 0 || !!scamalyticsUser),
      strictness: normalizeInteger(input.strictness, current.strictness, 0, 3),
      allowPublicAccessPoints: normalizeBoolean(input.allowPublicAccessPoints, current.allowPublicAccessPoints),
      lighterPenalties: normalizeBoolean(input.lighterPenalties, current.lighterPenalties),
      timeoutMs: normalizeInteger(input.timeoutMs, current.timeoutMs, 1000, 60000),
      monthlyQuotaPerKey: normalizeInteger(input.monthlyQuotaPerKey, current.monthlyQuotaPerKey, 1, 1_000_000),
      challengeFraudScore: normalizeInteger(input.challengeFraudScore, current.challengeFraudScore, 0, 100),
      tokenTtlMinutes: normalizeInteger(input.tokenTtlMinutes, current.tokenTtlMinutes, 1, 1440),
      failOpen: normalizeBoolean(input.failOpen, current.failOpen),
    };

    const now = new Date();
    await RuntimeConfigModel.findOneAndUpdate(
      { key: "IPQS" },
      { value: nextConfig, updatedAt: now },
      { upsert: true, returnDocument: "after" },
    ).exec();

    runtimeConfigCache.ipqs = nextConfig;
    loadedKeys.add("IPQS");
    initialized = true;

    return { updatedAt: now.toISOString() };
  }

  static async deleteIpqsSetting(): Promise<void> {
    await RuntimeConfigModel.deleteOne({ key: "IPQS" }).exec();
    runtimeConfigCache.ipqs = cloneRuntimeConfigDefaults(runtimeConfigDefaults).ipqs;
    loadedKeys.delete("IPQS");
  }

  static async getLinuxDoSetting(): Promise<{
    setting: {
      config: Omit<LinuxDoRuntimeConfig, "clientSecret"> & {
        clientSecret: string;
      };
      updatedAt?: string;
    };
  }> {
    const doc = await readRuntimeConfigDoc("LINUXDO");
    const config = doc ? normalizeStoredLinuxDoConfig(doc.value) : runtimeConfigDefaults.linuxdo;
    runtimeConfigCache.linuxdo = config;

    return {
      setting: {
        config: {
          clientId: config.clientId,
          clientSecret: maskSecret(config.clientSecret),
          discoveryUrl: config.discoveryUrl,
          scopes: config.scopes,
          authorizationEndpoint: config.authorizationEndpoint,
          tokenEndpoint: config.tokenEndpoint,
          userEndpoint: config.userEndpoint,
          forumBaseUrl: config.forumBaseUrl,
          callbackUrl: config.callbackUrl,
          frontendCallbackUrl: config.frontendCallbackUrl,
        },
        updatedAt: doc?.updatedAt?.toISOString(),
      },
    };
  }

  static async setLinuxDoSetting(input: Partial<LinuxDoRuntimeConfig>): Promise<{ updatedAt: string }> {
    const currentDoc = await readRuntimeConfigDoc("LINUXDO");
    const current = currentDoc ? normalizeStoredLinuxDoConfig(currentDoc.value) : runtimeConfigCache.linuxdo;

    const nextConfig: LinuxDoRuntimeConfig = {
      clientId: normalizeOptionalString(input.clientId, current.clientId, 512),
      clientSecret:
        typeof input.clientSecret === "string" && input.clientSecret.trim().length > 0
          ? input.clientSecret.trim().slice(0, 1024)
          : current.clientSecret,
      discoveryUrl: normalizeUrl(input.discoveryUrl, current.discoveryUrl),
      scopes: normalizeString(input.scopes, current.scopes, 512),
      authorizationEndpoint: normalizeUrl(input.authorizationEndpoint, current.authorizationEndpoint),
      tokenEndpoint: normalizeUrl(input.tokenEndpoint, current.tokenEndpoint),
      userEndpoint: normalizeUrl(input.userEndpoint, current.userEndpoint),
      forumBaseUrl: normalizeUrl(input.forumBaseUrl, current.forumBaseUrl),
      callbackUrl: normalizeUrl(input.callbackUrl, current.callbackUrl),
      frontendCallbackUrl: normalizeStoredLinuxDoConfig({
        ...current,
        frontendCallbackUrl: input.frontendCallbackUrl ?? current.frontendCallbackUrl,
      }).frontendCallbackUrl,
    };

    const now = new Date();
    await RuntimeConfigModel.findOneAndUpdate(
      { key: "LINUXDO" },
      { value: nextConfig, updatedAt: now },
      { upsert: true, returnDocument: "after" },
    ).exec();

    runtimeConfigCache.linuxdo = nextConfig;
    loadedKeys.add("LINUXDO");
    initialized = true;

    return { updatedAt: now.toISOString() };
  }

  static async deleteLinuxDoSetting(): Promise<void> {
    await RuntimeConfigModel.deleteOne({ key: "LINUXDO" }).exec();
    runtimeConfigCache.linuxdo = cloneRuntimeConfigDefaults(runtimeConfigDefaults).linuxdo;
    loadedKeys.delete("LINUXDO");
  }

  static async getGoogleAuthSetting(): Promise<{
    setting: {
      config: GoogleAuthRuntimeConfig;
      updatedAt?: string;
    };
  }> {
    const doc = await readRuntimeConfigDoc("GOOGLE_AUTH");
    const config = doc ? normalizeStoredGoogleAuthConfig(doc.value) : runtimeConfigDefaults.googleAuth;
    runtimeConfigCache.googleAuth = config;

    return {
      setting: {
        config: {
          clientId: config.clientId,
        },
        updatedAt: doc?.updatedAt?.toISOString(),
      },
    };
  }

  static async setGoogleAuthSetting(
    input: Partial<GoogleAuthRuntimeConfig> | Record<string, unknown>,
  ): Promise<{ updatedAt: string }> {
    const currentDoc = await readRuntimeConfigDoc("GOOGLE_AUTH");
    const current = currentDoc ? normalizeStoredGoogleAuthConfig(currentDoc.value) : runtimeConfigCache.googleAuth;
    if (isInstalledOnlyGoogleOAuthClientJson(input)) {
      throw new Error(
        "当前 JSON 是 Desktop/Installed 客户端。Google Identity Services (GSI) 需要「Web application」类型的 OAuth 客户端：在 Google Cloud Console → API 和服务 → 凭据 → 创建 OAuth 客户端 ID → 应用类型选择「Web 应用」，配置 Authorized JavaScript origins 后下载 web 类型 JSON 再导入。",
      );
    }

    const extractedClientId = extractGoogleAuthClientId(input);
    if (looksLikeGoogleOAuthClientJson(input) || extractedClientId) {
      if (!extractedClientId) {
        throw new Error("Google OAuth JSON 中缺少 client_id");
      }
      assertGoogleAuthClientIdForGsi(extractedClientId, looksLikeGoogleOAuthClientJson(input) ? "json" : "form");
    }

    const nextClientId = extractedClientId
      ? assertGoogleAuthClientIdForGsi(extractedClientId, "form")
      : current.clientId;
    const nextConfig: GoogleAuthRuntimeConfig = {
      clientId: nextClientId,
    };

    const now = new Date();
    await RuntimeConfigModel.findOneAndUpdate(
      { key: "GOOGLE_AUTH" },
      { value: nextConfig, updatedAt: now },
      { upsert: true, returnDocument: "after" },
    ).exec();

    runtimeConfigCache.googleAuth = nextConfig;
    loadedKeys.add("GOOGLE_AUTH");
    initialized = true;

    return { updatedAt: now.toISOString() };
  }

  static async deleteGoogleAuthSetting(): Promise<void> {
    await RuntimeConfigModel.deleteOne({ key: "GOOGLE_AUTH" }).exec();
    runtimeConfigCache.googleAuth = cloneRuntimeConfigDefaults(runtimeConfigDefaults).googleAuth;
    loadedKeys.delete("GOOGLE_AUTH");
  }

  static async getSynapseAndroidSetting(): Promise<{
    setting: {
      config: SynapseAndroidRuntimeConfig;
      updatedAt?: string;
      assetlinksPath: string;
    };
  }> {
    const doc = await readRuntimeConfigDoc("SYNAPSE_ANDROID");
    const config = doc ? normalizeStoredSynapseAndroidConfig(doc.value) : runtimeConfigDefaults.synapseAndroid;
    runtimeConfigCache.synapseAndroid = config;

    return {
      setting: {
        config: {
          packageName: config.packageName,
          sha256CertFingerprints: [...config.sha256CertFingerprints],
          googleClientId: config.googleClientId,
          disabled: config.disabled,
        },
        updatedAt: doc?.updatedAt?.toISOString(),
        assetlinksPath: "/.well-known/assetlinks.json",
      },
    };
  }

  static async setSynapseAndroidSetting(
    input: Partial<SynapseAndroidRuntimeConfig> | Record<string, unknown>,
  ): Promise<{ updatedAt: string }> {
    const currentDoc = await readRuntimeConfigDoc("SYNAPSE_ANDROID");
    const current = currentDoc
      ? normalizeStoredSynapseAndroidConfig(currentDoc.value)
      : runtimeConfigCache.synapseAndroid;
    const obj = asObject(input);

    const nextPackageName = hasOwnKey(obj, "packageName")
      ? normalizeOptionalString(obj.packageName, current.packageName, 200) || current.packageName
      : current.packageName;

    const nextFingerprints =
      hasOwnKey(obj, "sha256CertFingerprints") || hasOwnKey(obj, "fingerprints")
        ? normalizeSha256FingerprintList(
            obj.sha256CertFingerprints ?? obj.fingerprints,
            current.sha256CertFingerprints,
          )
        : current.sha256CertFingerprints;

    const nextGoogleClientId =
      hasOwnKey(obj, "googleClientId") || hasOwnKey(obj, "clientId")
        ? normalizeOptionalString(obj.googleClientId ?? obj.clientId, "", 256)
        : current.googleClientId;

    if (nextGoogleClientId && !/^[\w-]+\.apps\.googleusercontent\.com$/i.test(nextGoogleClientId)) {
      throw new Error("SYNAPSE_ANDROID_GOOGLE_CLIENT_ID 格式无效，需为 xxx.apps.googleusercontent.com");
    }

    if (!nextPackageName || !/^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)+$/.test(nextPackageName)) {
      throw new Error("ANDROID_PACKAGE_NAME 格式无效");
    }

    if (nextFingerprints.length === 0) {
      throw new Error("至少需要一个 SHA-256 证书指纹");
    }

    const nextDisabled = hasOwnKey(obj, "disabled")
      ? obj.disabled === true || obj.disabled === "true" || obj.disabled === 1 || obj.disabled === "1"
      : current.disabled;

    const nextConfig: SynapseAndroidRuntimeConfig = {
      packageName: nextPackageName,
      sha256CertFingerprints: nextFingerprints,
      googleClientId: nextGoogleClientId,
      disabled: Boolean(nextDisabled),
    };

    const now = new Date();
    await RuntimeConfigModel.findOneAndUpdate(
      { key: "SYNAPSE_ANDROID" },
      { value: nextConfig, updatedAt: now },
      { upsert: true, returnDocument: "after" },
    ).exec();

    runtimeConfigCache.synapseAndroid = nextConfig;
    loadedKeys.add("SYNAPSE_ANDROID");
    initialized = true;

    return { updatedAt: now.toISOString() };
  }

  static async deleteSynapseAndroidSetting(): Promise<void> {
    await RuntimeConfigModel.deleteOne({ key: "SYNAPSE_ANDROID" }).exec();
    runtimeConfigCache.synapseAndroid = cloneRuntimeConfigDefaults(runtimeConfigDefaults).synapseAndroid;
    loadedKeys.delete("SYNAPSE_ANDROID");
  }

  /**
   * Runtime-mutable request-signature settings. The middleware reads the in-memory cache
   * on every request, so successful saves take effect without restarting this process.
   */
  static async getNexaiSigningSetting(): Promise<{
    setting: {
      config: {
        mode: NexaiSigningRuntimeConfig["mode"];
        appSignSecret: string;
        appSignSecretPrev: string;
        hasAppSignSecret: boolean;
        hasAppSignSecretPrev: boolean;
        maxDriftMs: number;
      };
      updatedAt?: string;
    };
  }> {
    const doc = await readRuntimeConfigDoc("NEXAI_SIGNING");
    const config = doc ? normalizeStoredNexaiSigningConfig(doc.value) : runtimeConfigDefaults.nexaiSigning;
    runtimeConfigCache.nexaiSigning = config;

    return {
      setting: {
        config: {
          mode: config.mode,
          appSignSecret: maskSecret(config.appSignSecret),
          appSignSecretPrev: maskSecret(config.appSignSecretPrev),
          hasAppSignSecret: config.appSignSecret.length > 0,
          hasAppSignSecretPrev: config.appSignSecretPrev.length > 0,
          maxDriftMs: config.maxDriftMs,
        },
        updatedAt: doc?.updatedAt?.toISOString(),
      },
    };
  }

  static async setNexaiSigningSetting(
    input: Partial<NexaiSigningRuntimeConfig> | Record<string, unknown>,
  ): Promise<{ updatedAt: string }> {
    const currentDoc = await readRuntimeConfigDoc("NEXAI_SIGNING");
    const current = currentDoc
      ? normalizeStoredNexaiSigningConfig(currentDoc.value)
      : runtimeConfigCache.nexaiSigning;
    const obj = asObject(input);

    const nextMode = hasOwnKey(obj, "mode") ? normalizeNexaiSigningMode(obj.mode, current.mode) : current.mode;

    // Secret fields: leaving the field blank preserves the currently stored secret,
    // matching the SecretKeySection UX convention used elsewhere in this admin UI.
    const nextAppSignSecret =
      typeof obj.appSignSecret === "string" && obj.appSignSecret.trim().length > 0
        ? obj.appSignSecret.trim().slice(0, 1024)
        : current.appSignSecret;

    const nextAppSignSecretPrev =
      typeof obj.appSignSecretPrev === "string" && obj.appSignSecretPrev.trim().length > 0
        ? obj.appSignSecretPrev.trim().slice(0, 1024)
        : current.appSignSecretPrev;

    const nextMaxDriftMs = hasOwnKey(obj, "maxDriftMs")
      ? normalizeInteger(obj.maxDriftMs, current.maxDriftMs, 1000, 24 * 60 * 60 * 1000)
      : current.maxDriftMs;

    const nextConfig: NexaiSigningRuntimeConfig = {
      mode: nextMode,
      appSignSecret: nextAppSignSecret,
      appSignSecretPrev: nextAppSignSecretPrev,
      maxDriftMs: nextMaxDriftMs,
    };

    const now = new Date();
    await RuntimeConfigModel.findOneAndUpdate(
      { key: "NEXAI_SIGNING" },
      { value: nextConfig, updatedAt: now },
      { upsert: true, returnDocument: "after" },
    ).exec();

    runtimeConfigCache.nexaiSigning = nextConfig;
    loadedKeys.add("NEXAI_SIGNING");
    initialized = true;

    return { updatedAt: now.toISOString() };
  }

  static async deleteNexaiSigningSetting(): Promise<void> {
    await RuntimeConfigModel.deleteOne({ key: "NEXAI_SIGNING" }).exec();
    runtimeConfigCache.nexaiSigning = cloneRuntimeConfigDefaults(runtimeConfigDefaults).nexaiSigning;
    loadedKeys.delete("NEXAI_SIGNING");
  }

  static async getDeepLXSetting(): Promise<{
    setting: {
      config: {
        baseUrl: string;
        apiKey: string;
        requestUrl: string;
      };
      updatedAt?: string;
    };
  }> {
    const doc = await readRuntimeConfigDoc("DEEPLX");
    const config = doc ? normalizeStoredDeepLXConfig(doc.value) : runtimeConfigDefaults.deeplx;
    runtimeConfigCache.deeplx = config;

    return {
      setting: {
        config: {
          baseUrl: config.baseUrl,
          apiKey: maskSecret(config.apiKey),
          requestUrl: buildDeepLXTranslateUrl(config.baseUrl, maskSecret(config.apiKey)),
        },
        updatedAt: doc?.updatedAt?.toISOString(),
      },
    };
  }

  static async setDeepLXSetting(input: Partial<DeepLXRuntimeConfig>): Promise<{ updatedAt: string }> {
    const currentDoc = await readRuntimeConfigDoc("DEEPLX");
    const current = currentDoc ? normalizeStoredDeepLXConfig(currentDoc.value) : runtimeConfigCache.deeplx;
    const requestedBaseUrl =
      input.baseUrl === undefined ? current.baseUrl : normalizeUrl(input.baseUrl, current.baseUrl);

    if (requestedBaseUrl !== TRUSTED_DEEPLX_BASE_URL) {
      throw new Error(`DeepLX Base URL 仅允许 ${TRUSTED_DEEPLX_BASE_URL}`);
    }

    const nextConfig: DeepLXRuntimeConfig = {
      baseUrl: TRUSTED_DEEPLX_BASE_URL,
      apiKey:
        typeof input.apiKey === "string" && input.apiKey.trim().length > 0
          ? input.apiKey.trim().slice(0, 2048)
          : current.apiKey,
    };

    const now = new Date();
    await RuntimeConfigModel.findOneAndUpdate(
      { key: "DEEPLX" },
      { value: nextConfig, updatedAt: now },
      { upsert: true, returnDocument: "after" },
    ).exec();

    runtimeConfigCache.deeplx = nextConfig;
    loadedKeys.add("DEEPLX");
    initialized = true;

    return { updatedAt: now.toISOString() };
  }

  static async deleteDeepLXSetting(): Promise<void> {
    await RuntimeConfigModel.deleteOne({ key: "DEEPLX" }).exec();
    runtimeConfigCache.deeplx = cloneRuntimeConfigDefaults(runtimeConfigDefaults).deeplx;
    loadedKeys.delete("DEEPLX");
  }

  static async getNexaiSetting(): Promise<{
    setting: {
      config: Omit<NexaiRuntimeConfig, "jwtSecret" | "github"> & {
        jwtSecret: string;
        github: {
          clientId: string;
          clientSecret: string;
        };
      };
      updatedAt?: string;
    };
  }> {
    const doc = await readRuntimeConfigDoc("NEXAI");
    const config = doc ? normalizeStoredNexaiConfig(doc.value) : runtimeConfigDefaults.nexai;
    runtimeConfigCache.nexai = config;

    return {
      setting: {
        config: {
          jwtSecret: maskSecret(config.jwtSecret),
          jwtExpiresIn: config.jwtExpiresIn,
          refreshExpiresIn: config.refreshExpiresIn,
          google: {
            clientId: config.google.clientId,
          },
          github: {
            clientId: config.github.clientId,
            clientSecret: maskSecret(config.github.clientSecret),
          },
          frontendUrl: config.frontendUrl,
        },
        updatedAt: doc?.updatedAt?.toISOString(),
      },
    };
  }

  static async setNexaiSetting(input: Partial<NexaiRuntimeConfig>): Promise<{ updatedAt: string }> {
    const currentDoc = await readRuntimeConfigDoc("NEXAI");
    const current = currentDoc ? normalizeStoredNexaiConfig(currentDoc.value) : runtimeConfigCache.nexai;
    const inputGoogle = asObject(input.google);
    const inputGithub = asObject(input.github);

    const nextConfig: NexaiRuntimeConfig = {
      jwtSecret:
        typeof input.jwtSecret === "string" && input.jwtSecret.trim().length > 0
          ? input.jwtSecret.trim().slice(0, 1024)
          : current.jwtSecret,
      jwtExpiresIn: normalizeDuration(input.jwtExpiresIn, current.jwtExpiresIn),
      refreshExpiresIn: normalizeDuration(input.refreshExpiresIn, current.refreshExpiresIn),
      google: {
        clientId: normalizeOptionalString(inputGoogle.clientId, current.google.clientId, 512),
      },
      github: {
        clientId: normalizeOptionalString(inputGithub.clientId, current.github.clientId, 512),
        clientSecret:
          typeof inputGithub.clientSecret === "string" && inputGithub.clientSecret.trim().length > 0
            ? inputGithub.clientSecret.trim().slice(0, 1024)
            : current.github.clientSecret,
      },
      frontendUrl: normalizeUrl(input.frontendUrl, current.frontendUrl),
    };

    const now = new Date();
    await RuntimeConfigModel.findOneAndUpdate(
      { key: "NEXAI" },
      { value: nextConfig, updatedAt: now },
      { upsert: true, returnDocument: "after" },
    ).exec();

    runtimeConfigCache.nexai = nextConfig;
    loadedKeys.add("NEXAI");
    initialized = true;

    return { updatedAt: now.toISOString() };
  }

  static async deleteNexaiSetting(): Promise<void> {
    await RuntimeConfigModel.deleteOne({ key: "NEXAI" }).exec();
    runtimeConfigCache.nexai = cloneRuntimeConfigDefaults(runtimeConfigDefaults).nexai;
    loadedKeys.delete("NEXAI");
  }

  static async getTtsSetting(): Promise<{
    setting: {
      config: {
        generationCode: string;
      };
      updatedAt?: string;
    } | null;
  }> {
    const doc = await readRuntimeConfigDoc("TTS");
    const config = doc ? normalizeStoredTtsConfig(doc.value) : runtimeConfigDefaults.tts;
    runtimeConfigCache.tts = config;

    if (!config.generationCode) {
      return { setting: null };
    }

    return {
      setting: {
        config: {
          generationCode:
            config.generationCode.length > 8
              ? `${config.generationCode.slice(0, 2)}***${config.generationCode.slice(-4)}`
              : "***",
        },
        updatedAt: doc?.updatedAt?.toISOString(),
      },
    };
  }

  static async getRawTtsConfig(): Promise<TtsRuntimeConfig> {
    const doc = await readRuntimeConfigDoc("TTS");
    const config = doc ? normalizeStoredTtsConfig(doc.value) : runtimeConfigDefaults.tts;
    runtimeConfigCache.tts = config;
    return config;
  }

  static async setTtsSetting(input: Partial<TtsRuntimeConfig>): Promise<{ updatedAt: string }> {
    const currentDoc = await readRuntimeConfigDoc("TTS");
    const current = currentDoc ? normalizeStoredTtsConfig(currentDoc.value) : runtimeConfigCache.tts;

    const rawGenerationCode =
      typeof input.generationCode === "string" && input.generationCode.trim().length > 0
        ? input.generationCode
        : current.generationCode;

    // Empty is not allowed on explicit set — admin must provide a high-entropy code.
    const generationCode = assertStrongGenerationCode(rawGenerationCode, "生成码");
    if (!generationCode) {
      throw new Error("生成码不能为空");
    }

    const nextConfig: TtsRuntimeConfig = {
      generationCode,
    };

    const now = new Date();
    await RuntimeConfigModel.findOneAndUpdate(
      { key: "TTS" },
      { value: nextConfig, updatedAt: now },
      { upsert: true, returnDocument: "after" },
    ).exec();

    runtimeConfigCache.tts = nextConfig;
    loadedKeys.add("TTS");
    initialized = true;

    return { updatedAt: now.toISOString() };
  }

  static async deleteTtsSetting(): Promise<void> {
    await RuntimeConfigModel.deleteOne({ key: "TTS" }).exec();
    runtimeConfigCache.tts = cloneRuntimeConfigDefaults(runtimeConfigDefaults).tts;
    loadedKeys.delete("TTS");
  }

  static async getRawTtsProviderConfig(): Promise<TtsProviderRuntimeConfig> {
    const doc = await readRuntimeConfigDoc("TTS_PROVIDER", {
      fallbackOnError: () =>
        loadedKeys.has("TTS_PROVIDER")
          ? { value: runtimeConfigCache.ttsProvider as unknown as Record<string, unknown> }
          : null,
    });
    const config = doc
      ? normalizeStoredTtsProviderConfig(doc.value)
      : cloneRuntimeConfigDefaults(runtimeConfigDefaults).ttsProvider;
    runtimeConfigCache.ttsProvider = config;
    return config;
  }

  static async getTtsProviderSetting(): Promise<{
    config: {
      provider: TtsProviderRuntimeConfig["provider"];
      defaultModel: string;
      fish: {
        baseUrl: string;
        referenceId: string;
        apiKeyConfigured: boolean;
        modelCurl: string;
        defaultVoicesCurl: string;
      };
      updatedAt?: string;
    };
  }> {
    const doc = await readRuntimeConfigDoc("TTS_PROVIDER", {
      fallbackOnError: () =>
        loadedKeys.has("TTS_PROVIDER")
          ? { value: runtimeConfigCache.ttsProvider as unknown as Record<string, unknown> }
          : null,
    });
    const config = doc
      ? normalizeStoredTtsProviderConfig(doc.value)
      : cloneRuntimeConfigDefaults(runtimeConfigDefaults).ttsProvider;
    runtimeConfigCache.ttsProvider = config;

    return {
      config: {
        provider: config.provider,
        defaultModel: config.defaultModel,
        fish: {
          baseUrl: config.fish.baseUrl,
          referenceId: config.fish.referenceId,
          apiKeyConfigured: Boolean(config.fish.apiKey),
          modelCurl: formatFishAudioCatalogCurl(config.fish.catalog?.modelRequest),
          defaultVoicesCurl: formatFishAudioCatalogCurl(config.fish.catalog?.defaultVoicesRequest),
        },
        updatedAt: doc?.updatedAt?.toISOString(),
      },
    };
  }

  static async setTtsProviderSetting(input: unknown): Promise<{ updatedAt: string }> {
    const currentDoc = await readRuntimeConfigDoc("TTS_PROVIDER");
    const current = currentDoc
      ? normalizeStoredTtsProviderConfig(currentDoc.value)
      : runtimeConfigCache.ttsProvider;
    const nextConfig = mergeTtsProviderAdminUpdate(current, input);

    const now = new Date();
    await RuntimeConfigModel.findOneAndUpdate(
      { key: "TTS_PROVIDER" },
      { value: nextConfig, updatedAt: now },
      { upsert: true, returnDocument: "after" },
    ).exec();

    runtimeConfigCache.ttsProvider = nextConfig;
    loadedKeys.add("TTS_PROVIDER");
    initialized = true;
    return { updatedAt: now.toISOString() };
  }

  static async getEmailSetting(): Promise<{
    setting: {
      config: Omit<EmailRuntimeConfig, "resendApiKey" | "outemailApiKey" | "outemailCode"> & {
        resendApiKey: string;
        outemailApiKey: string;
        outemailCode: string;
      };
      updatedAt?: string;
    };
  }> {
    const doc = await readRuntimeConfigDoc("EMAIL");
    const config = doc ? normalizeStoredEmailConfig(doc.value) : runtimeConfigDefaults.email;
    runtimeConfigCache.email = config;

    return {
      setting: {
        config: {
          enabled: config.enabled,
          resendDomain: config.resendDomain,
          resendApiKey: maskSecret(config.resendApiKey),
          quotaTotal: config.quotaTotal,
          outemailEnabled: config.outemailEnabled,
          outemailDomain: config.outemailDomain,
          outemailApiKey: maskSecret(config.outemailApiKey),
          outemailCode: maskSecret(config.outemailCode),
          outemailQuotaTotal: config.outemailQuotaTotal,
        },
        updatedAt: doc?.updatedAt?.toISOString(),
      },
    };
  }

  static async setEmailSetting(input: Partial<EmailRuntimeConfig>): Promise<{ updatedAt: string }> {
    const currentDoc = await readRuntimeConfigDoc("EMAIL");
    const current = currentDoc ? normalizeStoredEmailConfig(currentDoc.value) : runtimeConfigCache.email;

    const nextConfig: EmailRuntimeConfig = {
      enabled: normalizeBoolean(input.enabled, current.enabled),
      resendDomain: normalizeDomain(input.resendDomain, current.resendDomain),
      resendApiKey:
        typeof input.resendApiKey === "string" && input.resendApiKey.trim().length > 0
          ? input.resendApiKey.trim().slice(0, 2048)
          : current.resendApiKey,
      quotaTotal: normalizeInteger(input.quotaTotal, current.quotaTotal, 1, 1_000_000),
      outemailEnabled: normalizeBoolean(input.outemailEnabled, current.outemailEnabled),
      outemailDomain: normalizeDomain(input.outemailDomain, current.outemailDomain),
      outemailApiKey:
        typeof input.outemailApiKey === "string" && input.outemailApiKey.trim().length > 0
          ? input.outemailApiKey.trim().slice(0, 2048)
          : current.outemailApiKey,
      outemailCode:
        typeof input.outemailCode === "string" && input.outemailCode.trim().length > 0
          ? input.outemailCode.trim().slice(0, 256)
          : current.outemailCode,
      outemailQuotaTotal: normalizeInteger(input.outemailQuotaTotal, current.outemailQuotaTotal, 1, 1_000_000),
    };

    if (nextConfig.enabled) {
      if (!nextConfig.resendDomain || !DOMAIN_PATTERN.test(nextConfig.resendDomain)) {
        throw new Error("主邮件发信域名格式不正确");
      }
      if (!RESEND_API_KEY_PATTERN.test(nextConfig.resendApiKey)) {
        throw new Error("主邮件 API Key 必须以 re_ 开头且长度有效");
      }
    }

    if (nextConfig.outemailEnabled) {
      if (!nextConfig.outemailDomain || !DOMAIN_PATTERN.test(nextConfig.outemailDomain)) {
        throw new Error("对外邮件发信域名格式不正确");
      }
      if (!RESEND_API_KEY_PATTERN.test(nextConfig.outemailApiKey)) {
        throw new Error("对外邮件 API Key 必须以 re_ 开头且长度有效");
      }
    }

    const now = new Date();
    await RuntimeConfigModel.findOneAndUpdate(
      { key: "EMAIL" },
      { value: nextConfig, updatedAt: now },
      { upsert: true, returnDocument: "after" },
    ).exec();

    runtimeConfigCache.email = nextConfig;
    loadedKeys.add("EMAIL");
    initialized = true;

    return { updatedAt: now.toISOString() };
  }

  static async deleteEmailSetting(): Promise<void> {
    await RuntimeConfigModel.deleteOne({ key: "EMAIL" }).exec();
    runtimeConfigCache.email = cloneRuntimeConfigDefaults(runtimeConfigDefaults).email;
    loadedKeys.delete("EMAIL");
  }

  static async getAdminSecuritySetting(): Promise<{
    setting: {
      config: Omit<AdminSecurityRuntimeConfig, "operationPassword" | "serverStatusPassword" | "publicShortUrlPassword"> & {
        operationPassword: string;
        serverStatusPassword: string;
        publicShortUrlPassword: string;
      };
      updatedAt?: string;
    };
  }> {
    const doc = await readRuntimeConfigDoc("ADMIN_SECURITY");
    const config = doc ? normalizeStoredAdminSecurityConfig(doc.value) : runtimeConfigDefaults.adminSecurity;
    runtimeConfigCache.adminSecurity = config;

    return {
      setting: {
        config: {
          operationPassword: maskSecret(config.operationPassword),
          serverStatusPassword: maskSecret(config.serverStatusPassword),
          publicShortUrlEnabled: config.publicShortUrlEnabled,
          publicShortUrlPassword: maskSecret(config.publicShortUrlPassword),
        },
        updatedAt: doc?.updatedAt?.toISOString(),
      },
    };
  }

  static async setAdminSecuritySetting(input: Partial<AdminSecurityRuntimeConfig>): Promise<{ updatedAt: string }> {
    const currentDoc = await readRuntimeConfigDoc("ADMIN_SECURITY");
    const current = currentDoc
      ? normalizeStoredAdminSecurityConfig(currentDoc.value)
      : runtimeConfigCache.adminSecurity;

    const nextConfig: AdminSecurityRuntimeConfig = {
      operationPassword:
        typeof input.operationPassword === "string" && input.operationPassword.trim().length > 0
          ? input.operationPassword.trim().slice(0, 1024)
          : current.operationPassword,
      serverStatusPassword:
        typeof input.serverStatusPassword === "string" && input.serverStatusPassword.trim().length > 0
          ? input.serverStatusPassword.trim().slice(0, 1024)
          : current.serverStatusPassword,
      publicShortUrlEnabled: normalizeBoolean(input.publicShortUrlEnabled, current.publicShortUrlEnabled),
      publicShortUrlPassword:
        typeof input.publicShortUrlPassword === "string" && input.publicShortUrlPassword.trim().length > 0
          ? input.publicShortUrlPassword.trim().slice(0, 1024)
          : current.publicShortUrlPassword,
    };

    if (!nextConfig.operationPassword) {
      throw new Error("管理员操作密码不能为空");
    }
    if (!nextConfig.serverStatusPassword) {
      throw new Error("服务器状态密码不能为空");
    }
    if (nextConfig.publicShortUrlEnabled && !nextConfig.publicShortUrlPassword) {
      throw new Error("启用公共短链创建前需要配置服务密码");
    }

    const now = new Date();
    await RuntimeConfigModel.findOneAndUpdate(
      { key: "ADMIN_SECURITY" },
      { value: nextConfig, updatedAt: now },
      { upsert: true, returnDocument: "after" },
    ).exec();

    runtimeConfigCache.adminSecurity = nextConfig;
    loadedKeys.add("ADMIN_SECURITY");
    initialized = true;

    return { updatedAt: now.toISOString() };
  }

  static async deleteAdminSecuritySetting(): Promise<void> {
    await RuntimeConfigModel.deleteOne({ key: "ADMIN_SECURITY" }).exec();
    runtimeConfigCache.adminSecurity = cloneRuntimeConfigDefaults(runtimeConfigDefaults).adminSecurity;
    loadedKeys.delete("ADMIN_SECURITY");
  }
}
