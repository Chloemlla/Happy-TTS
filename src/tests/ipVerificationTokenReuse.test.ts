import { evaluateIpRisk } from "../services/ipRiskService";

jest.mock("axios");

jest.mock("../config/config", () => ({
  config: {
    enableFirstVisitVerification: true,
    ipqs: {
      enabled: false,
      scamalyticsUser: "happyclovo",
      strictness: 1,
      allowPublicAccessPoints: false,
      lighterPenalties: true,
      timeoutMs: 8000,
      monthlyQuotaPerKey: 5000,
      challengeFraudScore: 75,
      tokenTtlMinutes: 40,
      failOpen: true,
    },
    proxycheck: {
      enabled: true,
    },
  },
}));

jest.mock("../services/ipRiskService", () => ({
  evaluateIpRisk: jest.fn(),
}));

const findOneExec = jest.fn();

jest.mock("../services/mongoService", () => ({
  connectMongo: jest.fn().mockResolvedValue(undefined),
  mongoose: {
    connection: {
      readyState: 1,
    },
  },
}));

jest.mock("../models/ipVerificationTokenModel", () => ({
  IpVerificationTokenModel: {
    findOne: jest.fn(() => ({
      sort: jest.fn(() => ({
        exec: findOneExec,
      })),
      exec: findOneExec,
    })),
    deleteMany: jest.fn(() => ({
      exec: jest.fn().mockResolvedValue({ deletedCount: 0 }),
    })),
    create: jest.fn().mockResolvedValue({}),
  },
}));

jest.mock("../models/ipqsQuotaModel", () => ({
  IpqsQuotaModel: {
    find: jest.fn(() => ({
      lean: jest.fn(() => ({
        exec: jest.fn().mockResolvedValue([]),
      })),
    })),
    findOneAndUpdate: jest.fn(() => ({
      lean: jest.fn().mockResolvedValue({ usageCount: 1 }),
    })),
    updateOne: jest.fn(() => ({
      exec: jest.fn().mockResolvedValue({}),
    })),
  },
}));

jest.mock("../models/ipqsLookupLogModel", () => ({
  IpqsLookupLogModel: {
    create: jest.fn().mockResolvedValue({}),
  },
}));

jest.mock("../services/turnstileService", () => ({
  TurnstileService: {
    verifyTokenDetailed: jest.fn(),
  },
}));

const IpVerificationService = require("../services/ipVerificationService").default;
const mockedEvaluateIpRisk = evaluateIpRisk as jest.MockedFunction<typeof evaluateIpRisk>;

describe("IpVerificationService session token reuse", () => {
  const fingerprint = "fingerprint_123456";
  const ipAddress = "203.0.113.10";
  const reusableToken = "f".repeat(64);

  beforeEach(() => {
    jest.clearAllMocks();
    findOneExec.mockResolvedValue({
      token: reusableToken,
      fingerprint,
      ipAddress,
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      issuedBy: "hcaptcha",
      riskFlags: ["vpn"],
    });
    mockedEvaluateIpRisk.mockResolvedValue({
      shouldChallenge: true,
      reason: "proxycheck vpn",
      risk: 90,
      flags: ["vpn"],
    } as Awaited<ReturnType<typeof evaluateIpRisk>>);
  });

  it("reuses a live token instead of re-challenging a flagged IP", async () => {
    const result = await IpVerificationService.initializeSession({
      fingerprint,
      ipAddress,
      userAgent: "Mozilla/5.0",
    });

    expect(result.success).toBe(true);
    expect(result.verified).toBe(true);
    expect(result.requiresVerification).toBe(false);
    expect(result.token).toBe(reusableToken);
    expect(result.issuedBy).toBe("hcaptcha");
    expect(mockedEvaluateIpRisk).not.toHaveBeenCalled();
  });

  it("challenges a flagged IP when no live token exists", async () => {
    findOneExec.mockResolvedValue(null);

    const result = await IpVerificationService.initializeSession({
      fingerprint,
      ipAddress,
      userAgent: "Mozilla/5.0",
    });

    expect(result.success).toBe(true);
    expect(result.verified).toBe(false);
    expect(result.requiresVerification).toBe(true);
    expect(mockedEvaluateIpRisk).toHaveBeenCalledWith(ipAddress);
  });
});
