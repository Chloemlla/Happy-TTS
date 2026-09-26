// 媒体工具(media-tool)共享类型与默认配置。
// 该模块在 Synapse 内置(server 态)与独立本地入口(standalone 态)两套运行环境复用,
// 因此不允许 import 任何 mongoose / 主应用路由 / logger,只依赖 Node 内置模块。

/** 转写服务接口参数(默认值即平台内置配置)。 */
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

  /** 单文件内部并发上传的分片数(1 = 逐片串行) */
  uploadConcurrency: number;
  /** 单个分片的上传重试次数(指数退避),用于吞掉 10105 这类上游瞬时失败 */
  uploadRetries: number;
  /** 断点续传:会话与已传分片写入 <音频>.transcribe.json,中断后从缺口继续 */
  resumeEnabled: boolean;
  /** 默认转写产物(单任务可覆盖);空数组等同 ["plain"] */
  outputs: TranscribeOutput[];
}

/** 用户态「语音转文本」页面的限额(普通登录用户可用,与 admin 媒体工具共引擎)。 */
export interface TranscribeUserSettings {
  /** 关闭后用户页提交任务会被拒,管理端仍可用 */
  enabled: boolean;
  /** 单个任务最多几个音频文件 */
  maxFilesPerJob: number;
  /** 每个用户同时在排队/运行的任务上限 */
  maxActiveJobs: number;
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
  user: TranscribeUserSettings;
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

/** 任务归属:admin=媒体工具管理端,user=语音转文本用户页(按 ownerId 隔离)。 */
export type MediaJobScope = "admin" | "user";

export interface MediaJobParams {
  /** bili: audio|video; transcribe 忽略 */
  mode?: "audio" | "video";
  /** bili: 覆盖全局音频格式 */
  audioFormat?: string;
  /** bili: 是否下载完自动转写 */
  transcribeAfter?: boolean;
  /** transcribe: 是否额外输出 .srt(旧字段,等价于 outputs 追加 "srt") */
  saveSrt?: boolean;
  /** transcribe: 产物格式(优先级高于 saveSrt) */
  outputs?: TranscribeOutput[];
  urls?: string[];
}

export interface MediaJobFileItem {
  ok: boolean;
  /** 入参展示名(URL 或文件名) */
  label: string;
  /** 落盘文件(相对 workDir 或绝对路径),失败时缺省 */
  file?: string;
  /** 纯文本转写文件(相对 workDir 或绝对路径) */
  txtFile?: string;
  /** 带时间线文本文件 */
  timedFile?: string;
  /** SRT 字幕文件 */
  srtFile?: string;
  /** 分段 JSON(始终写出,API 据此返回 segments) */
  jsonFile?: string;
  segments?: number;
  /** 音频时长(秒),服务端测得 */
  durationSec?: number;
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
  /** 归属作用域;缺省视为 admin(历史数据) */
  scope?: MediaJobScope;
  /** scope=user 时的用户 id,用于隔离任务与文件 */
  ownerId?: string;
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
  // 默认值:文件并发 3、分片串行上传、单片重试 4 次、续传默认开启;
  // 要调这些请走「管理后台 → 媒体工具 → 设置」(存数据库),不走环境变量。
  concurrency: 3,
  uploadConcurrency: 1,
  uploadRetries: 4,
  resumeEnabled: true,
  outputs: ["plain"],
};

/** 转写产物格式:纯文本 / 带时间线文本 / SRT 字幕(三种都可选,默认纯文本)。 */
export type TranscribeOutput = "plain" | "timed" | "srt";

export const TRANSCRIBE_OUTPUTS: TranscribeOutput[] = ["plain", "timed", "srt"];

/** 把任意入参(数组/逗号串/旧 saveSrt)归一成合法产物列表,非法或空则回退 fallback。 */
export function normalizeTranscribeOutputs(
  value: unknown,
  fallback: TranscribeOutput[] = ["plain"],
): TranscribeOutput[] {
  const raw = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(",")
      : [];
  const out: TranscribeOutput[] = [];
  for (const item of raw) {
    const key = String(item ?? "").trim().toLowerCase();
    if ((TRANSCRIBE_OUTPUTS as string[]).includes(key) && !out.includes(key as TranscribeOutput)) {
      out.push(key as TranscribeOutput);
    }
  }
  if (out.length === 0) return fallback.slice();
  if (!out.includes("plain")) out.unshift("plain");
  return out;
}

/**
 * 解析单个任务的产物选择:params.outputs 优先,其次沿用旧的 saveSrt 开关,
 * 都没有则用全局默认。纯文本始终保留(它是所有下游的基准产物)。
 */
export function resolveJobOutputs(
  params: { outputs?: unknown; saveSrt?: boolean },
  defaults: TranscribeOutput[] | undefined,
): TranscribeOutput[] {
  const base = normalizeTranscribeOutputs(defaults);
  if (Array.isArray(params.outputs) && params.outputs.length > 0) {
    return normalizeTranscribeOutputs(params.outputs, base);
  }
  if (params.saveSrt === true) {
    return base.includes("srt") ? base : [...base, "srt"];
  }
  if (params.saveSrt === false) {
    const withoutSrt = base.filter((o) => o !== "srt");
    return withoutSrt.length ? withoutSrt : (["plain"] as TranscribeOutput[]);
  }
  return base;
}

/**
 * 启动默认值。
 *
 * 环境变量只给「换一台机器就必须不一样」的东西:总开关、接地址/身份/密钥、落盘目录。
 * 其余参数(语种/场景/产物/并发/重试/限额/上传上限)一律写死在本文件里,
 * 需要微调走「管理后台 → 媒体工具 → 设置」(存 Mongo 快照,会覆盖这里的默认值),
 * 不留第 N 份隐式配置入口。
 */
export function defaultMediaToolSettings(env: NodeJS.ProcessEnv = process.env): MediaToolSettings {
  const defaultLasr = { ...DEFAULT_LASR_OPTS, outputs: [...DEFAULT_LASR_OPTS.outputs] };
  const lasr: LasrOptions = {
    ...defaultLasr,
    serverUrl: env.MEDIA_TOOL_LASR_URL || defaultLasr.serverUrl,
    appId: env.MEDIA_TOOL_APP_ID || defaultLasr.appId,
    appKey: env.MEDIA_TOOL_APP_KEY || defaultLasr.appKey,
    token: env.MEDIA_TOOL_VIVO_TOKEN || "",
    openid: env.MEDIA_TOOL_VIVO_OPENID || "",
  };
  const workDir = env.MEDIA_TOOL_WORK_DIR || "";
  const bili: BiliOptions = {
    ytDlpPath: env.MEDIA_TOOL_YTDLP || "",
    cookiesFile: env.MEDIA_TOOL_COOKIES || "",
    downloadDir: env.MEDIA_TOOL_DOWNLOAD_DIR || workDir,
    audioFormat: "mp3",
    concurrency: 2,
    videoMode: false,
    transcribeAfter: false,
  };
  const user: TranscribeUserSettings = {
    enabled: true,
    maxFilesPerJob: 5,
    maxActiveJobs: 2,
  };
  return {
    enabled: env.MEDIA_TOOL_DISABLED !== "1",
    workDir,
    maxUploadBytes: 200 * 1024 * 1024,
    maxJobLogLines: 600,
    lasr,
    bili,
    user,
  };
}

/**
 * 环境变量显式层:只收录「当前进程环境里真的写了值」的键。
 *
 * 设置持久化(Mongo 快照 / 本地 JSON)会覆盖启动默认值,于是改了环境变量看起来没生效。
 * get() 末尾再叠一层显式 env,让环境变量成为最终权威,与 env-manager 的
 * 「保存即写入运行时配置」语义对齐。只覆盖上面那几个「换机器就得改」的键。
 */
export function explicitEnvLayer(env: NodeJS.ProcessEnv = process.env): MediaSettingsLayer {
  const pick = (key: string): string | undefined => {
    const raw = env[key];
    return typeof raw === "string" && raw.trim() !== "" ? raw : undefined;
  };
  const layer: MediaSettingsLayer = { lasr: {}, bili: {}, user: {} };
  const disabled = pick("MEDIA_TOOL_DISABLED");
  if (disabled !== undefined) layer.enabled = disabled !== "1";
  const workDir = pick("MEDIA_TOOL_WORK_DIR");
  if (workDir) layer.workDir = workDir;

  const lasrString: Array<[keyof LasrOptions, string]> = [
    ["serverUrl", "MEDIA_TOOL_LASR_URL"],
    ["appId", "MEDIA_TOOL_APP_ID"],
    ["appKey", "MEDIA_TOOL_APP_KEY"],
    ["token", "MEDIA_TOOL_VIVO_TOKEN"],
    ["openid", "MEDIA_TOOL_VIVO_OPENID"],
  ];
  for (const [field, key] of lasrString) {
    const value = pick(key);
    if (value !== undefined) (layer.lasr as Record<string, unknown>)[field] = value;
  }

  const biliString: Array<[keyof BiliOptions, string]> = [
    ["ytDlpPath", "MEDIA_TOOL_YTDLP"],
    ["cookiesFile", "MEDIA_TOOL_COOKIES"],
    ["proxyUrl", "MEDIA_TOOL_PROXY"],
    ["downloadDir", "MEDIA_TOOL_DOWNLOAD_DIR"],
  ];
  for (const [field, key] of biliString) {
    const value = pick(key);
    if (value !== undefined) (layer.bili as Record<string, unknown>)[field] = value;
  }
  // 布尔开关不能走上面的循环（会把字符串塞进 boolean 字段），单独解析。
  const apiFallback = pick("MEDIA_TOOL_BILI_API_FALLBACK");
  if (apiFallback !== undefined) {
    layer.bili.apiFallback = !["0", "false", "no", "off"].includes(apiFallback.trim().toLowerCase());
  }
  return layer;
}

/** explicitEnvLayer 的返回形状(结构化定义,避免与 settingsStore 形成类型环)。 */
export interface MediaSettingsLayer {
  enabled?: boolean;
  workDir?: string;
  maxUploadBytes?: number;
  maxJobLogLines?: number;
  lasr: Partial<LasrOptions>;
  bili: Partial<BiliOptions>;
  user: Partial<TranscribeUserSettings>;
}
