import { sanitizeLogValue } from "../utils/requestLogSanitizer";

describe("request log sanitizer", () => {
  it("redacts sensitive keys recursively", () => {
    const sanitized = sanitizeLogValue({
      authorization: "Bearer secret",
      nested: {
        password: "hunter2",
        safe: "visible",
      },
    }) as Record<string, any>;

    expect(sanitized.authorization).toBe("[redacted]");
    expect(sanitized.nested.password).toBe("[redacted]");
    expect(sanitized.nested.safe).toBe("visible");
  });

  it("truncates long strings", () => {
    const sanitized = sanitizeLogValue({ body: "x".repeat(1100) }) as Record<string, string>;

    expect(sanitized.body).toContain("[truncated");
    expect(sanitized.body.length).toBeLessThan(1100);
  });
});

