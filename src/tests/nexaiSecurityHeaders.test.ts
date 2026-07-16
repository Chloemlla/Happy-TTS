import {
  extractSecurityHeaders,
  getRiskStrategy,
} from "../services/nexaiSecurityService";

function makeReq(headers: Record<string, string>) {
  return { headers } as any;
}

describe("NexAI anti-debug security headers", () => {
  it("defaults missing anti-debug headers safely", () => {
    const headers = extractSecurityHeaders(
      makeReq({
        "x-device-fingerprint": "fp-1",
        "x-device-risk-score": "5",
        "x-device-risk-level": "SAFE",
      }),
    );

    expect(headers.isAdbEnabled).toBe(false);
    expect(headers.isDevelopmentSettingsEnabled).toBe(false);
    expect(headers.isDebugBuild).toBe(false);
    expect(headers.isTracerAttached).toBe(false);
    expect(headers.antiDebugScore).toBe(0);
    expect(getRiskStrategy(headers)).toBe("NORMAL");
  });

  it("parses anti-debug headers and elevates strategy", () => {
    const headers = extractSecurityHeaders(
      makeReq({
        "x-device-fingerprint": "fp-2",
        "x-device-risk-score": "20",
        "x-device-risk-level": "LOW",
        "x-device-debugger": "1",
        "x-device-adb": "1",
        "x-device-dev-settings": "1",
        "x-device-debug-build": "0",
        "x-device-tracer": "1",
        "x-device-anti-debug-score": "0.62",
        "x-device-signature-valid": "1",
        "x-device-hash-valid": "1",
      }),
    );

    expect(headers.isDebugger).toBe(true);
    expect(headers.isAdbEnabled).toBe(true);
    expect(headers.isDevelopmentSettingsEnabled).toBe(true);
    expect(headers.isTracerAttached).toBe(true);
    expect(headers.antiDebugScore).toBeCloseTo(0.62);
    expect(headers.isCompromised).toBe(true);
    expect(getRiskStrategy(headers)).toBe("HONEYPOT");
  });

  it("blocks very high anti-debug scores", () => {
    const headers = extractSecurityHeaders(
      makeReq({
        "x-device-risk-score": "10",
        "x-device-anti-debug-score": "0.95",
        "x-device-tracer": "1",
      }),
    );
    expect(getRiskStrategy(headers)).toBe("BLOCK");
  });
});
