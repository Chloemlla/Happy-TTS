import { mongoose } from "../services/mongoService";
import type { TtsProviderExecutionSnapshot } from "../config/ttsProviderConfig";
import type { TtsJobStore } from "./tts.ports";

export type TtsJobStatus = "queued" | "processing" | "completed" | "failed";

export interface TtsUsageSummary {
  authenticated: boolean;
  isAdmin: boolean;
  dailyLimit: number | null;
  usedToday: number | null;
  remainingToday: number | null;
  reservedToday?: number | null;
}

export interface TtsNextAction {
  type: string;
  label: string;
  message: string;
}

export interface TtsAssetWatermarkSummary {
  id: string;
  kind: "server_forensic";
  policyVersion?: string;
}

export interface TtsGovernanceSummary {
  policyVersion?: string;
  contentSafety?: {
    decision: "allow" | "review" | "block";
    confidence: number;
    categories: string[];
    source: string;
    remoteChecked: boolean;
    remoteUnavailable?: boolean;
  };
}

export interface TtsJobResult {
  text?: string;
  fileName: string;
  audioUrl: string;
  audioFileId?: string;
  audioStorage?: "file" | "mongo";
  audioMimeType?: string;
  audioSize?: number;
  isDuplicate?: boolean;
  outputFormat?: string;
  provider?: string;
  providerModel?: string;
  providerVoice?: string;
  message: string;
  status: "generated" | "reused";
  watermark?: TtsAssetWatermarkSummary;
  permissions?: {
    canDownload: boolean;
    canShare: boolean;
  };
}

export interface TtsJobRequestPayload {
  text: string;
  model: string;
  voice: string;
  outputFormat: string;
  speed: number;
  providerExecution?: TtsProviderExecutionSnapshot;
}

export interface TtsJobRecord {
  taskId: string;
  status: TtsJobStatus;
  createdAt: string;
  updatedAt: string;
  request: TtsJobRequestPayload;
  userId?: string;
  isAdmin?: boolean;
  ip: string;
  fingerprint: string;
  message: string;
  error?: string;
  usage?: TtsUsageSummary;
  nextAction?: TtsNextAction;
  governance?: TtsGovernanceSummary;
  result?: TtsJobResult;
  attempts?: number;
  processingOwner?: string;
  leaseExpiresAt?: string;
}

const TtsJobSchema = new mongoose.Schema<TtsJobRecord>(
  {
    taskId: { type: String, required: true, unique: true, index: true },
    status: { type: String, required: true, index: true },
    createdAt: { type: String, required: true, index: true },
    updatedAt: { type: String, required: true },
    request: {
      text: { type: String, required: true },
      model: { type: String, required: true },
      voice: { type: String, required: true },
      outputFormat: { type: String, required: true },
      speed: { type: Number, required: true },
      providerExecution: {
        providerId: { type: String, enum: ["openai", "fish"] },
        model: { type: String },
        voice: { type: String },
        referenceId: { type: String },
        baseUrl: { type: String },
        cacheIdentity: { type: String },
      },
    },
    userId: { type: String, index: true },
    isAdmin: { type: Boolean },
    ip: { type: String, required: true, index: true },
    fingerprint: { type: String, required: true, index: true },
    message: { type: String, required: true },
    error: { type: String },
    usage: {
      authenticated: { type: Boolean },
      isAdmin: { type: Boolean },
      dailyLimit: { type: Number, default: null },
      usedToday: { type: Number, default: null },
      remainingToday: { type: Number, default: null },
      reservedToday: { type: Number, default: null },
    },
    nextAction: {
      type: { type: String },
      label: { type: String },
      message: { type: String },
    },
    governance: {
      policyVersion: { type: String },
      contentSafety: {
        decision: { type: String },
        confidence: { type: Number },
        categories: [{ type: String }],
        source: { type: String },
        remoteChecked: { type: Boolean },
        remoteUnavailable: { type: Boolean },
      },
    },
    result: {
      text: { type: String },
      fileName: { type: String },
      audioUrl: { type: String },
      audioFileId: { type: String },
      audioStorage: { type: String, enum: ["file", "mongo"] },
      audioMimeType: { type: String },
      audioSize: { type: Number },
      isDuplicate: { type: Boolean },
      outputFormat: { type: String },
      provider: { type: String },
      providerModel: { type: String },
      providerVoice: { type: String },
      message: { type: String },
      status: { type: String },
      watermark: {
        id: { type: String },
        kind: { type: String },
        policyVersion: { type: String },
      },
      permissions: {
        canDownload: { type: Boolean },
        canShare: { type: Boolean },
      },
    },
    attempts: { type: Number, default: 0 },
    processingOwner: { type: String, index: true },
    leaseExpiresAt: { type: String, index: true },
  },
  { collection: "tts_jobs" },
);

TtsJobSchema.index({ status: 1, createdAt: 1 });
TtsJobSchema.index({ status: 1, leaseExpiresAt: 1 });

const TtsJobModel = mongoose.models.TtsJob || mongoose.model<TtsJobRecord>("TtsJob", TtsJobSchema);

class MongoTtsJobStore implements TtsJobStore {
  public createTaskId() {
    return `tts_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }

  public async createJob(job: TtsJobRecord) {
    await TtsJobModel.create(job);
    return job;
  }

  public async getJob(taskId: string) {
    return (await TtsJobModel.findOne({ taskId }).lean().exec()) as TtsJobRecord | null;
  }

  public async updateJob(taskId: string, patch: Partial<TtsJobRecord>) {
    return (await TtsJobModel.findOneAndUpdate(
      { taskId },
      { $set: { ...patch, updatedAt: new Date().toISOString() } },
      { returnDocument: "after" },
    )
      .lean()
      .exec()) as TtsJobRecord | null;
  }

  public async completeJob(taskId: string, result: TtsJobResult, usage?: TtsUsageSummary, nextAction?: TtsNextAction) {
    return this.updateJob(taskId, {
      status: "completed",
      message: result.message,
      result,
      usage,
      nextAction,
      error: undefined,
      processingOwner: undefined,
      leaseExpiresAt: undefined,
    });
  }

  public async failJob(taskId: string, error: string, usage?: TtsUsageSummary, nextAction?: TtsNextAction) {
    return this.updateJob(taskId, {
      status: "failed",
      message: error,
      error,
      usage,
      nextAction,
      processingOwner: undefined,
      leaseExpiresAt: undefined,
    });
  }

  public async getQueuePosition(taskId: string) {
    const job = await this.getJob(taskId);
    if (!job || job.status !== "queued") {
      return 0;
    }

    return await TtsJobModel.countDocuments({
      status: "queued",
      createdAt: { $lt: job.createdAt },
    })
      .exec()
      .then((count) => count + 1);
  }

  public async claimNextQueuedJob(workerId: string, leaseMs: number) {
    return (await TtsJobModel.findOneAndUpdate(
      { status: "queued" },
      {
        $set: {
          status: "processing",
          message: "正在生成语音...",
          processingOwner: workerId,
          leaseExpiresAt: new Date(Date.now() + leaseMs).toISOString(),
          updatedAt: new Date().toISOString(),
        },
        $inc: { attempts: 1 },
      },
      { sort: { createdAt: 1 }, returnDocument: "after" },
    )
      .lean()
      .exec()) as TtsJobRecord | null;
  }

  public async recoverStaleJobs(staleBefore: number) {
    const result = await TtsJobModel.updateMany(
      {
        status: "processing",
        leaseExpiresAt: { $lte: new Date(staleBefore).toISOString() },
      },
      {
        $set: {
          status: "queued",
          message: "检测到任务处理中断，已重新入队",
          processingOwner: null,
          leaseExpiresAt: null,
          updatedAt: new Date().toISOString(),
        },
      },
    ).exec();

    return result.modifiedCount;
  }
}

export const ttsStorage = new MongoTtsJobStore();
