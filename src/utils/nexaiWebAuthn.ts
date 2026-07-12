import { config } from "../config/config";
import { RuntimeConfigService } from "../services/runtimeConfigService";
import logger from "./logger";

const DEFAULT_RP_ID = "tts.chloemlla.com";
const DEFAULT_RP_NAME = "NexAI";
const DEFAULT_ASSET_LINK_RELATIONS = [
  "delegate_permission/common.get_login_creds",
  "delegate_permission/common.handle_all_urls",
];

/**
 * Default Android clients for Digital Asset Links / App Links / passkeys.
 * Override or extend via NEXAI_ANDROID_* / ANDROID_* env vars, or full JSON override.
 *
 * - com.synapse.mobile: Synapse-Client release signing fingerprint
 * - com.chloemlla.nexai: NexAI Flutter Android release signing fingerprint
 *   (matches PackageInfo.buildSignature from production APK installs)
 */
const DEFAULT_SYNAPSE_MOBILE_PACKAGE_NAME = "com.synapse.mobile";
const DEFAULT_SYNAPSE_MOBILE_SHA256_CERT_FINGERPRINTS = [
  "E9:D8:5A:D2:52:C3:8D:86:C6:E4:B2:A8:C0:49:B8:B5:A9:FA:79:AC:6E:BB:11:8C:94:0A:83:03:B6:96:39:98",
];

const DEFAULT_NEXAI_ANDROID_PACKAGE_NAME = "com.chloemlla.nexai";
const DEFAULT_NEXAI_ANDROID_SHA256_CERT_FINGERPRINTS = [
  // Compact SHA-256 from NexAI PackageInfo.buildSignature:
  // FFD1F37C27051ACC7FA18745E107E6179A28572619B63FC6F74DAC3DA44ED7CE
  "FF:D1:F3:7C:27:05:1A:CC:7F:A1:87:45:E1:07:E6:17:9A:28:57:26:19:B6:3F:C6:F7:4D:AC:3D:A4:4E:D7:CE",
];

/** Base64url(SHA-256(signing cert DER)) for WebAuthn android:apk-key-hash origins. */
const DEFAULT_NEXAI_ANDROID_APK_KEY_HASHES = [
  "_9HzfCcFGsx_oYdF4QfmF5ooVyYZtj_G902sPaRO184",
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

  const androidOrigins = unique([
    ...DEFAULT_NEXAI_ANDROID_APK_KEY_HASHES,
    ...splitCsv(process.env.NEXAI_ANDROID_APK_KEY_HASHES || process.env.ANDROID_APK_KEY_HASHES),
  ]).map(normalizeAndroidApkKeyHash);

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
      // Empty array is a common misconfiguration that would break Android passkeys
      // by publishing no statements. Treat it as "use built-in defaults".
      if (parsed.length === 0) {
        logger.warn(
          "[NexAI] NEXAI_ANDROID_ASSETLINKS_JSON 为空数组，已回退到默认 Digital Asset Links 条目",
        );
        return null;
      }
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
 * 1. Full non-empty JSON override via `NEXAI_ANDROID_ASSETLINKS_JSON`
 * 2. Default packages (Synapse Mobile + NexAI) merged with env package/fingerprint lists
 * 3. Optional runtime SYNAPSE_ANDROID config from EnvManager (upsert/disable only)
 * 4. Empty array only when explicitly disabled (`ANDROID_ASSETLINKS_DISABLED=true`)
 */
export function getNexaiAssetLinksStatements(): AndroidAssetLinkStatement[] {
  if (isAssetLinksDisabled()) {
    logger.warn(
      "[NexAI] Digital Asset Links 已禁用（ANDROID_ASSETLINKS_DISABLED）；Android passkey 将无法关联 RP",
    );
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

  const defaultPackages: Array<{ packageName: string; fingerprints: string[] }> = [
    {
      packageName: DEFAULT_SYNAPSE_MOBILE_PACKAGE_NAME,
      fingerprints: DEFAULT_SYNAPSE_MOBILE_SHA256_CERT_FINGERPRINTS,
    },
    {
      packageName: DEFAULT_NEXAI_ANDROID_PACKAGE_NAME,
      fingerprints: DEFAULT_NEXAI_ANDROID_SHA256_CERT_FINGERPRINTS,
    },
  ];

  for (const entry of defaultPackages) {
    const statement = buildAssetLinkStatement(entry.packageName, entry.fingerprints);
    if (statement) {
      byPackage.set(statement.target.package_name, statement);
    }
  }

  for (const packageName of envPackageNames) {
    // Explicit packages use env fingerprints when provided; otherwise use the
    // matching default fingerprint (NexAI / Synapse) when available.
    let fingerprints = envFingerprints;
    if (fingerprints.length === 0) {
      if (packageName === DEFAULT_NEXAI_ANDROID_PACKAGE_NAME) {
        fingerprints = DEFAULT_NEXAI_ANDROID_SHA256_CERT_FINGERPRINTS;
      } else if (packageName === DEFAULT_SYNAPSE_MOBILE_PACKAGE_NAME) {
        fingerprints = DEFAULT_SYNAPSE_MOBILE_SHA256_CERT_FINGERPRINTS;
      } else {
        fingerprints = DEFAULT_SYNAPSE_MOBILE_SHA256_CERT_FINGERPRINTS;
      }
    }

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

  // Optional runtime config from EnvManager (SYNAPSE_ANDROID). Does not remove
  // NexAI defaults or env-based entries; only upserts/disables the configured package.
  try {
    const runtimeAndroid = RuntimeConfigService.getCachedConfig().synapseAndroid;
    const runtimePackage = String(runtimeAndroid?.packageName || "").trim();
    if (runtimePackage) {
      if (runtimeAndroid.disabled) {
        byPackage.delete(runtimePackage);
      } else if (Array.isArray(runtimeAndroid.sha256CertFingerprints) && runtimeAndroid.sha256CertFingerprints.length > 0) {
        const statement = buildAssetLinkStatement(runtimePackage, runtimeAndroid.sha256CertFingerprints);
        if (statement) {
          const existing = byPackage.get(runtimePackage);
          byPackage.set(
            runtimePackage,
            existing
              ? {
                  ...existing,
                  target: {
                    ...existing.target,
                    sha256_cert_fingerprints: unique([
                      ...existing.target.sha256_cert_fingerprints,
                      ...statement.target.sha256_cert_fingerprints,
                    ]),
                  },
                }
              : statement,
          );
        }
      }
    }
  } catch (error) {
    logger.warn("[NexAI] 读取运行时 Synapse Android assetlinks 配置失败，已忽略", {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return Array.from(byPackage.values());
}
