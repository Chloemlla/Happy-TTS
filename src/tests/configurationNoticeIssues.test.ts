const mockStartupConfig = {
  configuredSecrets: {
    openaiApiKey: true,
    jwtSecret: true,
    signSecretKey: true,
    adminPassword: true,
    adminOperationPassword: true,
    serverPassword: true,
    passwordEncryptionKey: true,
    internalServiceToken: true,
  },
  rustServices: {
    externalServicesConfigured: true,
  },
};

const mockRuntimeMutableConfig = {
  tts: {
    generationCode: "configured-generation-code",
  },
  email: {
    enabled: true,
    resendApiKey: "re_configured",
    outemailEnabled: false,
    outemailDomain: "example.test",
    outemailApiKey: "re_configured",
  },
  linuxdo: {
    clientId: "linuxdo-client",
    clientSecret: "linuxdo-secret",
  },
  googleAuth: {
    clientId: "google-client",
  },
  nexai: {
    google: { clientId: "nexai-google-client" },
    github: { clientId: "github-client", clientSecret: "github-secret" },
  },
  nexaiSigning: {
    mode: "off",
    appSignSecret: "",
  },
  ipqs: {
    enabled: false,
    apiKeys: [],
    scamalyticsUser: "",
  },
};

const mockConfig = {
  publicShortUrl: { enabled: false, password: "" },
  linuxdoCredit: {
    enabled: false,
    pid: "",
    key: "",
    protocol: "epay",
    privateKey: "",
  },
};

const mockProbeOptionalCapabilities = jest.fn();

jest.mock("../config/config", () => ({
  startupConfig: mockStartupConfig,
  runtimeMutableConfig: mockRuntimeMutableConfig,
  config: mockConfig,
}));

jest.mock("../services/configurationCapabilityProbeService", () => ({
  probeOptionalCapabilities: (...args: unknown[]) => mockProbeOptionalCapabilities(...args),
}));

const { getMissingConfigurationIssues } = require("../services/configurationNoticeIssues");

const managedEnvironmentNames = [
  "SMART_HUMAN_CHECK_SECRET",
  "POLICY_SECRET_SALT",
  "VERIFICATION_TOKEN_SECRET",
  "TTS_ASSET_ACCESS_SECRET",
  "LEGACY_API_CHOICE_SECRET",
  "DATA_COLLECTION_RAW_SECRET",
  "ECOENCHANTS_LICENSE_PEPPER",
  "ECOENCHANTS_ACTIVATION_TOKEN_SECRET",
  "ECOENCHANTS_OPS_TOKEN_SECRET",
  "ECOENCHANTS_DOWNLOAD_TOKEN_SECRET",
  "ECOENCHANTS_DOWNLOAD_URL_SIGNING_SECRET",
  "ECOENCHANTS_STRIPE_WEBHOOK_SECRET",
  "ECOENCHANTS_POLYMART_WEBHOOK_SECRET",
  "ECOENCHANTS_PAYPAL_WEBHOOK_SECRET",
] as const;

describe("configuration notice issue collection", () => {
  const originalEnvironment = new Map<string, string | undefined>();

  beforeAll(() => {
    for (const name of managedEnvironmentNames) {
      originalEnvironment.set(name, process.env[name]);
    }
  });

  beforeEach(() => {
    jest.clearAllMocks();
    for (const name of managedEnvironmentNames) {
      process.env[name] = name === "SMART_HUMAN_CHECK_SECRET" ? "0123456789abcdef" : "configured";
    }
    mockRuntimeMutableConfig.email.resendApiKey = "re_configured";
    mockRuntimeMutableConfig.googleAuth.clientId = "google-client";
    mockRuntimeMutableConfig.tts.generationCode = "configured-generation-code";
    mockProbeOptionalCapabilities.mockResolvedValue({
      turnstile: { secretConfigured: true, siteConfigured: true },
      hcaptcha: { secretConfigured: true, siteConfigured: true },
      resendWebhookConfigured: true,
      ipfsUploadConfigured: true,
      libreChatProviderConfigured: true,
      ttsProviders: [
        { name: "openai", active: true, configured: true },
        { name: "fish", active: false, configured: true },
      ],
    });
  });

  afterAll(() => {
    for (const [name, value] of originalEnvironment) {
      if (value === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = value;
      }
    }
  });

  it("reports the exact runtime-backed captcha setting that remains absent", async () => {
    mockProbeOptionalCapabilities.mockResolvedValue({
      turnstile: { secretConfigured: true, siteConfigured: false },
      hcaptcha: { secretConfigured: true, siteConfigured: true },
      resendWebhookConfigured: true,
      ipfsUploadConfigured: true,
      libreChatProviderConfigured: true,
      ttsProviders: [
        { name: "openai", active: true, configured: true },
        { name: "fish", active: false, configured: true },
      ],
    });

    await expect(getMissingConfigurationIssues()).resolves.toEqual([
      expect.objectContaining({
        id: "turnstile",
        settingNames: ["TURNSTILE_SITE_KEY"],
      }),
    ]);
  });

  it("reports Resend even when the missing key caused email to be disabled", async () => {
    mockRuntimeMutableConfig.email.resendApiKey = "";

    const issues = await getMissingConfigurationIssues();

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "resend-email", settingNames: ["RESEND_API_KEY"] }),
      ]),
    );
  });

  it("reports the missing browser TTS generation code", async () => {
    mockRuntimeMutableConfig.tts.generationCode = "";

    const issues = await getMissingConfigurationIssues();

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "tts-generation-code",
          settingNames: ["GENERATION_CODE"],
        }),
      ]),
    );
  });

  it("reports optional OAuth capability gaps without failing issue collection", async () => {
    mockRuntimeMutableConfig.googleAuth.clientId = "";

    const issues = await getMissingConfigurationIssues();

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "google-oauth", settingNames: ["GOOGLE_CLIENT_ID"] }),
      ]),
    );
  });
});
