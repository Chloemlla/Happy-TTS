/**
 * TTS shared/anonymous generation-code strength policy.
 *
 * Empty means "not configured" (feature disabled for shared-code paths).
 * Any non-empty value must be high-entropy so anonymous TTS cannot be gated by a guessable default.
 */

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

export const GENERATION_CODE_MIN_LENGTH = 24;
export const GENERATION_CODE_MIN_UNIQUE_CHARS = 12;
export const GENERATION_CODE_MAX_LENGTH = 256;

export type GenerationCodeValidationResult =
  | { ok: true; code: string }
  | { ok: false; reason: string };

function countUniqueChars(value: string): number {
  return new Set(Array.from(value)).size;
}

function looksLowEntropy(value: string): boolean {
  const lower = value.toLowerCase();

  if (WEAK_GENERATION_CODES.has(lower)) {
    return true;
  }

  // Repeated single character / trivial sequences.
  if (/^(.)\1+$/.test(value)) {
    return true;
  }

  // Pure sequential digits or letters (ascending/descending).
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  if (alphabet.includes(lower) || alphabet.split("").reverse().join("").includes(lower)) {
    return true;
  }

  // Very low unique-character density relative to length.
  if (countUniqueChars(value) < GENERATION_CODE_MIN_UNIQUE_CHARS) {
    return true;
  }

  return false;
}

/**
 * Normalize and validate a generation code.
 * Empty / whitespace-only values are treated as "not configured".
 */
export function normalizeGenerationCode(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.trim().slice(0, GENERATION_CODE_MAX_LENGTH);
}

export function validateGenerationCodeStrength(raw: unknown): GenerationCodeValidationResult {
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

export function assertStrongGenerationCode(raw: unknown, label = "GENERATION_CODE"): string {
  const result = validateGenerationCodeStrength(raw);
  if (!result.ok) {
    throw new Error(result.reason.replace(/^GENERATION_CODE/, label));
  }
  return result.code;
}

export function isGenerationCodeConfigured(raw: unknown): boolean {
  return normalizeGenerationCode(raw).length > 0;
}
