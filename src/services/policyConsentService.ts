import crypto from "node:crypto";
import { PolicyConsent } from "../models/policyConsentModel";

export const CURRENT_POLICY_VERSION = process.env.POLICY_VERSION || "2.0";
export const CONSENT_VALIDITY_DAYS = Number(process.env.POLICY_CONSENT_VALIDITY_DAYS || 30);
// 原实现把盐硬编码在源码里，等于公开密钥。这里优先用显式配置；生产环境缺配置时从
// JWT_SECRET 派生（生产必配，缺失时 config.ts 已会拦启动），避免为此新增一个会让服务起不来的必填项。
function resolveSecretSalt(): string {
  const configured = process.env.POLICY_SECRET_SALT?.trim();
  if (configured) return configured;

  const jwtSecret = process.env.JWT_SECRET?.trim();
  if (jwtSecret) {
    return crypto.createHash("sha256").update(`policy-consent-salt:${jwtSecret}`).digest("hex");
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("生产环境必须配置 POLICY_SECRET_SALT 或 JWT_SECRET");
  }
  return "hapxtts_secret_salt_dev_only";
}

const SECRET_SALT = resolveSecretSalt();

export function generatePolicyChecksum(consent: {
  timestamp: number;
  version: string;
  fingerprint: string;
}): string {
  const data = `${consent.timestamp}|${consent.version}|${consent.fingerprint}`;
  return crypto.createHmac("sha256", SECRET_SALT).update(data).digest("hex");
}

export function verifyPolicyChecksum(
  consent: { timestamp: number; version: string; fingerprint: string },
  checksum: string,
): boolean {
  const expectedChecksum = generatePolicyChecksum(consent);
  if (typeof checksum !== "string" || checksum.length !== expectedChecksum.length) {
    return false;
  }
  return crypto.timingSafeEqual(Buffer.from(checksum, "utf8"), Buffer.from(expectedChecksum, "utf8"));
}

export function shouldRequireTtsPolicyConsent(): boolean {
  if (process.env.NODE_ENV === "test") {
    return false;
  }
  return process.env.TTS_REQUIRE_POLICY_CONSENT === "true";
}

export async function hasValidPolicyConsent(
  fingerprint: string,
  version = CURRENT_POLICY_VERSION,
): Promise<boolean> {
  const sanitizedFingerprint = fingerprint.trim();
  if (!sanitizedFingerprint || sanitizedFingerprint === "unknown") {
    return false;
  }

  const consent = await PolicyConsent.findValidConsent(sanitizedFingerprint, version);
  if (!consent) {
    return false;
  }

  if (consent.isExpired()) {
    consent.isValid = false;
    await consent.save();
    return false;
  }

  return true;
}
