// 媒体工具(media-tool)共享类型与默认配置。
// 该模块在 Synapse 内置(server 态)与独立本地入口(standalone 态)两套运行环境复用,
// 因此不允许 import 任何 mongoose / 主应用路由 / logger,只依赖 Node 内置模块。

/** vivo LASR 录音转写接口参数(与逆向出的 SDK 默认值一致)。 */
export interface LasrOptions {
  serverUrl: string;
  appId: string;
  appKey: string;
  engineType: string;
  packageName: string;
  language: string;
  scene: string;
  saveSrt: boolean;
  // 设备参数(服务端一般只校验签名,参数值不强匹配)
  brand: string;
  model: string;
  product: string;
  rom: string;
  systemVersion: string;
  androidVersion: string;
  clientVersion: string;
  sdkVersion: string;
  netType: string;
  vaid: string;
  did: string;
  // vivo 账号身份(留空走未登录路径)
  token: string;
  openid: string;
  blockSizeBytes: number;
  maxFileSizeBytes: number;
  concurrency: number;
}

/** yt-dlp(哔哩哔哩)下载参数。 */
export interface BiliOptions {
  ytDlpPath: string;
  cookiesFile: string;
  downloadDir: string;
  audioFormat: string;
  concurrency: number;
  /** false=只抽音频(--extract-audio) true=保留完整视频 */
  videoMode: boolean;
  /** 下载完成后是否自动套接 vivo 转写 */
  transcribeAfter: boolean;
}

export interface MediaToolSettings {
  enabled: boolean;
  /** 文件浏览/上传/转写的工作根目录(相对路径解析到该目录内,防目录穿越) */
  workDir: string;
  maxUploadBytes: number;
  maxJobLogLines: number;
  lasr: LasrOptions;
  bili: BiliOptions;
}

export type MediaJobKind = "bili-download" | "transcribe";
export type MediaJobStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled";
export type MediaJobStage =
  | "queued"
  | "prepare"
  | "create"
  | "upload"
  | "run"
  | "progress"
  | "result"
  | "download"
  | "transcribe"
  | "finalize";

export interface MediaJobLogLine {
  /** epoch ms */
  t: number;
  text: string;
}

export interface MediaJobInput {
  type: "urls" | "paths" | "uploads";
  values: string[];
}

export interface MediaJobParams {
  /** bili: audio|video; transcribe 忽略 */
  mode?: "audio" | "video";
  /** bili: 覆盖全局音频格式 */
  audioFormat?: string;
  /** bili: 是否下载完自动转写 */
  transcribeAfter?: boolean;
  /** transcribe: 是否额外输出 .srt */
  saveSrt?: boolean;
  urls?: string[];
}

export interface MediaJobFileItem {
  ok: boolean;
  /** 入参展示名(URL 或文件名) */
  label: string;
  /** 落盘文件(相对 workDir 或绝对路径),失败时缺省 */
  file?: string;
  /** 转写文本文件(相对 workDir 或绝对路径) */
  txtFile?: string;
  segments?: number;
  error?: string;
}

export interface MediaJobResult {
  summary: string;
  files: string[];
  items: MediaJobFileItem[];
}

export interface MediaJobRecord {
  id: string;
  kind: MediaJobKind;
  /** 运行环境标识:server=内置 standalone=独立本地入口 */
  mode: string;
  createdBy: string;
  createdAt: number;
  startedAt?: number;
  finishedAt?: number;
  status: MediaJobStatus;
  stage: MediaJobStage;
  /** 0..100 */
  progress: number;
  input: MediaJobInput;
  params?: MediaJobParams;
  logs: MediaJobLogLine[];
  error?: string;
  result?: MediaJobResult;
  cancelRequested: boolean;
}

/** 独立本地入口的鉴权:无 MEDIA_TOOL_KEY/JWT_SECRET 且只绑 127.0.0.1 时允许全部(用户侧便利壳) */
export interface StandaloneAuth {
  kind: "none" | "key" | "jwt";
  /** key 明文(仅 kind=key) */
  secret: string;
}

export const DEFAULT_LASR_OPTS: LasrOptions = {
  serverUrl: "https://asr-v2.vivo.com.cn",
  appId: "8735273056",
  appKey: "NIhyMZRWZUGdDnrW",
  engineType: "fileasrrecorder",
  packageName: "com.android.bbksoundrecorder",
  language: "zh-Hans-CN",
  scene: "user",
  saveSrt: false,
  brand: "vivo",
  model: "V2309A",
  product: "PD2243",
  rom: "14",
  systemVersion: "14",
  androidVersion: "13",
  clientVersion: "1.7.3.9",
  sdkVersion: "5.2.5.66",
  netType: "1",
  vaid: "00000000000000",
  did: "",
  token: "",
  openid: "",
  blockSizeBytes: 5 * 1024 * 1024,
  maxFileSizeBytes: 500 * 1024 * 1024,
  concurrency: 2,
};

export function defaultMediaToolSettings(env: NodeJS.ProcessEnv = process.env): MediaToolSettings {
  const defaultLasr = { ...DEFAULT_LASR_OPTS };
  const lasr: LasrOptions = {
    ...defaultLasr,
    serverUrl: env.MEDIA_TOOL_LASR_URL || defaultLasr.serverUrl,
    appId: env.MEDIA_TOOL_APP_ID || defaultLasr.appId,
    appKey: env.MEDIA_TOOL_APP_KEY || defaultLasr.appKey,
    language: env.MEDIA_TOOL_LANG || defaultLasr.language,
    scene: env.MEDIA_TOOL_SCENE || defaultLasr.scene,
    token: env.MEDIA_TOOL_VIVO_TOKEN || "",
    openid: env.MEDIA_TOOL_VIVO_OPENID || "",
    saveSrt: env.MEDIA_TOOL_SAVE_SRT === "1",
    concurrency: Math.max(1, parseInt(env.MEDIA_TOOL_LASR_CONCURRENCY || String(defaultLasr.concurrency), 10) || defaultLasr.concurrency),
  };
  const workDir = env.MEDIA_TOOL_WORK_DIR || "";
  const downloadDir = env.MEDIA_TOOL_DOWNLOAD_DIR || workDir;
  const bili: BiliOptions = {
    ytDlpPath: env.MEDIA_TOOL_YTDLP || "",
    cookiesFile: env.MEDIA_TOOL_COOKIES || "",
    downloadDir,
    audioFormat: env.MEDIA_TOOL_AUDIO_FORMAT || "mp3",
    concurrency: Math.max(1, parseInt(env.MEDIA_TOOL_DL_CONCURRENCY || "2", 10) || 2),
    videoMode: env.MEDIA_TOOL_VIDEO_MODE === "1",
    transcribeAfter: env.MEDIA_TOOL_TRANSCRIBE_AFTER === "1",
  };
  return {
    enabled: env.MEDIA_TOOL_DISABLED !== "1",
    workDir,
    maxUploadBytes: Math.max(1, parseInt(env.MEDIA_TOOL_MAX_UPLOAD_MB || "200", 10) || 200) * 1024 * 1024,
    maxJobLogLines: 600,
    lasr,
    bili,
  };
}
