import crypto from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { lumenConfig } from "../../config/lumen.js";
import { ApiNonce } from "../../models/lumen/index.js";

/**
 * Request-signing middleware for Project Lumen.
 *
 * When `lumenConfig.requireRequestSigning` is `false`, the middleware passes
 * through without validation.
 *
 * Expected headers:
 *   - `x-lumen-timestamp`   – Unix timestamp (seconds or milliseconds)
 *   - `x-lumen-nonce`       – Unique nonce (at least 16 characters)
 *   - `x-lumen-signature`   – HMAC-SHA256 hex digest
 *
 * Canonical string:
 * ```
 * bodySha256
 * METHOD
 * nonce
 * path
 * query (sorted keys)
 * timestamp
 * ```
 *
 * The HMAC key is `lumenConfig.requestSigningSecret`.
 */

const MIN_NONCE_LENGTH = 16;
const DEFAULT_SKEW_SECONDS = 300;

function headerString(value: unknown): string {
  if (Array.isArray(value)) return typeof value[0] === "string" ? value[0].trim() : "";
  return typeof value === "string" ? value.trim() : "";
}

function sha256Hex(input: string): string {
  return crypto.createHash("sha256").update(input, "utf8").digest("hex");
}

function hmacSha256Hex(key: string, message: string): string {
  return crypto.createHmac("sha256", key).update(message, "utf8").digest("hex");
}

function constantTimeEqual(a: string, b: string): boolean {
  try {
    const ba = Buffer.from(a, "hex");
    const bb = Buffer.from(b, "hex");
    if (ba.length === 0 || ba.length !== bb.length) return false;
    return crypto.timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

function getRawBodyString(req: Request): string {
  if (req.rawBody && Buffer.isBuffer(req.rawBody)) {
    return req.rawBody.toString("utf8");
  }
  if (typeof req.body === "string") return req.body;
  if (req.body == null) return "";
  try {
    return JSON.stringify(req.body);
  } catch {
    return "";
  }
}

function buildCanonical(bodySha256: string, method: string, nonce: string, path: string, query: string, timestamp: string): string {
  const values: Array<{ key: string; value: string }> = [
    { key: "bodySha256", value: bodySha256 },
    { key: "method", value: method },
    { key: "nonce", value: nonce },
    { key: "path", value: path },
    { key: "query", value: query },
    { key: "timestamp", value: timestamp },
  ];
  values.sort((a, b) => a.key.localeCompare(b.key));
  return values.map((v) => `${v.key}=${v.value}`).join("\n");
}

function sortQueryString(queryString: string): string {
  if (!queryString) return "";
  const params = queryString.replace(/^\?/, "").split("&").filter(Boolean);
  params.sort((a, b) => a.localeCompare(b));
  return params.join("&");
}

function getSignaturePath(req: Request): string {
  return req.originalUrl ? req.originalUrl.split("?")[0] : req.path || "/";
}

/**
 * Verifies the request signature.  When `lumenConfig.requireRequestSigning` is
 * false, the middleware skips all checks.
 */
export function verifyRequestSignature(): (req: Request, res: Response, next: NextFunction) => void {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!lumenConfig.requireRequestSigning) {
        next();
        return;
      }

      const timestamp = headerString(req.headers["x-lumen-timestamp"]);
      const nonce = headerString(req.headers["x-lumen-nonce"]);
      const signature = headerString(req.headers["x-lumen-signature"]).toLowerCase();

      if (!timestamp || !nonce || !signature) {
        res.status(403).json({
          error: "Forbidden",
          reasonCode: "REQUEST_SIGNATURE_TIMESTAMP_MISSING",
          message: "Missing required signature headers (x-lumen-timestamp, x-lumen-nonce, x-lumen-signature)",
        });
        return;
      }

      // --- Timestamp skew check ---
      const tsNum = Number(timestamp);
      if (!Number.isFinite(tsNum)) {
        res.status(403).json({
          error: "Forbidden",
          reasonCode: "REQUEST_SIGNATURE_TIMESTAMP_INVALID",
          message: "X-Lumen-Timestamp must be a Unix seconds value.",
        });
        return;
      }

      const skewSeconds = lumenConfig.requestTimestampSkewSeconds || DEFAULT_SKEW_SECONDS;
      // Accept seconds or milliseconds; normalize to ms
      const tsMs = tsNum < 1e12 ? tsNum * 1000 : tsNum;
      const drift = Math.abs(Date.now() - tsMs);
      if (drift > skewSeconds * 1000) {
        res.status(403).json({
          error: "Forbidden",
          reasonCode: "REQUEST_SIGNATURE_TIMESTAMP_OUT_OF_WINDOW",
          message: `Request signing timestamp is outside the accepted clock-skew window of ${skewSeconds}s`,
        });
        return;
      }

      // --- Nonce reuse check ---
      if (nonce.length < MIN_NONCE_LENGTH) {
        res.status(403).json({
          error: "Forbidden",
          reasonCode: "REQUEST_SIGNATURE_NONCE_INVALID",
          message: `Nonce must be at least ${MIN_NONCE_LENGTH} characters`,
        });
        return;
      }

      const existingNonce = await ApiNonce.findById(nonce).exec();
      if (existingNonce) {
        res.status(403).json({
          error: "Forbidden",
          reasonCode: "REQUEST_SIGNATURE_NONCE_REUSED",
          message: "Nonce has already been used",
        });
        return;
      }

      // --- Build canonical string ---
      const body = getRawBodyString(req);
      const bodySha256 = sha256Hex(body);
      const method = req.method.toUpperCase();
      const path = getSignaturePath(req);
      const queryString = sortQueryString(req.originalUrl?.split("?")[1] || req.url?.split("?")[1] || "");
      // Use the raw (non-normalized) timestamp value for the canonical string
      const canonical = buildCanonical(bodySha256, method, nonce, path, queryString, timestamp);

      // --- Compute and verify signature ---
      const expectedSignature = hmacSha256Hex(lumenConfig.requestSigningSecret, canonical);

      if (!constantTimeEqual(expectedSignature, signature)) {
        res.status(403).json({
          error: "Forbidden",
          reasonCode: "REQUEST_SIGNATURE_INVALID",
          message: "Request signature did not match the backend signing secret and canonical payload.",
        });
        return;
      }

      // --- Store nonce with TTL to prevent replay ---
      const ttlSeconds = Math.max(skewSeconds, 3600); // At least 1 hour
      try {
        await ApiNonce.create({
          _id: nonce,
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + ttlSeconds * 1000),
        });
      } catch {
        /* non-critical: race with duplicate insert */
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}