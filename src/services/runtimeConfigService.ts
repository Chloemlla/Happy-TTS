import {
  buildRuntimeConfigDefaults,
  cloneRuntimeConfigDefaults,
  type IpqsRuntimeConfig,
  type LinuxDoRuntimeConfig,
  type NexaiRuntimeConfig,
  type RuntimeConfigDefaults,
} from "../config/runtimeConfigDefaults";
import { RuntimeConfigModel, type RuntimeConfigKey } from "../models/runtimeConfigModel";
import { mongoose } from "./mongoService";
import logger from "../utils/logger";

const FALLBACK_BASE_URL = "https://api.951100.xyz";
const FALLBACK_FRONTEND_URL = "https://tts.951100.xyz";
const FALLBACK_JWT_SECRET = "yb56beb12b35ab636b66c4f9fc168646785a8e85a";
const DURATION_PATTERN = /^\d+[smhd]$/i;

let runtimeConfigDefaults: RuntimeConfigDefaults = buildRuntimeConfigDefaults({
  baseUrl: FALLBACK_BASE_URL,
  frontendBaseUrl: FALLBACK_FRONTEND_URL,
  jwtSecret: FALLBACK_JWT_SECRET,
});

let runtimeConfigCache: RuntimeConfigDefaults = cloneRuntimeConfigDefaults(runtimeConfigDefaults);
const loadedKeys = new Set<RuntimeConfigKey>();
let initialized = false;

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
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
  const source = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/[\r\n,]+/)
      : fallback;

  const normalized = source
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);

  return Array.from(new Set(normalized));
}

function maskSecret(value: string): string {
  if (!value) return "";
  if (value.length <= 6) return "*".repeat(value.length);
  return `${value.slice(0, 2)}***${value.slice(-4)}`;
}

function normalizeStoredIpqsConfig(value: unknown, defaults = runtimeConfigDefaults.ipqs): IpqsRuntimeConfig {
  const raw = asObject(value);
  const apiKeys = normalizeStringArray(raw.apiKeys, defaults.apiKeys);
  const enabled = normalizeBoolean(raw.enabled, defaults.enabled);

  return {
    apiKeys,
    enabled: enabled && apiKeys.length > 0,
    strictness: normalizeInteger(raw.strictness, defaults.strictness, 0, 3),
    allowPublicAccessPoints: normalizeBoolean(
      raw.allowPublicAccessPoints,
      defaults.allowPublicAccessPoints,
    ),
    lighterPenalties: normalizeBoolean(raw.lighterPenalties, defaults.lighterPenalties),
    timeoutMs: normalizeInteger(raw.timeoutMs, defaults.timeoutMs, 1000, 60000),
    monthlyQuotaPerKey: normalizeInteger(
      raw.monthlyQuotaPerKey,
      defaults.monthlyQuotaPerKey,
      1,
      1_000_000,
    ),
    challengeFraudScore: normalizeInteger(
      raw.challengeFraudScore,
      defaults.challengeFraudScore,
      0,
      100,
    ),
    tokenTtlMinutes: normalizeInteger(raw.tokenTtlMinutes, defaults.tokenTtlMinutes, 1, 1440),
    failOpen: normalizeBoolean(raw.failOpen, defaults.failOpen),
  };
}

function normalizeStoredLinuxDoConfig(
  value: unknown,
  defaults = runtimeConfigDefaults.linuxdo,
): LinuxDoRuntimeConfig {
  const raw = asObject(value);

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
    frontendCallbackUrl: normalizeUrl(raw.frontendCallbackUrl, defaults.frontendCallbackUrl),
  };
}

function normalizeStoredNexaiConfig(
  value: unknown,
  defaults = runtimeConfigDefaults.nexai,
): NexaiRuntimeConfig {
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

async function readRuntimeConfigDoc(key: RuntimeConfigKey): Promise<{ value: Record<string, unknown>; updatedAt?: Date } | null> {
  if (mongoose.connection.readyState !== 1) return null;

  const doc = await RuntimeConfigModel.findOne({ key }).lean().exec();
  if (!doc || !doc.value || typeof doc.value !== "object") return null;

  return {
    value: doc.value as Record<string, unknown>,
    updatedAt: doc.updatedAt,
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
    if (!loadedKeys.has("NEXAI")) {
      runtimeConfigCache.nexai = cloneRuntimeConfigDefaults(defaults).nexai;
    }
  }

  static getCachedConfig(): RuntimeConfigDefaults {
    return runtimeConfigCache;
  }

  static async initialize(force = false): Promise<void> {
    if (mongoose.connection.readyState !== 1) return;
    if (initialized && !force) return;

    const docs = await RuntimeConfigModel.find({
      key: { $in: ["IPQS", "LINUXDO", "NEXAI"] },
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
      nextCache.nexai = runtimeConfigCache.nexai;
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
    const apiKeys = input.apiKeys === undefined
      ? current.apiKeys
      : normalizeStringArray(input.apiKeys, current.apiKeys);
    const enabled = normalizeBoolean(input.enabled, current.enabled);

    if (enabled && apiKeys.length === 0) {
      throw new Error("启用 IPQS 前至少需要配置一个 API Key");
    }

    const nextConfig: IpqsRuntimeConfig = {
      apiKeys,
      enabled: enabled && apiKeys.length > 0,
      strictness: normalizeInteger(input.strictness, current.strictness, 0, 3),
      allowPublicAccessPoints: normalizeBoolean(
        input.allowPublicAccessPoints,
        current.allowPublicAccessPoints,
      ),
      lighterPenalties: normalizeBoolean(input.lighterPenalties, current.lighterPenalties),
      timeoutMs: normalizeInteger(input.timeoutMs, current.timeoutMs, 1000, 60000),
      monthlyQuotaPerKey: normalizeInteger(
        input.monthlyQuotaPerKey,
        current.monthlyQuotaPerKey,
        1,
        1_000_000,
      ),
      challengeFraudScore: normalizeInteger(
        input.challengeFraudScore,
        current.challengeFraudScore,
        0,
        100,
      ),
      tokenTtlMinutes: normalizeInteger(input.tokenTtlMinutes, current.tokenTtlMinutes, 1, 1440),
      failOpen: normalizeBoolean(input.failOpen, current.failOpen),
    };

    const now = new Date();
    await RuntimeConfigModel.findOneAndUpdate(
      { key: "IPQS" },
      { value: nextConfig, updatedAt: now },
      { upsert: true, new: true },
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
      authorizationEndpoint: normalizeUrl(
        input.authorizationEndpoint,
        current.authorizationEndpoint,
      ),
      tokenEndpoint: normalizeUrl(input.tokenEndpoint, current.tokenEndpoint),
      userEndpoint: normalizeUrl(input.userEndpoint, current.userEndpoint),
      forumBaseUrl: normalizeUrl(input.forumBaseUrl, current.forumBaseUrl),
      callbackUrl: normalizeUrl(input.callbackUrl, current.callbackUrl),
      frontendCallbackUrl: normalizeUrl(
        input.frontendCallbackUrl,
        current.frontendCallbackUrl,
      ),
    };

    const now = new Date();
    await RuntimeConfigModel.findOneAndUpdate(
      { key: "LINUXDO" },
      { value: nextConfig, updatedAt: now },
      { upsert: true, new: true },
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
          typeof inputGithub.clientSecret === "string" &&
          inputGithub.clientSecret.trim().length > 0
            ? inputGithub.clientSecret.trim().slice(0, 1024)
            : current.github.clientSecret,
      },
      frontendUrl: normalizeUrl(input.frontendUrl, current.frontendUrl),
    };

    const now = new Date();
    await RuntimeConfigModel.findOneAndUpdate(
      { key: "NEXAI" },
      { value: nextConfig, updatedAt: now },
      { upsert: true, new: true },
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
}
