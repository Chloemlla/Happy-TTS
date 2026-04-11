import request from "supertest";
import app from "../app";
import { getNexaiAssetLinksStatements, getNexaiWebAuthnConfig } from "../utils/nexaiWebAuthn";

const ENV_KEYS = [
  "NEXAI_WEBAUTHN_RP_ID",
  "WEBAUTHN_RP_ID",
  "RP_ID",
  "NEXAI_WEBAUTHN_EXPECTED_ORIGINS",
  "NEXAI_WEBAUTHN_ALLOWED_ORIGINS",
  "WEBAUTHN_EXPECTED_ORIGIN",
  "RP_ORIGIN",
  "NEXAI_ANDROID_APK_KEY_HASHES",
  "ANDROID_APK_KEY_HASHES",
  "NEXAI_ANDROID_ASSETLINKS_JSON",
  "NEXAI_ANDROID_PACKAGE_NAME",
  "NEXAI_ANDROID_PACKAGE_NAMES",
  "ANDROID_PACKAGE_NAME",
  "ANDROID_PACKAGE_NAMES",
  "NEXAI_ANDROID_SHA256_CERT_FINGERPRINTS",
  "ANDROID_SHA256_CERT_FINGERPRINTS",
] as const;

const ENV_SNAPSHOT = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]])) as Record<
  (typeof ENV_KEYS)[number],
  string | undefined
>;

function resetEnv(): void {
  for (const key of ENV_KEYS) {
    if (ENV_SNAPSHOT[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = ENV_SNAPSHOT[key];
    }
  }
}

describe("NexAI WebAuthn backend fixes", () => {
  beforeEach(() => {
    resetEnv();
    for (const key of ENV_KEYS) {
      delete process.env[key];
    }
  });

  afterAll(() => {
    resetEnv();
  });

  it("uses api.951100.xyz as the default RP ID instead of localhost", () => {
    const webAuthnConfig = getNexaiWebAuthnConfig();

    expect(webAuthnConfig.rpID).toBe("api.951100.xyz");
    expect(webAuthnConfig.expectedOrigins).toContain("https://api.951100.xyz");
    expect(webAuthnConfig.rpID).not.toBe("localhost");
  });

  it("includes Android apk-key-hash origins when provided", () => {
    process.env.NEXAI_ANDROID_APK_KEY_HASHES = "test-hash-1,android:apk-key-hash:test-hash-2";

    const webAuthnConfig = getNexaiWebAuthnConfig();

    expect(webAuthnConfig.expectedOrigins).toEqual(
      expect.arrayContaining([
        "https://api.951100.xyz",
        "android:apk-key-hash:test-hash-1",
        "android:apk-key-hash:test-hash-2",
      ]),
    );
  });

  it("builds valid assetlinks statements from environment variables", () => {
    process.env.NEXAI_ANDROID_PACKAGE_NAME = "xyz.nexai.app";
    process.env.NEXAI_ANDROID_SHA256_CERT_FINGERPRINTS = "AA:BB:CC,11:22:33";

    expect(getNexaiAssetLinksStatements()).toEqual([
      {
        relation: ["delegate_permission/common.get_login_creds", "delegate_permission/common.handle_all_urls"],
        target: {
          namespace: "android_app",
          package_name: "xyz.nexai.app",
          sha256_cert_fingerprints: ["AA:BB:CC", "11:22:33"],
        },
      },
    ]);
  });

  it("serves /.well-known/assetlinks.json as JSON instead of HTML", async () => {
    process.env.NEXAI_ANDROID_PACKAGE_NAME = "xyz.nexai.app";
    process.env.NEXAI_ANDROID_SHA256_CERT_FINGERPRINTS = "AA:BB:CC";

    const response = await request(app).get("/.well-known/assetlinks.json").expect(200);

    expect(response.headers["content-type"]).toMatch(/application\/json/);
    expect(response.body).toEqual([
      {
        relation: ["delegate_permission/common.get_login_creds", "delegate_permission/common.handle_all_urls"],
        target: {
          namespace: "android_app",
          package_name: "xyz.nexai.app",
          sha256_cert_fingerprints: ["AA:BB:CC"],
        },
      },
    ]);
  });
});
