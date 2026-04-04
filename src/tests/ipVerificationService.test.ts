import axios from "axios";
import IpVerificationService from "../services/ipVerificationService";

jest.mock("axios");

jest.mock("../config/config", () => ({
  config: {
    ipqs: {
      enabled: true,
      strictness: 1,
      allowPublicAccessPoints: false,
      lighterPenalties: true,
      timeoutMs: 8000,
      monthlyQuotaPerKey: 5000,
      challengeFraudScore: 75,
      tokenTtlMinutes: 40,
      failOpen: true,
    },
  },
}));

const findOneExec = jest.fn();
const findQuotaExec = jest.fn();
const deleteManyExec = jest.fn();
const createToken = jest.fn();
const createLookupLog = jest.fn();
const quotaLean = jest.fn();
const verifyTokenDetailed = jest.fn();

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
      exec: deleteManyExec,
    })),
    create: createToken,
  },
}));

jest.mock("../models/ipqsQuotaModel", () => ({
  IpqsQuotaModel: {
    find: jest.fn(() => ({
      lean: jest.fn(() => ({
        exec: findQuotaExec,
      })),
    })),
    findOneAndUpdate: jest.fn(() => ({
      lean: quotaLean,
    })),
    updateOne: jest.fn(() => ({
      exec: jest.fn().mockResolvedValue({}),
    })),
  },
}));

jest.mock("../models/ipqsLookupLogModel", () => ({
  IpqsLookupLogModel: {
    create: createLookupLog,
  },
}));

jest.mock("../services/turnstileService", () => ({
  TurnstileService: {
    verifyTokenDetailed,
  },
}));

describe("IpVerificationService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.IPQS_API_KEY = "test-ipqs-key";
    findOneExec.mockResolvedValue(null);
    findQuotaExec.mockResolvedValue([]);
    deleteManyExec.mockResolvedValue({ deletedCount: 0 });
    createToken.mockResolvedValue({});
    createLookupLog.mockResolvedValue({});
    quotaLean.mockResolvedValue({ usageCount: 1 });
    verifyTokenDetailed.mockResolvedValue({ success: true });
  });

  it("requires verification when IPQS reports a high fraud score", async () => {
    (axios.get as jest.Mock).mockResolvedValue({
      data: {
        fraud_score: 92,
        proxy: true,
        vpn: false,
        tor: false,
        active_vpn: false,
        active_tor: false,
        recent_abuse: false,
        bot_status: false,
      },
    });

    const result = await IpVerificationService.initializeSession({
      fingerprint: "fingerprint_123456",
      ipAddress: "203.0.113.10",
      userAgent: "Mozilla/5.0",
      userLanguage: "zh-CN",
    });

    expect(result.success).toBe(true);
    expect(result.requiresVerification).toBe(true);
    expect(result.verified).toBe(false);
    expect(result.fraudScore).toBe(92);
    expect(result.riskFlags).toContain("proxy");
  });

  it("issues an automatic token when IPQS reports low risk", async () => {
    (axios.get as jest.Mock).mockResolvedValue({
      data: {
        fraud_score: 12,
        proxy: false,
        vpn: false,
        tor: false,
        active_vpn: false,
        active_tor: false,
        recent_abuse: false,
        bot_status: false,
      },
    });

    const result = await IpVerificationService.initializeSession({
      fingerprint: "fingerprint_123456",
      ipAddress: "198.51.100.20",
      userAgent: "Mozilla/5.0",
      userLanguage: "en-US",
    });

    expect(result.success).toBe(true);
    expect(result.requiresVerification).toBe(false);
    expect(result.verified).toBe(true);
    expect(result.issuedBy).toBe("auto");
    expect(result.token).toBeTruthy();
    expect(createToken).toHaveBeenCalled();
  });

  it("accepts a completed captcha flow and issues a verification token", async () => {
    const result = await IpVerificationService.completeVerification(
      "fingerprint_123456",
      "198.51.100.20",
      "captcha-token",
      "Mozilla/5.0",
      "turnstile",
    );

    expect(verifyTokenDetailed).toHaveBeenCalledWith(
      "captcha-token",
      "198.51.100.20",
      "Mozilla/5.0",
      "fingerprint_123456",
      "turnstile",
    );
    expect(result.success).toBe(true);
    expect(result.verified).toBe(true);
    expect(result.issuedBy).toBe("turnstile");
  });
});
