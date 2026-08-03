import {
  GENERATION_CODE_MIN_LENGTH,
  validateGenerationCodeStrength,
} from "../utils/generationCodePolicy";

describe("generation code strength policy", () => {
  it("accepts a sufficiently long high-entropy code", () => {
    const code = "K7mQ2vR9xL4pT8nW3cY6hJ1s";

    expect(validateGenerationCodeStrength(code)).toEqual({ ok: true, code });
  });

  it("rejects codes shorter than the configured minimum", () => {
    const code = "K7mQ2vR9xL4pT8nW";
    const result = validateGenerationCodeStrength(code);

    expect(code).toHaveLength(GENERATION_CODE_MIN_LENGTH - 8);
    expect(result).toEqual({
      ok: false,
      reason: `GENERATION_CODE must be at least ${GENERATION_CODE_MIN_LENGTH} characters when configured`,
    });
  });

  it("rejects long but low-entropy codes", () => {
    const result = validateGenerationCodeStrength("a".repeat(GENERATION_CODE_MIN_LENGTH));

    expect(result).toEqual({
      ok: false,
      reason:
        "GENERATION_CODE must be high-entropy (reject predictable/weak values such as admin/password/short codes)",
    });
  });
});
