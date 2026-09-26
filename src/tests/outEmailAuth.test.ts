import type { ApiKeyDoc } from "../models/apiKeyModel";

const mockValidateApiKey = jest.fn();
const mockRecordUsage = jest.fn();
const mockGetUserById = jest.fn();
const mockFindOne = jest.fn();
const mockGetOutEmailCodeFallback = jest.fn(() => "");

jest.mock("../services/apiKeyService", () => ({
  validateApiKey: (...args: unknown[]) => mockValidateApiKey(...args),
  recordUsage: (...args: unknown[]) => mockRecordUsage(...args),
}));

jest.mock("../utils/userStorage", () => ({
  UserStorage: {
    getUserById: (...args: unknown[]) => mockGetUserById(...args),
  },
}));

jest.mock("../services/emailService", () => ({
  EmailService: {},
  getOutEmailCodeFallback: () => mockGetOutEmailCodeFallback(),
  getOutEmailQuotaTotal: () => 100,
  getOutEmailServiceStatus: () => ({ available: true, domain: "example.com", error: "" }),
  resolveOutEmailDomain: () => "example.com",
}));

jest.mock("../services/mongoService", () => {
  // 用真 mongoose，只把 model() 拦下来递测试自己的查询替身。
  // 原先手写了一个 function Schema(){ return {} } 的替身：outEmailService 在 import 期会调
  // OutEmailQuotaSchema.index({date:1},{unique:true})，空对象没这个方法，当场就报
  // "OutEmailQuotaSchema.index is not a function"（缺 .virtual/.statics 同理）。
  const actual = jest.requireActual("../services/mongoService");
  const fakeModel = () => ({
    findOne: (...args: unknown[]) => mockFindOne(...args),
    create: jest.fn(),
    insertMany: jest.fn(),
  });
  const mongooseStub = new Proxy(actual.mongoose as object, {
    get: (target, prop) => {
      if (prop === "model") return jest.fn(fakeModel);
      if (prop === "models") return {};
      if (prop === "connection") return { readyState: 1 };
      return Reflect.get(target, prop as string | symbol, target);
    },
  });
  return { ...actual, mongoose: mongooseStub };
});

// outEmailService imports `./logger` (src/services/logger); mock that module path.
jest.mock("../services/logger", () => ({
  logger: {
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

function platformKey(overrides: Partial<ApiKeyDoc> = {}): ApiKeyDoc {
  return {
    keyId: "ak_testkey1",
    keyHash: "hash",
    name: "outemail-test",
    userId: "user-1",
    permissions: ["outemail"],
    rateLimit: 60,
    expiresAt: null,
    lastUsedAt: null,
    lastUsedIp: null,
    usageCount: 0,
    enabled: true,
    billingEnabled: true,
    billingMode: "metered",
    balanceCredits: 0,
    totalChargedCredits: 0,
    totalBillableRequests: 0,
    lastBillingAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function leanSetting(doc: { domain?: string; code?: string; apiKey?: string } | null) {
  return {
    lean: () => ({
      exec: () => Promise.resolve(doc),
    }),
  };
}

describe("ensureOutEmailAuth platform API keys", () => {
  let ensureOutEmailAuth: typeof import("../services/outEmailService").ensureOutEmailAuth;

  beforeEach(async () => {
    jest.resetModules();
    mockValidateApiKey.mockReset();
    mockRecordUsage.mockReset();
    mockGetUserById.mockReset();
    mockFindOne.mockReset();
    mockGetOutEmailCodeFallback.mockReset();
    mockGetOutEmailCodeFallback.mockReturnValue("");
    mockFindOne.mockImplementation(() => leanSetting(null));
    mockGetUserById.mockResolvedValue({ id: "user-1", username: "admin", disabled: false });
    mockRecordUsage.mockResolvedValue(undefined);

    ({ ensureOutEmailAuth } = await import("../services/outEmailService"));
  });

  it("accepts platform API key with outemail permission", async () => {
    mockValidateApiKey.mockResolvedValue(platformKey());

    const result = await ensureOutEmailAuth({
      apiKey: "ak_testkey1.secret",
      domain: "example.com",
      ip: "1.2.3.4",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.authKind).toBe("platform-api-key");
      expect(result.keyId).toBe("ak_testkey1");
    }
    expect(mockRecordUsage).toHaveBeenCalledWith("ak_testkey1", "1.2.3.4");
  });

  it("accepts platform API key with * permission", async () => {
    mockValidateApiKey.mockResolvedValue(platformKey({ permissions: ["*"] }));

    const result = await ensureOutEmailAuth({
      apiKey: "ak_admin.secret",
      domain: "example.com",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.authKind).toBe("platform-api-key");
    }
  });

  it("rejects platform API key without outemail permission", async () => {
    mockValidateApiKey.mockResolvedValue(platformKey({ permissions: ["tts", "status"] }));

    const result = await ensureOutEmailAuth({
      apiKey: "ak_testkey1.secret",
      domain: "example.com",
    });

    expect(result).toEqual({ success: false, error: '此 API Key 无 "outemail" 权限' });
  });

  it("prefers EnvManager external key over platform key", async () => {
    mockFindOne.mockImplementation(() => leanSetting({ domain: "example.com", apiKey: "env-shared-key", code: "" }));
    mockValidateApiKey.mockResolvedValue(platformKey());

    const result = await ensureOutEmailAuth({
      apiKey: "env-shared-key",
      domain: "example.com",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.authKind).toBe("outemail-setting");
    }
    expect(mockValidateApiKey).not.toHaveBeenCalled();
  });

  it("falls back to platform key when EnvManager key mismatches", async () => {
    mockFindOne.mockImplementation(() => leanSetting({ domain: "example.com", apiKey: "env-shared-key", code: "" }));
    mockValidateApiKey.mockResolvedValue(platformKey());

    const result = await ensureOutEmailAuth({
      apiKey: "ak_testkey1.secret",
      domain: "example.com",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.authKind).toBe("platform-api-key");
    }
  });

  it("accepts legacy code when configured", async () => {
    mockFindOne.mockImplementation(() => leanSetting({ domain: "example.com", apiKey: "", code: "legacy-code" }));

    const result = await ensureOutEmailAuth({
      code: "legacy-code",
      domain: "example.com",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.authKind).toBe("outemail-code");
    }
  });

  it("returns missing auth when no credentials presented", async () => {
    const result = await ensureOutEmailAuth({ domain: "example.com" });
    expect(result).toEqual({ success: false, error: "缺少鉴权信息" });
  });
});
