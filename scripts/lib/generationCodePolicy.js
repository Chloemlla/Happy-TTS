"use strict";

const WEAK_GENERATION_CODES = new Set(
  [
    "admin",
    "password",
    "pass",
    "123456",
    "12345678",
    "qwerty",
    "test",
    "testing",
    "demo",
    "default",
    "secret",
    "token",
    "changeme",
    "happyclo",
    "generation",
    "generationcode",
    "tts",
    "anonymous",
  ].map((value) => value.toLowerCase()),
);

const GENERATION_CODE_MIN_LENGTH = 24;
const GENERATION_CODE_MIN_UNIQUE_CHARS = 12;
const GENERATION_CODE_MAX_LENGTH = 256;

function countUniqueChars(value) {
  return new Set(Array.from(value)).size;
}

function looksLowEntropy(value) {
  const lower = value.toLowerCase();

  if (WEAK_GENERATION_CODES.has(lower)) {
    return true;
  }

  if (/^(.)\1+$/.test(value)) {
    return true;
  }

  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  if (alphabet.includes(lower) || alphabet.split("").reverse().join("").includes(lower)) {
    return true;
  }

  if (countUniqueChars(value) < GENERATION_CODE_MIN_UNIQUE_CHARS) {
    return true;
  }

  return false;
}

function normalizeGenerationCode(raw) {
  if (typeof raw !== "string") return "";
  return raw.trim().slice(0, GENERATION_CODE_MAX_LENGTH);
}

function validateGenerationCodeStrength(raw) {
  const code = normalizeGenerationCode(raw);
  if (!code) {
    return { ok: true, code: "" };
  }

  if (code.length < GENERATION_CODE_MIN_LENGTH) {
    return {
      ok: false,
      reason: `GENERATION_CODE must be at least ${GENERATION_CODE_MIN_LENGTH} characters when configured`,
    };
  }

  if (looksLowEntropy(code)) {
    return {
      ok: false,
      reason:
        "GENERATION_CODE must be high-entropy (reject predictable/weak values such as admin/password/short codes)",
    };
  }

  return { ok: true, code };
}

function assertStrongGenerationCode(raw, label = "GENERATION_CODE") {
  const result = validateGenerationCodeStrength(raw);
  if (!result.ok) {
    throw new Error(result.reason.replace(/^GENERATION_CODE/, label));
  }
  return result.code;
}

function isGenerationCodeConfigured(raw) {
  return normalizeGenerationCode(raw).length > 0;
}

module.exports = {
  GENERATION_CODE_MIN_LENGTH,
  GENERATION_CODE_MIN_UNIQUE_CHARS,
  GENERATION_CODE_MAX_LENGTH,
  normalizeGenerationCode,
  validateGenerationCodeStrength,
  assertStrongGenerationCode,
  isGenerationCodeConfigured,
};
