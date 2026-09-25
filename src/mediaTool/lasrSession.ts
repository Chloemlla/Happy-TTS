// vivo LASR 会话续传 + 分片上传池(对齐 transcribe.js 2026-09-13 新增能力)。
//
// 断点续传:<音频同名>.transcribe.json 记 audio_id / userId / x-sessionId / 已传片号,
// 进程重启、任务重试、网络中断后都从缺口继续,不重新 create、不重传已完成分片。
// 文件尺寸/修改时间/分片数任一变化即作废重来,避免把半截旧文件拼进新音频。
//
// 上传并发:worker 池按 uploadConcurrency 领片,服务端按 slice_index 组装,乱序上传结果正确;
// 实测并发×文件并发过高时上游会返 10105(ks3 落盘失败),故配合单片指数退避重试。
import crypto from "node:crypto";
import fs from "node:fs";
import { audioDurationSec, CancelledError } from "./runtime";
import { buildQuery, doPost, javaUrlEncode, multipartBody, parseSliceResp } from "./lasrTransport";
import type { LasrOptions } from "./types";

export const SESSION_SIDECAR_VERSION = 1;

export interface LasrSessionState {
  version: number;
  fileSize: number;
  fileMtimeMs: number;
  sliceNum: number;
  fileName: string;
  userId: string;
  xSessionId: string;
  audioId: string | null;
  duration: number;
  /** 从 0 起连续完成的水位(进度显示与旧 sidecar 兼容) */
  uploadedSlices: number;
  /** 已完成片号:并发下完成顺序是乱的,续传按这份集合跳过 */
  uploadedSet: number[];
}

export interface UploadCallbacks {
  log(text: string): void;
  /** 上传阶段内部进度 0..100 */
  progress?(percent: number): void;
  isCancelled?(): boolean;
}

/** sidecar 与音频同目录同名(扩展名替换),因此永远落在 workDir 内。 */
export function sessionSidecarPath(filePath: string): string {
  return filePath.replace(/\.[^./\\]+$/, "") + ".transcribe.json";
}

export function readSession(filePath: string): LasrSessionState | null {
  try {
    const raw = JSON.parse(fs.readFileSync(sessionSidecarPath(filePath), "utf8")) as Partial<LasrSessionState>;
    if (!raw || typeof raw.audioId !== "string" || !raw.audioId) return null;
    if (typeof raw.sliceNum !== "number" || typeof raw.fileSize !== "number") return null;
    return {
      version: SESSION_SIDECAR_VERSION,
      fileSize: raw.fileSize,
      fileMtimeMs: typeof raw.fileMtimeMs === "number" ? raw.fileMtimeMs : 0,
      sliceNum: raw.sliceNum,
      fileName: typeof raw.fileName === "string" ? raw.fileName : "",
      userId: typeof raw.userId === "string" && raw.userId ? raw.userId : crypto.randomUUID().replace(/-/g, ""),
      xSessionId: typeof raw.xSessionId === "string" && raw.xSessionId ? raw.xSessionId : crypto.randomUUID(),
      audioId: raw.audioId,
      duration: typeof raw.duration === "number" ? raw.duration : 0,
      uploadedSlices: typeof raw.uploadedSlices === "number" ? raw.uploadedSlices : 0,
      uploadedSet: Array.isArray(raw.uploadedSet) ? raw.uploadedSet.filter((n) => Number.isInteger(n) && n >= 0) : [],
    };
  } catch {
    return null;
  }
}

/** sidecar 写失败只影响续传(不能反噬转写主流程)。 */
export function writeSession(filePath: string, session: LasrSessionState): void {
  try {
    fs.writeFileSync(sessionSidecarPath(filePath), JSON.stringify(session, null, 2), "utf8");
  } catch {
    // 忽略:退化为无续传
  }
}

export function clearSession(filePath: string): void {
  try {
    fs.unlinkSync(sessionSidecarPath(filePath));
  } catch {
    // 本来就没有
  }
}

export function createSession(filePath: string, meta: { fileSize: number; fileMtimeMs: number; sliceNum: number; fileName: string }): LasrSessionState {
  return {
    version: SESSION_SIDECAR_VERSION,
    fileSize: meta.fileSize,
    fileMtimeMs: meta.fileMtimeMs,
    sliceNum: meta.sliceNum,
    fileName: meta.fileName,
    userId: crypto.randomUUID().replace(/-/g, ""),
    xSessionId: crypto.randomUUID(),
    audioId: null,
    duration: audioDurationSec(filePath),
    uploadedSlices: 0,
    uploadedSet: [],
  };
}

/** 会话是否仍对应当前文件(尺寸/修改时间/分片数三项全等)。 */
export function sessionMatches(session: LasrSessionState, fileSize: number, fileMtimeMs: number, sliceNum: number): boolean {
  return session.fileSize === fileSize && session.fileMtimeMs === fileMtimeMs && session.sliceNum === sliceNum;
}

/** 待传片号 = 全集 - 已完成(连续水位与集合两轨都算进已完成)。 */
export function pendingSliceIndices(session: LasrSessionState, sliceNum: number): number[] {
  const done = new Set(session.uploadedSet || []);
  for (let i = 0; i < (session.uploadedSlices || 0); i++) done.add(i);
  const pending: number[] = [];
  for (let i = 0; i < sliceNum; i++) if (!done.has(i)) pending.push(i);
  return pending;
}

/**
 * 分片上传:worker 池并发领片 + 单片指数退避重试 + 每片落盘续传。
 * 一片重试用尽即停领新片(已在途的跑完),已完成的片号已持久化,调用方可整链续传。
 */
export async function uploadAllSlices(opts: LasrOptions, filePath: string, session: LasrSessionState, cb: UploadCallbacks): Promise<void> {
  const pending = pendingSliceIndices(session, session.sliceNum);
  if (pending.length === 0) {
    cb.log("  分片已全部上传,跳过");
    cb.progress?.(100);
    return;
  }
  const conc = Math.max(1, Math.min(opts.uploadConcurrency || 1, pending.length));
  cb.log(`[2/5] /lasr/upload(待传 ${pending.length}/${session.sliceNum} 片,并发 ${conc})`);

  const boundary = "----vivo" + crypto.randomBytes(16).toString("hex");
  const encName = javaUrlEncode(session.fileName || filePath);
  const fd = fs.openSync(filePath, "r");
  const done = new Set(session.uploadedSet || []);
  for (let i = 0; i < (session.uploadedSlices || 0); i++) done.add(i);

  let next = 0;
  let failure: unknown = null;
  const commit = (sliceIndex: number) => {
    done.add(sliceIndex);
    let watermark = session.uploadedSlices || 0;
    while (done.has(watermark)) watermark++;
    session.uploadedSlices = watermark;
    session.uploadedSet = [...done].sort((a, b) => a - b);
    writeSession(filePath, session);
    cb.progress?.(Math.round((watermark / Math.max(1, session.sliceNum)) * 100));
  };

  const uploadSlice = async (sliceIndex: number): Promise<void> => {
    const offset = sliceIndex * opts.blockSizeBytes;
    const length = Math.min(opts.blockSizeBytes, session.fileSize - offset);
    const buf = Buffer.alloc(Math.max(0, length));
    let read = 0;
    while (read < length) {
      const r = fs.readSync(fd, buf, read, length - read, offset + read);
      if (r <= 0) break;
      read += r;
    }
    let lastErr: Error = new Error(`上传分片 ${sliceIndex} 未执行`);
    const retries = Math.max(0, opts.uploadRetries ?? 0);
    for (let attempt = 0; attempt <= retries; attempt++) {
      if (attempt > 0) {
        const wait = Math.min(15000, 1000 * 2 ** (attempt - 1));
        cb.log(`  分片 ${sliceIndex + 1} 重试 ${attempt}/${retries}(等 ${wait}ms): ${lastErr.message}`);
        await new Promise((r) => setTimeout(r, wait));
      }
      if (cb.isCancelled?.()) throw new CancelledError();
      try {
        const query = buildQuery(opts, String(Math.floor(Date.now() / 1000)), session.userId, {
          audioId: session.audioId ?? undefined,
          sliceIndex,
          sliceNum: session.sliceNum,
          xSessionId: session.xSessionId,
        });
        const body = multipartBody(boundary, encName, "application/octet-stream", buf);
        const resp = await doPost(opts, "/lasr/upload", query, body, `multipart/form-data; boundary=${boundary}`);
        const json = parseSliceResp(resp);
        if (json.code === 0 || json.code === 20005) {
          commit(sliceIndex);
          cb.log(`  分片 ${sliceIndex + 1}/${session.sliceNum} 完成(code=${json.code},连续水位 ${session.uploadedSlices})`);
          return;
        }
        lastErr = new Error(`上传分片 ${sliceIndex} 失败 code=${json.code} desc=${json.desc}`);
      } catch (e) {
        lastErr = e instanceof Error ? e : new Error(String(e)); // 网络异常/非 JSON 响应也进重试
      }
    }
    throw lastErr;
  };

  try {
    const workers = Array.from({ length: conc }, async () => {
      while (!failure) {
        if (cb.isCancelled?.()) {
          failure = new CancelledError();
          break;
        }
        const i = next++;
        if (i >= pending.length) break;
        try {
          await uploadSlice(pending[i]);
        } catch (e) {
          failure = e; // 一片失败即停领新片,已在途的片跑完;已完成片已落盘可续传
        }
      }
    });
    await Promise.all(workers);
    if (failure) throw failure;
    cb.log("  上传完成");
  } finally {
    try {
      fs.closeSync(fd);
    } catch {
      // 已关闭
    }
  }
}
