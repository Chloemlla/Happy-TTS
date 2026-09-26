import mongoose from "mongoose";

/** media_tool_jobs 集合:与 src/mediaTool/types.ts 的 MediaJobRecord 保持同构(epoch 数字时间戳)。 */
export interface MediaToolJobDoc {
  id: string;
  kind: "bili-download" | "transcribe";
  mode: string;
  /** 任务归属:缺省=管理端(历史文档无此字段) */
  scope?: "admin" | "user";
  /** scope=user 的用户 id */
  ownerId?: string;
  createdBy: string;
  createdAt: number;
  startedAt?: number;
  finishedAt?: number;
  status: string;
  stage: string;
  progress: number;
  input: { type: string; values: string[] };
  params?: Record<string, unknown>;
  logs: Array<{ t: number; text: string }>;
  error?: string;
  result?: unknown;
  cancelRequested: boolean;
}

const jobLogLineSchema = new mongoose.Schema<{ t: number; text: string }>(
  {
    t: { type: Number, required: true },
    text: { type: String, required: true },
  },
  { _id: false },
);

const jobSchema = new mongoose.Schema<MediaToolJobDoc>(
  {
    id: { type: String, required: true, unique: true },
    kind: { type: String, enum: ["bili-download", "transcribe"], required: true },
    mode: { type: String, required: true, default: "server" },
    scope: { type: String, enum: ["admin", "user"], default: "admin" },
    ownerId: { type: String },
    createdBy: { type: String, required: true },
    createdAt: { type: Number, required: true },
    startedAt: { type: Number },
    finishedAt: { type: Number },
    status: {
      type: String,
      enum: ["queued", "running", "succeeded", "failed", "cancelled"],
      required: true,
      default: "queued",
    },
    stage: { type: String, default: "queued" },
    progress: { type: Number, default: 0 },
    input: { type: mongoose.Schema.Types.Mixed, required: true },
    params: { type: mongoose.Schema.Types.Mixed },
    logs: { type: [jobLogLineSchema], default: [] },
    error: { type: String },
    result: { type: mongoose.Schema.Types.Mixed },
    cancelRequested: { type: Boolean, default: false },
  },
  { collection: "media_tool_jobs", versionKey: false },
);
jobSchema.index({ createdAt: -1 });
jobSchema.index({ kind: 1, createdAt: -1 });
jobSchema.index({ status: 1, createdAt: -1 });
// 用户页「我的任务」与每用户活跃任务计数都走这条
jobSchema.index({ scope: 1, ownerId: 1, createdAt: -1 });

/** 分段:与 src/mediaTool/vivoLasr.ts 的 LasrSegment 同构(bg/ed 为毫秒)。 */
export interface MediaToolTranscriptSegment {
  bg: number;
  ed: number;
  onebest?: string;
  speaker?: string;
}

/**
 * media_tool_transcripts 集合:转写正文入库。
 *
 * media_tool_jobs 只留产物文件指针,正文(纯文本 + 分段)单独一张表,
 * 于是 workDir 被清空/换盘/迁移后,详情接口仍能从库里给出正文。
 * 列表接口不读这张表,因此不会被正文体积拖慢。
 */
export interface MediaToolTranscriptDoc {
  jobId: string;
  /** 任务内第几个文件(对应 job.result.items 的下标) */
  index: number;
  scope: "admin" | "user";
  ownerId?: string;
  label: string;
  durationSec: number;
  segmentCount: number;
  /** 无时间线纯文本(与 .txt 产物同源) */
  plainText: string;
  segments: MediaToolTranscriptSegment[];
  createdAt: number;
}

const transcriptSegmentSchema = new mongoose.Schema<MediaToolTranscriptSegment>(
  {
    bg: { type: Number, required: true },
    ed: { type: Number, required: true },
    onebest: { type: String },
    speaker: { type: String },
  },
  { _id: false },
);

const transcriptSchema = new mongoose.Schema<MediaToolTranscriptDoc>(
  {
    jobId: { type: String, required: true },
    index: { type: Number, required: true },
    scope: { type: String, enum: ["admin", "user"], default: "admin" },
    ownerId: { type: String },
    label: { type: String, required: true },
    durationSec: { type: Number, default: 0 },
    segmentCount: { type: Number, default: 0 },
    plainText: { type: String, default: "" },
    segments: { type: [transcriptSegmentSchema], default: [] },
    createdAt: { type: Number, required: true },
  },
  { collection: "media_tool_transcripts", versionKey: false },
);
// 一个任务内一个文件一行;重试时按 (jobId,index) 覆盖
transcriptSchema.index({ jobId: 1, index: 1 }, { unique: true });
// TTL 未启用:正文是用户数据的最终副本,过期删除会重演"文件被清后静默无正文"。
// 需要保留期时在这里加 expires,并在设置页给出明确提示:
//   transcriptSchema.index({ createdAt: 1 }, { expireAfterSeconds: <秒> });
transcriptSchema.index({ scope: 1, ownerId: 1, createdAt: -1 });

/** media_tool_settings 集合:单文档(key='media-tool')存完整 MediaToolSettings 快照。 */
export interface MediaToolSettingsDoc {
  key: string;
  value: Record<string, unknown>;
  updatedAt: number;
}

const settingsSchema = new mongoose.Schema<MediaToolSettingsDoc>(
  {
    key: { type: String, required: true, unique: true },
    value: { type: mongoose.Schema.Types.Mixed, required: true },
    updatedAt: { type: Number, required: true },
  },
  { collection: "media_tool_settings", versionKey: false },
);

export const MediaToolJobModel =
  (mongoose.models.MediaToolJob as mongoose.Model<MediaToolJobDoc>) ||
  mongoose.model<MediaToolJobDoc>("MediaToolJob", jobSchema);
export const MediaToolTranscriptModel =
  (mongoose.models.MediaToolTranscript as mongoose.Model<MediaToolTranscriptDoc>) ||
  mongoose.model<MediaToolTranscriptDoc>("MediaToolTranscript", transcriptSchema);
/** media_tool_cookies 集合:B 站 cookies 正文。存 DB 而不是磁盘，因为镜像未挂持久卷时
 * 运行容器里的任何文件都会在重新部署后静默消失（这正是“cookies 明明配了却像没生效”的根源）。 */
export interface MediaToolCookiesDoc {
  key: string;
  content: string;
  bytes: number;
  updatedAt: number;
  updatedBy: string;
}

const cookiesSchema = new mongoose.Schema<MediaToolCookiesDoc>(
  {
    key: { type: String, required: true, unique: true },
    content: { type: String, required: true },
    bytes: { type: Number, required: true, default: 0 },
    updatedAt: { type: Number, required: true },
    updatedBy: { type: String, default: "" },
  },
  { collection: "media_tool_cookies", versionKey: false },
);

export const MediaToolSettingsModel =
  (mongoose.models.MediaToolSettings as mongoose.Model<MediaToolSettingsDoc>) ||
  mongoose.model<MediaToolSettingsDoc>("MediaToolSettings", settingsSchema);
export const MediaToolCookiesModel =
  (mongoose.models.MediaToolCookies as mongoose.Model<MediaToolCookiesDoc>) ||
  mongoose.model<MediaToolCookiesDoc>("MediaToolCookies", cookiesSchema);
