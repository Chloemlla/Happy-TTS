// 转写服务传输层:编码 / 排序 / 签名 / 请求(签名要求原文逐字节一致,勿随意改动)。
// 从 vivoLasr.ts 拆出,供续传上传池(lasrSession.ts)与主流程共用,避免相互 import 成环。
import crypto from "node:crypto";
import http from "node:http";
import https from "node:https";
import type { LasrOptions } from "./types";

// ---------------------------------------------------------------------------
// 编码 / 排序 / 过滤:签名原文按字节比对,任何改动都会导致验签失败
// ---------------------------------------------------------------------------
export function javaUrlEncode(s: string | null | undefined): string {
  if (s == null) return "";
  s = String(s).replace(/ /g, "");
  if (s === "") return "";
  let out = "";
  for (const ch of s) {
    if (/[A-Za-z0-9._*-]/.test(ch)) {
      out += ch;
    } else {
      for (const b of Buffer.from(ch, "utf8")) {
        out += "%" + b.toString(16).toUpperCase().padStart(2, "0");
      }
    }
  }
  return out;
}

export function filterSpecialCharacters(str: string): string {
  return str
    .replace(/\+/g, "%20")
    .replace(/%21/g, "!")
    .replace(/%27/g, "'")
    .replace(/%28/g, "(")
    .replace(/%29/g, ")")
    .replace(/%7E/g, "~")
    .replace(/%2A/g, "*")
    .replace(/%2D/g, "-")
    .replace(/%2E/g, ".")
    .replace(/%5F/g, "_");
}

/** 复刻 Java String.compareToIgnoreCase(ASCII 下等价于忽略大小写比较)。 */
export function compareToIgnoreCase(a: string, b: string): number {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const c1 = a.charCodeAt(i);
    const c2 = b.charCodeAt(i);
    if (c1 !== c2) {
      const u1 = a[i].toUpperCase();
      const u2 = b[i].toUpperCase();
      if (u1 !== u2) {
        const l1 = a[i].toLowerCase();
        const l2 = b[i].toLowerCase();
        if (l1 !== l2) return l1 < l2 ? -1 : 1;
      }
    }
  }
  return a.length - b.length;
}

export function nonce(n: number): string {
  const cs = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let out = "";
  for (let i = 0; i < n; i++) out += cs[crypto.randomInt(cs.length)];
  return out;
}

export interface QueryExtra {
  audioId?: string;
  sliceIndex?: number;
  sliceNum?: number;
  xSessionId?: string;
}

/** 构造查询串(对应 c/a.java 的 queryString):排序 + 过滤,不含 "?"。 */
export function buildQuery(opts: LasrOptions, timestamp: string, userId: string, extra?: QueryExtra): string {
  const enc = javaUrlEncode;
  const params: string[] = [];
  params.push("android_version=" + enc(opts.androidVersion));
  if (extra && extra.audioId != null) params.push("audio_id=" + enc(extra.audioId));
  if (opts.brand) params.push("brand=" + enc(opts.brand));
  params.push("client_version=" + enc(opts.clientVersion));
  params.push("engineid=" + enc(opts.engineType));
  params.push("model=" + enc(opts.model));
  params.push("net_type=" + enc(opts.netType));
  params.push("package=" + enc(opts.packageName));
  params.push("product=" + enc(opts.product));
  params.push("rom=" + enc(opts.rom));
  params.push("sdk_version=" + enc(opts.sdkVersion));
  if (extra && extra.sliceIndex != null) params.push("slice_index=" + extra.sliceIndex);
  if (extra && extra.sliceNum != null) params.push("slice_num=" + extra.sliceNum);
  params.push("system_time=" + enc(timestamp));
  params.push("system_version=" + enc(opts.systemVersion));
  params.push("user_id=" + enc(userId));
  if (extra && extra.xSessionId != null) params.push("x-sessionId=" + enc(extra.xSessionId));
  params.sort((a, b) => compareToIgnoreCase(a, b));
  return filterSpecialCharacters(params.join("&"));
}

export function sign(opts: LasrOptions, reqPath: string, query: string, timestamp: string, nonceStr: string): string {
  const canonical = [
    "POST",
    reqPath,
    query,
    opts.appId,
    timestamp,
    `x-ai-gateway-app-id:${opts.appId}\nx-ai-gateway-timestamp:${timestamp}\nx-ai-gateway-nonce:${nonceStr}`,
  ].join("\n");
  return crypto.createHmac("sha256", opts.appKey).update(canonical, "utf8").digest("base64");
}

export interface RawResp {
  status: number;
  body: string;
}

/** 发起一次 POST(原样发送已编码 query,不做二次编码)。 */
export async function doPost(
  opts: LasrOptions,
  reqPath: string,
  query: string,
  body: Buffer | string,
  contentType: string,
): Promise<RawResp> {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const nonceStr = nonce(8);
  const url = (opts.serverUrl || "").replace(/\/+$/, "") + reqPath + "?" + query;
  const bodyBuf = typeof body === "string" ? Buffer.from(body, "utf8") : body;
  const headers: Record<string, string> = {
    "Content-Type": contentType,
    "User-Agent": "okhttp/4.9.1",
    "X-AI-GATEWAY-APP-ID": opts.appId,
    "X-AI-GATEWAY-TIMESTAMP": timestamp,
    "X-AI-GATEWAY-NONCE": nonceStr,
    "X-AI-GATEWAY-SIGNED-HEADERS": "x-ai-gateway-app-id;x-ai-gateway-timestamp;x-ai-gateway-nonce",
    "X-AI-GATEWAY-SIGNATURE": sign(opts, reqPath, query, timestamp, nonceStr),
    appid: opts.appId,
  };
  if (opts.did) headers.imei = opts.did;
  if (opts.vaid) headers.vaid = opts.vaid;
  if (opts.token) headers.token = opts.token;
  if (opts.openid) headers.openid = opts.openid;

  return new Promise<RawResp>((resolve, reject) => {
    const parsed = new URL(url);
    const lib = parsed.protocol === "http:" ? http : https;
    const req = lib.request(
      {
        method: "POST",
        hostname: parsed.hostname,
        port: parsed.port,
        path: parsed.pathname + parsed.search,
        headers: { ...headers, "Content-Length": bodyBuf.length },
        timeout: 60000,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c) => chunks.push(c as Buffer));
        res.on("end", () => {
          resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8") });
        });
      },
    );
    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.write(bodyBuf);
    req.end();
  });
}

export interface LasrEnvelope {
  code: number;
  desc?: string;
  data: { [k: string]: unknown };
}

/** 解析统一响应外层 { code, desc, sid, data };code!==0 抛错。 */
export function parseResp(resp: RawResp): LasrEnvelope {
  let json: LasrEnvelope;
  try {
    json = JSON.parse(resp.body) as LasrEnvelope;
  } catch {
    throw new Error("非 JSON 响应: " + resp.body.slice(0, 300));
  }
  if (json.code !== 0) {
    throw new Error(`服务端错误 code=${json.code} desc=${json.desc} (HTTP ${resp.status})`);
  }
  return json;
}

/** 宽松解析:非 JSON 响应直接抛错,交由单片重试判定。 */
export function parseSliceResp(resp: RawResp): { code: number; desc?: string } {
  try {
    return JSON.parse(resp.body) as { code: number; desc?: string };
  } catch {
    throw new Error("非 JSON 响应: " + resp.body.slice(0, 200));
  }
}

/** multipart/form-data 单分片 body。 */
export function multipartBody(boundary: string, filename: string, contentType: string, data: Buffer): Buffer {
  const head = Buffer.from(
    `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="${filename}"\r\n` +
      `Content-Type: ${contentType}\r\n` +
      `\r\n`,
    "utf8",
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`, "utf8");
  return Buffer.concat([head, data, tail]);
}
