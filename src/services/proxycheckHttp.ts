import { isIP } from "node:net";
import { isRecord, toStringField } from "./proxycheckParsing";
import {
  isValidHmacKeyShape,
  PROXYCHECK_SIGNATURE_HEADER,
  verifyPayloadSignature,
} from "./proxycheckSignature";

/**
 * proxycheck.io 的 HTTP 层：只负责构造请求、发请求、验签、判定顶层 status。
 *
 * 鉴权是 `key` 参数；另外 Dashboard 可为账号生成 API Payload Verification Key，
 * 上游在 HTTPS 响应的 `http_x_signature` 头里回签响应体，本层逐字节验签后才解析
 * （见 proxycheckSignature.ts）。未配置该 key 时不做验签，只依赖 TLS。
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

/** 一次上游查询的全部可调参数；`verificationKey` 为空串表示不验签。 */
export interface ProxycheckRequestOptions {
  apiKey: string;
  verificationKey: string;
  timeoutMs: number;
  days: number;
}

/** status 非 ok/warning 一律当失败；只回状态名，不回上游 message（可能回显含 key 的 URL）。 */
function assertUpstreamOk(payload: ProxycheckPayload): void {
  const status = toStringField(payload.status);
  if (status === "ok" || status === "warning") return;
  throw new Error(`proxycheck_status_${status || "unknown"}`);
}

/**
 * 先验签、再解析：验签不通过一律当上游失败抛出，绝不把未验签的响应当风险数据用
 * （放行还是拦截由调用方的 failOpen 策略决定，本层不替它决定）。
 *
 * 只读一次响应体：HMAC 要对原始字节算，JSON.parse 要用同一份字节解码，二次读取拿不到。
 */
async function readVerifiedPayload(response: Response, verificationKey: string): Promise<ProxycheckPayload> {
  const rawBody = Buffer.from(await response.arrayBuffer());

  if (verificationKey) {
    const verdict = verifyPayloadSignature(rawBody, verificationKey, response.headers.get(PROXYCHECK_SIGNATURE_HEADER));
    if (verdict !== "verified") throw new Error(`proxycheck_signature_${verdict}`);
  }

  try {
    return JSON.parse(rawBody.toString("utf8")) as ProxycheckPayload;
  } catch {
    // 不把 JSON.parse 的原始报错透出去：V8 会在消息里回显响应片段，可能是含 key 的 URL。
    throw new Error("proxycheck_response_not_json");
  }
}

/** 空的 verificationKey = 未配置；非空但长度不对属于配置错误，先拦下以免每次都验签失败。 */
function assertVerificationKeyUsable(verificationKey: string): void {
  if (verificationKey && !isValidHmacKeyShape(verificationKey)) {
    throw new Error("proxycheck_hmac_key_malformed");
  }
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

/**
 * 单地址查询也走批量那条 `POST /v3/`，不用 `GET /v3/{ip}`：官方唯一的参考实现
 * （proxycheck-php 的 check()）查几个地址都用这条路径，是唯一能确认会回
 * `http_x_signature` 的路径。GET 是否带签名无任何佐证，而"缺签名也放行"会让验签形同虚设
 * （能剥掉响应头的中间人同样能改写响应体），所以不能赌。
 */
export async function requestSingleLookup(
  ip: string,
  options: ProxycheckRequestOptions,
): Promise<Record<string, unknown> | null> {
  const payload = await requestBatchLookup([ip], options);
  return extractIpResult(payload, ip);
}

export async function requestBatchLookup(
  ips: string[],
  options: ProxycheckRequestOptions,
): Promise<ProxycheckPayload> {
  assertVerificationKeyUsable(options.verificationKey);

  const body = new URLSearchParams();
  body.set("key", options.apiKey);
  body.set("ips", ips.join(","));
  body.set("vpn", "1");
  body.set("asn", "1");
  body.set("risk", "1");
  body.set("node", "1");
  body.set("p", "1");
  body.set("days", String(options.days));

  const response = await fetch(`${PROXYCHECK_BASE_URL}/v3/`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
      // 不协商压缩：验签哈希的是收到的字节，官方库用 libcurl 也没请求压缩。
      "Accept-Encoding": "identity",
    },
    body: body.toString(),
    redirect: "error",
    signal: AbortSignal.timeout(options.timeoutMs),
  });

  if (!response.ok) {
    throw new Error(`proxycheck_http_${response.status}`);
  }

  const payload = await readVerifiedPayload(response, options.verificationKey);
  assertUpstreamOk(payload);
  return payload;
}
