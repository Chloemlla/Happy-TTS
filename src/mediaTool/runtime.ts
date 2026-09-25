import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const isWindows = process.platform === "win32";

/** 音频扩展名白名单(vivo LASR 一般按整段音频处理,视频容器 mp4/m4a 亦可)。 */
export const AUDIO_EXTS = new Set([
  ".m4a", ".mp3", ".wav", ".aac", ".amr", ".flac", ".mp4",
  ".ogg", ".opus", ".m4b", ".3gp", ".wma", ".mka", ".ape", ".caf",
]);

export function isAudioFile(p: string): boolean {
  return AUDIO_EXTS.has(path.extname(p).toLowerCase());
}

/** yt-dlp 落盘/可预览结果里可能出现的扩展名(用于文件浏览高亮)。 */
export const MEDIA_EXTS = new Set([...AUDIO_EXTS, ".mkv", ".webm", ".ts"]);

/** 任务被取消的哨兵异常:Job runner 捕获后把状态标成 cancelled(而非 failed)。 */
export class CancelledError extends Error {
  constructor(message = "任务已取消") {
    super(message);
    this.name = "MediaToolCancelled";
  }
}

/** Windows 控制台代码页探测(yt-dlp 输出可能是 GBK)。reg query 失败回退 utf8。 */
let acpEncoding: string | null | undefined;
function resolveAcpEncoding(): string | null {
  if (acpEncoding !== undefined) return acpEncoding;
  if (!isWindows) {
    acpEncoding = null;
    return acpEncoding;
  }
  try {
    const out = execFileSync(
      "reg",
      ["query", "HKLM\\SYSTEM\\CurrentControlSet\\Control\\Nls\\CodePage", "/v", "ACP"],
      { encoding: "utf8", windowsHide: true, timeout: 5000 },
    );
    const m = /ACP\s+REG_SZ\s+(\d+)/i.exec(out);
    const code = m ? parseInt(m[1], 10) : 0;
    acpEncoding = code === 936 ? "gbk" : code === 65001 ? "utf8" : null;
  } catch {
    acpEncoding = null;
  }
  return acpEncoding;
}

/** 把外部进程输出的原始字节流解码成字符串(Windows 按控制台代码页,其余按 utf8)。 */
export function decodeSpawnBuffer(buf: Buffer): string {
  if (buf.length === 0) return "";
  const enc = resolveAcpEncoding();
  if (enc && enc !== "utf8") {
    try {
      return new TextDecoder(enc).decode(buf);
    } catch {
      // TextDecoder 不认识该编码名时退回手工 iconv 式映射(gbk 由 ICU 提供)
    }
  }
  return buf.toString("utf8");
}

export interface SpawnResult {
  status: number | null;
  stdout: string;
  stderr: string;
}

export function runTool(bin: string, args: string[], opts: { cwd?: string; maxBuffer?: number } = {}): SpawnResult {
  // spawnSync("") 抛 ERR_INVALID_ARG_VALUE(The argument 'file' cannot be empty),
  // 会把"未配置可执行路径"(如空的 MEDIA_TOOL_YTDLP)变成健康检查整个 500;
  // 在此归一成"退出码 -1 + 说明",与 ensureDir 的空值兜底同口径。
  if (!bin || !bin.trim()) {
    return { status: -1, stdout: "", stderr: "可执行文件路径为空,无法启动外部程序(请在设置页填写路径)" };
  }
  const r = spawnSync(bin, args, {
    cwd: opts.cwd,
    maxBuffer: opts.maxBuffer ?? 32 * 1024 * 1024,
    encoding: "buffer",
    windowsHide: true,
  });
  return {
    status: r.status,
    stdout: decodeSpawnBuffer(r.stdout ?? Buffer.alloc(0)),
    stderr: decodeSpawnBuffer(r.stderr ?? Buffer.alloc(0)),
  };
}

/** spawnSync 包裹:成功(stdout 去尾空白)否则抛错(带 stderr 摘要)。 */
export function runToolChecked(bin: string, args: string[], opts: { cwd?: string } = {}): string {
  const r = runTool(bin, args, opts);
  if (r.status !== 0) {
    throw new Error(`${path.basename(bin)} ${args[0] ?? ""} 退出码=${r.status}: ${(r.stderr || r.stdout).slice(0, 400)}`);
  }
  return r.stdout.trim();
}

/**
 * yt-dlp 可执行路径:未配置时回退到裸命令名 "yt-dlp",由 spawn 自行走 PATH 解析。
 *
 * 设置页与 .env.example 都承诺「留空自动探测 PATH」,但配置有三层(启动默认 / Mongo 快照 /
 * 显式环境变量),任何一层给出空串都会原样落到 spawn 上——所以统一在使用点归一,
 * 而不是只改其中一层的默认值。
 */
export function resolveYtDlpBin(configured: string): string {
  return (configured || "").trim() || "yt-dlp";
}

/** 是否为裸命令名(不含路径分隔符)。裸命令名交给 PATH 解析,不能用 existsSync 判存在。 */
export function isBareCommand(bin: string): boolean {
  return !bin.includes("/") && !bin.includes("\\");
}

export function ensureDir(dir: string): void {
  if (!dir) return;
  fs.mkdirSync(dir, { recursive: true });
}

export function statOrNull(p: string): fs.Stats | null {
  try {
    // codeql[js/path-injection] statOrNull 的每个调用点要么传 multer 写入 inbox 的临时文件路径,要么已先经 relInside/relInsideRoot(root,·) 守界;整个 media-tool 子树是 admin 门内(requireAdmin + mount adminLimiter),自定义守界函数 CodeQL 不可见故在此共享 sink 上报。
    return fs.statSync(p);
  } catch {
    return null;
  }
}

/** 检查 root 是否完全包含 target:在 root 内返回相对 posix 路径,否则 null(防目录穿越)。 */
export function relInside(root: string, target: string): string | null {
  const rel = path.relative(path.resolve(root), path.resolve(target));
  if (rel === "") return "";
  if (rel.startsWith("..") || path.isAbsolute(rel)) return null;
  return rel.split(path.sep).join("/");
}

/**
 * 把客户端传的相对路径归一并锁定在 root 内:越界/空/绝对 → null。
 * 返回的是可直接 path.join(root, rel) 的 posix 相对路径。
 */
export function relInsideRoot(root: string, value: string): string | null {
  const rel = path.posix.normalize((value || "").replace(/\\/g, "/")).replace(/^\/+/, "");
  if (!rel || rel === "." || rel.startsWith("../")) return null;
  const abs = path.resolve(root, rel);
  return relInside(root, abs) === rel ? rel : null;
}

/** 上传文件名清洗:修多编码转换 + 去掉路径分隔/控制字符,限长。 */
export function sanitizeFileName(name: string, fallback = "upload"): string {
  const cleaned = Buffer.from(name || "", "latin1").toString("utf8").replace(/[\\/:*?"<>|\x00-\x1f]/g, "_").trim();
  return (cleaned || fallback).slice(0, 180);
}

/**
 * 用户专属子目录名:可读前缀 + id 摘要。
 * 先洗掉非安全字符再拼 sha1 前 8 位,保证不同用户不会因清洗碰撞到同一目录。
 */
export function userScopedDirName(userId: string): string {
  const safe = String(userId || "").replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 48) || "anon";
  const digest = createHash("sha1").update(String(userId || "")).digest("hex").slice(0, 8);
  return `${safe}-${digest}`;
}

/** 音频时长(秒):优先 ffprobe,退回解析 m4a mvhd,再退回 0。ffprobePath 为空时直接尝试 ffprobe。 */
export function audioDurationSec(filePath: string, ffprobePath?: string): number {
  const bin = ffprobePath || "ffprobe";
  try {
    const r = runTool(bin, ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", filePath]);
    const v = parseFloat(r.stdout.trim());
    if (r.status === 0 && Number.isFinite(v) && v > 0) return Math.round(v);
  } catch {
    // fallthrough
  }
  try {
    const buf = Buffer.alloc(1024 * 1024);
    const fd = fs.openSync(filePath, "r");
    const n = fs.readSync(fd, buf, 0, buf.length, 0);
    fs.closeSync(fd);
    const idx = buf.indexOf(Buffer.from("mvhd"), 0, n);
    if (idx >= 0) {
      const ver = buf[idx + 4];
      let timescale: number;
      let duration: number;
      if (ver === 1) {
        timescale = buf.readUInt32BE(idx + 24);
        duration = Number(buf.readBigUInt64BE(idx + 28));
      } else {
        timescale = buf.readUInt32BE(idx + 16);
        duration = buf.readUInt32BE(idx + 20);
      }
      if (timescale > 0) return Math.round(duration / timescale);
    }
  } catch {
    // fallthrough
  }
  return 0;
}

export function fmtMs(v: number | null | undefined): string {
  if (v == null) return "?";
  const s = Math.floor(v / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

/** 时间线文本用的时钟:超过一小时补时位,否则 mm:ss。 */
export function fmtClock(v: number | null | undefined): string {
  if (v == null) return "?";
  const total = Math.floor(Math.max(0, v) / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const p = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${p(h)}:${p(m)}:${p(s)}` : `${p(m)}:${p(s)}`;
}

export function fmtSrt(v: number | null | undefined): string {
  if (v == null) return "00:00:00,000";
  const ms = Math.floor(v);
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${p(h)}:${p(m)}:${p(s)},${p(ms % 1000, 3)}`;
}

/** 外部子进程 stdout 的增量解码器(配合 { stream: true } 消费)。Windows 用系统 ANSI 代码页,其余 utf-8。 */
export function makeConsoleDecoder(): TextDecoder {
  const enc = resolveAcpEncoding();
  return new TextDecoder(enc ?? "utf-8");
}

/** 工作根目录解析:空→<cwd>/data/media-tool;相对→基于 cwd。HTTP 文件浏览/上传/落盘都限制在该根内。 */
export function resolveRootDir(workDir: string): string {
  const raw = (workDir || "").trim();
  const resolved = raw ? (path.isAbsolute(raw) ? raw : path.resolve(process.cwd(), raw)) : path.resolve(process.cwd(), "data", "media-tool");
  return path.normalize(resolved);
}

/** 临时目录(浏览器上传缓冲落点,随用随删)。 */
export function tmpRoot(): string {
  return path.join(os.tmpdir(), "synapse-media-tool");
}
