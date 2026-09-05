import crypto from "node:crypto";
import type { Request } from "express";

export const QQ_GUARD_SIG_VERSION = "1" as const;
export const DEFAULT_MAX_DRIFT_MS = 5 * 60 * 1000;
export const MIN_NONCE_LENGTH = 16;
export const MAX_NONCE_LENGTH = 128;

const KEY_INFO = "qq-guard/control-channel/hmac-sha256";
const DEFAULT_SECRET = "";

function buildCanonical(ts: string, nonce: string, method: string, path: string, body: string): string {
  return [ts, nonce, method.toUpperCase(), path, body].join("\n");
}

function hmacHex(secret: string, message: string): string {
  return crypto.createHmac("sha256", secret).update(message, "utf8").digest("hex");
}

function safeEqualHex(a: string, b: string): boolean {
  const ba = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  if (ba.length === 0 || ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

function getRawBodyString(req: Request): string {
  const raw = (req as any).rawBody ?? req.body;
  if (raw === undefined || raw === null) return "";
  if (Buffer.isBuffer(raw)) return raw.toString("utf8");
  return typeof raw === "string" ? raw : JSON.stringify(raw);
}

/**
 * 校验机器人请求的 HMAC 签名（x-qqg-* 头）。nonce 消费由调用方通过 nonceStore 处理。
 */
export function verifyQqGuardSignature(
  req: Request,
  opts: { secret: string; maxDriftMs?: number },
): { ok: true } | { ok: false; code: number; message: string } {
  const { secret = DEFAULT_SECRET } = opts;
  const maxDrift = opts.maxDriftMs ?? DEFAULT_MAX_DRIFT_MS;
  const headers = req.headers as Record<string, string | undefined>;

  const version = (headers["x-qqg-sig-version"] ?? "").trim();
  const ts = (headers["x-qqg-ts"] ?? "").trim();
  const nonce = (headers["x-qqg-nonce"] ?? "").trim();
  const sig = (headers["x-qqg-sig"] ?? "").trim();

  if (version !== QQ_GUARD_SIG_VERSION) return { ok: false, code: 400, message: "bad-version" };
  if (!ts) return { ok: false, code: 401, message: "missing-ts" };

  let tsNum = Number(ts);
  if (!Number.isFinite(tsNum)) return { ok: false, code: 401, message: "bad-ts" };
  if (tsNum < 1e12) tsNum *= 1000; // 秒 → 毫秒

  const drift = Math.abs(Date.now() - tsNum);
  if (drift > maxDrift) return { ok: false, code: 401, message: "timeout" };

  if (nonce.length < MIN_NONCE_LENGTH || nonce.length > MAX_NONCE_LENGTH) {
    return { ok: false, code: 400, message: "bad-nonce" };
  }

  const path = req.originalUrl || req.url || "/";
  const canonical = buildCanonical(ts, nonce, req.method || "GET", path, getRawBodyString(req));
  if (!safeEqualHex(sig, hmacHex(secret, canonical))) {
    return { ok: false, code: 401, message: "bad-signature" };
  }

  return { ok: true };
}

/**
 * 生成请求签名头（供测试/自检回放，与本中间件对称）。
 */
export function buildQqGuardSignatureHeaders(input: {
  secret: string;
  method: string;
  path: string;
  body?: string;
  ts?: number;
  nonce?: string;
}): Record<string, string> {
  const ts = String(input.ts ?? Math.floor(Date.now() / 1000));
  const nonce = input.nonce ?? crypto.randomUUID();
  const body = input.body ?? "";
  const canonical = buildCanonical(ts, nonce, input.method, input.path, body);
  return {
    "x-qqg-sig-version": QQ_GUARD_SIG_VERSION,
    "x-qqg-ts": ts,
    "x-qqg-nonce": nonce,
    "x-qqg-sig": hmacHex(input.secret, canonical),
  };
}