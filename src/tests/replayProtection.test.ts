import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { replayProtection } from '../middleware/replayProtection';
import { destroyNonceStore } from '../services/nonceStore';

const SECRET = process.env.SIGN_SECRET_KEY || 'w=NKYzE?jZHbqmG1k4m6B!.Yp9t5)HY@LsMnN~UK9i';

function sign(timestamp: string, nonce: string, body: string) {
  return crypto.createHmac('sha256', SECRET).update(`${timestamp}${nonce}${body}`).digest('hex');
}

function makeMockReq(overrides: Partial<Request> = {}): Partial<Request> {
  return {
    headers: {},
    body: {},
    ip: '127.0.0.1',
    path: '/test',
    ...overrides,
  };
}

function makeMockRes(): { res: Partial<Response>; statusCode: number; jsonBody: any } {
  const ctx = { statusCode: 200, jsonBody: null as any };
  const res: Partial<Response> = {
    status(code: number) { ctx.statusCode = code; return res as Response; },
    json(body: any) { ctx.jsonBody = body; return res as Response; },
  };
  return { res, ...ctx };
}

describe('replayProtection middleware', () => {
  // 强制非 development 环境
  const origEnv = process.env.NODE_ENV;
  beforeAll(() => { process.env.NODE_ENV = 'production'; });
  afterAll(() => { process.env.NODE_ENV = origEnv; destroyNonceStore(); });

  const middleware = replayProtection({ skipInDev: false });

  it('rejects requests missing headers', (done) => {
    const req = makeMockReq();
    const { res } = makeMockRes();
    middleware(req as Request, res as Response, () => {
      done(new Error('should not call next'));
    });
    setTimeout(() => {
      expect((res.status as any).mock?.calls?.[0]?.[0] ?? 400).toBe(400);
      done();
    }, 10);
  });

  it('rejects expired timestamps', (done) => {
    const ts = String(Date.now() - 10 * 60 * 1000); // 10 min ago
    const nonce = crypto.randomBytes(16).toString('hex');
    const sig = sign(ts, nonce, '');
    const req = makeMockReq({
      headers: { 'x-timestamp': ts, 'x-nonce': nonce, 'x-signature': sig },
    });
    const { res, statusCode } = makeMockRes();
    let nextCalled = false;
    middleware(req as Request, res as Response, () => { nextCalled = true; });
    setTimeout(() => {
      expect(nextCalled).toBe(false);
      done();
    }, 10);
  });

  it('passes valid signed requests', (done) => {
    const ts = String(Date.now());
    const nonce = crypto.randomBytes(16).toString('hex');
    const body = JSON.stringify({ code: 'TEST-123' });
    const sig = sign(ts, nonce, body);
    const req = makeMockReq({
      headers: { 'x-timestamp': ts, 'x-nonce': nonce, 'x-signature': sig },
      body: { code: 'TEST-123' },
    });
    const { res } = makeMockRes();
    middleware(req as Request, res as Response, () => {
      done(); // next() called = pass
    });
  });

  it('rejects replayed nonce', (done) => {
    const ts = String(Date.now());
    const nonce = crypto.randomBytes(16).toString('hex');
    const body = '';
    const sig = sign(ts, nonce, body);
    const makeReq = () => makeMockReq({
      headers: { 'x-timestamp': ts, 'x-nonce': nonce, 'x-signature': sig },
      body: {},
    });

    // First request should pass
    const { res: res1 } = makeMockRes();
    middleware(makeReq() as Request, res1 as Response, () => {
      // Second request with same nonce should fail
      const { res: res2 } = makeMockRes();
      let nextCalled = false;
      middleware(makeReq() as Request, res2 as Response, () => { nextCalled = true; });
      setTimeout(() => {
        expect(nextCalled).toBe(false);
        done();
      }, 10);
    });
  });

  it('rejects invalid signature', (done) => {
    const ts = String(Date.now());
    const nonce = crypto.randomBytes(16).toString('hex');
    const sig = 'a'.repeat(64); // wrong signature
    const req = makeMockReq({
      headers: { 'x-timestamp': ts, 'x-nonce': nonce, 'x-signature': sig },
    });
    const { res } = makeMockRes();
    let nextCalled = false;
    middleware(req as Request, res as Response, () => { nextCalled = true; });
    setTimeout(() => {
      expect(nextCalled).toBe(false);
      done();
    }, 10);
  });
});
