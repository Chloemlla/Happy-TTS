import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createClientIntegrityCheck,
  getClientIntegrityDiagnostics,
  resetClientIntegrityDiagnosticsForTests,
} from "./integrityDiagnostics";

describe("client integrity diagnostics", () => {
  beforeEach(() => {
    resetClientIntegrityDiagnosticsForTests();
    vi.restoreAllMocks();
  });

  it("distinguishes detected, not-detected, and check-failed outcomes", () => {
    const cleanCheck = createClientIntegrityCheck("dangerous-extension");
    expect(cleanCheck.finish(false)).toMatchObject({
      outcome: "not-detected",
      detected: false,
      trust: "low",
      authorizationBoundary: false,
    });

    const detectedCheck = createClientIntegrityCheck("dangerous-extension");
    expect(detectedCheck.finish(true, ["marker-found"])).toMatchObject({
      outcome: "detected",
      detected: true,
      reasons: ["marker-found"],
    });

    const failingTarget = new Proxy<Record<string, unknown>>(
      {},
      {
        get() {
          throw new Error("secret token and private URL must not escape");
        },
      }
    );
    const failedCheck = createClientIntegrityCheck("dangerous-extension");
    const value = failedCheck.probe("window.GM_info", () => failingTarget.GM_info);

    expect(value).toBeUndefined();
    expect(failedCheck.finish(false)).toMatchObject({
      outcome: "check-failed",
      detected: false,
      failedProbes: ["window.gm_info"],
      trust: "low",
      authorizationBoundary: false,
    });
  });

  it("redacts exception details and rate-limits repeated diagnostics", () => {
    const dispatchEvent = vi.spyOn(window, "dispatchEvent");

    for (let index = 0; index < 50; index += 1) {
      const check = createClientIntegrityCheck("Extension Scan / user@example.com");
      check.probe("Window.GM_info", () => {
        throw new Error(`token=secret-${index} https://private.example/path`);
      });
      check.finish(false);
    }

    expect(dispatchEvent).toHaveBeenCalledTimes(1);
    expect(getClientIntegrityDiagnostics()).toEqual([
      expect.objectContaining({
        source: "unknown",
        outcome: "check-failed",
        failedProbes: ["window.gm_info"],
        trust: "low",
        authorizationBoundary: false,
      }),
    ]);
    expect(JSON.stringify(getClientIntegrityDiagnostics())).not.toContain("secret-");
    expect(JSON.stringify(getClientIntegrityDiagnostics())).not.toContain("private.example");
  });
});
