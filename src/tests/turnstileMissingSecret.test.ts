const mockAxiosPost = jest.fn();
const mockGetTurnstileKey = jest.fn();
const mockGetHCaptchaKey = jest.fn();
const mockPersistTurnstileTrace = jest.fn();

jest.mock("axios", () => ({
  __esModule: true,
  default: { post: (...args: unknown[]) => mockAxiosPost(...args) },
}));

jest.mock("../services/turnstile/models", () => ({
  getTurnstileKey: (...args: unknown[]) => mockGetTurnstileKey(...args),
  getHCaptchaKey: (...args: unknown[]) => mockGetHCaptchaKey(...args),
}));

jest.mock("../services/turnstile/trace", () => ({
  generateUniqueTraceId: () => "trace-missing-config",
  persistTurnstileTrace: (...args: unknown[]) => mockPersistTurnstileTrace(...args),
}));

jest.mock("../services/turnstile/risk", () => ({
  assessClientRisk: () => ({ riskLevel: "LOW", riskScore: 0, riskReasons: [] }),
  recordVerificationOutcome: jest.fn(),
  translateTurnstileErrors: jest.fn(),
}));

const { verifyToken } = require("../services/turnstile/verify");
const { verifyHCaptchaToken } = require("../services/turnstile/hcaptcha");

describe("captcha verification without provider secrets", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetTurnstileKey.mockResolvedValue(null);
    mockGetHCaptchaKey.mockResolvedValue(null);
    mockPersistTurnstileTrace.mockResolvedValue(undefined);
  });

  it("fails closed when Turnstile is not configured", async () => {
    await expect(verifyToken("valid-token-value", "203.0.113.5")).resolves.toBe(false);

    expect(mockAxiosPost).not.toHaveBeenCalled();
    expect(mockPersistTurnstileTrace).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        reason: "service_unavailable",
        errorCode: "SERVICE_UNAVAILABLE",
      }),
    );
  });

  it("fails closed when hCaptcha is not configured", async () => {
    await expect(verifyHCaptchaToken("valid-token-value", "203.0.113.5")).resolves.toBe(false);

    expect(mockAxiosPost).not.toHaveBeenCalled();
    expect(mockPersistTurnstileTrace).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        reason: "service_unavailable",
        errorCode: "SERVICE_UNAVAILABLE",
        verificationMethod: "hcaptcha",
      }),
    );
  });
});
