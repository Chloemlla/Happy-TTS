import { config } from "../config/config";
import logger from "./logger";

const DEFAULT_RP_ID = "tts.chloemlla.com";
const DEFAULT_RP_NAME = "NexAI";
const DEFAULT_ASSET_LINK_RELATIONS = [
  "delegate_permission/common.get_login_creds",
  "delegate_permission/common.handle_all_urls",
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

export function getNexaiAssetLinksStatements(): AndroidAssetLinkStatement[] {
  const overrideStatements = parseAssetLinksOverride(process.env.NEXAI_ANDROID_ASSETLINKS_JSON);
  if (overrideStatements) {
    return overrideStatements;
  }

  const packageNames = unique([
    ...splitCsv(process.env.NEXAI_ANDROID_PACKAGE_NAMES),
    ...splitCsv(process.env.NEXAI_ANDROID_PACKAGE_NAME),
    ...splitCsv(process.env.ANDROID_PACKAGE_NAMES),
    ...splitCsv(process.env.ANDROID_PACKAGE_NAME),
  ]);
  const fingerprints = unique([
    ...splitCsv(process.env.NEXAI_ANDROID_SHA256_CERT_FINGERPRINTS),
    ...splitCsv(process.env.ANDROID_SHA256_CERT_FINGERPRINTS),
  ]);

  if (!packageNames.length || !fingerprints.length) {
    return [];
  }

  return packageNames.map((packageName) => ({
    relation: DEFAULT_ASSET_LINK_RELATIONS,
    target: {
      namespace: "android_app",
      package_name: packageName,
      sha256_cert_fingerprints: fingerprints,
    },
  }));
}
