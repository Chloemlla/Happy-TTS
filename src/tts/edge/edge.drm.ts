import crypto from "node:crypto";
import { EDGE_TRUSTED_CLIENT_TOKEN } from "./edge.protocol";

/** 1601-01-01 → 1970-01-01 的秒数，即 .NET file-time 纪元偏移。 */
const EDGE_WINDOWS_EPOCH_OFFSET_SECONDS = 11_644_473_600;
const EDGE_GEC_WINDOW_SECONDS = 300;
const EDGE_TICKS_PER_SECOND = 10_000_000n;

/** 时钟偏移小于该值（秒）时不值得矫正，避免把网络抖动当成偏差。 */
const EDGE_MIN_SKEW_SECONDS = 30;

export function generateEdgeMuid(): string {
  return crypto.randomBytes(16).toString("hex").toUpperCase();
}

/**
 * Sec-MS-GEC：把「Unix 秒 + 1601 纪元偏移」按 5 分钟对齐后换算成 100ns tick，
 * 与 TrustedClientToken 拼接做 SHA256，取大写十六进制。
 * 全程用 BigInt 精确定点计算（10^7 量级会超出 double 的整数精度）。
 */
export function generateEdgeSecMsGec(now: number = Date.now(), skewSeconds = 0): string {
  const windowsSeconds = Math.floor(now / 1000 + EDGE_WINDOWS_EPOCH_OFFSET_SECONDS + skewSeconds);
  const aligned = Math.floor(windowsSeconds / EDGE_GEC_WINDOW_SECONDS) * EDGE_GEC_WINDOW_SECONDS;
  const ticks = (BigInt(aligned) * EDGE_TICKS_PER_SECOND).toString();
  return crypto
    .createHash("sha256")
    .update(ticks + EDGE_TRUSTED_CLIENT_TOKEN)
    .digest("hex")
    .toUpperCase();
}

/**
 * 从上游响应的 Date 头推算本机相对上游的时钟偏移（秒）。
 * 返回 0 表示无需矫正（缺失、无法解析或偏差过小）。
 */
export function parseEdgeClockSkewSeconds(
  dateHeader: string | null | undefined,
  now: number = Date.now(),
): number {
  if (!dateHeader) return 0;
  const serverMillis = Date.parse(dateHeader);
  if (!Number.isFinite(serverMillis)) return 0;
  const skew = Math.round(serverMillis / 1000) - Math.floor(now / 1000);
  return Math.abs(skew) >= EDGE_MIN_SKEW_SECONDS ? skew : 0;
}
