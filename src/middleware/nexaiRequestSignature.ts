import crypto from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import logger from "../utils/logger";
import { getNonceStore } from "../services/nonceStore";

type SigningMode = "off" | "soft" | "enforce";

export type NexaiErrorStage =
  | "server_signature"
  | "server_auth"
  | "server_validation"
  | "server_internal"
  | "rate_limit"
  | "risk_policy";

declare global {
  namespace Express {
    interface Request {
      rawBody?: Buffer;
      nexaiSig?: {
        mode: SigningMode;
        ok: boolean;
        keyType?: "token" | "app";
      };
    }
  }
}

const SIG_VERSION = "2";
const DEFAULT_MAX_DRIFT_MS = 5 * 60 * 1000;
const MIN_NONCE_LENGTH = 16;

function getSigningMode(): SigningMode {
  const raw = (process.env.NEXAI_REQUEST_SIGNING || "soft").trim().toLowerCase();
  if (raw === "off" || raw === "enforce" || raw === "soft") return raw;
  return "soft";
}

function getMaxDriftMs(): number {
  const n = Number(process.env.NEXAI_SIG_MAX_DRIFT_MS || DEFAULT_MAX_DRIFT_MS);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_MAX_DRIFT_MS;
}

function getAppSecrets(): string[] {
  return [process.env.NEXAI_APP_SIGN_SECRET, process.env.NEXAI_APP_SIGN_SECRET_PREV]
    .map((v) => (typeof v === "string" ? v.trim() : ""))
    .filter(Boolean);
}

function getBearerToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (!authHeader) return null;
  const trimmed = authHeader.trimStart();
  if (trimmed.length < 7) return null;
  if (trimmed.slice(0, 6).toLowerCase() !== "bearer") return null;
  const sep = trimmed.charCodeAt(6);
  if (sep !== 0x20 && sep !== 0x09) return null;
  const token = trimmed.slice(7).trim();
  return token || null;
}

function getSignaturePath(req: Request): string {
  const originalPath = req.originalUrl?.split("?")[0];
  return originalPath || req.path || "/";
}

function getRawBodyString(req: Request): string {
  if (req.rawBody && Buffer.isBuffer(req.rawBody)) {
    return req.rawBody.toString("utf8");
  }
  if (typeof req.body === "string") return req.body;
  if (req.body == null) return "";
  // Last resort — prefer rawBody in production.
  try {
    return JSON.stringify(req.body);
  } catch {
    return "";
  }
}

function buildCanonical(ts: string, nonce: string, method: string, path: string, body: string): string {
  return [ts, nonce, method.toUpperCase(), path, body].join("\n");
}

function hmacHex(key: string, message: string): string {
  return crypto.createHmac("sha256", key).update(message, "utf8").digest("hex");
}

function safeEqualHex(a: string, b: string): boolean {
  try {
    const ba = Buffer.from(a, "hex");
    const bb = Buffer.from(b, "hex");
    if (ba.length === 0 || ba.length !== bb.length) return false;
    return crypto.timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

function headerString(value: unknown): string {
  if (Array.isArray(value)) return typeof value[0] === "string" ? value[0].trim() : "";
  return typeof value === "string" ? value.trim() : "";
}

/** Paths under /api/nexai that never require signature. */
function isSignatureExempt(path: string): boolean {
  const p = path.split("?")[0];
  if (p === "/api/nexai/auth/oauth-config") return true;
  if (/^\/api\/nexai\/releases\/[^/]+\/manifest$/.test(p)) return true;
  // Public artifact read: GET /api/nexai/artifacts/:shortId (not list GET /artifacts)
  if (/^\/api\/nexai\/artifacts\/[^/]+$/.test(p)) return true;
  return false;
}

/** Anonymous routes that may use App secret (C) when no Bearer. */
function allowsAppSecret(path: string): boolean {
  const p = path.split("?")[0];
  return (
    p === "/api/nexai/auth/register" ||
    p === "/api/nexai/auth/login" ||
    p === "/api/nexai/auth/google" ||
    p === "/api/nexai/auth/github" ||
    p === "/api/nexai/auth/forgot-password" ||
    p === "/api/nexai/auth/reset-password" ||
    p === "/api/nexai/auth/passkey/login/options" ||
    p === "/api/nexai/auth/passkey/login/verify" ||
    p === "/api/nexai/auth/passkey/login/discoverable/options" ||
    p === "/api/nexai/auth/passkey/login/discoverable/verify" ||
    p === "/api/nexai/auth/refresh" ||
    p === "/api/nexai/security/report" ||
    p === "/api/nexai/security/status" ||
    p === "/api/nexai/artifacts" || // unlikely anonymous create
    p.startsWith("/api/nexai/artifacts/")
  );
}

export function sendNexaiError(
  res: Response,
  status: number,
  opts: {
    error: string;
    code: string;
    stage: NexaiErrorStage;
    details?: Record<string, unknown>;
  },
): Response {
  return res.status(status).json({
    success: false,
    error: opts.error,
    code: opts.code,
    stage: opts.stage,
    ...(opts.details ? { details: opts.details } : {}),
  });
}

const nonceStore = getNonceStore({
  namespace: "nexai-sig-v2",
  ttlMs: DEFAULT_MAX_DRIFT_MS,
  redisPrefix: "nexai-sig-nonce:",
});

/**
 * NexAI request signature middleware (nexai-sig-v2).
 * B: HMAC key = Bearer access token when present.
 * C: HMAC key = NEXAI_APP_SIGN_SECRET for gated anonymous routes.
 */
export function nexaiRequestSignature(req: Request, res: Response, next: NextFunction): void {
  const mode = getSigningMode();
  const path = getSignaturePath(req);

  if (mode === "off" || isSignatureExempt(path)) {
    req.nexaiSig = { mode, ok: true };
    return next();
  }

  const version = headerString(req.headers["x-nexai-sig-version"]);
  const ts = headerString(req.headers["x-nexai-ts"]);
  const nonce = headerString(req.headers["x-nexai-nonce"]);
  const signature = headerString(req.headers["x-nexai-sig"]).toLowerCase();

  const fail = (status: number, code: string, error: string, details?: Record<string, unknown>) => {
    logger.warn("[NexAI Sig]", { code, path, ip: req.ip, mode, ...details });
    if (mode === "soft") {
      res.setHeader("X-NexAI-Sig-Result", "fail");
      res.setHeader("X-NexAI-Sig-Code", code);
      req.nexaiSig = { mode, ok: false };
      return next();
    }
    return sendNexaiError(res, status, {
      error,
      code,
      stage: "server_signature",
      details: { path, ...(details || {}) },
    });
  };

  if (!ts || !nonce || !signature) {
    return fail(400, "NEXAI_SIG_MISSING", "缺少请求签名参数 (X-NexAI-Ts / X-NexAI-Nonce / X-NexAI-Sig)");
  }

  if (version && version !== SIG_VERSION) {
    return fail(400, "NEXAI_SIG_VERSION", `不支持的签名版本: ${version}`, { sigVersion: version });
  }

  const tsNum = Number(ts);
  if (!Number.isFinite(tsNum)) {
    return fail(400, "NEXAI_SIG_EXPIRED", "无效的时间戳格式");
  }

  // Accept seconds or milliseconds; normalize to ms for drift.
  const tsMs = tsNum < 1e12 ? tsNum * 1000 : tsNum;
  const drift = Math.abs(Date.now() - tsMs);
  const maxDrift = getMaxDriftMs();
  if (drift > maxDrift) {
    return fail(403, "NEXAI_SIG_EXPIRED", "请求已过期，请校准系统时间后重试", {
      driftMs: drift,
      maxDriftMs: maxDrift,
    });
  }

  if (nonce.length < MIN_NONCE_LENGTH) {
    return fail(400, "NEXAI_SIG_MISSING", `nonce 长度不足（最少 ${MIN_NONCE_LENGTH} 字符）`);
  }

  const consumeResult = nonceStore.consume(nonce);
  if (!consumeResult.success) {
    if (consumeResult.reason === "nonce_not_found") {
      nonceStore.storeNonce(nonce, req.ip, req.headers["user-agent"] as string | undefined);
      const retry = nonceStore.consume(nonce);
      if (!retry.success) {
        return fail(403, "NEXAI_SIG_REPLAY", "检测到重放请求，请重试", { reason: retry.reason });
      }
    } else if (consumeResult.reason === "nonce_already_consumed") {
      return fail(403, "NEXAI_SIG_REPLAY", "检测到重放请求（nonce 已使用）");
    } else {
      return fail(403, "NEXAI_SIG_REPLAY", "nonce 校验失败", { reason: consumeResult.reason });
    }
  }

  const body = getRawBodyString(req);
  const canonical = buildCanonical(String(Math.trunc(tsNum)), nonce, req.method, path, body);

  const bearer = getBearerToken(req);
  const keys: Array<{ key: string; keyType: "token" | "app" }> = [];

  if (bearer) {
    // Authed requests must bind to access token (B).
    keys.push({ key: bearer, keyType: "token" });
  } else {
    // Refresh: allow signing with the refreshToken in the raw body (B-variant).
    if (path === "/api/nexai/auth/refresh") {
      try {
        const parsed = body ? JSON.parse(body) : null;
        const refreshToken =
          parsed && typeof parsed.refreshToken === "string" ? parsed.refreshToken.trim() : "";
        if (refreshToken) {
          keys.push({ key: refreshToken, keyType: "token" });
        }
      } catch {
        // ignore JSON parse errors; will fall through to app secret / fail
      }
    }
    if (allowsAppSecret(path)) {
      for (const secret of getAppSecrets()) {
        keys.push({ key: secret, keyType: "app" });
      }
    }
  }

  if (keys.length === 0) {
    return fail(401, "NEXAI_SIG_KEY", "无法校验签名：缺少可用密钥（请登录或配置应用签名密钥）");
  }

  let matched: "token" | "app" | null = null;
  for (const candidate of keys) {
    const expected = hmacHex(candidate.key, canonical);
    if (safeEqualHex(expected, signature)) {
      matched = candidate.keyType;
      break;
    }
  }

  if (!matched) {
    return fail(403, "NEXAI_SIG_INVALID", "请求签名无效", {
      reason: "hmac_mismatch",
      sigVersion: SIG_VERSION,
    });
  }

  res.setHeader("X-NexAI-Sig-Result", "ok");
  req.nexaiSig = { mode, ok: true, keyType: matched };
  return next();
}
