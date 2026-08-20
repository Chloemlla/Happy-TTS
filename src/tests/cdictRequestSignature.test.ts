import crypto from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { nexaiRequestSignature } from "../middleware/nexaiRequestSignature";
import { destroyNonceStore } from "../services/nonceStore";

jest.mock("../services/runtimeConfigService", () => ({
  RuntimeConfigService: {
    getCachedConfig: jest.fn(() => ({
      cdictSigning: {
        mode: process.env.CDICT_REQUEST_SIGNING || "soft",
        appSignSecret: process.env.CDICT_APP_SIGN_SECRET || "",
        appSignSecretPrev: process.env.CDICT_APP_SIGN_SECRET_PREV || "",
        maxDriftMs: 5 * 60 * 1000,
      },
    })),
  },
}));

const SECRET = "test-cdict-app-sign-secret";
const INSTALL_ID = "2d87ce39-5c4f-4a70-a950-cfb63805a7dc";

function sign(
  key: string,
  ts: string,
  nonce: string,
  installId: string,
  method: string,
  path: string,
  body: string,
): string {
  return crypto
    .createHmac("sha256", key)
    .update([ts, nonce, installId, method.toUpperCase(), path, body].join("\n"))
    .digest("hex");
}

function makeReq(overrides: Partial<Request> = {}): Request {
  const base = {
    headers: {},
    body: {},
    ip: "203.0.113.1",
    method: "GET",
    originalUrl: "/api/cdict/languages",
    path: "/api/cdict/languages",
  };
  return { ...base, ...overrides, headers: { ...base.headers, ...overrides.headers } } as Request;
}

function run(req: Request): Promise<{ nextCalled: boolean; statusCode: number; body: any; req: Request }> {
  return new Promise((resolve) => {
    const state = { statusCode: 200, body: null as any };
    const res = {
      status(code: number) {
        state.statusCode = code;
        return res;
      },
      json(payload: any) {
        state.body = payload;
        return res;
      },
      setHeader: jest.fn(),
    } as unknown as Response;
    let nextCalled = false;
    const next: NextFunction = () => {
      nextCalled = true;
      resolve({ nextCalled, ...state, req });
    };
    nexaiRequestSignature(req, res, next);
    setImmediate(() => {
      if (!nextCalled) resolve({ nextCalled, ...state, req });
    });
  });
}

describe("cdictRequestSignature (cdict-sig-v1)", () => {
  beforeEach(() => {
    process.env.CDICT_REQUEST_SIGNING = "enforce";
    process.env.CDICT_APP_SIGN_SECRET = SECRET;
    delete process.env.CDICT_APP_SIGN_SECRET_PREV;
  });

  afterAll(() => {
    delete process.env.CDICT_REQUEST_SIGNING;
    delete process.env.CDICT_APP_SIGN_SECRET;
    delete process.env.CDICT_APP_SIGN_SECRET_PREV;
    destroyNonceStore("cdict-sig-v1");
  });

  it("keeps an unsigned legacy client on the untrusted tier", async () => {
    const result = await run(makeReq());
    expect(result.nextCalled).toBe(true);
    expect(result.req.cdictClient).toEqual({ trusted: false, reason: "unsigned" });
  });

  it("trusts a valid signature and binds its install id", async () => {
    const path = "/api/cdict/translate";
    const body = "text=hello&from=auto&to=zh-CHS";
    const ts = String(Date.now());
    const nonce = crypto.randomBytes(16).toString("hex");
    const result = await run(
      makeReq({
        method: "POST",
        originalUrl: path,
        path,
        rawBody: Buffer.from(body),
        headers: {
          "x-cdict-sig-version": "1",
          "x-cdict-ts": ts,
          "x-cdict-nonce": nonce,
          "x-cdict-install": INSTALL_ID,
          "x-cdict-sig": sign(SECRET, ts, nonce, INSTALL_ID, "POST", path, body),
        },
      } as Partial<Request>),
    );
    expect(result.nextCalled).toBe(true);
    expect(result.req.cdictClient).toEqual({ trusted: true, installId: INSTALL_ID, keyType: "app" });
  });

  it("rejects a present but invalid signature in enforce mode", async () => {
    const result = await run(
      makeReq({
        headers: {
          "x-cdict-ts": String(Date.now()),
          "x-cdict-nonce": crypto.randomBytes(16).toString("hex"),
          "x-cdict-install": INSTALL_ID,
          "x-cdict-sig": "ab".repeat(32),
        },
      }),
    );
    expect(result.nextCalled).toBe(false);
    expect(result.statusCode).toBe(403);
    expect(result.body).toMatchObject({ code: "CDICT_SIG_INVALID" });
  });

  it("downgrades a bad signature to the IP tier in soft mode", async () => {
    process.env.CDICT_REQUEST_SIGNING = "soft";
    const result = await run(
      makeReq({
        headers: {
          "x-cdict-ts": String(Date.now()),
          "x-cdict-nonce": crypto.randomBytes(16).toString("hex"),
          "x-cdict-install": INSTALL_ID,
          "x-cdict-sig": "ab".repeat(32),
        },
      }),
    );
    expect(result.nextCalled).toBe(true);
    expect(result.req.cdictClient).toEqual({ trusted: false, reason: "hmac_mismatch" });
  });

  it("accepts the previous secret during rotation", async () => {
    const previousSecret = "test-cdict-previous-sign-secret";
    process.env.CDICT_APP_SIGN_SECRET_PREV = previousSecret;
    const path = "/api/cdict/languages";
    const ts = String(Date.now());
    const nonce = crypto.randomBytes(16).toString("hex");
    const result = await run(
      makeReq({
        headers: {
          "x-cdict-ts": ts,
          "x-cdict-nonce": nonce,
          "x-cdict-install": INSTALL_ID,
          "x-cdict-sig": sign(previousSecret, ts, nonce, INSTALL_ID, "GET", path, ""),
        },
      }),
    );
    expect(result.req.cdictClient).toEqual({ trusted: true, installId: INSTALL_ID, keyType: "appPrev" });
  });

  it("rejects a signature when a GET query parameter changes", async () => {
    const signedTarget = "/api/cdict/tts?source=engine&text=hello";
    const receivedTarget = "/api/cdict/tts?source=engine&text=changed";
    const ts = String(Date.now());
    const nonce = crypto.randomBytes(16).toString("hex");
    const result = await run(
      makeReq({
        originalUrl: receivedTarget,
        path: "/api/cdict/tts",
        headers: {
          "x-cdict-ts": ts,
          "x-cdict-nonce": nonce,
          "x-cdict-install": INSTALL_ID,
          "x-cdict-sig": sign(SECRET, ts, nonce, INSTALL_ID, "GET", signedTarget, ""),
        },
      }),
    );
    expect(result.nextCalled).toBe(false);
    expect(result.body).toMatchObject({ code: "CDICT_SIG_INVALID" });
  });

  it("rejects replay of a valid signed request", async () => {
    const path = "/api/cdict/languages";
    const ts = String(Date.now());
    const nonce = crypto.randomBytes(16).toString("hex");
    const headers = {
      "x-cdict-ts": ts,
      "x-cdict-nonce": nonce,
      "x-cdict-install": INSTALL_ID,
      "x-cdict-sig": sign(SECRET, ts, nonce, INSTALL_ID, "GET", path, ""),
    };
    expect((await run(makeReq({ headers }))).nextCalled).toBe(true);
    const replay = await run(makeReq({ headers }));
    expect(replay.nextCalled).toBe(false);
    expect(replay.body).toMatchObject({ code: "CDICT_SIG_REPLAY" });
  });
});
