import mongoose from "mongoose";

/** media_tool_jobs 集合:与 src/mediaTool/types.ts 的 MediaJobRecord 保持同构(epoch 数字时间戳)。 */
export interface MediaToolJobDoc {
  id: string;
  kind: "bili-download" | "transcribe";
  mode: string;
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
export const MediaToolSettingsModel =
  (mongoose.models.MediaToolSettings as mongoose.Model<MediaToolSettingsDoc>) ||
  mongoose.model<MediaToolSettingsDoc>("MediaToolSettings", settingsSchema);
