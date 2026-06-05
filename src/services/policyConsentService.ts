import crypto from "node:crypto";
import { PolicyConsent } from "../models/policyConsentModel";

export const CURRENT_POLICY_VERSION = process.env.POLICY_VERSION || "2.0";
export const CONSENT_VALIDITY_DAYS = Number(process.env.POLICY_CONSENT_VALIDITY_DAYS || 30);
const SECRET_SALT = process.env.POLICY_SECRET_SALT || "hapxtts_secret_salt";

export function verifyPolicyChecksum(
  consent: { timestamp: number; version: string; fingerprint: string },
  checksum: string,
): boolean {
  const data = `${consent.timestamp}|${consent.version}|${consent.fingerprint}`;
  const expectedChecksum = crypto
    .createHash("sha256")
    .update(data + SECRET_SALT)
    .digest("hex")
    .substring(0, 8);

  return checksum === expectedChecksum;
}

export function generatePolicyChecksum(consent: {
  timestamp: number;
  version: string;
  fingerprint: string;
}): string {
  const data = `${consent.timestamp}|${consent.version}|${consent.fingerprint}`;
  return crypto
    .createHash("sha256")
    .update(data + SECRET_SALT)
    .digest("hex")
    .substring(0, 8);
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
