/**
 * 回归测试：生成码闸门的管理员豁免。
 *
 * 前端承诺「管理员账号无需填写生成码」，但管线里 validateGenerationCode 对所有
 * 非 API Key 调用一律校验，管理员照样吃 403 TTS_INVALID_GENERATION_CODE。
 * 这里钉住豁免口径（与 validatePolicyConsent 一致）：会话身份是管理员/超管时不校验生成码，
 * 普通用户与匿名调用仍然必须有正确生成码。
 */

const mockSchemaConstructor = jest.fn();
const mockMongooseModels: Record<string, unknown> = {};

jest.mock("../services/mongoService", () => ({
  mongoose: {
    connection: { readyState: 1 },
    Schema: mockSchemaConstructor,
    models: mockMongooseModels,
    model: jest.fn((name: string) => mockMongooseModels[name]),
    isValidObjectId: () => true,
  },
}));

jest.mock("../services/auditLogService", () => ({
  AuditLogService: { log: jest.fn(async () => undefined) },
}));

jest.mock("../services/contentFilterService", () => ({
  ContentFilterService: {
    shouldSkipDetection: () => true,
    detectProhibitedContent: jest.fn(),
  },
}));

jest.mock("../services/policyConsentService", () => ({
  CURRENT_POLICY_VERSION: "test-policy-version",
  hasValidPolicyConsent: jest.fn(async () => true),
  shouldRequireTtsPolicyConsent: () => false,
}));

jest.mock("../services/turnstileService", () => ({
  TurnstileService: { isEnabled: async () => false, verifyToken: async () => true },
}));

jest.mock("../tts/tts.settings", () => ({
  ttsSettingsStore: { getGenerationCode: async () => null },
}));

jest.mock("../tts/tts.history", () => ({ generationHistoryStore: {} }));

jest.mock("../tts/tts.service", () => ({
  TtsService: class {
    public resolveOutputFormat(format: string): string {
      return format;
    }
    public resolveSpeed(speed: unknown): number {
      return typeof speed === "number" ? speed : 1;
    }
    public async resolveProviderExecution(model: string, voice: string) {
      return { providerId: "openai", model, voice };
    }
    public generateContentHashCandidates(): string[] {
      return ["hash-candidate"];
    }
    public async findExistingFile(): Promise<string | null> {
      return null;
    }
    public buildAudioUrl(fileName: string): string {
      return `https://chloemlla.com/api/tts/assets/${fileName}`;
    }
  },
}));

const { TtsSubmissionPipeline } = require("../tts/tts.pipeline") as typeof import("../tts/tts.pipeline");

const EXPECTED_CODE = "configured-generation-code";

function buildPipeline() {
  const settingsStore = { getGenerationCode: async () => EXPECTED_CODE };
  const historyStore = {
    findDuplicateForUser: async () => null,
    findDuplicateForAnonymous: async () => null,
  };
  const snapshot = { user: null, remainingToday: 5, reservedToday: 0, consumedToday: 0 };
  const ledger = {
    getUsageSnapshot: async () => snapshot,
    reserve: async () => ({ success: true, snapshot }),
    reserveAnonymous: async () => ({ success: true, remainingToday: 5 }),
  };
  return new TtsSubmissionPipeline(
    settingsStore as never,
    historyStore as never,
    ledger as never,
  );
}

function contextFor(role: string | null, overrides: Record<string, unknown> = {}) {
  const currentUser = role ? { id: "user-1", username: "tester", role } : null;
  return {
    input: {
      text: "测试文本",
      model: "gpt-4o-mini-tts",
      voice: "alloy",
      outputFormat: "mp3",
      output_format: "mp3",
      speed: 1,
      fingerprint: "fingerprint-1",
      generationCode: "",
      cfToken: "",
    },
    ip: "203.0.113.7",
    currentUser,
    taskId: "task-1",
    authenticatedByApiKey: false,
    ...overrides,
  };
}

describe("TTS 生成码闸门的管理员豁免", () => {
  it("普通用户不带生成码仍然被拦下", async () => {
    await expect(
      buildPipeline().validateAndBuild(contextFor("user") as never),
    ).rejects.toMatchObject({ code: "TTS_INVALID_GENERATION_CODE" });
  });

  it("匿名调用不带生成码仍然被拦下", async () => {
    await expect(
      buildPipeline().validateAndBuild(contextFor(null) as never),
    ).rejects.toMatchObject({ code: "TTS_INVALID_GENERATION_CODE" });
  });

  it("管理员与超管不带生成码即可提交", async () => {
    for (const role of ["admin", "superadmin"]) {
      const result = await buildPipeline().validateAndBuild(contextFor(role) as never);
      expect(result.isAdmin).toBe(true);
      expect(result.usageSummary.isAdmin).toBe(true);
    }
  });

  it("管理员填了错误生成码也不受生成码校验影响", async () => {
    const context = contextFor("admin");
    context.input.generationCode = "wrong-code";
    await expect(
      buildPipeline().validateAndBuild(context as never),
    ).resolves.toMatchObject({ isAdmin: true });
  });

  it("普通用户带正确生成码可以继续", async () => {
    const context = contextFor("user");
    context.input.generationCode = EXPECTED_CODE;
    const result = await buildPipeline().validateAndBuild(context as never);
    expect(result.isAdmin).toBe(false);
  });

  it("API Key 调用本来就不走生成码校验", async () => {
    const context = contextFor(null, { authenticatedByApiKey: true });
    await expect(buildPipeline().validateAndBuild(context as never)).resolves.toBeTruthy();
  });
});
