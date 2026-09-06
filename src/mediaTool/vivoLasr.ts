// vivo/BBK 录音机「录音转写」逆向 API 的 TypeScript 移植(与 transcribe.js 语义一致)。
//
// 复现 com.android.bbksoundrecorder 的 LASR 大文件转写链路:
//   POST /lasr/create → data.audio_id;  POST /lasr/upload(multipart, 5MB 分片) → data.slices
//   POST /lasr/run → data.task_id;      POST /lasr/progress(轮询) → data.progress
//   POST /lasr/result → data.result[] { onebest, bg, ed, speaker, lid }
// 鉴权:新 X-AI-GATEWAY-* 头,签名 = Base64(HMAC-SHA256(appKey, 6 行原串))。
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import path from "node:path";
import {
  CancelledError,
  audioDurationSec,
  ensureDir,
  fmtSrt,
} from "./runtime";
import type { LasrOptions, MediaJobStage } from "./types";

export interface LasrSegment {
  bg: number;
  ed: number;
  onebest?: string;
  speaker?: string;
}

export interface LasrOutcome {
  filePath: string;
  segments: LasrSegment[];
  plainText: string;
  /** 实际写出的 .txt 绝对路径 */
  txtPath: string;
  /** 实际写出的 .srt 绝对路径(未启用 saveSrt 时为 null) */
  srtPath: string | null;
  durationSec: number;
}

export interface LasrCallbacks {
  log?: (text: string) => void;
  progress?: (stage: MediaJobStage, percent: number) => void;
  isCancelled?: () => boolean;
}

function throwIfCancelled(cb: LasrCallbacks): void {
  if (cb.isCancelled && cb.isCancelled()) {
    throw new CancelledError();
  }
}

// ---------------------------------------------------------------------------
// 与 Java 完全一致的编码 / 排序 / 过滤(照抄 transcribe.js)
// ---------------------------------------------------------------------------
function javaUrlEncode(s: string | null | undefined): string {
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

function filterSpecialCharacters(str: string): string {
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

function compareToIgnoreCase(a: string, b: string): number {
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

function nonce(n: number): string {
  const cs = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let out = "";
  for (let i = 0; i < n; i++) out += cs[crypto.randomInt(cs.length)];
  return out;
}

interface QueryExtra {
  audioId?: string;
  sliceIndex?: number;
  sliceNum?: number;
  xSessionId?: string;
}

function buildQuery(opts: LasrOptions, timestamp: string, userId: string, extra?: QueryExtra): string {
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

function sign(opts: LasrOptions, reqPath: string, query: string, timestamp: string, nonceStr: string): string {
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

interface RawResp {
  status: number;
  body: string;
}

async function doPost(opts: LasrOptions, reqPath: string, query: string, body: Buffer | string, contentType: string): Promise<RawResp> {
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
          const text = Buffer.concat(chunks).toString("utf8");
          resolve({ status: res.statusCode ?? 0, body: text });
        });
      },
    );
    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.write(bodyBuf);
    req.end();
  });
}

function parseResp(resp: RawResp): { code: number; desc?: string; data: { [k: string]: unknown } } {
  let json: { code: number; desc?: string; data: { [k: string]: unknown } };
  try {
    json = JSON.parse(resp.body);
  } catch {
    throw new Error("非 JSON 响应: " + resp.body.slice(0, 300));
  }
  if (json.code !== 0) {
    throw new Error(`服务端错误 code=${json.code} desc=${json.desc} (HTTP ${resp.status})`);
  }
  return json;
}

function multipartBody(boundary: string, filename: string, contentType: string, data: Buffer): Buffer {
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

interface SessionState {
  userId: string;
  xSessionId: string;
  audioId: string | null;
  uploadedSlices: number;
  duration: number;
  fileSize: number;
  sliceNum: number;
}

function saveResult(filePath: string, result: LasrSegment[], saveSrt: boolean): { txtPath: string; srtPath: string | null; plain: string } {
  const base = filePath.replace(/\.[^./\\]+$/, "");
  const plain = result.map((s) => s.onebest || "").join("");
  const txtPath = base + ".txt";
  fs.writeFileSync(txtPath, plain, "utf8");
  let srtPath: string | null = null;
  if (saveSrt) {
    srtPath = base + ".srt";
    const srt = result
      .map((s, i) => {
        const speaker = s.speaker ? `（说话人${s.speaker}）` : "";
        return `${i + 1}\n${fmtSrt(s.bg)} --> ${fmtSrt(s.ed)}\n${speaker}${s.onebest || ""}\n`;
      })
      .join("\n");
    fs.writeFileSync(srtPath, srt, "utf8");
  }
  return { txtPath, srtPath, plain };
}

// ---------------------------------------------------------------------------
// 单文件主流程
// ---------------------------------------------------------------------------
async function processFile(opts: LasrOptions, filePath: string, cb: LasrCallbacks): Promise<LasrOutcome> {
  const log = (m: string) => cb.log?.(m);
  const stat = fs.statSync(filePath);
  if (stat.size === 0 || stat.size > opts.maxFileSizeBytes) {
    throw new Error(`文件大小非法: ${stat.size} 字节(需 >0 且 <=${opts.maxFileSizeBytes})`);
  }
  const fileSize = stat.size;
  const sliceNum = Math.ceil(fileSize / opts.blockSizeBytes);
  const fileName = path.basename(filePath);

  throwIfCancelled(cb);

  const session: SessionState = {
    userId: crypto.randomUUID().replace(/-/g, ""),
    xSessionId: crypto.randomUUID(),
    audioId: null,
    uploadedSlices: 0,
    duration: audioDurationSec(filePath),
    fileSize,
    sliceNum,
  };
  log(`文件: ${fileName}`);
  log(`大小: ${fileSize} 字节, 分片数: ${sliceNum}, 时长: ${session.duration}s`);

  // 1) create
  log("[1/5] /lasr/create");
  cb.progress?.("create", 3);
  const createQuery = buildQuery(opts, String(Math.floor(Date.now() / 1000)), session.userId);
  const createBody = JSON.stringify({
    "x-sessionId": session.xSessionId,
    slice_num: sliceNum,
    audio_type: "auto",
    scene: opts.scene,
  });
  const created = parseResp(
    await doPost(opts, "/lasr/create", createQuery, createBody, "application/json; charset=utf-8"),
  );
  session.audioId = typeof created.data.audio_id === "string" ? created.data.audio_id : null;
  if (!session.audioId) throw new Error("create 未返回 audio_id");
  log(`  audio_id = ${session.audioId}`);

  // 2) upload(5MB 分片,每片后刷新进度;期间可取消)
  log("[2/5] /lasr/upload(分片上传)");
  cb.progress?.("upload", 8);
  const boundary = "----vivo" + crypto.randomBytes(16).toString("hex");
  const encName = javaUrlEncode(fileName);
  const fd = fs.openSync(filePath, "r");
  try {
    for (let sliceIndex = session.uploadedSlices; sliceIndex < sliceNum; sliceIndex++) {
      throwIfCancelled(cb);
      const offset = sliceIndex * opts.blockSizeBytes;
      const length = Math.min(opts.blockSizeBytes, fileSize - offset);
      const buf = Buffer.alloc(length);
      let read = 0;
      while (read < length) {
        const r = fs.readSync(fd, buf, read, length - read, offset + read);
        if (r <= 0) break;
        read += r;
      }
      const upQuery = buildQuery(opts, String(Math.floor(Date.now() / 1000)), session.userId, {
        audioId: session.audioId,
        sliceIndex,
        sliceNum,
        xSessionId: session.xSessionId,
      });
      const mBody = multipartBody(boundary, encName, "application/octet-stream", buf);
      const upResp = await doPost(opts, "/lasr/upload", upQuery, mBody, `multipart/form-data; boundary=${boundary}`);
      const upJson = JSON.parse(upResp.body);
      if (upJson.code !== 0 && upJson.code !== 20005) {
        throw new Error(`上传分片 ${sliceIndex} 失败 code=${upJson.code} desc=${upJson.desc}`);
      }
      session.uploadedSlices = sliceIndex + 1;
      cb.progress?.("upload", 8 + Math.round(((sliceIndex + 1) / sliceNum) * 32));
      log(`  分片 ${sliceIndex + 1}/${sliceNum}(code=${upJson.code})`);
    }
    log("  上传完成");
  } finally {
    fs.closeSync(fd);
  }

  // 3) run
  throwIfCancelled(cb);
  log("[3/5] /lasr/run");
  cb.progress?.("run", 42);
  const runQuery = buildQuery(opts, String(Math.floor(Date.now() / 1000)), session.userId);
  const runBody = JSON.stringify({
    audio_id: session.audioId,
    "x-sessionId": session.xSessionId,
    audio_time: session.duration,
    language_code: opts.language,
    scene: opts.scene,
  });
  const ran = parseResp(await doPost(opts, "/lasr/run", runQuery, runBody, "application/json; charset=utf-8"));
  const taskId = typeof ran.data.task_id === "string" ? ran.data.task_id : null;
  if (!taskId) throw new Error("run 未返回 task_id");
  log(`  task_id = ${taskId}`);

  // 4) progress(轮询;服务端 0-100 映射到 44-94;期间可取消)
  log("[4/5] /lasr/progress(轮询进度)");
  const progBody = JSON.stringify({
    task_id: taskId,
    "x-sessionId": session.xSessionId,
    language_code: opts.language,
    scene: opts.scene,
  });
  let progress = -1;
  while (progress !== 100) {
    throwIfCancelled(cb);
    const progQuery = buildQuery(opts, String(Math.floor(Date.now() / 1000)), session.userId);
    const polled = parseResp(await doPost(opts, "/lasr/progress", progQuery, progBody, "application/json; charset=utf-8"));
    progress = typeof polled.data.progress === "number" ? polled.data.progress : -1;
    cb.progress?.("progress", 44 + Math.round((Math.max(0, progress) / 100) * 50));
    log(`  进度: ${progress}%`);
    if (progress >= 100) break;
    await new Promise((r) => setTimeout(r, 3000));
  }

  // 5) result + 落盘
  throwIfCancelled(cb);
  log("[5/5] /lasr/result");
  cb.progress?.("result", 96);
  const resQuery = buildQuery(opts, String(Math.floor(Date.now() / 1000)), session.userId);
  const finaled = parseResp(await doPost(opts, "/lasr/result", resQuery, progBody, "application/json; charset=utf-8"));
  const raw = Array.isArray(finaled.data.result) ? (finaled.data.result as LasrSegment[]) : [];
  const segments = raw.filter((s) => s && typeof s.onebest === "string");

  ensureDir(path.dirname(filePath));
  const saved = saveResult(filePath, segments, opts.saveSrt);
  log(`已保存(${segments.length} 段)→ ${saved.txtPath}`);
  if (saved.srtPath) log(`已保存(字幕)→ ${saved.srtPath}`);
  cb.progress?.("result", 100);
  return {
    filePath,
    segments,
    plainText: saved.plain,
    txtPath: saved.txtPath,
    srtPath: saved.srtPath,
    durationSec: session.duration,
  };
}

/** 转写单个音频文件,成功返回转写文本与落盘路径,取消抛 CancelledError。 */
export async function transcribeAudioFile(
  opts: LasrOptions,
  filePath: string,
  cb: LasrCallbacks = {},
): Promise<LasrOutcome> {
  const resolved = path.resolve(filePath);
  try {
    return await processFile(opts, resolved, cb);
  } catch (e) {
    if (e instanceof CancelledError) throw e;
    // 网络抖动常见:create 成功但中途断连,整链重跑一次(与脚本一致的健壮性)
    if (cb.log) cb.log(`流程中断(${(e as Error).message}),整体重试一次`);
    return await processFile(opts, resolved, cb);
  }
}
