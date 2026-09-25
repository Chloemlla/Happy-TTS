import crypto from "node:crypto";

/**
 * proxycheck.io 响应验签（官方 Dashboard 的 "API Payload Verification Key"）。
 *
 * 逐条对齐官方 proxycheck-php 库（src/proxycheck.php，v1.0.4 的 check()）：
 *   hash_hmac('sha256', $raw_body, $hmac_key) === $headers['http_x_signature']
 * 即 HMAC-SHA256(原始响应体字节, key) 的小写 hex，仅在 HTTPS 请求下由上游附带该响应头。
 * 方向是「上游签名、本服务验签」，与 clientProbeService 自建的「本服务签名、浏览器上报」相反。
 */

export const PROXYCHECK_SIGNATURE_HEADER = "http_x_signature";
/** 官方文档与库都按 64 字符对待该密钥（strlen($key) == 64）。 */
export const PROXYCHECK_HMAC_KEY_LENGTH = 64;

const SHA256_HEX_PATTERN = /^[0-9a-f]{64}$/;

/** 非空但长度不对的 key 会让每一次验签都失败，等于把上游整个打死，要在发请求前拦下。 */
export function isValidHmacKeyShape(key: string): boolean {
  return key.length === PROXYCHECK_HMAC_KEY_LENGTH;
}

/** 逐字节对原始响应体做 HMAC：绝不先 JSON.parse 再序列化（会改变字节，签名必然对不上）。 */
export function computePayloadSignature(rawBody: string | Buffer, key: string): string {
  return crypto.createHmac("sha256", key).update(rawBody).digest("hex");
}

export type PayloadSignatureVerdict = "verified" | "header_missing" | "header_malformed" | "mismatch";

/**
 * 先用 regex 钉死 64 位小写 hex 形态，再定时安全比较：timingSafeEqual 在长度不等时会抛错，
 * Buffer.from(x,"hex") 对非法 hex 又会静默截断，不先钉形态这两点都会出错。
 * 上游按约定回小写 hex，比较也严格按小写——与官方库的 `!==` 一致。
 */
export function verifyPayloadSignature(
  rawBody: string | Buffer,
  key: string,
  provided: string | null | undefined,
): PayloadSignatureVerdict {
  const header = typeof provided === "string" ? provided.trim() : "";
  if (!header) return "header_missing";
  if (!SHA256_HEX_PATTERN.test(header)) return "header_malformed";

  const expected = computePayloadSignature(rawBody, key);
  if (!crypto.timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(header, "hex"))) return "mismatch";
  return "verified";
}
