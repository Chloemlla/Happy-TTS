// 录音转写引擎主流程:建会话 → 分片上传 → 启动识别 → 轮询进度 → 取分段结果并落盘。
//
// 传输与签名细节集中在 lasrTransport.ts,续传与分片并发在 lasrSession.ts;
// 对外文案只讲能力,不描述这条链路的来源。
import fs from "node:fs";
import path from "node:path";
import {
  clearSession,
  createSession,
  readSession,
  sessionMatches,
  uploadAllSlices,
  writeSession,
  type LasrSessionState,
} from "./lasrSession";
import { buildQuery, doPost, parseResp } from "./lasrTransport";
import { CancelledError, audioDurationSec, ensureDir, fmtClock, fmtSrt } from "./runtime";
import type { LasrOptions, MediaJobStage, TranscribeOutput } from "./types";
import { normalizeTranscribeOutputs } from "./types";

export interface LasrSegment {
  bg: number;
  ed: number;
  onebest?: string;
  speaker?: string;
}

export interface LasrOutcome {
  filePath: string;
  segments: LasrSegment[];
  /** 无时间线纯文本(段落直接相接) */
  plainText: string;
  /** 带时间线文本(每行 [mm:ss] / [hh:mm:ss] 前缀) */
  timedText: string;
  /** 实际写出的产物路径,未选中的格式为 null */
  txtPath: string | null;
  timedPath: string | null;
  srtPath: string | null;
  /** 分段 JSON:始终写出,segments 出参与续读都靠它 */
  jsonPath: string;
  outputs: TranscribeOutput[];
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
// 产物落盘
// ---------------------------------------------------------------------------

/** 时间线文本:一行一段,前缀 [时间] 或 [起 -> 止],可选说话人标记。 */
export function buildTimedText(segments: LasrSegment[], range = true): string {
  return segments
    .map((s) => {
      const speaker = s.speaker ? `（说话人${s.speaker}）` : "";
      const stamp = range ? `[${fmtClock(s.bg)} -> ${fmtClock(s.ed)}]` : `[${fmtClock(s.bg)}]`;
      return `${stamp}${speaker}${s.onebest || ""}`;
    })
    .join("\n");
}

export function buildSrt(segments: LasrSegment[]): string {
  return segments
    .map((s, i) => {
      const speaker = s.speaker ? `（说话人${s.speaker}）` : "";
      return `${i + 1}\n${fmtSrt(s.bg)} --> ${fmtSrt(s.ed)}\n${speaker}${s.onebest || ""}\n`;
    })
    .join("\n");
}

/** 写所选产物;`.json`(分段)恒写,API 的 segments 出参与后续复读都依赖它。 */
export function writeOutputs(
  filePath: string,
  segments: LasrSegment[],
  outputs: TranscribeOutput[],
  durationSec: number,
): { txtPath: string | null; timedPath: string | null; srtPath: string | null; jsonPath: string; plainText: string; timedText: string } {
  const base = filePath.replace(/\.[^./\\]+$/, "");
  const plainText = segments.map((s) => s.onebest || "").join("");
  const timedText = buildTimedText(segments);
  const want = new Set(outputs);

  const txtPath = want.has("plain") ? base + ".txt" : null;
  const timedPath = want.has("timed") ? base + ".timed.txt" : null;
  const srtPath = want.has("srt") ? base + ".srt" : null;
  const jsonPath = base + ".json";

  if (txtPath) fs.writeFileSync(txtPath, plainText, "utf8");
  if (timedPath) fs.writeFileSync(timedPath, timedText, "utf8");
  if (srtPath) fs.writeFileSync(srtPath, buildSrt(segments), "utf8");
  fs.writeFileSync(
    jsonPath,
    JSON.stringify({ version: 1, durationSec, segments, createdAt: Date.now() }, null, 2),
    "utf8",
  );
  return { txtPath, timedPath, srtPath, jsonPath, plainText, timedText };
}

/** 读回分段(供 API 出参);文件缺失/损坏返回 null。 */
export function readSegments(jsonPath: string): LasrSegment[] | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(jsonPath, "utf8")) as { segments?: unknown };
    if (!Array.isArray(parsed.segments)) return null;
    return parsed.segments.filter(
      (s): s is LasrSegment => Boolean(s) && typeof (s as LasrSegment).onebest === "string",
    );
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// 单文件主流程
// ---------------------------------------------------------------------------
interface FileMeta {
  fileSize: number;
  fileMtimeMs: number;
  sliceNum: number;
  fileName: string;
}

function statMeta(opts: LasrOptions, filePath: string): FileMeta {
  const stat = fs.statSync(filePath);
  if (stat.size === 0 || stat.size > opts.maxFileSizeBytes) {
    throw new Error(`文件大小非法: ${stat.size} 字节(需 >0 且 <=${opts.maxFileSizeBytes})`);
  }
  return {
    fileSize: stat.size,
    fileMtimeMs: Math.floor(stat.mtimeMs),
    sliceNum: Math.ceil(stat.size / opts.blockSizeBytes),
    fileName: path.basename(filePath),
  };
}

async function processFile(
  opts: LasrOptions,
  filePath: string,
  meta: FileMeta,
  resumed: LasrSessionState | null,
  cb: LasrCallbacks,
): Promise<LasrOutcome> {
  const log = (m: string) => cb.log?.(m);
  throwIfCancelled(cb);

  let session = resumed;
  if (!session) {
    session = createSession(filePath, meta);
    log(`文件: ${meta.fileName}`);
    log(`大小: ${meta.fileSize} 字节, 分片数: ${meta.sliceNum}, 时长: ${session.duration}s`);

    // 1) create
    log("[1/5] /lasr/create");
    cb.progress?.("create", 3);
    const createQuery = buildQuery(opts, String(Math.floor(Date.now() / 1000)), session.userId);
    const createBody = JSON.stringify({
      "x-sessionId": session.xSessionId,
      slice_num: meta.sliceNum,
      audio_type: "auto",
      scene: opts.scene,
    });
    const created = parseResp(await doPost(opts, "/lasr/create", createQuery, createBody, "application/json; charset=utf-8"));
    session.audioId = typeof created.data.audio_id === "string" ? created.data.audio_id : null;
    if (!session.audioId) throw new Error("create 未返回 audio_id");
    log(`  audio_id = ${session.audioId}`);
    if (opts.resumeEnabled) writeSession(filePath, session);
  } else {
    if (session.duration == null || session.duration === 0) session.duration = audioDurationSec(filePath);
    log(`[续传] 复用 audio_id=${session.audioId},从分片 ${(session.uploadedSlices || 0) + 1}/${meta.sliceNum} 继续(时长: ${session.duration}s)`);
    cb.progress?.("upload", 8);
  }

  // 2) upload(分片并发 + 单片重试 + 每片落盘续传)
  await uploadAllSlices(opts, filePath, session, {
    log,
    progress: (pct) => cb.progress?.("upload", 8 + Math.round(pct * 0.32)),
    isCancelled: cb.isCancelled,
  });

  const audioId = session.audioId as string;

  // 3) run
  throwIfCancelled(cb);
  log("[3/5] /lasr/run");
  cb.progress?.("run", 42);
  const runQuery = buildQuery(opts, String(Math.floor(Date.now() / 1000)), session.userId);
  const runBody = JSON.stringify({
    audio_id: audioId,
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
  const outputs = normalizeTranscribeOutputs(opts.outputs);

  ensureDir(path.dirname(filePath));
  const saved = writeOutputs(filePath, segments, outputs, session.duration);
  log(`已保存(${segments.length} 段)→ ${saved.txtPath ?? saved.jsonPath}`);
  if (saved.timedPath) log(`已保存(带时间线)→ ${saved.timedPath}`);
  if (saved.srtPath) log(`已保存(字幕)→ ${saved.srtPath}`);
  cb.progress?.("result", 100);

  return {
    filePath,
    segments,
    plainText: saved.plainText,
    timedText: saved.timedText,
    txtPath: saved.txtPath,
    timedPath: saved.timedPath,
    srtPath: saved.srtPath,
    jsonPath: saved.jsonPath,
    outputs,
    durationSec: session.duration,
  };
}

/**
 * 转写单个音频文件。
 * 续传开启时优先复用 sidecar 会话;续传失败即清缓存整链重跑。
 * 取消抛 CancelledError,不动 sidecar(下次接着传)。
 */
export async function transcribeAudioFile(
  opts: LasrOptions,
  filePath: string,
  cb: LasrCallbacks = {},
): Promise<LasrOutcome> {
  const resolved = path.resolve(filePath);
  const meta = statMeta(opts, resolved);
  let resumed = opts.resumeEnabled ? readSession(resolved) : null;
  if (resumed && !sessionMatches(resumed, meta.fileSize, meta.fileMtimeMs, meta.sliceNum)) {
    cb.log?.("续传缓存与文件不一致,作废重来");
    clearSession(resolved);
    resumed = null;
  }

  try {
    const outcome = await processFile(opts, resolved, meta, resumed, cb);
    clearSession(resolved);
    return outcome;
  } catch (e) {
    if (e instanceof CancelledError) throw e;
    if (resumed) {
      cb.log?.(`续传失败(${(e as Error).message}),清除缓存完整重跑`);
      clearSession(resolved);
      const outcome = await processFile(opts, resolved, meta, null, cb);
      clearSession(resolved);
      return outcome;
    }
    // 网络抖动常见:会话建好但中途断连,整链重跑一次
    cb.log?.(`流程中断(${(e as Error).message}),整体重试一次`);
    return processFile(opts, resolved, meta, null, cb);
  }
}
