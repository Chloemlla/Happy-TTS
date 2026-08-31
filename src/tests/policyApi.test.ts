import request from "supertest";
import app from "../app";
import { PolicyConsent } from "../models/policyConsentModel";
import { connectMongo, mongoose } from "../services/mongoService";
import {
  CONSENT_VALIDITY_DAYS,
  CURRENT_POLICY_VERSION,
  generatePolicyChecksum,
} from "../services/policyConsentService";

describe("Policy API MongoDB contract", () => {
  beforeAll(async () => {
    await connectMongo();
    await PolicyConsent.deleteMany({});
  });

  afterAll(async () => {
    await PolicyConsent.deleteMany({});
    await mongoose.disconnect();
  });

  it("reports the server policy version and validity window", async () => {
    const response = await request(app).get("/api/policy/version").expect(200);

    expect(response.body).toEqual({
      success: true,
      version: CURRENT_POLICY_VERSION,
      validityDays: CONSENT_VALIDITY_DAYS,
    });
  });

  it("records, verifies, revokes, and invalidates a consent", async () => {
    // 使用 supertest agent，自动保留 verify 时下发的设备凭据 cookie
    const agent = request.agent(app);

    const consent = {
      timestamp: Date.now(),
      version: CURRENT_POLICY_VERSION,
      fingerprint: `nightly-policy-${Date.now()}`,
    };
    const checksum = generatePolicyChecksum(consent);

    const recorded = await agent
      .post("/api/policy/verify")
      .send({ consent: { ...consent, checksum }, userAgent: "PolicyNightly/1.0" })
      .expect(200);

    expect(recorded.body).toEqual(
      expect.objectContaining({
        success: true,
        consentId: expect.any(String),
        expiresAt: expect.any(String),
      }),
    );

    const verified = await agent
      .get("/api/policy/check")
      .query({ fingerprint: consent.fingerprint, version: consent.version })
      .expect(200);

    expect(verified.body).toEqual(
      expect.objectContaining({
        success: true,
        hasValidConsent: true,
        version: CURRENT_POLICY_VERSION,
      }),
    );

    const revoked = await agent
      .post("/api/policy/revoke")
      .send({ fingerprint: consent.fingerprint, version: consent.version })
      .expect(200);

    expect(revoked.body).toEqual(
      expect.objectContaining({
        success: true,
        revokedCount: 1,
      }),
    );

    const afterRevoke = await agent
      .get("/api/policy/check")
      .query({ fingerprint: consent.fingerprint, version: consent.version })
      .expect(200);

    expect(afterRevoke.body).toEqual(
      expect.objectContaining({
        success: false,
        hasValidConsent: false,
        currentVersion: CURRENT_POLICY_VERSION,
      }),
    );
  });

  it("rejects revoke/check without the device credential (cookie)", async () => {
    const consent = {
      timestamp: Date.now(),
      version: CURRENT_POLICY_VERSION,
      fingerprint: `nightly-unauthorized-${Date.now()}`,
    };
    const checksum = generatePolicyChecksum(consent);

    // 用一个匿名 agent 记录同意（拿到 cookie），再用另一个匿名 agent 尝试撤销
    const ownerAgent = request.agent(app);
    await ownerAgent
      .post("/api/policy/verify")
      .send({ consent: { ...consent, checksum }, userAgent: "PolicyNightly/1.0" })
      .expect(200);

    const attackerAgent = request.agent(app);
    const revoked = await attackerAgent
      .post("/api/policy/revoke")
      .send({ fingerprint: consent.fingerprint, version: consent.version })
      .expect(403);

    expect(revoked.body.code).toBe("DEVICE_CREDENTIAL_REQUIRED");
  });

  it("rejects a consent with an invalid checksum", async () => {
    const response = await request(app)
      .post("/api/policy/verify")
      .send({
        consent: {
          timestamp: Date.now(),
          version: CURRENT_POLICY_VERSION,
          fingerprint: `nightly-invalid-${Date.now()}`,
          checksum: "invalid-checksum",
        },
      })
      .expect(400);

    expect(response.body).toEqual(
      expect.objectContaining({
        success: false,
        code: "INVALID_CHECKSUM",
      }),
    );
  });
});
