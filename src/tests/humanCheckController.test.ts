import express from "express";
import rateLimit from "express-rate-limit";
import request from "supertest";

let mockService: {
  issueNonce: jest.Mock;
  verifyToken: jest.Mock;
  getStats: jest.Mock;
  cleanupExpiredNonces: jest.Mock;
};

jest.mock("../services/smartHumanCheckService", () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => {
    mockService = {
      issueNonce: jest.fn(),
      verifyToken: jest.fn(),
      getStats: jest.fn(),
      cleanupExpiredNonces: jest.fn(),
    };
    return mockService;
  }),
}));

import { SmartHumanCheckController } from "../controllers/humanCheckController";

describe("SmartHumanCheckController", () => {
  let app: express.Application;

  beforeEach(() => {
    app = express();
    app.use(express.json());

    // Lightweight rate limiter for tests to satisfy static analysis
    const testLimiter = rateLimit({
      windowMs: 60 * 1000,
      max: 1000,
      standardHeaders: true,
      legacyHeaders: false,
      keyGenerator: (req) => req.ip || req.socket.remoteAddress || "unknown",
    });

    // Setup routes
    app.get("/nonce", testLimiter, SmartHumanCheckController.issueNonce);
    app.post("/verify", testLimiter, SmartHumanCheckController.verifyToken);
    app.get("/stats", testLimiter, SmartHumanCheckController.getStats);

    // Mock service is already set up globally
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("GET /nonce", () => {
    it("should return nonce successfully", async () => {
      const mockNonceResult = {
        success: true,
        nonce: "test-nonce-123",
        timestamp: Date.now(),
      };

      mockService.issueNonce.mockReturnValue(mockNonceResult);

      const response = await request(app).get("/nonce").expect(200);

      expect(response.body).toEqual(mockNonceResult);
      expect(mockService.issueNonce).toHaveBeenCalledWith(
        expect.objectContaining({
          ip: expect.any(String),
          origin: expect.any(String),
        }),
      );
    });

    it("should handle service errors gracefully", async () => {
      const mockErrorResult = {
        success: false,
        error: "server_error",
        errorCode: "SERVER_ERROR",
        errorMessage: "服务器内部错误",
        retryable: true,
        timestamp: Date.now(),
      };

      mockService.issueNonce.mockReturnValue(mockErrorResult);

      const response = await request(app).get("/nonce").expect(503);

      expect(response.body).toEqual(mockErrorResult);
    });

    it("should handle service exceptions", async () => {
      mockService.issueNonce.mockImplementation(() => {
        throw new Error("Service crashed");
      });

      const response = await request(app).get("/nonce").expect(500);

      expect(response.body).toMatchObject({
        success: false,
        error: "server_error",
        errorCode: "SERVER_ERROR",
        errorMessage: "服务器内部错误",
        retryable: true,
      });
    });

    it("should extract client IP from headers", async () => {
      const mockNonceResult = {
        success: true,
        nonce: "test-nonce-123",
        timestamp: Date.now(),
      };

      mockService.issueNonce.mockReturnValue(mockNonceResult);

      await request(app)
        .get("/nonce")
        .set("X-Forwarded-For", "192.168.1.100, 10.0.0.1")
        .set("User-Agent", "Test-Agent/1.0")
        .expect(200);

      expect(mockService.issueNonce).toHaveBeenCalledWith(
        expect.objectContaining({
          ip: "192.168.1.100",
          ua: "Test-Agent/1.0",
          origin: expect.any(String),
        }),
      );
    });
  });

  describe("POST /verify", () => {
    it("should verify token successfully", async () => {
      const mockVerifyResult = {
        success: true,
        score: 0.85,
        tokenOk: true,
        nonceOk: true,
        timestamp: Date.now(),
      };

      mockService.verifyToken.mockReturnValue(mockVerifyResult);

      const response = await request(app).post("/verify").send({ token: "valid-token-123" }).expect(200);

      expect(response.body).toMatchObject(mockVerifyResult);
      expect(response.body.traceId).toEqual(expect.any(String));
      expect(mockService.verifyToken).toHaveBeenCalledWith(
        "valid-token-123",
        expect.objectContaining({
          ip: expect.any(String),
          origin: expect.any(String),
        }),
      );
    });

    it("should return 400 for missing token", async () => {
      const response = await request(app).post("/verify").send({}).expect(400);

      expect(response.body).toMatchObject({
        success: false,
        error: "missing_token",
        errorCode: "MISSING_TOKEN",
        errorMessage: "缺少验证令牌",
        retryable: false,
      });

      expect(mockService.verifyToken).not.toHaveBeenCalled();
    });

    it("should return 400 for invalid token type", async () => {
      const response = await request(app).post("/verify").send({ token: 123 }).expect(400);

      expect(response.body).toMatchObject({
        success: false,
        error: "missing_token",
        errorCode: "MISSING_TOKEN",
      });
    });

    it("should handle verification failure with appropriate status codes", async () => {
      const mockFailureResult = {
        success: false,
        reason: "nonce_expired",
        errorCode: "NONCE_EXPIRED",
        errorMessage: "验证码已过期",
        retryable: true,
        timestamp: Date.now(),
      };

      mockService.verifyToken.mockReturnValue(mockFailureResult);

      const response = await request(app).post("/verify").send({ token: "expired-token" }).expect(410); // 410 for expired nonce

      expect(response.body).toMatchObject(mockFailureResult);
      expect(response.body.traceId).toEqual(expect.any(String));
    });

    it("should handle low score failure", async () => {
      const mockFailureResult = {
        success: false,
        reason: "low_score",
        score: 0.3,
        errorCode: "LOW_SCORE",
        errorMessage: "行为评分过低",
        retryable: false,
        timestamp: Date.now(),
      };

      mockService.verifyToken.mockReturnValue(mockFailureResult);

      const response = await request(app).post("/verify").send({ token: "low-score-token" }).expect(400);

      expect(response.body).toMatchObject(mockFailureResult);
      expect(response.body.traceId).toEqual(expect.any(String));
    });

    it("should handle service exceptions during verification", async () => {
      mockService.verifyToken.mockImplementation(() => {
        throw new Error("Verification service crashed");
      });

      const response = await request(app).post("/verify").send({ token: "test-token" }).expect(500);

      expect(response.body).toMatchObject({
        success: false,
        error: "server_error",
        errorCode: "SERVER_ERROR",
        errorMessage: "服务器内部错误",
        retryable: true,
      });
    });
  });

  describe("GET /stats", () => {
    it("should return statistics successfully", async () => {
      const mockStats = {
        totalCount: 100,
        consumedCount: 80,
        activeCount: 15,
        expiredCount: 5,
        oldestNonceAge: 300000,
        newestNonceAge: 1000,
        averageAge: 150000,
      };

      mockService.getStats.mockReturnValue(mockStats);

      const response = await request(app).get("/stats").expect(200);

      expect(response.body).toMatchObject({
        success: true,
        stats: mockStats,
        timestamp: expect.any(Number),
      });

      expect(mockService.getStats).toHaveBeenCalled();
    });

    it("should handle stats service exceptions", async () => {
      mockService.getStats.mockImplementation(() => {
        throw new Error("Stats service crashed");
      });

      const response = await request(app).get("/stats").expect(500);

      expect(response.body).toMatchObject({
        success: false,
        error: "server_error",
        errorCode: "SERVER_ERROR",
        errorMessage: "服务器内部错误",
        retryable: true,
      });
    });
  });

  describe("IP extraction", () => {
    it("should extract IP from X-Forwarded-For header", async () => {
      const mockNonceResult = {
        success: true,
        nonce: "test-nonce",
        timestamp: Date.now(),
      };

      mockService.issueNonce.mockReturnValue(mockNonceResult);

      await request(app).get("/nonce").set("X-Forwarded-For", "203.0.113.1, 198.51.100.1, 192.0.2.1").expect(200);

      expect(mockService.issueNonce).toHaveBeenCalledWith(
        expect.objectContaining({
          ip: "203.0.113.1",
          origin: expect.any(String),
        }),
      );
    });

    it("should handle missing X-Forwarded-For header", async () => {
      const mockNonceResult = {
        success: true,
        nonce: "test-nonce",
        timestamp: Date.now(),
      };

      mockService.issueNonce.mockReturnValue(mockNonceResult);

      await request(app).get("/nonce").expect(200);

      expect(mockService.issueNonce).toHaveBeenCalledWith(
        expect.objectContaining({
          ip: expect.any(String),
          origin: expect.any(String),
        }),
      );
    });
  });
});
