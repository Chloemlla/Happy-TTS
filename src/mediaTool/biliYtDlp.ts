// yt-dlp(B 站)批量下载引擎的 TypeScript 移植(与 bili-download.js 语义一致)。
// 去掉交互/CLI 位,提供 resolveItems(展开合集)+ downloadBatch(并发池)。
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  CancelledError,
  ensureDir,
  makeConsoleDecoder,
  runTool,
  runToolChecked,
} from "./runtime";
import type { BiliOptions } from "./types";

export interface BiliItem {
  url: string;
  playlistIndex: number | null;
  bvId: string;
}

export interface BiliBatchItemOutcome {
  ok: boolean;
  label: string;
  saved?: string;
  error?: string;
  cancelled?: boolean;
}

export interface BiliBatchResult {
  itemTotal: number;
  pending: number;
  skipped: number;
  results: BiliBatchItemOutcome[];
}

export interface BiliCallbacks {
  log?: (text: string) => void;
  /** 每完成一项回调(done/total) */
  progress?: (done: number, total: number) => void;
  isCancelled?: () => boolean;
}

export function bvIdOf(url: string): string {
  const m = url.match(/BV[0-9A-Za-z]+/);
  return m ? m[0] : url;
}

export function normalize(s: string): string {
  const t = (s || "").trim();
  return /^BV[0-9A-Za-z]{8,}$/.test(t) ? `https://www.bilibili.com/video/${t}` : t;
}

/** 是否“合集型”URL:这类 URL 即使不带序号也应该建「合集名/序号-标题」目录。 */
function isPlaylistUrl(url: string): boolean {
  return (
    /\/lists\/\d+/.test(url) ||
    /type=season/.test(url) ||
    /collectiondetail/.test(url) ||
    /medialist/.test(url) ||
    /favlist/.test(url) ||
    /\bseries\b/.test(url) ||
    /[?&]p=/.test(url)
  );
}

const PLAYLIST_TEMPLATE = "%(playlist_title)s/%(playlist_index)02d-%(title)s.%(ext)s";
const SINGLE_TEMPLATE = "%(title)s.%(ext)s";

function cookiesArgs(opts: BiliOptions): string[] {
  const cf = (opts.cookiesFile || "").trim();
  if (!cf || !fs.existsSync(cf)) return [];
  return ["--cookies", cf];
}

/** 合集/多分P 链接 → 逐集 { index, url }。flat-playlist 只抓页面不下载,快。失败返回空,由调用方整条处理。 */
export function expandPlaylist(opts: BiliOptions, url: string): Array<{ index: number; url: string }> {
  try {
    const out = runToolChecked(opts.ytDlpPath, [
      ...cookiesArgs(opts),
      "--flat-playlist",
      "--no-warnings",
      "--print",
      "%(playlist_index)s %(url)s",
      url,
    ]);
    const pairs: Array<{ index: number; url: string }> = [];
    for (const line of out.split(/\r?\n/)) {
      const m = line.match(/^(\d+)\s+(\S+)/);
      if (m) pairs.push({ index: parseInt(m[1], 10), url: m[2] });
    }
    if (pairs.length) return pairs;
  } catch {
    // 落入下方整条处理
  }
  return [];
}

/** 原始输入(URL/BV 号) → 去重后的逐集下载项。本地 .txt 列表文件亦支持(每行一项)。 */
export function resolveItems(opts: BiliOptions, rawInputs: string[]): BiliItem[] {
  const items: BiliItem[] = [];
  const seen = new Set<string>();
  const add = (raw: string) => {
    const t = (raw || "").trim();
    if (!t) return;
    if (fs.existsSync(t) && fs.statSync(t).isFile()) {
      for (const line of fs.readFileSync(t, "utf8").split(/\r?\n/)) add(line);
      return;
    }
    const u = normalize(t);
    if (!u) return;
    const pairs = expandPlaylist(opts, u);
    if (pairs.length) {
      const multiPart = new Set(pairs.map((p) => bvIdOf(p.url))).size === 1;
      for (const p of pairs) {
        const key = `${u}#${p.index}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const bv = bvIdOf(p.url);
        items.push({ url: u, playlistIndex: p.index, bvId: multiPart ? `${bv}_p${p.index}` : bv });
      }
    } else {
      if (seen.has(u)) return;
      seen.add(u);
      items.push({ url: u, playlistIndex: null, bvId: bvIdOf(u) });
    }
  };
  for (const a of rawInputs) add(a);
  return items;
}

// ---------------------------------------------------------------------------
// 断点续传状态(.bili-download.json,与脚本同路径同结构)
// 进程内串行锁防并发 job 同时读写同一状态文件。
// ---------------------------------------------------------------------------
interface CompletedEntry {
  saved: string | null;
  ts: number;
}
interface BiliState {
  version: number;
  completed: Record<string, CompletedEntry>;
}

let stateLock: Promise<void> = Promise.resolve();
function locked<T>(fn: () => T): Promise<T> {
  const p = stateLock.then(fn);
  stateLock = p.then(
    () => undefined,
    () => undefined,
  );
  return p;
}

function stateFilePath(opts: BiliOptions): string {
  return path.join(opts.downloadDir, ".bili-download.json");
}

function loadStateFile(opts: BiliOptions): BiliState {
  try {
    const obj = JSON.parse(fs.readFileSync(stateFilePath(opts), "utf8")) as BiliState;
    if (obj && obj.completed && typeof obj.completed === "object") return obj;
  } catch {
    // 无状态文件
  }
  return { version: 1, completed: {} };
}

function saveStateFile(opts: BiliOptions, state: BiliState): void {
  try {
    ensureDir(opts.downloadDir);
    fs.writeFileSync(stateFilePath(opts), JSON.stringify(state, null, 2), "utf8");
  } catch (e) {
    // 状态写失败不阻断下载(静默,进程内 completed 仍生效)
  }
}

/** 从磁盘已有 [BVxxx].mp3/.mp4 回填完成记录(断点续传兜底)。 */
function seedFromDisk(opts: BiliOptions, state: BiliState): number {
  let count = 0;
  const walk = (dir: string) => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(mp3|mp4)$/i.test(entry.name)) {
        const m = entry.name.match(/\[(BV[0-9A-Za-z]+(?:_p\d+)?)\]/);
        if (m && !state.completed[m[1]]) {
          state.completed[m[1]] = { saved: full, ts: Date.now() };
          count++;
        }
      }
    }
  };
  walk(opts.downloadDir);
  if (count) saveStateFile(opts, state);
  return count;
}

// ---------------------------------------------------------------------------
// 单项下载
// ---------------------------------------------------------------------------
function buildArgs(opts: BiliOptions, item: BiliItem, videoMode: boolean): string[] {
  const a = [
    ...cookiesArgs(opts),
    "--concurrent-fragments",
    "4",
    "--newline",
    "--retries",
    "10",
    "--fragment-retries",
    "10",
  ];
  const useFolder =
    !/favlist/.test(item.url) && (item.playlistIndex !== null || isPlaylistUrl(item.url));
  a.push(
    "--paths",
    opts.downloadDir,
    "--output",
    useFolder ? PLAYLIST_TEMPLATE : SINGLE_TEMPLATE,
    "--replace-in-metadata",
    "title",
    "^.+? p\\d+ ",
    "",
  );
  if (videoMode) {
    a.push("--merge-output-format", "mp4");
  } else {
    a.push("--extract-audio", "--audio-format", opts.audioFormat || "mp3", "--audio-quality", "0");
  }
  if (item.playlistIndex !== null) a.push("--playlist-items", String(item.playlistIndex));
  a.push(item.url);
  return a;
}

async function downloadItem(
  opts: BiliOptions,
  item: BiliItem,
  videoMode: boolean,
  cb: BiliCallbacks,
): Promise<BiliBatchItemOutcome> {
  const label = item.playlistIndex !== null ? `${item.url}(第${item.playlistIndex}集)` : item.url;
  return new Promise<BiliBatchItemOutcome>((resolve) => {
    const args = buildArgs(opts, item, videoMode);
    cb.log?.(`下载 > ${label}`);
    cb.log?.(`CMD> ${opts.ytDlpPath} ${args.join(" ")}`);
    let proc;
    try {
      proc = spawn(opts.ytDlpPath, args, { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    } catch (e) {
      resolve({ ok: false, label, error: `无法启动 yt-dlp: ${(e as Error).message}` });
      return;
    }

    const stdoutDec = makeConsoleDecoder();
    const stderrDec = makeConsoleDecoder();
    let lineBuf = "";
    let stderrBuf = "";
    let saved: string | null = null;
    let settled = false;
    let stderrTail = "";

    const drainStdout = () => {
      let idx: number;
      while ((idx = lineBuf.indexOf("\n")) !== -1) {
        const line = lineBuf.slice(0, idx);
        lineBuf = lineBuf.slice(idx + 1);
        const clean = line.replace(/\r$/, "");
        const m =
          clean.match(/Destination: (.+)$/) ||
          clean.match(/^\[download\] (.+\.\w+) has already been downloaded$/) ||
          clean.match(/Not converting audio (.+); file is already in target format/);
        if (m) saved = m[1];
        cb.log?.(`${label} ${clean}`.replace(/\s+$/, ""));
      }
    };

    proc.stdout.on("data", (d: Buffer) => {
      lineBuf += stdoutDec.decode(d, { stream: true });
      drainStdout();
    });
    proc.stderr.on("data", (d: Buffer) => {
      stderrTail = (stderrTail + stderrDec.decode(d, { stream: true })).slice(-2000);
    });
    proc.on("error", (err) => {
      if (settled) return;
      settled = true;
      stopKiller();
      resolve({ ok: false, label, error: err.message });
    });
    proc.on("close", (code) => {
      stopKiller();
      lineBuf += stdoutDec.decode();
      drainStdout();
      stderrBuf = stderrTail + stderrDec.decode();
      if (settled) return;
      settled = true;
      if (code === 0) {
        resolve({ ok: true, label, saved: saved ?? undefined });
      } else {
        const tail = stderrBuf.trim().split(/\r?\n/).slice(-3).join(" | ");
        resolve({
          ok: false,
          label,
          error: `yt-dlp 退出码=${code}${tail ? `: ${tail.slice(0, 300)}` : ""}`,
        });
      }
    });

    // 取消：500ms 轮询 isCancelled,命中即杀掉当前子进程
    const killer = setInterval(() => {
      if (cb.isCancelled && cb.isCancelled()) {
        stopKiller();
        if (!settled) {
          settled = true;
          try {
            proc.kill();
          } catch {
            // 已退出
          }
          resolve({ ok: false, label, error: "已取消", cancelled: true });
        }
      }
    }, 500);
    killer.unref?.();
    function stopKiller() {
      clearInterval(killer);
    }
  });
}

// ---------------------------------------------------------------------------
// 批量入口
// ---------------------------------------------------------------------------
export async function downloadBatch(
  opts: BiliOptions,
  rawInputs: string[],
  videoMode: boolean,
  cb: BiliCallbacks = {},
): Promise<BiliBatchResult> {
  ensureDir(opts.downloadDir);
  const log = (m: string) => cb.log?.(m);
  log(`模式: ${videoMode ? "视频(合并 mp4)" : `音频(仅${opts.audioFormat || "mp3"})`} | 并发: ${opts.concurrency}`);
  if (!fs.existsSync(opts.ytDlpPath)) {
    throw new Error(`yt-dlp 不存在: ${opts.ytDlpPath}(设置页可改路径)`);
  }
  const raw = (rawInputs || []).filter((x) => String(x).trim());
  if (raw.length === 0) throw new Error("没有输入任何下载项");
  const items = resolveItems(opts, raw);
  if (items.length === 0) throw new Error("没有解析出任何可下载项");

  return locked(async () => {
    const state = loadStateFile(opts);
    const seeded = seedFromDisk(opts, state);
    if (seeded) log(`已从磁盘回填 ${seeded} 条完成记录`);
    const pending = items.filter((it) => !state.completed[it.bvId]);
    const skipped = items.length - pending.length;
    if (skipped) log(`跳过已完成 ${skipped} 项`);
    if (pending.length === 0) {
      log("全部已完成,无需下载");
      return { itemTotal: items.length, pending: 0, skipped, results: [] };
    }
    log(`待处理 ${pending.length} 项(完成一项立刻领下一项)`);

    const results: Array<BiliBatchItemOutcome | undefined> = new Array(pending.length);
    const limit = Math.max(1, Math.min(opts.concurrency || 2, pending.length));
    let next = 0;
    let cancelled = false;
    const workers = Array.from({ length: limit }, async () => {
      while (!cancelled) {
        const i = next++;
        if (i >= pending.length) break;
        const outcome = await downloadItem(opts, pending[i], videoMode, cb);
        results[i] = outcome;
        if (outcome.cancelled) {
          cancelled = true;
          break;
        }
        if (outcome.ok && outcome.saved) {
          state.completed[pending[i].bvId] = { saved: outcome.saved, ts: Date.now() };
        }
        cb.progress?.(
          results.filter((r) => r !== undefined).length,
          pending.length,
        );
      }
    });
    await Promise.all(workers);
    // 工作池结束后一次性落盘:并发 writeFileSync 会互相覆盖丢条目,
    // 中途崩溃由 seedFromDisk 从磁盘兜底回填。
    saveStateFile(opts, state);

    if (cancelled) throw new CancelledError();

    const failures = results.filter((r) => r && !r.ok);
    if (failures.length) {
      log(`失败 ${failures.length} 项:`);
      for (const f of failures) log(`  ✘ ${f?.label}: ${f?.error}`);
    }
    return {
      itemTotal: items.length,
      pending: pending.length,
      skipped,
      results: results.filter((r) => r !== undefined) as BiliBatchItemOutcome[],
    };
  });
}

/** yt-dlp 是否可用:返回版本号(不可用抛错)。用于健康检查。 */
export function probeYtDlp(opts: BiliOptions): { version: string } {
  const out = runTool(opts.ytDlpPath, ["--version"], { maxBuffer: 1024 * 1024 });
  if (out.status !== 0) {
    throw new Error(`yt-dlp 不可用: ${out.stderr || out.stdout || "无法启动"}`);
  }
  return { version: out.stdout.trim() || String(out.status) };
}

/** 生成 jobId。 */
export function genJobId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}${crypto.randomBytes(3).toString("hex")}`;
}
