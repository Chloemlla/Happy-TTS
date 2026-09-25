import { isIP } from "node:net";
import { isRecord, toStringField } from "./proxycheckParsing";

/**
 * proxycheck.io 的 HTTP 层：只负责构造请求、发请求、判定顶层 status。
 * 鉴权只有 `key` 查询参数一种（proxycheck 没有 HMAC / 签名机制）。
 */

// 上游地址硬编码：绝不从配置接受任意 URL（防 SSRF）。
const PROXYCHECK_BASE_URL = "https://proxycheck.io";
// 批量端点单次 <= 1000 个 IP（官方限制）。
export const BATCH_MAX_IPS = 1000;

/**
 * 响应顶层：status + 每个被查询地址一个键（键名就是 IP 字符串），
 * 另外可能混有 message / node 等非地址键。
 */
export interface ProxycheckPayload {
  status?: unknown;
  message?: unknown;
  [key: string]: unknown;
}

/** status 非 ok/warning 一律当失败；只回状态名，不回上游 message（可能回显含 key 的 URL）。 */
function assertUpstreamOk(payload: ProxycheckPayload): void {
  const status = toStringField(payload.status);
  if (status === "ok" || status === "warning") return;
  throw new Error(`proxycheck_status_${status || "unknown"}`);
}

export function extractIpResult(payload: ProxycheckPayload, ip: string): Record<string, unknown> | null {
  const direct = payload[ip];
  if (isRecord(direct)) return direct;

  // 上游有时回显压缩后的 IPv6 形式，键名与请求不完全一致，退化为扫描 IP 形态的键。
  for (const [key, value] of Object.entries(payload)) {
    if (key === "status" || key === "message" || key === "node") continue;
    if (isIP(key) && isRecord(value)) return value;
  }
  return null;
}

function buildSingleLookupUrl(ip: string, apiKey: string, days: number): URL {
  // 主机名硬编码；ip 已由 isIP 校验过，只能是 IP 字面量，不会引入分隔符或主机名。
  const url = new URL(`${PROXYCHECK_BASE_URL}/v3/${ip}`);
  url.searchParams.set("key", apiKey);
  url.searchParams.set("vpn", "1");
  url.searchParams.set("asn", "1");
  url.searchParams.set("risk", "1");
  url.searchParams.set("node", "1");
  url.searchParams.set("p", "1");
  url.searchParams.set("days", String(days));
  return url;
}

export async function requestSingleLookup(
  ip: string,
  apiKey: string,
  timeoutMs: number,
  days: number,
): Promise<Record<string, unknown> | null> {
  const response = await fetch(buildSingleLookupUrl(ip, apiKey, days), {
    method: "GET",
    headers: { Accept: "application/json" },
    // 不跟随重定向：避免被上游 3xx 带到任意主机（对齐 IPQS 通道的 maxRedirects: 0）。
    redirect: "error",
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok) {
    throw new Error(`proxycheck_http_${response.status}`);
  }

  const payload = (await response.json()) as ProxycheckPayload;
  assertUpstreamOk(payload);
  return extractIpResult(payload, ip);
}

export async function requestBatchLookup(
  ips: string[],
  apiKey: string,
  timeoutMs: number,
  days: number,
): Promise<ProxycheckPayload> {
  const body = new URLSearchParams();
  body.set("key", apiKey);
  body.set("ips", ips.join(","));
  body.set("vpn", "1");
  body.set("asn", "1");
  body.set("risk", "1");
  body.set("node", "1");
  body.set("p", "1");
  body.set("days", String(days));

  const response = await fetch(`${PROXYCHECK_BASE_URL}/v3/`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
    redirect: "error",
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok) {
    throw new Error(`proxycheck_http_${response.status}`);
  }

  const payload = (await response.json()) as ProxycheckPayload;
  assertUpstreamOk(payload);
  return payload;
}
