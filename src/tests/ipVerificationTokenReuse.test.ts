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

/**
 * 封禁服务不在本套件射程内，但必须替掉（T-01）。
 *
 * cfbb90b2 起 ipVerificationService 会 `import { manualBanIp } from "./turnstile/ipBan"`，
 * 而 ipBan.ts 静态导入 models/ipBanModel —— 后者在 **import 期** 就要
 * `new mongoose.Schema(...)`，本套件的 mongoService 替身只给了
 * `{ connection: { readyState: 1 } }` ⇒ 整套件死在加载阶段：
 *   TypeError: mongoService_1.mongoose.Schema is not a constructor
 * 这里用替身而不是给 mongoService 补真 Schema：补真 Schema 只能活过 ipBanModel 那一步，
 * ipBan.ts 还会继续往 middleware/ipBanCheck 拖（那里会拖整棵路由树，
 * 就是 9cb3ee77 在 mockAppSecurityBoundaries 里避开 requireActual 的原因）。
 * 本套件测的是「TTL 内复用会话令牌」，封禁语义由 ipRiskDecision 等套件负责。
 */
jest.mock("../services/turnstile/ipBan", () => ({
  isIpBanned: jest.fn(async () => ({ banned: false })),
  recordViolation: jest.fn(async () => false),
  manualBanIp: jest.fn(async () => ({ success: false })),
  unbanIp: jest.fn(async () => false),
  cleanupExpiredIpBans: jest.fn(async () => 0),
  getIpBanStats: jest.fn(async () => ({ total: 0, active: 0, expired: 0 })),
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
