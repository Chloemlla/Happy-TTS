jest.mock("../models/ecoEnchantsModel", () => ({
  EcoEnchantsActivationModel: {
    findOne: jest.fn(),
    countDocuments: jest.fn(),
    create: jest.fn(),
    updateMany: jest.fn(),
  },
  EcoEnchantsAuditLogModel: {
    create: jest.fn(),
  },
  EcoEnchantsIdempotencyRecordModel: {
    findOne: jest.fn(),
    create: jest.fn(),
  },
  EcoEnchantsLicenseModel: {
    findOne: jest.fn(),
    findOneAndUpdate: jest.fn(),
    create: jest.fn(),
    find: jest.fn(),
  },
  EcoEnchantsPlanModel: {
    findOne: jest.fn(),
    create: jest.fn(),
  },
  EcoEnchantsProductModel: {
    findOne: jest.fn(),
    create: jest.fn(),
    findOneAndUpdate: jest.fn(),
  },
  EcoEnchantsReleaseBuildModel: {
    findOne: jest.fn(),
    create: jest.fn(),
    find: jest.fn(),
  },
  EcoEnchantsRiskEventModel: {
    create: jest.fn(),
  },
  EcoEnchantsWebhookEventModel: {
    findOne: jest.fn(),
    create: jest.fn(),
  },
}));

import {
  EcoEnchantsActivationModel,
  EcoEnchantsAuditLogModel,
  EcoEnchantsIdempotencyRecordModel,
  EcoEnchantsLicenseModel,
  EcoEnchantsPlanModel,
  EcoEnchantsReleaseBuildModel,
  EcoEnchantsRiskEventModel,
} from "../models/ecoEnchantsModel";
import { EcoEnchantsService, type LicenseVerifyRequest } from "../services/ecoEnchantsService";

const mockedLicenseModel = EcoEnchantsLicenseModel as jest.Mocked<typeof EcoEnchantsLicenseModel>;
const mockedActivationModel = EcoEnchantsActivationModel as jest.Mocked<typeof EcoEnchantsActivationModel>;
const mockedPlanModel = EcoEnchantsPlanModel as jest.Mocked<typeof EcoEnchantsPlanModel>;
const mockedReleaseBuildModel = EcoEnchantsReleaseBuildModel as jest.Mocked<typeof EcoEnchantsReleaseBuildModel>;
const mockedAuditLogModel = EcoEnchantsAuditLogModel as jest.Mocked<typeof EcoEnchantsAuditLogModel>;
const mockedRiskEventModel = EcoEnchantsRiskEventModel as jest.Mocked<typeof EcoEnchantsRiskEventModel>;
const mockedIdempotencyModel = EcoEnchantsIdempotencyRecordModel as jest.Mocked<
  typeof EcoEnchantsIdempotencyRecordModel
>;

const baseVerifyRequest: LicenseVerifyRequest = {
  productId: "ecoenchants",
  licenseKey: "ECOE-AAAA-BBBB-CCCC",
  installationId: "install-1",
  server: {
    platform: "Paper",
    platformVersion: "1.21.11-R0.1-SNAPSHOT",
    minecraftVersion: "1.21.11",
    onlineMode: true,
    javaVersion: "21.0.7",
  },
  plugin: {
    version: "13.0.0",
    channel: "stable",
    buildFingerprint: `sha256:${"a".repeat(64)}`,
  },
};

function createLicense(overrides: Record<string, unknown> = {}) {
  return {
    licenseId: "lic_test",
    productId: "ecoenchants",
    customerId: "customer-1",
    planId: "pro",
    status: "valid",
    maxActivations: 3,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    keyLast4: "CCCC",
    save: jest.fn(),
    ...overrides,
  } as any;
}

describe("EcoEnchantsService.verifyLicense", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.ECOENCHANTS_ALLOW_DEVELOPMENT_BUILDS;
    mockedAuditLogModel.create.mockResolvedValue({} as any);
    mockedRiskEventModel.create.mockResolvedValue({} as any);
  });

  it("returns valid and refreshes an existing activation when the build fingerprint is official", async () => {
    const license = createLicense();
    const activation = {
      activationId: "act_test",
      licenseId: "lic_test",
      installationIdHash: "hash",
      status: "active",
      save: jest.fn().mockResolvedValue(undefined),
    } as any;

    mockedLicenseModel.findOne.mockResolvedValue(license);
    mockedReleaseBuildModel.findOne.mockResolvedValue({ buildId: "build_test" } as any);
    mockedActivationModel.findOne.mockResolvedValue(activation);
    mockedActivationModel.countDocuments.mockResolvedValue(1);

    const result = await EcoEnchantsService.verifyLicense(baseVerifyRequest, {
      requestId: "req_test",
      ip: "127.0.0.1",
    });

    expect(result.status).toBe("valid");
    expect(result.activation?.activationId).toBe("act_test");
    expect(activation.save).toHaveBeenCalledTimes(1);
    expect(mockedReleaseBuildModel.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        productId: "ecoenchants",
        version: "13.0.0",
        channel: "stable",
        sha256: "a".repeat(64),
      }),
    );
  });

  it("allows trial licenses and creates an activation without storing forbidden player data", async () => {
    const createdActivation = {
      activationId: "act_created",
      licenseId: "lic_test",
      installationIdHash: "hash",
      status: "active",
      lastSeenAt: new Date("2026-06-05T08:00:00Z"),
    } as any;
    mockedLicenseModel.findOne.mockResolvedValue(createLicense({ status: "trial" }));
    mockedActivationModel.findOne.mockResolvedValue(null);
    mockedActivationModel.countDocuments.mockResolvedValue(0);
    mockedActivationModel.create.mockResolvedValue(createdActivation);

    const result = await EcoEnchantsService.verifyLicense(
      {
        ...baseVerifyRequest,
        playerUuid: "00000000-0000-0000-0000-000000000000",
        playerIp: "203.0.113.10",
        chat: ["private-message"],
        economy: { balance: 1000 },
        inventory: ["diamond"],
        coordinates: { x: 1, y: 2, z: 3 },
        permissionGroups: ["admin"],
        worldHashes: ["abc123"],
        plugin: { version: "13.0.0", channel: "stable" },
      } as LicenseVerifyRequest,
      { requestId: "req_test" },
    );

    expect(result.status).toBe("trial");
    expect(mockedActivationModel.create).toHaveBeenCalledTimes(1);
    const createdPayload = mockedActivationModel.create.mock.calls[0][0] as Record<string, unknown>;
    expect(JSON.stringify(createdPayload)).not.toMatch(
      /playerUuid|playerIp|chat|economy|inventory|coordinates|permissionGroups|worldHashes/,
    );
  });

  it("returns tampered before activation when the build fingerprint is not whitelisted", async () => {
    mockedLicenseModel.findOne.mockResolvedValue(createLicense());
    mockedReleaseBuildModel.findOne.mockResolvedValue(null);

    const result = await EcoEnchantsService.verifyLicense(baseVerifyRequest, {
      requestId: "req_test",
    });

    expect(result.status).toBe("tampered");
    expect(mockedRiskEventModel.create).toHaveBeenCalledWith(expect.objectContaining({ type: "build_fingerprint_mismatch" }));
    expect(mockedActivationModel.findOne).not.toHaveBeenCalled();
  });

  it.each([
    ["expired", createLicense({ expiresAt: new Date(Date.now() - 60 * 1000) })],
    ["suspended", createLicense({ status: "suspended" })],
    ["revoked", createLicense({ status: "revoked" })],
  ])("returns %s without activating the installation", async (expectedStatus, license) => {
    mockedLicenseModel.findOne.mockResolvedValue(license);

    const result = await EcoEnchantsService.verifyLicense(
      {
        ...baseVerifyRequest,
        plugin: { version: "13.0.0", channel: "stable" },
      },
      { requestId: "req_test" },
    );

    expect(result.status).toBe(expectedStatus);
    expect(mockedActivationModel.findOne).not.toHaveBeenCalled();
    expect(mockedActivationModel.create).not.toHaveBeenCalled();
  });

  it("returns invalid when the license key hash is not found", async () => {
    mockedLicenseModel.findOne.mockResolvedValue(null);

    const result = await EcoEnchantsService.verifyLicense(baseVerifyRequest, { requestId: "req_test" });

    expect(result.status).toBe("invalid");
    expect(mockedActivationModel.findOne).not.toHaveBeenCalled();
  });

  it("returns activation_limit_exceeded when no activation seat remains", async () => {
    mockedLicenseModel.findOne.mockResolvedValue(createLicense({ maxActivations: 1 }));
    mockedActivationModel.findOne.mockResolvedValue(null);
    mockedActivationModel.countDocuments.mockResolvedValue(1);

    const result = await EcoEnchantsService.verifyLicense(
      {
        ...baseVerifyRequest,
        plugin: { version: "13.0.0", channel: "stable" },
      },
      { requestId: "req_test" },
    );

    expect(result.status).toBe("activation_limit_exceeded");
    expect(mockedActivationModel.create).not.toHaveBeenCalled();
  });
});

describe("EcoEnchantsService.createLicense", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedAuditLogModel.create.mockResolvedValue({} as any);
  });

  it("stores only a keyed hash and last four characters for license keys", async () => {
    mockedPlanModel.findOne.mockResolvedValue({ planId: "pro", maxActivations: 3 } as any);
    mockedLicenseModel.create.mockImplementation(async (payload: any) => ({
      ...payload,
      createdAt: new Date("2026-06-05T08:00:00Z"),
      updatedAt: new Date("2026-06-05T08:00:00Z"),
    }));

    const result = await EcoEnchantsService.createLicense(
      {
        productId: "ecoenchants",
        customerId: "customer-1",
        planId: "pro",
        licenseKey: "ECOE-1111-2222-3333",
      },
      { requestId: "req_test", actorType: "admin", actorId: "admin-1" },
    );

    const createPayload = mockedLicenseModel.create.mock.calls[0][0] as Record<string, unknown>;
    expect(createPayload).not.toHaveProperty("licenseKey");
    expect(createPayload.keyHash).toMatch(/^[a-f0-9]{64}$/);
    expect(createPayload.keyLast4).toBe("3333");
    expect(result.license.key).toBe("****-****-****-3333");
    expect(result.licenseKey).toBe("ECOE-1111-2222-3333");
  });
});

describe("EcoEnchantsService.withIdempotency", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("rejects a reused idempotency key with a different request body", async () => {
    mockedIdempotencyModel.findOne.mockResolvedValue({
      bodyHash: "different",
      method: "POST",
      path: "/api/ecoenchants/v1/admin/licenses",
    } as any);

    await expect(
      EcoEnchantsService.withIdempotency(
        {
          scope: "admin.licenses.create",
          key: "idem-key",
          method: "POST",
          path: "/api/ecoenchants/v1/admin/licenses",
          body: { customerId: "customer-1" },
        },
        async () => ({ statusCode: 201, body: { requestId: "req_test" } }),
      ),
    ).rejects.toMatchObject({
      statusCode: 409,
      code: "idempotency_conflict",
    });
  });
});
