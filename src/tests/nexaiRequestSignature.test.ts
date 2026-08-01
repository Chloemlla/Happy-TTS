import crypto from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { nexaiRequestSignature } from "../middleware/nexaiRequestSignature";
import { destroyNonceStore } from "../services/nonceStore";

jest.mock("../services/runtimeConfigService", () => ({
  RuntimeConfigService: {
    getCachedConfig: jest.fn(() => {
      const rawMode = String(process.env.NEXAI_REQUEST_SIGNING || "soft").toLowerCase();
      const mode = rawMode === "off" || rawMode === "enforce" ? rawMode : "soft";
      const rawMaxDrift = Number(process.env.NEXAI_SIG_MAX_DRIFT_MS);
      return {
        nexaiSigning: {
          mode,
          appSignSecret: process.env.NEXAI_APP_SIGN_SECRET || "",
          appSignSecretPrev: process.env.NEXAI_APP_SIGN_SECRET_PREV || "",
          maxDriftMs: Number.isFinite(rawMaxDrift) && rawMaxDrift > 0 ? rawMaxDrift : 5 * 60 * 1000,
        },
      };
    }),
  },
}));

const APP_SECRET = "test-nexai-app-sign-secret";
const ACCESS_TOKEN = "test-access-token-value";
const REFRESH_TOKEN = "test-refresh-token-value";

function sign(
  key: string,
  ts: string,
  nonce: string,
  method: string,
  path: string,
  body: string,
): string {
  return crypto.createHmac("sha256", key).update([ts, nonce, method.toUpperCase(), path, body].join("\n")).digest("hex");
}

function makeReq(overrides: Partial<Request> = {}): Request {
  const base = {
    headers: {},
    body: {},
    ip: "127.0.0.1",
    method: "POST",
    originalUrl: "/api/nexai/auth/login",
    path: "/api/nexai/auth/login",
  };
  return { ...base, ...overrides, headers: { ...(base.headers as any), ...(overrides.headers as any) } } as Request;
}

function makeRes(): { res: Response; statusCode: number; body: any; headers: Record<string, string> } {
  const state = { statusCode: 200, body: null as any, headers: {} as Record<string, string> };
  const res = {
    status(code: number) {
      state.statusCode = code;
      return res;
    },
    json(payload: any) {
      state.body = payload;
      return res;
    },
    setHeader(name: string, value: string) {
      state.headers[name.toLowerCase()] = String(value);
      return res;
    },
  } as unknown as Response;
  return { res, get statusCode() { return state.statusCode; }, get body() { return state.body; }, get headers() { return state.headers; } };
}

function run(req: Request): Promise<{ nextCalled: boolean; statusCode: number; body: any; headers: Record<string, string>; req: Request }> {
  return new Promise((resolve) => {
    const mock = makeRes();
    let nextCalled = false;
    const next: NextFunction = () => {
      nextCalled = true;
      resolve({ nextCalled, statusCode: mock.statusCode, body: mock.body, headers: mock.headers, req });
    };
    nexaiRequestSignature(req, mock.res, next);
    // Soft/fail or enforce paths that respond without next() settle on next tick.
    setImmediate(() => {
      if (!nextCalled) {
        resolve({ nextCalled, statusCode: mock.statusCode, body: mock.body, headers: mock.headers, req });
      }
    });
  });
}

describe("nexaiRequestSignature (nexai-sig-v2)", () => {
  const envSnapshot = {
    NEXAI_REQUEST_SIGNING: process.env.NEXAI_REQUEST_SIGNING,
    NEXAI_APP_SIGN_SECRET: process.env.NEXAI_APP_SIGN_SECRET,
    NEXAI_APP_SIGN_SECRET_PREV: process.env.NEXAI_APP_SIGN_SECRET_PREV,
    NEXAI_SIG_MAX_DRIFT_MS: process.env.NEXAI_SIG_MAX_DRIFT_MS,
  };

  beforeEach(() => {
    process.env.NEXAI_REQUEST_SIGNING = "enforce";
    process.env.NEXAI_APP_SIGN_SECRET = APP_SECRET;
    delete process.env.NEXAI_APP_SIGN_SECRET_PREV;
    delete process.env.NEXAI_SIG_MAX_DRIFT_MS;
  });

  afterAll(() => {
    for (const [key, value] of Object.entries(envSnapshot)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    destroyNonceStore("nexai-sig-v2");
  });

  it("soft mode continues and marks fail headers when signature missing", async () => {
    process.env.NEXAI_REQUEST_SIGNING = "soft";
    const result = await run(makeReq());
    expect(result.nextCalled).toBe(true);
    expect(result.headers["x-nexai-sig-result"]).toBe("fail");
    expect(result.headers["x-nexai-sig-code"]).toBe("NEXAI_SIG_MISSING");
    expect(result.req.nexaiSig).toEqual({ mode: "soft", ok: false });
  });

  it("enforce mode rejects missing signature headers with stage envelope", async () => {
    const result = await run(makeReq());
    expect(result.nextCalled).toBe(false);
    expect(result.statusCode).toBe(400);
    expect(result.body).toMatchObject({
      success: false,
      code: "NEXAI_SIG_MISSING",
      stage: "server_signature",
    });
    expect(typeof result.body.error).toBe("string");
    expect(result.body.error.length).toBeGreaterThan(0);
  });

  it("accepts valid bearer-bound HMAC", async () => {
    const path = "/api/nexai/sync/v2";
    const body = JSON.stringify({ payload: "cipher" });
    const ts = String(Date.now());
    const nonce = crypto.randomBytes(16).toString("hex");
    const signature = sign(ACCESS_TOKEN, ts, nonce, "PUT", path, body);
    const result = await run(
      makeReq({
        method: "PUT",
        originalUrl: path,
        path,
        headers: {
          authorization: `Bearer ${ACCESS_TOKEN}`,
          "x-nexai-sig-version": "2",
          "x-nexai-ts": ts,
          "x-nexai-nonce": nonce,
          "x-nexai-sig": signature,
        },
        rawBody: Buffer.from(body, "utf8"),
        body: JSON.parse(body),
      } as any),
    );
    expect(result.nextCalled).toBe(true);
    expect(result.headers["x-nexai-sig-result"]).toBe("ok");
    expect(result.req.nexaiSig).toEqual({ mode: "enforce", ok: true, keyType: "token" });
  });

  it("rejects invalid HMAC", async () => {
    const path = "/api/nexai/auth/login";
    const body = JSON.stringify({ username: "a", password: "b" });
    const ts = String(Date.now());
    const nonce = crypto.randomBytes(16).toString("hex");
    const result = await run(
      makeReq({
        method: "POST",
        originalUrl: path,
        path,
        headers: {
          "x-nexai-sig-version": "2",
          "x-nexai-ts": ts,
          "x-nexai-nonce": nonce,
          "x-nexai-sig": "ab".repeat(32),
        },
        rawBody: Buffer.from(body, "utf8"),
        body: JSON.parse(body),
      } as any),
    );
    expect(result.nextCalled).toBe(false);
    expect(result.statusCode).toBe(403);
    expect(result.body).toMatchObject({
      success: false,
      code: "NEXAI_SIG_INVALID",
      stage: "server_signature",
    });
  });

  it("rejects expired timestamps", async () => {
    const path = "/api/nexai/auth/login";
    const body = "";
    const ts = String(Date.now() - 10 * 60 * 1000);
    const nonce = crypto.randomBytes(16).toString("hex");
    const signature = sign(APP_SECRET, ts, nonce, "POST", path, body);
    const result = await run(
      makeReq({
        method: "POST",
        originalUrl: path,
        path,
        headers: {
          "x-nexai-sig-version": "2",
          "x-nexai-ts": ts,
          "x-nexai-nonce": nonce,
          "x-nexai-sig": signature,
        },
        rawBody: Buffer.from(body, "utf8"),
      } as any),
    );
    expect(result.nextCalled).toBe(false);
    expect(result.statusCode).toBe(403);
    expect(result.body).toMatchObject({
      code: "NEXAI_SIG_EXPIRED",
      stage: "server_signature",
    });
  });

  it("rejects replayed nonce", async () => {
    const path = "/api/nexai/auth/login";
    const body = "";
    const ts = String(Date.now());
    const nonce = crypto.randomBytes(16).toString("hex");
    const signature = sign(APP_SECRET, ts, nonce, "POST", path, body);
    const build = () =>
      makeReq({
        method: "POST",
        originalUrl: path,
        path,
        headers: {
          "x-nexai-sig-version": "2",
          "x-nexai-ts": ts,
          "x-nexai-nonce": nonce,
          "x-nexai-sig": signature,
        },
        rawBody: Buffer.from(body, "utf8"),
      } as any);

    const first = await run(build());
    expect(first.nextCalled).toBe(true);

    const second = await run(build());
    expect(second.nextCalled).toBe(false);
    expect(second.statusCode).toBe(403);
    expect(second.body).toMatchObject({
      code: "NEXAI_SIG_REPLAY",
      stage: "server_signature",
    });
  });

  it("accepts refreshToken-bound signatures on /auth/refresh", async () => {
    const path = "/api/nexai/auth/refresh";
    const body = JSON.stringify({ refreshToken: REFRESH_TOKEN });
    const ts = String(Date.now());
    const nonce = crypto.randomBytes(16).toString("hex");
    const signature = sign(REFRESH_TOKEN, ts, nonce, "POST", path, body);
    const result = await run(
      makeReq({
        method: "POST",
        originalUrl: path,
        path,
        headers: {
          "x-nexai-sig-version": "2",
          "x-nexai-ts": ts,
          "x-nexai-nonce": nonce,
          "x-nexai-sig": signature,
        },
        rawBody: Buffer.from(body, "utf8"),
        body: JSON.parse(body),
      } as any),
    );
    expect(result.nextCalled).toBe(true);
    expect(result.req.nexaiSig?.keyType).toBe("token");
  });

  it("exempts public GET artifact reads", async () => {
    const result = await run(
      makeReq({
        method: "GET",
        originalUrl: "/api/nexai/artifacts/abc123xyz",
        path: "/api/nexai/artifacts/abc123xyz",
        headers: {},
      }),
    );
    expect(result.nextCalled).toBe(true);
    expect(result.req.nexaiSig).toEqual({ mode: "enforce", ok: true });
  });

  it("does not exempt mutating artifact methods under enforce", async () => {
    const result = await run(
      makeReq({
        method: "DELETE",
        originalUrl: "/api/nexai/artifacts/abc123xyz",
        path: "/api/nexai/artifacts/abc123xyz",
        headers: {},
      }),
    );
    expect(result.nextCalled).toBe(false);
    expect(result.statusCode).toBe(400);
    expect(result.body).toMatchObject({
      code: "NEXAI_SIG_MISSING",
      stage: "server_signature",
    });
  });

  it("exempts GitHub OAuth browser callback GET", async () => {
    const result = await run(
      makeReq({
        method: "GET",
        originalUrl: "/api/nexai/auth/github/callback?code=abc",
        path: "/api/nexai/auth/github/callback",
        headers: {},
      }),
    );
    expect(result.nextCalled).toBe(true);
    expect(result.req.nexaiSig?.ok).toBe(true);
  });
});
