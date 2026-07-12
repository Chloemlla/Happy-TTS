import { config } from "../config/config";
import logger from "./logger";

const DEFAULT_RP_ID = "tts.chloemlla.com";
const DEFAULT_RP_NAME = "NexAI";
const DEFAULT_ASSET_LINK_RELATIONS = [
  "delegate_permission/common.get_login_creds",
  "delegate_permission/common.handle_all_urls",
];

/**
 * Synapse Android client (Synapse-Client) release signing fingerprint.
 * Used for Digital Asset Links / App Links (Linux.do callback + passkeys).
 * Override or extend via NEXAI_ANDROID_* / ANDROID_* env vars, or full JSON override.
 */
const DEFAULT_SYNAPSE_MOBILE_PACKAGE_NAME = "com.synapse.mobile";
const DEFAULT_SYNAPSE_MOBILE_SHA256_CERT_FINGERPRINTS = [
  "E9:D8:5A:D2:52:C3:8D:86:C6:E4:B2:A8:C0:49:B8:B5:A9:FA:79:AC:6E:BB:11:8C:94:0A:83:03:B6:96:39:98",
];

type AndroidAssetLinkStatement = {
  relation: string[];
  target: {
    namespace: "android_app";
    package_name: string;
    sha256_cert_fingerprints: string[];
  };
};

function splitCsv(value?: string): string[] {
  return (value || "")
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}

function normalizeSha256Fingerprint(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  // Accept both colon-separated and compact hex forms.
  if (trimmed.includes(":")) {
    return trimmed.toUpperCase();
  }
  const compact = trimmed.replace(/[^0-9a-fA-F]/g, "");
  if (compact.length === 64 && /^[0-9a-fA-F]+$/.test(compact)) {
    return compact
      .toUpperCase()
      .match(/.{1,2}/g)!
      .join(":");
  }
  return trimmed.toUpperCase();
}

function normalizeUrlOrigin(value: string): string | null {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function getDefaultBaseOrigin(): string {
  return normalizeUrlOrigin(config.baseUrl) || `https://${DEFAULT_RP_ID}`;
}

function getDefaultRpId(): string {
  try {
    return new URL(config.baseUrl).hostname || DEFAULT_RP_ID;
  } catch {
    return DEFAULT_RP_ID;
  }
}

function normalizeAndroidApkKeyHash(value: string): string {
  return value.startsWith("android:apk-key-hash:") ? value : `android:apk-key-hash:${value}`;
}

export function getNexaiWebAuthnConfig(): {
  rpName: string;
  rpID: string;
  expectedOrigins: string[];
  primaryOrigin: string;
} {
  const rpID =
    process.env.NEXAI_WEBAUTHN_RP_ID?.trim() ||
    process.env.WEBAUTHN_RP_ID?.trim() ||
    process.env.RP_ID?.trim() ||
    getDefaultRpId();

  const baseOrigin = getDefaultBaseOrigin();
  const configuredOrigins = [
    ...splitCsv(process.env.NEXAI_WEBAUTHN_EXPECTED_ORIGINS),
    ...splitCsv(process.env.NEXAI_WEBAUTHN_ALLOWED_ORIGINS),
    ...splitCsv(process.env.WEBAUTHN_EXPECTED_ORIGIN),
    ...splitCsv(process.env.RP_ORIGIN),
  ]
    .map(normalizeUrlOrigin)
    .filter((origin): origin is string => Boolean(origin));

  const androidOrigins = splitCsv(process.env.NEXAI_ANDROID_APK_KEY_HASHES || process.env.ANDROID_APK_KEY_HASHES).map(
    normalizeAndroidApkKeyHash,
  );

  const expectedOrigins = unique([baseOrigin, ...configuredOrigins, ...androidOrigins]);

  return {
    rpName: DEFAULT_RP_NAME,
    rpID,
    expectedOrigins,
    primaryOrigin: expectedOrigins[0] || baseOrigin,
  };
}

function parseAssetLinksOverride(raw: string | undefined): AndroidAssetLinkStatement[] | null {
  if (!raw?.trim()) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed as AndroidAssetLinkStatement[];
    }

    logger.warn("[NexAI] NEXAI_ANDROID_ASSETLINKS_JSON 不是数组，已忽略");
  } catch (error) {
    logger.warn("[NexAI] NEXAI_ANDROID_ASSETLINKS_JSON 解析失败，已回退到字段拼装", {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return null;
}

function isAssetLinksDisabled(): boolean {
  const raw = (process.env.ANDROID_ASSETLINKS_DISABLED || process.env.NEXAI_ANDROID_ASSETLINKS_DISABLED || "")
    .trim()
    .toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}

function buildAssetLinkStatement(packageName: string, fingerprints: string[]): AndroidAssetLinkStatement | null {
  const normalizedPackage = packageName.trim();
  const normalizedFingerprints = unique(
    fingerprints.map(normalizeSha256Fingerprint).filter((item) => item.length > 0),
  );
  if (!normalizedPackage || normalizedFingerprints.length === 0) {
    return null;
  }

  return {
    relation: [...DEFAULT_ASSET_LINK_RELATIONS],
    target: {
      namespace: "android_app",
      package_name: normalizedPackage,
      sha256_cert_fingerprints: normalizedFingerprints,
    },
  };
}

/**
 * Statements served at `GET /.well-known/assetlinks.json`.
 *
 * Priority:
 * 1. Full JSON override via `NEXAI_ANDROID_ASSETLINKS_JSON`
 * 2. Env package/fingerprint lists merged with default Synapse Mobile entry
 * 3. Empty array when explicitly disabled (`ANDROID_ASSETLINKS_DISABLED=true`)
 */
export function getNexaiAssetLinksStatements(): AndroidAssetLinkStatement[] {
  if (isAssetLinksDisabled()) {
    return [];
  }

  const overrideStatements = parseAssetLinksOverride(process.env.NEXAI_ANDROID_ASSETLINKS_JSON);
  if (overrideStatements) {
    return overrideStatements;
  }

  const envPackageNames = unique([
    ...splitCsv(process.env.NEXAI_ANDROID_PACKAGE_NAMES),
    ...splitCsv(process.env.NEXAI_ANDROID_PACKAGE_NAME),
    ...splitCsv(process.env.ANDROID_PACKAGE_NAMES),
    ...splitCsv(process.env.ANDROID_PACKAGE_NAME),
  ]);
  const envFingerprints = unique(
    [
      ...splitCsv(process.env.NEXAI_ANDROID_SHA256_CERT_FINGERPRINTS),
      ...splitCsv(process.env.ANDROID_SHA256_CERT_FINGERPRINTS),
    ].map(normalizeSha256Fingerprint),
  );

  const byPackage = new Map<string, AndroidAssetLinkStatement>();

  const defaultStatement = buildAssetLinkStatement(
    DEFAULT_SYNAPSE_MOBILE_PACKAGE_NAME,
    DEFAULT_SYNAPSE_MOBILE_SHA256_CERT_FINGERPRINTS,
  );
  if (defaultStatement) {
    byPackage.set(defaultStatement.target.package_name, defaultStatement);
  }

  for (const packageName of envPackageNames) {
    // Explicit packages use env fingerprints when provided; otherwise fall back to
    // the default Synapse release fingerprint so package-only env still works.
    const fingerprints =
      envFingerprints.length > 0 ? envFingerprints : DEFAULT_SYNAPSE_MOBILE_SHA256_CERT_FINGERPRINTS;
    const statement = buildAssetLinkStatement(packageName, fingerprints);
    if (!statement) {
      continue;
    }

    const existing = byPackage.get(statement.target.package_name);
    if (existing) {
      byPackage.set(statement.target.package_name, {
        ...existing,
        target: {
          ...existing.target,
          sha256_cert_fingerprints: unique([
            ...existing.target.sha256_cert_fingerprints,
            ...statement.target.sha256_cert_fingerprints,
          ]),
        },
      });
    } else {
      byPackage.set(statement.target.package_name, statement);
    }
  }

  return Array.from(byPackage.values());
}
