import path from "node:path";
import type { NextFunction, Request, Response } from "express";

const mockVerifyRequestToken = jest.fn();

jest.mock("../config/config", () => ({
  config: {
    ipqs: {
      enabled: true,
    },
  },
  // logger 初始化依赖 compileTimeConfig.logsDir
  compileTimeConfig: {
    logsDir: path.join(process.cwd(), "logs"),
  },
}));

// 真实 securityPolicy 会拉起整张路由图（routes/index → 全部 route modules），
// 导致测试套件在模块加载时初始化 rate limiter / logger 失败。这里用与
// ipVerification 相同的 bypass 路径列表做替身，仅隔离被测中间件。
jest.mock("../security/securityPolicy", () => ({
  shouldBypassSecurityComponent: jest.fn((_component: string, url: string) => {
    const pathname = String(url || "").split("?")[0];
    return (
      pathname === "/api/ip-verification" ||
      pathname === "/api/turnstile" ||
      pathname === "/api/human-check" ||
      pathname === "/api/status" ||
      pathname === "/api/frontend-config" ||
      pathname.startsWith("/api/auth/linuxdo/") ||
      pathname.startsWith("/api/oauth") ||
      pathname.startsWith("/api/tts/assets")
    );
  }),
}));

jest.mock("../services/ipVerificationService", () => ({
  __esModule: true,
  default: {
    verifyRequestToken: mockVerifyRequestToken,
  },
}));

const { ipVerificationMiddleware } = require("../middleware/ipVerification");

function createResponse() {
  const json = jest.fn();
  const status = jest.fn(() => ({ json }));
  return { status, json } as unknown as Response & { status: jest.Mock; json: jest.Mock };
}

describe("ipVerificationMiddleware", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("rejects browser-like requests that do not include the verification headers", async () => {
    const req = {
      method: "GET",
      originalUrl: "/api/tts/generate",
      headers: { origin: "https://tts.chloemlla.com" },
      ip: "203.0.113.10",
      socket: { remoteAddress: "203.0.113.10" },
    } as unknown as Request;
    const res = createResponse();
    const next = jest.fn() as unknown as NextFunction;

    await ipVerificationMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects non-browser (scripted) requests that omit browser headers", async () => {
    const req = {
      method: "GET",
      originalUrl: "/api/tts/generate",
      headers: {}, // curl/scripts omit Origin, Sec-Fetch-Mode and x-fingerprint
      ip: "203.0.113.10",
      socket: { remoteAddress: "203.0.113.10" },
    } as unknown as Request;
    const res = createResponse();
    const next = jest.fn() as unknown as NextFunction;

    await ipVerificationMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("bypasses exempt routes such as the LinuxDo callback", async () => {
    const req = {
      method: "GET",
      originalUrl: "/api/auth/linuxdo/callback",
      headers: { origin: "https://tts.chloemlla.com" },
      ip: "203.0.113.10",
      socket: { remoteAddress: "203.0.113.10" },
    } as unknown as Request;
    const res = createResponse();
    const next = jest.fn() as unknown as NextFunction;

    await ipVerificationMiddleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("bypasses signed TTS assets because media elements cannot attach verification headers", async () => {
    const req = {
      method: "GET",
      originalUrl: "/api/tts/assets/audio.mp3?accessToken=signed-token",
      headers: { "sec-fetch-mode": "no-cors" },
      ip: "203.0.113.10",
      socket: { remoteAddress: "203.0.113.10" },
    } as unknown as Request;
    const res = createResponse();
    const next = jest.fn() as unknown as NextFunction;

    await ipVerificationMiddleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
    expect(mockVerifyRequestToken).not.toHaveBeenCalled();
  });

  it("allows requests when the verification token is valid", async () => {
    mockVerifyRequestToken.mockResolvedValue(true);

    const req = {
      method: "POST",
      originalUrl: "/api/tts/generate",
      headers: {
        origin: "https://tts.chloemlla.com",
        "x-fingerprint": "fingerprint_123456",
        "x-ip-verification-token": "verification-token",
      },
      ip: "198.51.100.20",
      socket: { remoteAddress: "198.51.100.20" },
    } as unknown as Request;
    const res = createResponse();
    const next = jest.fn() as unknown as NextFunction;

    await ipVerificationMiddleware(req, res, next);

    expect(mockVerifyRequestToken).toHaveBeenCalledWith("verification-token", "fingerprint_123456", "198.51.100.20");
    expect(next).toHaveBeenCalled();
  });
});
