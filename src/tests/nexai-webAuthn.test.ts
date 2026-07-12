import request from "supertest";
import jwt from "jsonwebtoken";
import app from "../app";
import { config } from "../config/config";
import { NexaiUserModel } from "../models/nexaiUserModel";
import { NEXAI_PASSKEY_UNKNOWN_CREDENTIAL_CODE, NexaiAuthService } from "../services/nexaiAuthService";
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
  "ANDROID_ASSETLINKS_DISABLED",
  "NEXAI_ANDROID_ASSETLINKS_DISABLED",
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

function createNexaiAccessToken(user: { id: string; username: string; email: string; role?: string }) {
  return jwt.sign(
    {
      userId: user.id,
      username: user.username,
      email: user.email,
      role: user.role || "user",
      provider: "local",
      scope: "nexai",
    },
    config.nexai.jwtSecret,
  );
}

describe("NexAI WebAuthn backend fixes", () => {
  beforeEach(async () => {
    resetEnv();
    for (const key of ENV_KEYS) {
      delete process.env[key];
    }
    await NexaiUserModel.deleteMany({});
  });

  afterAll(() => {
    resetEnv();
  });

  it("uses tts.chloemlla.com as the default RP ID instead of localhost", () => {
    const webAuthnConfig = getNexaiWebAuthnConfig();

    expect(webAuthnConfig.rpID).toBe("tts.chloemlla.com");
    expect(webAuthnConfig.expectedOrigins).toContain("https://tts.chloemlla.com");
    expect(webAuthnConfig.expectedOrigins).toContain(
      "android:apk-key-hash:_9HzfCcFGsx_oYdF4QfmF5ooVyYZtj_G902sPaRO184",
    );
    expect(webAuthnConfig.rpID).not.toBe("localhost");
  });

  it("includes Android apk-key-hash origins when provided", () => {
    process.env.NEXAI_ANDROID_APK_KEY_HASHES = "test-hash-1,android:apk-key-hash:test-hash-2";

    const webAuthnConfig = getNexaiWebAuthnConfig();

    expect(webAuthnConfig.expectedOrigins).toEqual(
      expect.arrayContaining([
        "https://tts.chloemlla.com",
        "android:apk-key-hash:_9HzfCcFGsx_oYdF4QfmF5ooVyYZtj_G902sPaRO184",
        "android:apk-key-hash:test-hash-1",
        "android:apk-key-hash:test-hash-2",
      ]),
    );
  });

  it("includes default Synapse Mobile and NexAI assetlinks when no env packages are set", () => {
    const statements = getNexaiAssetLinksStatements();
    expect(statements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          relation: ["delegate_permission/common.get_login_creds", "delegate_permission/common.handle_all_urls"],
          target: expect.objectContaining({
            namespace: "android_app",
            package_name: "com.synapse.mobile",
            sha256_cert_fingerprints: expect.arrayContaining([
              "E9:D8:5A:D2:52:C3:8D:86:C6:E4:B2:A8:C0:49:B8:B5:A9:FA:79:AC:6E:BB:11:8C:94:0A:83:03:B6:96:39:98",
            ]),
          }),
        }),
        expect.objectContaining({
          relation: ["delegate_permission/common.get_login_creds", "delegate_permission/common.handle_all_urls"],
          target: expect.objectContaining({
            namespace: "android_app",
            package_name: "com.chloemlla.nexai",
            sha256_cert_fingerprints: expect.arrayContaining([
              "FF:D1:F3:7C:27:05:1A:CC:7F:A1:87:45:E1:07:E6:17:9A:28:57:26:19:B6:3F:C6:F7:4D:AC:3D:A4:4E:D7:CE",
            ]),
          }),
        }),
      ]),
    );
  });

  it("ignores empty NEXAI_ANDROID_ASSETLINKS_JSON override and keeps defaults", () => {
    process.env.NEXAI_ANDROID_ASSETLINKS_JSON = "[]";

    const statements = getNexaiAssetLinksStatements();
    const packages = statements.map((item) => item.target.package_name);

    expect(packages).toEqual(
      expect.arrayContaining(["com.chloemlla.nexai", "com.synapse.mobile"]),
    );
  });

  it("builds valid assetlinks statements from environment variables and keeps default packages", () => {
    process.env.NEXAI_ANDROID_PACKAGE_NAME = "xyz.nexai.app";
    process.env.NEXAI_ANDROID_SHA256_CERT_FINGERPRINTS = "AA:BB:CC,11:22:33";

    const statements = getNexaiAssetLinksStatements();
    const packages = statements.map((item) => item.target.package_name);
    expect(packages).toEqual(
      expect.arrayContaining(["xyz.nexai.app", "com.synapse.mobile", "com.chloemlla.nexai"]),
    );

    const nexai = statements.find((item) => item.target.package_name === "xyz.nexai.app");
    expect(nexai?.target.sha256_cert_fingerprints).toEqual(
      expect.arrayContaining(["AA:BB:CC", "11:22:33"]),
    );
  });

  it("serves /.well-known/assetlinks.json as JSON instead of HTML", async () => {
    process.env.NEXAI_ANDROID_PACKAGE_NAME = "xyz.nexai.app";
    process.env.NEXAI_ANDROID_SHA256_CERT_FINGERPRINTS = "AA:BB:CC";

    const response = await request(app).get("/.well-known/assetlinks.json").expect(200);

    expect(response.headers["content-type"]).toMatch(/application\/json/);
    expect(Array.isArray(response.body)).toBe(true);
    const packages = response.body.map((item: { target: { package_name: string } }) => item.target.package_name);
    expect(packages).toEqual(
      expect.arrayContaining(["xyz.nexai.app", "com.synapse.mobile", "com.chloemlla.nexai"]),
    );
  });

  it("can disable assetlinks statements via ANDROID_ASSETLINKS_DISABLED", () => {
    process.env.ANDROID_ASSETLINKS_DISABLED = "true";
    expect(getNexaiAssetLinksStatements()).toEqual([]);
  });

  it("returns server-authoritative passkey signal options", async () => {
    const user = {
      id: "user-123",
      username: "alice",
      email: "alice@example.com",
      displayName: "Alice",
      authProvider: "local",
      emailVerified: true,
      role: "user",
      loginCount: 0,
      passkeys: [
        {
          id: "credential-id==",
          publicKey: Buffer.from("public-key"),
          counter: 1,
          backedUp: false,
          transports: ["internal", "hybrid"],
          deviceType: "singleDevice",
        },
      ],
    };
    await NexaiUserModel.create(user);

    const response = await request(app)
      .get("/api/nexai/auth/passkey/signal/options")
      .set("Authorization", `Bearer ${createNexaiAccessToken(user)}`)
      .expect(200);

    const expectedUserId = Buffer.from(user.id, "utf8").toString("base64url");
    expect(response.body).toEqual({
      success: true,
      data: {
        allAcceptedCredentials: {
          rpId: "tts.chloemlla.com",
          userId: expectedUserId,
          allAcceptedCredentialIds: ["credential-id"],
        },
        currentUserDetails: {
          rpId: "tts.chloemlla.com",
          userId: expectedUserId,
          name: "alice@example.com",
          displayName: "Alice",
        },
      },
    });
  });

  it("returns an empty accepted credential list when the user has no passkeys", async () => {
    await NexaiUserModel.create({
      id: "no-passkeys",
      username: "bob",
      email: "bob@example.com",
      displayName: "Bob",
      authProvider: "local",
      emailVerified: true,
      role: "user",
      loginCount: 0,
      passkeys: [],
    });

    const signalOptions = await NexaiAuthService.getPasskeySignalOptions("no-passkeys");

    expect(signalOptions.allAcceptedCredentials.allAcceptedCredentialIds).toEqual([]);
    expect(signalOptions.currentUserDetails).toMatchObject({
      name: "bob@example.com",
      displayName: "Bob",
    });
  });

  it("uses unknown_credential only when the passkey credential id is not known", async () => {
    const baseUser = {
      username: "carol",
      email: "carol@example.com",
      displayName: "Carol",
      authProvider: "local",
      emailVerified: true,
      role: "user",
      loginCount: 0,
      passkeys: [
        {
          id: "known-credential",
          publicKey: Buffer.from("public-key"),
          counter: 1,
          backedUp: false,
          transports: ["internal"],
          deviceType: "singleDevice",
        },
      ],
    };
    await NexaiUserModel.create({
      ...baseUser,
      id: "unknown-credential-user",
      currentChallenge: "challenge",
    });

    const unknownCredentialResponse = await request(app)
      .post("/api/nexai/auth/passkey/login/verify")
      .send({
        identifier: "carol@example.com",
        response: { id: "missing-credential" },
      })
      .expect(400);

    expect(unknownCredentialResponse.body).toMatchObject({
      success: false,
      code: NEXAI_PASSKEY_UNKNOWN_CREDENTIAL_CODE,
    });

    await NexaiUserModel.create({
      ...baseUser,
      id: "expired-challenge-user",
      username: "dave",
      email: "dave@example.com",
    });

    const expiredChallengeResponse = await request(app)
      .post("/api/nexai/auth/passkey/login/verify")
      .send({
        identifier: "dave@example.com",
        response: { id: "known-credential" },
      })
      .expect(400);

    expect(expiredChallengeResponse.body.code).toBeUndefined();
  });

  it("issues discoverable passkey login options without an identifier", async () => {
    const response = await request(app).post("/api/nexai/auth/passkey/login/discoverable/options").send({}).expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.data).toMatchObject({
      rpId: "tts.chloemlla.com",
      userVerification: "preferred",
    });
    expect(typeof response.body.data.challenge).toBe("string");
    expect(response.body.data.challenge.length).toBeGreaterThan(0);
    expect(response.body.data.allowCredentials).toEqual([]);
  });

  it("rejects discoverable verify for unknown credentials with unknown_credential", async () => {
    const optionsResponse = await request(app)
      .post("/api/nexai/auth/passkey/login/discoverable/options")
      .send({})
      .expect(200);

    const challenge = optionsResponse.body.data.challenge as string;
    const verifyResponse = await request(app)
      .post("/api/nexai/auth/passkey/login/discoverable/verify")
      .send({
        challenge,
        response: { id: "missing-discoverable-credential" },
      })
      .expect(400);

    expect(verifyResponse.body).toMatchObject({
      success: false,
      code: NEXAI_PASSKEY_UNKNOWN_CREDENTIAL_CODE,
    });
  });

  it("rejects discoverable verify when challenge is missing or expired", async () => {
    const missingChallenge = await request(app)
      .post("/api/nexai/auth/passkey/login/discoverable/verify")
      .send({
        response: { id: "any-credential" },
      })
      .expect(400);
    expect(missingChallenge.body.success).toBe(false);
    expect(missingChallenge.body.code).toBeUndefined();

    const expiredChallenge = await request(app)
      .post("/api/nexai/auth/passkey/login/discoverable/verify")
      .send({
        challenge: "never-issued-challenge",
        response: { id: "any-credential" },
      })
      .expect(400);
    expect(expiredChallenge.body.success).toBe(false);
    expect(expiredChallenge.body.code).toBeUndefined();
  });

});
