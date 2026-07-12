import { describe, expect, it } from "@jest/globals";
import {
  assertGoogleAuthClientIdForGsi,
  extractGoogleAuthClientId,
  isInstalledOnlyGoogleOAuthClientJson,
  isValidGoogleWebClientId,
  looksLikeGoogleOAuthClientJson,
} from "../services/runtimeConfigService";

describe("Google GSI client ID helpers", () => {
  const webClientId = "17055657909-ejokcidnqhg4vspj7diq255o0roomea3.apps.googleusercontent.com";
  const installedClientId = "17055657909-fvhkanhq0ht0gm69ra2sjb5onpeqrh91.apps.googleusercontent.com";

  it("prefers web.client_id over installed.client_id", () => {
    expect(
      extractGoogleAuthClientId({
        web: { client_id: webClientId },
        installed: { client_id: installedClientId },
      }),
    ).toBe(webClientId);
  });

  it("extracts top-level clientId form payloads", () => {
    expect(extractGoogleAuthClientId({ clientId: webClientId })).toBe(webClientId);
  });

  it("detects installed-only Google OAuth JSON", () => {
    expect(
      isInstalledOnlyGoogleOAuthClientJson({
        installed: {
          client_id: installedClientId,
          project_id: "subtle-reserve-488705-n3",
        },
      }),
    ).toBe(true);

    expect(
      isInstalledOnlyGoogleOAuthClientJson({
        web: { client_id: webClientId },
      }),
    ).toBe(false);
  });

  it("validates Google web client id format", () => {
    expect(isValidGoogleWebClientId(webClientId)).toBe(true);
    expect(isValidGoogleWebClientId("not-a-client-id")).toBe(false);
    expect(isValidGoogleWebClientId("")).toBe(false);
  });

  it("assertGoogleAuthClientIdForGsi rejects invalid ids", () => {
    expect(() => assertGoogleAuthClientIdForGsi("bad", "form")).toThrow(/格式无效/);
    expect(assertGoogleAuthClientIdForGsi(` ${webClientId} `, "form")).toBe(webClientId);
  });

  it("looksLikeGoogleOAuthClientJson recognizes console downloads", () => {
    expect(looksLikeGoogleOAuthClientJson({ web: { client_id: webClientId } })).toBe(true);
    expect(looksLikeGoogleOAuthClientJson({ client_id: webClientId })).toBe(true);
    expect(looksLikeGoogleOAuthClientJson({ foo: 1 })).toBe(false);
  });
});
