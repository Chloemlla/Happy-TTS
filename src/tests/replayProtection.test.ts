import crypto from "node:crypto";
import type { Request, Response } from "express";
import { config } from "../config/config";
import { replayProtection } from "../middleware/replayProtection";
import { destroyNonceStore } from "../services/nonceStore";

const SECRET = "test-replay-signing-secret";

function sign(timestamp: string, nonce: string, body: string, method = "POST", path = "/test") {
  return crypto.createHmac("sha256", SECRET).update([timestamp, nonce, method, path, body].join("\n")).digest("hex");
}

function makeMockReq(overrides: Partial<Request> = {}): Partial<Request> {
  return {
    headers: {},
    body: {},
    ip: "127.0.0.1",
    method: "POST",
    originalUrl: "/test",
    path: "/test",
    ...overrides,
  };
}

function makeMockRes() {
  const res = {} as Response;
  const status = jest.fn((_code: number) => res);
  const json = jest.fn((_body: unknown) => res);
  Object.assign(res, { status, json });
  return { res, status, json };
}

describe("replayProtection middleware", () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalSignSecret = process.env.SIGN_SECRET_KEY;
  const originalConfigSignSecret = config.signSecretKey;

  beforeAll(() => {
    process.env.NODE_ENV = "production";
    process.env.SIGN_SECRET_KEY = SECRET;
    config.signSecretKey = SECRET;
  });

  afterAll(() => {
    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalNodeEnv;
    }
    if (originalSignSecret === undefined) {
      delete process.env.SIGN_SECRET_KEY;
    } else {
      process.env.SIGN_SECRET_KEY = originalSignSecret;
    }
    config.signSecretKey = originalConfigSignSecret;
    destroyNonceStore();
  });

  const middleware = replayProtection({ skipInDev: false });

  it("rejects requests missing headers", () => {
    const req = makeMockReq();
    const { res, status, json } = makeMockRes();
    const next = jest.fn();

    middleware(req as Request, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith({
      error: "缺少请求签名参数 (x-timestamp / x-nonce / x-signature)",
    });
  });

  it("rejects expired timestamps", () => {
    const timestamp = String(Date.now() - 10 * 60 * 1000);
    const nonce = crypto.randomBytes(16).toString("hex");
    const req = makeMockReq({
      headers: {
        "x-timestamp": timestamp,
        "x-nonce": nonce,
        "x-signature": sign(timestamp, nonce, ""),
      },
    });
    const { res, status } = makeMockRes();
    const next = jest.fn();

    middleware(req as Request, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(403);
  });

  it("passes valid signed requests", () => {
    const timestamp = String(Date.now());
    const nonce = crypto.randomBytes(16).toString("hex");
    const body = JSON.stringify({ code: "TEST-123" });
    const req = makeMockReq({
      headers: {
        "x-timestamp": timestamp,
        "x-nonce": nonce,
        "x-signature": sign(timestamp, nonce, body),
      },
      body: { code: "TEST-123" },
    });
    const { res, status } = makeMockRes();
    const next = jest.fn();

    middleware(req as Request, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(status).not.toHaveBeenCalled();
  });

  it("rejects replayed nonce", () => {
    const timestamp = String(Date.now());
    const nonce = crypto.randomBytes(16).toString("hex");
    const signature = sign(timestamp, nonce, "");
    const makeReq = () =>
      makeMockReq({
        headers: {
          "x-timestamp": timestamp,
          "x-nonce": nonce,
          "x-signature": signature,
        },
        body: {},
      });

    const firstResponse = makeMockRes();
    const firstNext = jest.fn();
    middleware(makeReq() as Request, firstResponse.res, firstNext);

    const replayResponse = makeMockRes();
    const replayNext = jest.fn();
    middleware(makeReq() as Request, replayResponse.res, replayNext);

    expect(firstNext).toHaveBeenCalledTimes(1);
    expect(replayNext).not.toHaveBeenCalled();
    expect(replayResponse.status).toHaveBeenCalledWith(403);
  });

  it("rejects invalid signature", () => {
    const timestamp = String(Date.now());
    const nonce = crypto.randomBytes(16).toString("hex");
    const req = makeMockReq({
      headers: {
        "x-timestamp": timestamp,
        "x-nonce": nonce,
        "x-signature": "a".repeat(64),
      },
    });
    const { res, status } = makeMockRes();
    const next = jest.fn();

    middleware(req as Request, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(403);
  });
});
