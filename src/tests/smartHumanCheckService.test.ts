import crypto from "node:crypto";
import { SmartHumanCheckService, type IssueResult, type SmartClientPayload } from "../services/smartHumanCheckService";

const TEST_IP = "127.0.0.1";
const TEST_UA = "test-agent";

function deriveEphemeralSubkey(ephemeralKey: Buffer, purpose: "token.enc" | "token.mac"): Buffer {
  return crypto.createHmac("sha256", ephemeralKey).update(`shc.v2.${purpose}`).digest();
}

function createV2Token(
  nonceResult: IssueResult,
  payload: SmartClientPayload | null,
  opts?: { pow?: { nonce: string }; corruptMac?: boolean },
): string {
  if (!nonceResult.nonce || !nonceResult.key) throw new Error("missing nonce result fields");

  const nonceBytes = Buffer.from(nonceResult.nonce, "utf8");
  const ephemeralKey = Buffer.from(nonceResult.key, "base64");
  const tokenEncKey = deriveEphemeralSubkey(ephemeralKey, "token.enc");
  const tokenMacKey = deriveEphemeralSubkey(ephemeralKey, "token.mac");

  const iv = crypto.randomBytes(12);
  const plaintext = Buffer.from(JSON.stringify({ payload, ...(opts?.pow ? { pow: opts.pow } : {}) }), "utf8");
  const aad = Buffer.from(`shc.v2.token|${nonceResult.nonce}`, "utf8");
  const cipher = crypto.createCipheriv("aes-256-gcm", tokenEncKey, iv);
  cipher.setAAD(aad);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final(), cipher.getAuthTag()]);

  const len = Buffer.alloc(2);
  len.writeUInt16BE(nonceBytes.length, 0);
  const withoutMac = Buffer.concat([Buffer.from([2]), len, nonceBytes, iv, ciphertext]);
  const mac = crypto.createHmac("sha256", tokenMacKey).update(withoutMac).digest();
  if (opts?.corruptMac) mac[mac.length - 1] ^= 1;

  return Buffer.concat([withoutMac, mac]).toString("base64url");
}

function goodSignals() {
  return {
    mouseMoves: 320,
    keyPresses: 48,
    totalDistance: 6200,
    uniquePathPoints: 190,
    avgSpeed: 620,
    maxSpeed: 1800,
    minSpeed: 12,
    speedVariance: 3,
    focusTimeMs: 9000,
    visibilityChanges: 0,
    trapTriggered: false,
    keyTimings: [120, 180, 240, 190],
    avgKeyInterval: 200,
    keyPressVariance: 150,
    mouseAcceleration: 0.5,
    directionChanges: 90,
    pauseCount: 24,
    clickCount: 6,
    screenResolution: "1920x1080",
    devicePixelRatio: 1,
    touchSupport: false,
    sessionDuration: 15000,
    idleTime: 800,
    hardwareConcurrency: 8,
    deviceMemory: 8,
    connectionType: "4g",
    webdriver: false,
    sliderCompleted: true,
    proofInteractionMs: 15000,
  };
}

function payload(nonce: string, overrides: Partial<SmartClientPayload> = {}): SmartClientPayload {
  return {
    v: 2,
    ts: Date.now(),
    tz: "UTC",
    ua: TEST_UA,
    ce: "test-canvas-entropy",
    st: goodSignals(),
    cn: nonce,
    ...overrides,
  };
}

describe("SmartHumanCheckService", () => {
  let service: SmartHumanCheckService;

  beforeEach(() => {
    process.env.SMART_HUMAN_CHECK_RL_WINDOW_MS = "1000";
    process.env.SMART_HUMAN_CHECK_NONCE_LIMIT = "1000";
    process.env.SMART_HUMAN_CHECK_VERIFY_LIMIT = "1000";
    process.env.SMART_HUMAN_CHECK_ABUSE_WINDOW_MS = "60000";
    process.env.SMART_HUMAN_CHECK_ABUSE_THRESHOLD = "100";
    process.env.SMART_HUMAN_CHECK_BAN_MS = "60000";

    service = new SmartHumanCheckService({
      secret: "test-secret-key-123",
      ttlMs: 5 * 60 * 1000,
      maxSkewMs: 2 * 60 * 1000,
      scoreThreshold: 0.62,
    });
  });

  describe("issueNonce", () => {
    it("should generate a valid nonce successfully", async () => {
      const result = await service.issueNonce(TEST_IP, TEST_UA);

      expect(result.success).toBe(true);
      expect(typeof result.nonce).toBe("string");
      expect(typeof result.key).toBe("string");
      expect(result.action).toBe("default");
      expect(result.timestamp).toBeDefined();
      expect(result.error).toBeUndefined();
    });

    it("should return structured error response on failure", async () => {
      const spy = jest.spyOn(crypto, "randomBytes").mockImplementation(() => {
        throw new Error("Crypto error");
      });

      const result = await service.issueNonce();

      expect(result.success).toBe(false);
      expect(result.error).toBe("服务器内部错误");
      expect(result.errorCode).toBe("SERVER_ERROR");
      expect(result.errorMessage).toBe("服务器内部错误");
      expect(result.retryable).toBe(true);
      expect(result.timestamp).toBeDefined();

      spy.mockRestore();
    });
  });

  describe("verifyToken", () => {
    it("should return structured error for missing token", async () => {
      const result = await service.verifyToken("");

      expect(result.success).toBe(false);
      expect(result.reason).toBe("missing_token");
      expect(result.errorCode).toBe("MISSING_TOKEN");
      expect(result.errorMessage).toBe("缺少验证令牌");
      expect(result.retryable).toBe(false);
      expect(result.timestamp).toBeDefined();
    });

    it("should return structured error for bad token format", async () => {
      const result = await service.verifyToken("invalid-base64");

      expect(result.success).toBe(false);
      expect(result.reason).toBe("bad_token_format");
      expect(result.errorCode).toBe("BAD_TOKEN_FORMAT");
      expect(result.errorMessage).toBe("验证令牌格式错误");
      expect(result.retryable).toBe(false);
      expect(result.timestamp).toBeDefined();
    });

    it("should return structured error for incomplete token", async () => {
      const nonceResult = await service.issueNonce(TEST_IP, TEST_UA);
      expect(nonceResult.success).toBe(true);

      const token = createV2Token(nonceResult, null);
      const result = await service.verifyToken(token, { ip: TEST_IP, ua: TEST_UA });

      expect(result.success).toBe(false);
      expect(result.reason).toBe("incomplete_token");
      expect(result.errorCode).toBe("INCOMPLETE_TOKEN");
      expect(result.errorMessage).toBe("验证令牌数据不完整");
      expect(result.retryable).toBe(false);
      expect(result.timestamp).toBeDefined();
    });

    it("should return structured error for client time skew", async () => {
      const nonceResult = await service.issueNonce(TEST_IP, TEST_UA);
      expect(nonceResult.success).toBe(true);

      const token = createV2Token(
        nonceResult,
        payload(nonceResult.nonce!, {
          ts: Date.now() - 10 * 60 * 1000,
        }),
      );

      const result = await service.verifyToken(token, { ip: TEST_IP, ua: TEST_UA });

      expect(result.success).toBe(false);
      expect(result.reason).toBe("client_time_skew");
      expect(result.errorCode).toBe("CLIENT_TIME_SKEW");
      expect(result.errorMessage).toBe("客户端时间偏差过大");
      expect(result.retryable).toBe(true);
      expect(result.timestamp).toBeDefined();
    });

    it("should compute low score server-side and ignore client supplied sc", async () => {
      const nonceResult = await service.issueNonce(TEST_IP, TEST_UA);
      expect(nonceResult.success).toBe(true);

      const lowSignalPayload = payload(nonceResult.nonce!, {
        st: {},
      } as Partial<SmartClientPayload>);
      (lowSignalPayload as any).sc = 1;

      const token = createV2Token(nonceResult, lowSignalPayload);
      const result = await service.verifyToken(token, { ip: TEST_IP, ua: TEST_UA });

      expect(result.success).toBe(false);
      expect(result.reason).toBe("low_score");
      expect(result.errorCode).toBe("LOW_SCORE");
      expect(result.errorMessage).toBe("行为评分过低");
      expect(result.retryable).toBe(true);
      expect(result.score).toBeLessThan(0.62);
      expect(result.timestamp).toBeDefined();
    });

    it("should successfully verify valid v2 token from raw behavioral signals", async () => {
      const nonceResult = await service.issueNonce(TEST_IP, TEST_UA);
      expect(nonceResult.success).toBe(true);

      const highSignalPayload = payload(nonceResult.nonce!);
      (highSignalPayload as any).sc = 0;

      const token = createV2Token(nonceResult, highSignalPayload);
      const result = await service.verifyToken(token, { ip: TEST_IP, ua: TEST_UA });

      expect(result.success).toBe(true);
      expect(result.score).toBeGreaterThanOrEqual(0.62);
      expect(result.tokenOk).toBe(true);
      expect(result.nonceOk).toBe(true);
      expect(result.timestamp).toBeDefined();
      expect(result.riskScore).toBeGreaterThanOrEqual(0);
      expect(result.riskScore).toBeLessThanOrEqual(1);
      expect(["low", "medium", "high"]).toContain(result.riskLevel as any);
    });

    it("should reject token replay after nonce consumption", async () => {
      const nonceResult = await service.issueNonce(TEST_IP, TEST_UA);
      expect(nonceResult.success).toBe(true);
      const token = createV2Token(nonceResult, payload(nonceResult.nonce!));

      expect((await service.verifyToken(token, { ip: TEST_IP, ua: TEST_UA })).success).toBe(true);
      const replay = await service.verifyToken(token, { ip: TEST_IP, ua: TEST_UA });

      expect(replay.success).toBe(false);
      expect(replay.errorCode).toBe("NONCE_REUSED");
    });

    it("should reject tokens bound to a different user agent", async () => {
      const nonceResult = await service.issueNonce(TEST_IP, TEST_UA);
      expect(nonceResult.success).toBe(true);

      const token = createV2Token(nonceResult, payload(nonceResult.nonce!));
      const result = await service.verifyToken(token, { ip: TEST_IP, ua: "different-agent" });

      expect(result.success).toBe(false);
      expect(result.reason).toBe("bad_binding:ua");
      expect(result.errorCode).toBe("BAD_BINDING_UA");
    });

    it("should block when high risk is detected (trap triggered)", async () => {
      const nonceResult = await service.issueNonce(TEST_IP, TEST_UA);
      expect(nonceResult.success).toBe(true);

      const riskyPayload = payload(nonceResult.nonce!, {
        st: { ...goodSignals(), trapTriggered: true },
      });
      const token = createV2Token(nonceResult, riskyPayload);
      const result = await service.verifyToken(token, { ip: TEST_IP, ua: TEST_UA });

      expect(result.success).toBe(false);
      expect(result.reason).toBe("high_risk");
      expect(result.errorCode).toBe("HIGH_RISK");
      expect(result.errorMessage).toBe("检测到高风险行为");
      expect(result.tokenOk).toBe(true);
      expect(result.nonceOk).toBe(true);
      expect(result.riskLevel).toBe("high");
      expect(result.riskScore).toBeGreaterThanOrEqual(0.7);
      expect(result.riskReasons).toContain("trap_triggered");
      expect(result.timestamp).toBeDefined();
    });
  });

  describe("rate limiting and abuse prevention", () => {
    beforeEach(() => {
      process.env.SMART_HUMAN_CHECK_RL_WINDOW_MS = "1000";
      process.env.SMART_HUMAN_CHECK_NONCE_LIMIT = "2";
      process.env.SMART_HUMAN_CHECK_VERIFY_LIMIT = "2";
      process.env.SMART_HUMAN_CHECK_ABUSE_WINDOW_MS = "60000";
      process.env.SMART_HUMAN_CHECK_ABUSE_THRESHOLD = "3";
      process.env.SMART_HUMAN_CHECK_BAN_MS = "60000";

      service = new SmartHumanCheckService({
        secret: "test-secret-key-123",
        ttlMs: 5 * 60 * 1000,
        maxSkewMs: 2 * 60 * 1000,
        scoreThreshold: 0.62,
      });
    });

    it("should rate limit nonce issuance per IP", async () => {
      const ip = "10.0.0.1";
      const r1 = await service.issueNonce(ip, "ua");
      const r2 = await service.issueNonce(ip, "ua");
      const r3 = await service.issueNonce(ip, "ua");

      expect(r1.success).toBe(true);
      expect(r2.success).toBe(true);
      expect(r3.success).toBe(false);
      expect(r3.errorCode).toBe("RATE_LIMITED");
      expect(r3.errorMessage).toBe("请求过于频繁");
    });

    it("should rate limit verify calls per IP before parsing token", async () => {
      const ip = "10.0.0.2";
      const _r1 = await service.verifyToken("", ip);
      const _r2 = await service.verifyToken("", ip);
      const r3 = await service.verifyToken("", ip);

      expect(r3.success).toBe(false);
      expect(r3.reason).toBe("rate_limited");
      expect(r3.errorCode).toBe("RATE_LIMITED");
    });

    it("should temporarily ban IP after repeated bad signatures", async () => {
      process.env.SMART_HUMAN_CHECK_VERIFY_LIMIT = "1000";
      process.env.SMART_HUMAN_CHECK_NONCE_LIMIT = "1000";
      service = new SmartHumanCheckService({
        secret: "test-secret-key-123",
        ttlMs: 5 * 60 * 1000,
        maxSkewMs: 2 * 60 * 1000,
        scoreThreshold: 0.62,
      });

      const ip = "10.0.0.3";
      const makeBadSigToken = async () => {
        const nonceResult = await service.issueNonce(ip, TEST_UA);
        expect(nonceResult.success).toBe(true);
        return createV2Token(nonceResult, payload(nonceResult.nonce!), { corruptMac: true });
      };

      const t1 = await service.verifyToken(await makeBadSigToken(), { ip, ua: TEST_UA });
      const t2 = await service.verifyToken(await makeBadSigToken(), { ip, ua: TEST_UA });
      const t3 = await service.verifyToken(await makeBadSigToken(), { ip, ua: TEST_UA });

      expect(t1.reason).toBe("bad_token_sig");
      expect(t2.reason).toBe("bad_token_sig");
      expect(t3.reason).toBe("bad_token_sig");

      const banned = await service.verifyToken("anything", { ip, ua: TEST_UA });
      expect(banned.success).toBe(false);
      expect(banned.reason).toBe("abuse_banned");
      expect(banned.errorCode).toBe("ABUSE_BANNED");
    });
  });
});
