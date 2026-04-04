import type { NextFunction, Request, Response } from "express";
import { ipVerificationMiddleware } from "../middleware/ipVerification";

const verifyRequestToken = jest.fn();

jest.mock("../config/config", () => ({
  config: {
    ipqs: {
      enabled: true,
    },
  },
}));

jest.mock("../services/ipVerificationService", () => ({
  __esModule: true,
  default: {
    verifyRequestToken,
  },
}));

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
      headers: { origin: "https://tts.951100.xyz" },
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
      headers: { origin: "https://tts.951100.xyz" },
      ip: "203.0.113.10",
      socket: { remoteAddress: "203.0.113.10" },
    } as unknown as Request;
    const res = createResponse();
    const next = jest.fn() as unknown as NextFunction;

    await ipVerificationMiddleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("allows requests when the verification token is valid", async () => {
    verifyRequestToken.mockResolvedValue(true);

    const req = {
      method: "POST",
      originalUrl: "/api/tts/generate",
      headers: {
        origin: "https://tts.951100.xyz",
        "x-fingerprint": "fingerprint_123456",
        "x-ip-verification-token": "verification-token",
      },
      ip: "198.51.100.20",
      socket: { remoteAddress: "198.51.100.20" },
    } as unknown as Request;
    const res = createResponse();
    const next = jest.fn() as unknown as NextFunction;

    await ipVerificationMiddleware(req, res, next);

    expect(verifyRequestToken).toHaveBeenCalledWith(
      "verification-token",
      "fingerprint_123456",
      "198.51.100.20",
    );
    expect(next).toHaveBeenCalled();
  });
});
