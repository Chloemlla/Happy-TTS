// 先加载共享的安全边界替身：本套件把 config 整个 mock 成了一个只含 ipqs/proxycheck 的对象，
// 而真的 routeLimiters 在模块作域就会建 sharedRateLimitStore（读 config.redis）
// → "Cannot read properties of undefined (reading 'redis')"，整个套件死在 import 阶段。
// 本文件测的是 ipVerificationService 的判定逻辑，不需要真的限流/封禁中间件。
import "./helpers/mockAppSecurityBoundaries";
import axios from "axios";

jest.mock("axios");

jest.mock("../config/config", () => ({
  config: {
    ipqs: {
      enabled: true,
      scamalyticsUser: "happyclovo",
      strictness: 1,
      allowPublicAccessPoints: false,
      lighterPenalties: true,
      timeoutMs: 8000,
      monthlyQuotaPerKey: 5000,
      challengeFraudScore: 75,
      tokenTtlMinutes: 40,
      failOpen: true,
      // G5-23 之后 getApiKeys() 只读 config.ipqs.apiKeys，不再合并 env
      // （ipVerificationService.ts:201-206）。缺这个字段就是 selectApiKey → no_keys →
      // failOpen 分支把 requiresVerification 压成 false，高分用例自然变红，
      // 而且 axios.get 根本不会被调用。
      apiKeys: ["test-ipqs-key"],
    },
    proxycheck: {
      enabled: false,
    },
  },
}));

const findOneExec = jest.fn();
const findQuotaExec = jest.fn();
const deleteManyExec = jest.fn();
const createToken = jest.fn();
const mockCreateLookupLog = jest.fn();
const quotaLean = jest.fn();
const verifyTokenDetailed = jest.fn();

jest.mock("../services/mongoService", () => {
  // 真 mongoose + 只抹掉 readyState：以前只给了一个 { connection: { readyState: 1 } }，
  // 但 ipVerificationService 会经 ipRiskService 导入 model 文件，它们在 import 期就要
  // `new mongoose.Schema(...)` ⇒ "mongoose.Schema is not a constructor"，整个套件死在加载阶段。
  // 真正的数据库访问全部由下面的 model 逐个 mock 拦掉了，这里不需要假 Schema。
  const actual = jest.requireActual("../services/mongoService");
  const fakeConnection = { readyState: 1 };
  // 真 Schema（model 文件 import 期就要它），但 model() 必须继续拦下来：
  // 真 model() 会走到 Model.compile → connection.collection(...)，而这里并没有真连接，
  // 只给一个带 readyState 的假 connection 会直接 TypeError: connection.collection is not a function。
  // 兼用的链式替身：任何方法（create/findOne/countDocuments...）都返回“可 await、
  // 可继续 .lean()/.exec()/.session()”的对象，await 结果统一是 null，不会卡在驱动缓冲上。
  const chainable = (): any => {
    const fn: any = () => chainable();
    fn.then = (onFulfilled?: unknown, onRejected?: unknown) =>
      Promise.resolve(null).then(onFulfilled as never, onRejected as never);
    fn.catch = (onRejected?: unknown) => Promise.resolve(null).catch(onRejected as never);
    fn.finally = (cb?: unknown) => Promise.resolve(null).finally(cb as never);
    return new Proxy(fn, {
      apply: () => chainable(),
      get: (target, prop) => {
        if (prop === "then" || prop === "catch" || prop === "finally") return target[prop];
        return chainable();
      },
    });
  };
  const mongooseStub = new Proxy(actual.mongoose as object, {
    get: (target, prop) => {
      if (prop === "model") return () => chainable();
      if (prop === "models") return {};
      if (prop === "connection") return fakeConnection;
      return Reflect.get(target, prop as string | symbol, target);
    },
  });
  return {
    ...actual,
    connectMongo: jest.fn().mockResolvedValue(undefined),
    mongoose: mongooseStub,
  };
});

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
    create: mockCreateLookupLog,
  },
}));

jest.mock("../services/turnstileService", () => ({
  TurnstileService: {
    verifyTokenDetailed,
  },
}));

const IpVerificationService = require("../services/ipVerificationService").default;

describe("IpVerificationService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    findOneExec.mockResolvedValue(null);
    findQuotaExec.mockResolvedValue([]);
    deleteManyExec.mockResolvedValue({ deletedCount: 0 });
    createToken.mockResolvedValue({});
    mockCreateLookupLog.mockResolvedValue({});
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
    expect(axios.get).toHaveBeenCalledWith(
      "https://api13.scamalytics.com/v3/happyclovo/",
      expect.objectContaining({
        maxRedirects: 0,
        params: expect.objectContaining({
          ip: "203.0.113.10",
        }),
      }),
    );
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
